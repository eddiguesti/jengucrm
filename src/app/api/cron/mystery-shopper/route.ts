import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Mystery Shopper Cron Job
 * Runs at 11am UTC Mon-Fri
 *
 * 1. Auto-adds prospects with 'needs-contact-discovery' tag to queue
 * 2. Triggers mystery shopper emails for pending queue items
 * 3. Removes completed/failed items from queue
 */

const MAX_QUEUE_ADDITIONS = 10; // Add up to 10 new prospects to queue per run
const MAX_EMAILS_PER_RUN = 5;   // Send up to 5 mystery shopper emails per run

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServerClient();
  const stats = {
    added_to_queue: 0,
    emails_sent: 0,
    removed_from_queue: 0,
    errors: [] as string[],
  };

  try {
    console.log('[Mystery Shopper Cron] Starting...');

    // Step 1: Auto-add prospects needing contact discovery to queue
    // Find prospects with 'needs-contact-discovery' tag not already in queue
    const { data: prospectsNeedingDiscovery, error: fetchError } = await supabase
      .from('prospects')
      .select('id, name, score, tier')
      .contains('tags', ['needs-contact-discovery'])
      .order('score', { ascending: false })
      .limit(MAX_QUEUE_ADDITIONS * 2); // Fetch extra in case some are already in queue

    if (fetchError) {
      console.error('[Mystery Shopper Cron] Fetch error:', fetchError);
      stats.errors.push(`Fetch error: ${fetchError.message}`);
    }

    if (prospectsNeedingDiscovery && prospectsNeedingDiscovery.length > 0) {
      // Check which are already in queue
      const prospectIds = prospectsNeedingDiscovery.map(p => p.id);
      const { data: existingQueue } = await supabase
        .from('mystery_shopper_queue')
        .select('prospect_id')
        .in('prospect_id', prospectIds)
        .not('status', 'in', '("completed","failed")');

      const existingIds = new Set((existingQueue || []).map(q => q.prospect_id));

      // Add new ones to queue
      const toAdd = prospectsNeedingDiscovery
        .filter(p => !existingIds.has(p.id))
        .slice(0, MAX_QUEUE_ADDITIONS);

      for (const prospect of toAdd) {
        const priority = prospect.tier === 'hot' ? 1 : prospect.tier === 'warm' ? 5 : 9;

        const { error: insertError } = await supabase
          .from('mystery_shopper_queue')
          .insert({
            prospect_id: prospect.id,
            status: 'pending',
            priority,
          });

        if (insertError) {
          // Ignore duplicate errors (unique constraint)
          if (!insertError.message.includes('duplicate')) {
            stats.errors.push(`Queue insert error for ${prospect.name}: ${insertError.message}`);
          }
        } else {
          stats.added_to_queue++;
          console.log(`[Mystery Shopper Cron] Added ${prospect.name} to queue (priority ${priority})`);
        }
      }
    }

    // Step 2: Trigger mystery shopper emails for pending queue items
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    try {
      const response = await fetch(`${baseUrl}/api/mystery-inquiry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: MAX_EMAILS_PER_RUN }),
      });

      const data = await response.json();

      if (response.ok) {
        stats.emails_sent = data.sent || 0;
        console.log(`[Mystery Shopper Cron] Sent ${stats.emails_sent} mystery shopper emails`);
      } else {
        stats.errors.push(`Mystery inquiry failed: ${data.error}`);
      }
    } catch (err) {
      stats.errors.push(`Mystery inquiry error: ${String(err)}`);
    }

    // Step 3: Clean up old completed/failed entries (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deleted, error: deleteError } = await supabase
      .from('mystery_shopper_queue')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', thirtyDaysAgo)
      .select('id');

    if (deleteError) {
      stats.errors.push(`Cleanup error: ${deleteError.message}`);
    } else {
      stats.removed_from_queue = deleted?.length || 0;
    }

    console.log('[Mystery Shopper Cron] Complete:', stats);

    // Log activity
    await supabase.from('activities').insert({
      type: 'system',
      title: 'Mystery shopper queue processed',
      description: `Added ${stats.added_to_queue} to queue, sent ${stats.emails_sent} emails, cleaned ${stats.removed_from_queue} old entries.`,
    });

    return NextResponse.json({
      success: stats.errors.length === 0,
      message: `Queue: +${stats.added_to_queue}, Emails: ${stats.emails_sent}, Cleaned: ${stats.removed_from_queue}`,
      stats,
    });
  } catch (error) {
    console.error('[Mystery Shopper Cron] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      stats,
    }, { status: 500 });
  }
}
