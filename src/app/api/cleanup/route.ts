import { NextRequest, NextResponse } from 'next/server';
import { cleanupProspects, previewCleanup } from '@/lib/enrichment/ai-cleanup';

/**
 * POST: Run AI cleanup on prospects
 * Body: { dryRun?: boolean, limit?: number, stage?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { dryRun = false, limit = 100, stage = 'new' } = body;

    const result = await cleanupProspects({ dryRun, limit, stage });

    return NextResponse.json({
      success: true,
      dryRun,
      ...result,
      summary: `Analyzed ${result.analyzed} prospects: ${result.archived} archived, ${result.kept} kept`,
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
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Preview failed', details: String(error) },
      { status: 500 }
    );
  }
}
