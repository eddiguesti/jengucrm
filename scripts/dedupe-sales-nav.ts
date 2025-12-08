/**
 * Deduplicate Sales Navigator prospects
 *
 * Strategy:
 * 1. Group by linkedin_url (unique identifier from Sales Nav)
 * 2. For prospects without linkedin_url, group by normalized company name
 * 3. Keep the record with the most data (has email > has website > nothing)
 * 4. Merge useful data from duplicates before deleting
 */

import { supabase } from './lib/supabase';

interface Prospect {
  id: string;
  name: string;
  email: string | null;
  website: string | null;
  linkedin_url: string | null;
  score: number | null;
  stage: string | null;
  tags: string[] | null;
  created_at: string;
}

/**
 * Normalize company name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .replace(/hotel|resort|spa|inn|suites|club|house|restaurant|bar/g, '') // Remove common suffixes
    .trim();
}

/**
 * Extract domain from website
 */
function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }
}

/**
 * Score a prospect based on data completeness
 * Higher score = more complete data = keep this one
 */
function scoreProspect(p: Prospect): number {
  let score = 0;
  if (p.email) score += 100; // Email is most valuable
  if (p.website) score += 50;
  if (p.linkedin_url) score += 25;
  if (p.score && p.score > 10) score += 10;
  if (p.tags && p.tags.length > 0) score += 5;
  return score;
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');

  console.log('=== Sales Navigator Deduplication ===');
  console.log(DRY_RUN ? '(DRY RUN - no changes will be made)' : '(LIVE MODE - will delete duplicates)');
  console.log('');

  // Fetch all Sales Nav prospects
  console.log('Fetching prospects...');
  const allProspects: Prospect[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('prospects')
      .select('id, name, email, website, linkedin_url, score, stage, tags, created_at')
      .eq('source', 'sales_navigator')
      .range(offset, offset + limit - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allProspects.push(...data);
    offset += limit;
    console.log(`Fetched ${allProspects.length} prospects...`);
  }

  console.log(`\nTotal prospects: ${allProspects.length}`);

  // Group by linkedin_url first (most reliable)
  const byLinkedIn = new Map<string, Prospect[]>();
  const noLinkedIn: Prospect[] = [];

  for (const p of allProspects) {
    if (p.linkedin_url) {
      const key = p.linkedin_url.toLowerCase();
      if (!byLinkedIn.has(key)) byLinkedIn.set(key, []);
      byLinkedIn.get(key)!.push(p);
    } else {
      noLinkedIn.push(p);
    }
  }

  // Group prospects without linkedin_url by normalized name + domain
  const byNameDomain = new Map<string, Prospect[]>();
  for (const p of noLinkedIn) {
    const domain = extractDomain(p.website);
    const key = normalizeName(p.name) + (domain ? `_${domain}` : '');
    if (!byNameDomain.has(key)) byNameDomain.set(key, []);
    byNameDomain.get(key)!.push(p);
  }

  // Find duplicates and decide what to keep
  const toDelete: string[] = [];
  const toUpdate: Array<{ id: string; data: Partial<Prospect> }> = [];
  let duplicateGroups = 0;

  // Process LinkedIn duplicates
  for (const [linkedIn, prospects] of byLinkedIn) {
    if (prospects.length <= 1) continue;
    duplicateGroups++;

    // Sort by score (best first)
    prospects.sort((a, b) => scoreProspect(b) - scoreProspect(a));
    const keeper = prospects[0];
    const duplicates = prospects.slice(1);

    // Merge data from duplicates into keeper
    let mergedEmail = keeper.email;
    let mergedWebsite = keeper.website;
    let mergedScore = keeper.score || 10;
    let mergedTags = new Set(keeper.tags || []);

    for (const dup of duplicates) {
      if (!mergedEmail && dup.email) mergedEmail = dup.email;
      if (!mergedWebsite && dup.website) mergedWebsite = dup.website;
      if (dup.score && dup.score > mergedScore) mergedScore = dup.score;
      if (dup.tags) dup.tags.forEach(t => mergedTags.add(t));
      toDelete.push(dup.id);
    }

    // Check if keeper needs update
    const needsUpdate =
      mergedEmail !== keeper.email ||
      mergedWebsite !== keeper.website ||
      mergedScore !== keeper.score ||
      mergedTags.size !== (keeper.tags?.length || 0);

    if (needsUpdate) {
      toUpdate.push({
        id: keeper.id,
        data: {
          email: mergedEmail,
          website: mergedWebsite,
          score: mergedScore,
          tags: Array.from(mergedTags),
        }
      });
    }

    if (duplicates.length > 0) {
      console.log(`\nLinkedIn: ${linkedIn.substring(0, 50)}...`);
      console.log(`  Keep: ${keeper.name} (score: ${scoreProspect(keeper)}, email: ${keeper.email ? 'YES' : 'no'})`);
      duplicates.forEach(d => console.log(`  Delete: ${d.name} (score: ${scoreProspect(d)})`));
    }
  }

  // Process name+domain duplicates
  for (const [key, prospects] of byNameDomain) {
    if (prospects.length <= 1) continue;
    duplicateGroups++;

    // Sort by score (best first)
    prospects.sort((a, b) => scoreProspect(b) - scoreProspect(a));
    const keeper = prospects[0];
    const duplicates = prospects.slice(1);

    // Merge data from duplicates into keeper
    let mergedEmail = keeper.email;
    let mergedWebsite = keeper.website;
    let mergedScore = keeper.score || 10;
    let mergedTags = new Set(keeper.tags || []);

    for (const dup of duplicates) {
      if (!mergedEmail && dup.email) mergedEmail = dup.email;
      if (!mergedWebsite && dup.website) mergedWebsite = dup.website;
      if (dup.score && dup.score > mergedScore) mergedScore = dup.score;
      if (dup.tags) dup.tags.forEach(t => mergedTags.add(t));
      toDelete.push(dup.id);
    }

    // Check if keeper needs update
    const needsUpdate =
      mergedEmail !== keeper.email ||
      mergedWebsite !== keeper.website ||
      mergedScore !== keeper.score ||
      mergedTags.size !== (keeper.tags?.length || 0);

    if (needsUpdate) {
      toUpdate.push({
        id: keeper.id,
        data: {
          email: mergedEmail,
          website: mergedWebsite,
          score: mergedScore,
          tags: Array.from(mergedTags),
        }
      });
    }

    if (duplicates.length > 0 && duplicates.length < 5) { // Only log small groups
      console.log(`\nName: ${prospects[0].name}`);
      console.log(`  Keep: ${keeper.name} (score: ${scoreProspect(keeper)}, email: ${keeper.email ? 'YES' : 'no'})`);
      duplicates.forEach(d => console.log(`  Delete: ${d.name} (score: ${scoreProspect(d)})`));
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Duplicate groups found: ${duplicateGroups}`);
  console.log(`Records to delete: ${toDelete.length}`);
  console.log(`Records to update: ${toUpdate.length}`);
  console.log(`Records after dedup: ${allProspects.length - toDelete.length}`);

  if (DRY_RUN) {
    console.log('\n(DRY RUN - no changes made)');
    console.log('Run without --dry-run to actually delete duplicates');
    return;
  }

  // Execute updates
  console.log('\nUpdating records with merged data...');
  for (const update of toUpdate) {
    const { error } = await supabase
      .from('prospects')
      .update(update.data)
      .eq('id', update.id);

    if (error) {
      console.error(`Failed to update ${update.id}:`, error);
    }
  }
  console.log(`Updated ${toUpdate.length} records`);

  // Execute deletes in batches
  console.log('\nDeleting duplicates...');
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const { error } = await supabase
      .from('prospects')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`Failed to delete batch:`, error);
    } else {
      deleted += batch.length;
      console.log(`Deleted ${deleted}/${toDelete.length}`);
    }
  }

  console.log(`\n=== Deduplication Complete ===`);
  console.log(`Deleted: ${deleted} duplicate records`);
  console.log(`Remaining: ${allProspects.length - deleted} unique prospects`);
}

main().catch(console.error);
