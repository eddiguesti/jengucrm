import { NextRequest, NextResponse } from 'next/server';
import { cleanupProspects, previewCleanup, scoreProspect } from '@/lib/enrichment/ai-cleanup';

/**
 * POST: Run AI cleanup and scoring on prospects
 * Body: { dryRun?: boolean, limit?: number, stage?: string, prospect_id?: string }
 *
 * If prospect_id is provided, scores just that prospect
 * Otherwise runs batch cleanup/scoring on prospects in the specified stage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { dryRun = false, limit = 100, stage = 'new', prospect_id } = body;

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

    // Batch cleanup and scoring
    const result = await cleanupProspects({ dryRun, limit, stage });

    return NextResponse.json({
      success: true,
      dryRun,
      ...result,
      summary: `Analyzed ${result.analyzed} prospects: ${result.archived} archived, ${result.kept} kept, ${result.scored} scored`,
      grade_summary: `Grade breakdown: A=${result.scoreBreakdown.A}, B=${result.scoreBreakdown.B}, C=${result.scoreBreakdown.C}, D=${result.scoreBreakdown.D}, F=${result.scoreBreakdown.F}`,
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
 * GET: Preview what would be cleaned up and scored
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const preview = await previewCleanup(limit);

    return NextResponse.json({
      success: true,
      preview: true,
      toArchive: preview.toArchive.length,
      toKeep: preview.toKeep.length,
      archiveList: preview.toArchive,
      keepList: preview.toKeep.slice(0, 10), // Just show first 10 keeps
      scoreBreakdown: preview.scoreBreakdown,
      grade_summary: `Expected grades: A=${preview.scoreBreakdown.A}, B=${preview.scoreBreakdown.B}, C=${preview.scoreBreakdown.C}, D=${preview.scoreBreakdown.D}, F=${preview.scoreBreakdown.F}`,
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Preview failed', details: String(error) },
      { status: 500 }
    );
  }
}
