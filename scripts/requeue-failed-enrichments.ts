/**
 * Re-queue Sales Navigator prospects that have websites but no email
 * These failed enrichment and should be retried with MillionVerifier + catch-all acceptance
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function requeueFailedEnrichments() {
  console.log('Finding Sales Nav prospects with website but no email...\n');

  // Get prospects that have a website but no email (failed enrichment)
  const { data: prospects, error, count } = await supabase
    .from('prospects')
    .select('id, name, company', { count: 'exact' })
    .eq('source', 'sales_navigator')
    .not('website', 'is', null)
    .is('email', null)
    .limit(2000);

  if (error) {
    console.error('Error fetching prospects:', error);
    process.exit(1);
  }

  console.log(`Found ${count} prospects with website but no email\n`);

  if (!prospects || prospects.length === 0) {
    console.log('No prospects to re-queue');
    return;
  }

  // Check which ones are already in the queue (pending)
  const prospectIds = prospects.map(p => p.id);

  // Get prospects already pending (don't re-queue these)
  const { data: existingQueue } = await supabase
    .from('sales_nav_enrichment_queue')
    .select('prospect_id')
    .in('prospect_id', prospectIds.slice(0, 1000))
    .eq('status', 'pending');

  const { data: existingQueue2 } = await supabase
    .from('sales_nav_enrichment_queue')
    .select('prospect_id')
    .in('prospect_id', prospectIds.slice(1000))
    .eq('status', 'pending');

  const existingIds = new Set([
    ...(existingQueue || []).map(q => q.prospect_id),
    ...(existingQueue2 || []).map(q => q.prospect_id),
  ]);
  const toQueue = prospects.filter(p => !existingIds.has(p.id));

  console.log(`Already in queue (pending): ${existingIds.size}`);
  console.log(`Need to re-queue: ${toQueue.length}\n`);

  if (toQueue.length === 0) {
    console.log('All prospects are already in queue');
    return;
  }

  // Re-queue in batches
  const BATCH_SIZE = 100;
  let queued = 0;
  let errors = 0;

  for (let i = 0; i < toQueue.length; i += BATCH_SIZE) {
    const batch = toQueue.slice(i, i + BATCH_SIZE);

    // First delete any existing entries for these prospects (completed or failed)
    const batchIds = batch.map(p => p.id);
    await supabase
      .from('sales_nav_enrichment_queue')
      .delete()
      .in('prospect_id', batchIds)
      .in('status', ['completed', 'failed']);

    // Now insert new queue entries
    const queueEntries = batch.map(p => ({
      prospect_id: p.id,
      prospect_name: p.name || 'Unknown',
      company: p.company || 'Unknown',
      status: 'pending',
      created_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('sales_nav_enrichment_queue')
      .insert(queueEntries);

    if (insertError) {
      console.error(`Batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, insertError.message);
      errors += batch.length;
    } else {
      queued += batch.length;
      console.log(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: Queued ${batch.length} prospects`);
    }
  }

  console.log(`\n=== Re-queue Complete ===`);
  console.log(`Queued: ${queued}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nRun the enrichment cron to process these prospects with catch-all acceptance`);
}

requeueFailedEnrichments().catch(console.error);
