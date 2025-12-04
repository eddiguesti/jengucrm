import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculateScore, getTier } from '@/lib/enrichment/scoring';

/**
 * Re-scoring Cron Job
 * Runs weekly (Sundays at 6am UTC) to re-score all prospects
 * Updates scores based on any new data collected during the week
 */

const BATCH_SIZE = 100;
const CURRENT_SCORE_VERSION = 2; // Increment when scoring logic changes

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
    total_processed: 0,
    upgraded: 0,
    downgraded: 0,
    unchanged: 0,
    errors: 0,
  };

  try {
    console.log('[Rescore Cron] Starting weekly re-scoring...');

    // Get all prospects that haven't been scored with current version
    // or haven't been scored in over a week
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const { data: prospects, error } = await supabase
        .from('prospects')
        .select('*')
        .or(`score_version.is.null,score_version.lt.${CURRENT_SCORE_VERSION}`)
        .order('created_at', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) {
        console.error('[Rescore Cron] Fetch error:', error);
        break;
      }

      if (!prospects || prospects.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch
      for (const prospect of prospects) {
        try {
          const { total: newScore, breakdown } = calculateScore(prospect);
          const newTier = getTier(newScore);
          const oldTier = prospect.tier || 'cold';

          // Update prospect
          const { error: updateError } = await supabase
            .from('prospects')
            .update({
              score: newScore,
              score_breakdown: breakdown,
              tier: newTier,
              last_scored_at: new Date().toISOString(),
              score_version: CURRENT_SCORE_VERSION,
            })
            .eq('id', prospect.id);

          if (updateError) {
            console.error('[Rescore Cron] Update error:', prospect.id, updateError);
            stats.errors++;
            continue;
          }

          stats.total_processed++;

          // Track tier changes
          const tierOrder = { cold: 0, warm: 1, hot: 2 };
          if (tierOrder[newTier as keyof typeof tierOrder] > tierOrder[oldTier as keyof typeof tierOrder]) {
            stats.upgraded++;
          } else if (tierOrder[newTier as keyof typeof tierOrder] < tierOrder[oldTier as keyof typeof tierOrder]) {
            stats.downgraded++;
          } else {
            stats.unchanged++;
          }
        } catch (err) {
          console.error('[Rescore Cron] Error processing:', prospect.id, err);
          stats.errors++;
        }
      }

      offset += BATCH_SIZE;

      // Safety limit
      if (offset > 10000) {
        console.log('[Rescore Cron] Safety limit reached');
        break;
      }
    }

    console.log('[Rescore Cron] Complete:', stats);

    // Log activity
    await supabase.from('activities').insert({
      type: 'system',
      title: 'Weekly re-scoring completed',
      description: `Processed ${stats.total_processed} prospects. ${stats.upgraded} upgraded, ${stats.downgraded} downgraded, ${stats.unchanged} unchanged, ${stats.errors} errors.`,
    });

    return NextResponse.json({
      success: true,
      message: `Re-scored ${stats.total_processed} prospects`,
      stats,
    });
  } catch (error) {
    console.error('[Rescore Cron] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      stats,
    }, { status: 500 });
  }
}
