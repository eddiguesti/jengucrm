import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';
import { isChainHotel } from '@/lib/constants';

type ProspectRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_title: string | null;
  linkedin_url: string | null;
  website: string | null;
  email: string | null;
  tags: string[] | null;
  archived: boolean | null;
  created_at: string;
};

function normalizeKey(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function extractDomainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function seniorityScore(title: string | null): number {
  const t = (title || '').toLowerCase();
  if (/\b(ceo|coo|cfo|chief|president|owner|founder)\b/.test(t)) return 40;
  if (/\b(general\s*manager|gm|managing\s*director|director)\b/.test(t)) return 30;
  if (/\b(vp|vice\s*president|head\s*of|regional|area\s*manager)\b/.test(t)) return 20;
  if (/\b(manager|supervisor)\b/.test(t)) return 10;
  return 0;
}

function addTag(tags: string[] | null, tag: string): string[] {
  const next = new Set([...(tags || []), tag]);
  return [...next];
}

/**
 * POST /api/admin/sales-navigator/cleanup
 * Archives:
 * - Chain hotels (by name match)
 * - Duplicates (by linkedin_url and website domain)
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${config.security.cronSecret}`) {
    return errors.unauthorized('Unauthorized');
  }

  const supabase = createServerClient();

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(parseInt(String(body.limit || 5000), 10) || 5000, 1), 20000);
  const dryRun = body.dry_run ?? false;

  const { data: prospects, error: fetchError } = await supabase
    .from('prospects')
    .select('id, name, contact_name, contact_title, linkedin_url, website, email, tags, archived, created_at')
    .eq('source', 'sales_navigator')
    .eq('archived', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (fetchError) return errors.internal('Failed to fetch prospects', fetchError);

  const rows = (prospects || []) as ProspectRow[];
  if (rows.length === 0) {
    return success({ message: 'No prospects to clean', checked: 0 });
  }

  const toArchive: Array<{ id: string; reason: string; tag: string }> = [];

  // 1) Chain filter
  for (const p of rows) {
    if (isChainHotel(p.name)) {
      toArchive.push({ id: p.id, reason: 'Chain hotel filtered', tag: 'filtered-chain' });
    }
  }

  // 2) Dedupe by linkedin_url (keep earliest)
  const byLinkedIn = new Map<string, ProspectRow[]>();
  for (const p of rows) {
    const key = normalizeKey(p.linkedin_url);
    if (!key) continue;
    const list = byLinkedIn.get(key) || [];
    list.push(p);
    byLinkedIn.set(key, list);
  }

  for (const [, list] of byLinkedIn) {
    if (list.length <= 1) continue;
    // Keep the best (has email + seniority), tie-breaker earliest created_at
    const sorted = [...list].sort((a, b) => {
      const aScore = (a.email ? 10 : 0) + seniorityScore(a.contact_title);
      const bScore = (b.email ? 10 : 0) + seniorityScore(b.contact_title);
      if (bScore !== aScore) return bScore - aScore;
      return a.created_at.localeCompare(b.created_at);
    });

    const keep = sorted[0]?.id;
    for (const p of sorted.slice(1)) {
      if (p.id !== keep) {
        toArchive.push({ id: p.id, reason: 'Duplicate linkedin_url', tag: 'duplicate-linkedin' });
      }
    }
  }

  // 3) Dedupe by website domain (keep best)
  const byDomain = new Map<string, ProspectRow[]>();
  for (const p of rows) {
    const domain = extractDomainFromUrl(p.website);
    if (!domain) continue;
    const list = byDomain.get(domain) || [];
    list.push(p);
    byDomain.set(domain, list);
  }

  for (const [, list] of byDomain) {
    if (list.length <= 1) continue;
    const sorted = [...list].sort((a, b) => {
      const aScore = (a.email ? 10 : 0) + seniorityScore(a.contact_title);
      const bScore = (b.email ? 10 : 0) + seniorityScore(b.contact_title);
      if (bScore !== aScore) return bScore - aScore;
      return a.created_at.localeCompare(b.created_at);
    });
    const keep = sorted[0]?.id;
    for (const p of sorted.slice(1)) {
      if (p.id !== keep) {
        toArchive.push({ id: p.id, reason: 'Duplicate website domain', tag: 'duplicate-website' });
      }
    }
  }

  // Dedupe archive list (prefer first reason)
  const archiveById = new Map<string, { reason: string; tag: string }>();
  for (const item of toArchive) {
    if (!archiveById.has(item.id)) {
      archiveById.set(item.id, { reason: item.reason, tag: item.tag });
    }
  }

  if (dryRun) {
    return success({
      dry_run: true,
      checked: rows.length,
      would_archive: archiveById.size,
      examples: [...archiveById.entries()].slice(0, 25).map(([id, r]) => ({ id, ...r })),
    });
  }

  let archived = 0;
  let queueUpdated = 0;

  for (const [id, r] of archiveById.entries()) {
    try {
      const row = rows.find(p => p.id === id);
      const tags = addTag(row?.tags || null, r.tag);
      await supabase
        .from('prospects')
        .update({ archived: true, tags })
        .eq('id', id);

      archived++;

      // Also mark queue as failed to avoid processing
      const { error: qErr } = await supabase
        .from('sales_nav_enrichment_queue')
        .update({ status: 'failed', error: r.reason })
        .eq('prospect_id', id);
      if (!qErr) queueUpdated++;
    } catch (error) {
      logger.warn({ error, id }, 'Cleanup: failed to archive prospect');
    }
  }

  logger.info({ checked: rows.length, archived, queueUpdated }, 'Sales Navigator cleanup complete');

  return success({
    success: true,
    checked: rows.length,
    archived,
    queueUpdated,
  });
}

