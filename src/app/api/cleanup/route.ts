import { NextRequest, NextResponse } from 'next/server';
import { cleanupProspects, previewCleanup, scoreProspect } from '@/lib/enrichment/ai-cleanup';
import { createServerClient } from '@/lib/supabase';

// Archive reason types
export type ArchiveReason =
  | 'unresponsive' // 5+ emails, no reply
  | 'stale' // No activity for 30+ days
  | 'ai_filtered' // AI determined not a fit
  | 'wrong_industry' // Not a hotel
  | 'big_chain' // Corporate chain hotel
  | 'wrong_role' // Irrelevant job posting
  | 'duplicate' // Duplicate entry
  | 'manual' // User manually archived
  | 'other';

interface CleanupCandidate {
  id: string;
  name: string;
  city?: string;
  reason: ArchiveReason;
  description: string;
}

interface CleanupStats {
  unresponsive: number;
  stale: number;
  aiFiltered: number;
  total: number;
}

/**
 * Find unresponsive prospects (5+ outbound emails, no reply)
 */
async function findUnresponsiveProspects(supabase: ReturnType<typeof createServerClient>): Promise<CleanupCandidate[]> {
  // Get prospects with email counts
  const { data: emailStats } = await supabase
    .from('emails')
    .select('prospect_id, direction')
    .in('direction', ['outbound', 'inbound']);

  if (!emailStats) return [];

  // Group by prospect
  const prospectEmails = new Map<string, { sent: number; received: number }>();
  for (const email of emailStats) {
    const stats = prospectEmails.get(email.prospect_id) || { sent: 0, received: 0 };
    if (email.direction === 'outbound') stats.sent++;
    else stats.received++;
    prospectEmails.set(email.prospect_id, stats);
  }

  // Find prospects with 5+ sent and 0 received
  const unresponsiveIds: string[] = [];
  for (const [prospectId, stats] of prospectEmails) {
    if (stats.sent >= 5 && stats.received === 0) {
      unresponsiveIds.push(prospectId);
    }
  }

  if (unresponsiveIds.length === 0) return [];

  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, name, city')
    .in('id', unresponsiveIds)
    .eq('archived', false);

  return (prospects || []).map(p => ({
    id: p.id,
    name: p.name,
    city: p.city,
    reason: 'unresponsive' as ArchiveReason,
    description: '5+ emails sent with no reply',
  }));
}

/**
 * Find stale prospects (no activity for 30+ days, still in early stages)
 */
async function findStaleProspects(supabase: ReturnType<typeof createServerClient>): Promise<CleanupCandidate[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get prospects with no recent activity
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, name, city, stage, updated_at')
    .eq('archived', false)
    .in('stage', ['new', 'researching', 'outreach']) // Only early stages
    .lt('updated_at', thirtyDaysAgo.toISOString())
    .limit(100);

  return (prospects || []).map(p => ({
    id: p.id,
    name: p.name,
    city: p.city,
    reason: 'stale' as ArchiveReason,
    description: `No activity for 30+ days (stage: ${p.stage})`,
  }));
}

/**
 * POST: Run cleanup on prospects
 * Body: { dryRun?: boolean, limit?: number, stage?: string, prospect_id?: string, mode?: 'all' | 'ai' | 'unresponsive' | 'stale' }
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const { dryRun = false, limit = 100, stage = 'new', prospect_id, mode = 'all' } = body;

    // Single prospect scoring
    if (prospect_id) {
      const score = await scoreProspect(prospect_id);
      if (!score) {
        return NextResponse.json(
          { error: 'Prospect not found or could not be scored' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        ...score,
      });
    }

    const stats: CleanupStats = { unresponsive: 0, stale: 0, aiFiltered: 0, total: 0 };
    const archivedProspects: CleanupCandidate[] = [];

    // Find unresponsive prospects
    if (mode === 'all' || mode === 'unresponsive') {
      const unresponsive = await findUnresponsiveProspects(supabase);
      stats.unresponsive = unresponsive.length;

      if (!dryRun) {
        for (const p of unresponsive) {
          await supabase
            .from('prospects')
            .update({
              archived: true,
              archived_at: new Date().toISOString(),
              archive_reason: 'unresponsive',
            })
            .eq('id', p.id);

          await supabase.from('activities').insert({
            prospect_id: p.id,
            type: 'note',
            title: 'Auto-archived: Unresponsive',
            description: p.description,
          });
        }
      }

      archivedProspects.push(...unresponsive);
    }

    // Find stale prospects
    if (mode === 'all' || mode === 'stale') {
      const stale = await findStaleProspects(supabase);
      stats.stale = stale.length;

      if (!dryRun) {
        for (const p of stale) {
          await supabase
            .from('prospects')
            .update({
              archived: true,
              archived_at: new Date().toISOString(),
              archive_reason: 'stale',
            })
            .eq('id', p.id);

          await supabase.from('activities').insert({
            prospect_id: p.id,
            type: 'note',
            title: 'Auto-archived: Stale',
            description: p.description,
          });
        }
      }

      archivedProspects.push(...stale);
    }

    // Run AI cleanup
    if (mode === 'all' || mode === 'ai') {
      const result = await cleanupProspects({ dryRun, limit, stage });
      stats.aiFiltered = result.archived;

      // Get names for AI-filtered prospects
      if (result.results.length > 0) {
        const aiArchivedIds = result.results
          .filter(r => r.action === 'archive')
          .map(r => r.prospect_id);

        if (aiArchivedIds.length > 0) {
          const { data: aiProspects } = await supabase
            .from('prospects')
            .select('id, name, city')
            .in('id', aiArchivedIds);

          const prospectMap = new Map((aiProspects || []).map(p => [p.id, p]));

          archivedProspects.push(...result.results
            .filter(r => r.action === 'archive')
            .map(r => ({
              id: r.prospect_id,
              name: prospectMap.get(r.prospect_id)?.name || 'Unknown',
              city: prospectMap.get(r.prospect_id)?.city,
              reason: 'ai_filtered' as ArchiveReason,
              description: r.reason,
            })));
        }
      }
    }

    stats.total = stats.unresponsive + stats.stale + stats.aiFiltered;

    return NextResponse.json({
      success: true,
      dryRun,
      stats,
      archived: archivedProspects,
      summary: `Cleaned ${stats.total} prospects: ${stats.unresponsive} unresponsive, ${stats.stale} stale, ${stats.aiFiltered} AI-filtered`,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET: Preview what would be cleaned up
 */
export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const mode = searchParams.get('mode') || 'all';

    const preview: {
      unresponsive: CleanupCandidate[];
      stale: CleanupCandidate[];
      aiFiltered: Array<{ id: string; name: string; reason: string }>;
      stats: CleanupStats;
    } = {
      unresponsive: [],
      stale: [],
      aiFiltered: [],
      stats: { unresponsive: 0, stale: 0, aiFiltered: 0, total: 0 },
    };

    // Preview unresponsive
    if (mode === 'all' || mode === 'unresponsive') {
      preview.unresponsive = await findUnresponsiveProspects(supabase);
      preview.stats.unresponsive = preview.unresponsive.length;
    }

    // Preview stale
    if (mode === 'all' || mode === 'stale') {
      preview.stale = await findStaleProspects(supabase);
      preview.stats.stale = preview.stale.length;
    }

    // Preview AI cleanup
    if (mode === 'all' || mode === 'ai') {
      const aiPreview = await previewCleanup(limit);
      preview.aiFiltered = aiPreview.toArchive;
      preview.stats.aiFiltered = aiPreview.toArchive.length;
    }

    preview.stats.total = preview.stats.unresponsive + preview.stats.stale + preview.stats.aiFiltered;

    return NextResponse.json({
      success: true,
      preview: true,
      ...preview,
      summary: `Found ${preview.stats.total} prospects to clean: ${preview.stats.unresponsive} unresponsive, ${preview.stats.stale} stale, ${preview.stats.aiFiltered} AI-filtered`,
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Preview failed', details: String(error) },
      { status: 500 }
    );
  }
}
