import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { isLargeChain, getJobPriorityScore, getTierFromScore } from '@/lib/scrapers/types';

const XAI_API_KEY = process.env.XAI_API_KEY;

interface Prospect {
  id: string;
  name: string;
  city?: string;
  country?: string;
  source_job_title?: string;
  tier?: string;
  stage?: string;
}

interface GrokAnalysis {
  should_keep: boolean;
  reason: string;
  is_chain: boolean;
  is_relevant_role: boolean;
  suggested_tier: 'hot' | 'warm' | 'cold';
  priority_score: number;
}

/**
 * Use Grok to analyze a batch of prospects and determine which to keep/delete
 */
async function analyzeProspectsWithGrok(prospects: Prospect[]): Promise<Map<string, GrokAnalysis>> {
  if (!XAI_API_KEY) {
    throw new Error('XAI_API_KEY not configured');
  }

  const prospectList = prospects.map(p => ({
    id: p.id,
    name: p.name,
    city: p.city || '',
    job_title: p.source_job_title || '',
  }));

  const prompt = `Analyze these hotel/hospitality prospects and determine which ones Jengu (an AI guest communication platform) should target.

PROSPECTS TO ANALYZE:
${JSON.stringify(prospectList, null, 2)}

For EACH prospect, determine:
1. should_keep: false if it's a large hotel chain (Marriott, Hilton, Hyatt, IHG, Accor, etc.), recruitment agency, OTA, or non-hotel business
2. is_chain: true if it's part of a major chain that would have their own tech department
3. is_relevant_role: true if the job_title indicates someone who would benefit from/decide on guest communication AI
4. suggested_tier:
   - "hot" = IT/Tech/Digital/Innovation/Systems roles - PRIMARY targets who definitely need automation
   - "warm" = Front Office, Reservations, Guest Services, Revenue - deal with guest communication
   - "cold" = GM, F&B, HR, Spa - general decision makers but not primary target
5. priority_score: 0-100 based on how likely they need Jengu (IT roles = 100, Front Office = 70, Revenue = 40, GM = 20)
6. reason: brief explanation

DELETE these types:
- Large hotel chains (Marriott, Hilton, Hyatt, IHG, Accor, Wyndham, Best Western, Four Seasons, Ritz Carlton, etc.)
- Recruitment/staffing agencies
- OTAs (Booking.com, Expedia, etc.)
- Non-hospitality businesses
- Operational staff roles (chef, receptionist, housekeeper, waiter, etc.)

KEEP these types:
- Independent/boutique hotels
- Small hotel groups (under 10 properties)
- Management/director level roles

Respond with a JSON array:
[
  {
    "id": "prospect_id",
    "should_keep": true/false,
    "reason": "brief reason",
    "is_chain": true/false,
    "is_relevant_role": true/false,
    "suggested_tier": "hot/warm/cold",
    "priority_score": 0-100
  }
]`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-4-latest',
      messages: [
        {
          role: 'system',
          content: 'You are a data cleaning assistant. Analyze prospects and return ONLY valid JSON array with no additional text.'
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status}`);
  }

  const data = await response.json();
  const responseText = data.choices?.[0]?.message?.content || '';

  // Parse JSON response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Grok response');
  }

  const analyses: GrokAnalysis[] = JSON.parse(jsonMatch[0]);
  const resultMap = new Map<string, GrokAnalysis>();

  for (const analysis of analyses) {
    resultMap.set((analysis as unknown as { id: string }).id, analysis);
  }

  return resultMap;
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { mode = 'analyze', batchSize = 50 } = body;

    // Get all prospects
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, name, city, country, source_job_title, tier, stage')
      .order('created_at', { ascending: false })
      .limit(batchSize);

    if (error) throw error;
    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ message: 'No prospects to clean', stats: {} });
    }

    // First pass: Quick rule-based filtering
    const quickAnalysis: { toDelete: Prospect[]; toAnalyze: Prospect[]; alreadyGood: Prospect[] } = {
      toDelete: [],
      toAnalyze: [],
      alreadyGood: [],
    };

    for (const prospect of prospects) {
      // Quick chain check
      if (isLargeChain(prospect.name)) {
        quickAnalysis.toDelete.push(prospect);
        continue;
      }

      // Check job role score
      const score = getJobPriorityScore(prospect.source_job_title || '');
      if (score === 0) {
        // Unclear role - send to Grok for analysis
        quickAnalysis.toAnalyze.push(prospect);
      } else {
        quickAnalysis.alreadyGood.push(prospect);
      }
    }

    let grokAnalysis = new Map<string, GrokAnalysis>();
    const grokToDelete: string[] = [];
    const grokUpdates: { id: string; tier: string; priority_score: number }[] = [];

    // If there are prospects to analyze with Grok
    if (quickAnalysis.toAnalyze.length > 0 && XAI_API_KEY) {
      try {
        grokAnalysis = await analyzeProspectsWithGrok(quickAnalysis.toAnalyze);

        for (const [id, analysis] of grokAnalysis) {
          if (!analysis.should_keep) {
            grokToDelete.push(id);
          } else {
            grokUpdates.push({
              id,
              tier: analysis.suggested_tier,
              priority_score: analysis.priority_score,
            });
          }
        }
      } catch (grokError) {
        console.error('Grok analysis failed:', grokError);
        // Continue without Grok analysis
      }
    }

    // Update tiers for good prospects based on job title score
    const tierUpdates: { id: string; tier: string; priority_score: number }[] = [];
    for (const prospect of quickAnalysis.alreadyGood) {
      const score = getJobPriorityScore(prospect.source_job_title || '');
      const newTier = getTierFromScore(score);

      if (prospect.tier !== newTier) {
        tierUpdates.push({ id: prospect.id, tier: newTier, priority_score: score });
      }
    }

    // Execute changes based on mode
    if (mode === 'execute') {
      // Delete chain prospects
      const allToDelete = [
        ...quickAnalysis.toDelete.map(p => p.id),
        ...grokToDelete,
      ];

      if (allToDelete.length > 0) {
        await supabase
          .from('prospects')
          .delete()
          .in('id', allToDelete);
      }

      // Update tiers - OPTIMIZED: batch updates using Promise.all
      const allUpdates = [...tierUpdates, ...grokUpdates];
      if (allUpdates.length > 0) {
        // Group updates by tier for more efficient batch operations
        const byTier: Record<string, string[]> = {};
        for (const update of allUpdates) {
          if (!byTier[update.tier]) byTier[update.tier] = [];
          byTier[update.tier].push(update.id);
        }

        // Batch update by tier (reduces from N queries to ~3 queries max)
        await Promise.all(
          Object.entries(byTier).map(([tier, ids]) =>
            supabase
              .from('prospects')
              .update({ tier })
              .in('id', ids)
          )
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Cleanup completed',
        stats: {
          total_analyzed: prospects.length,
          deleted_chains: quickAnalysis.toDelete.length,
          deleted_by_grok: grokToDelete.length,
          total_deleted: allToDelete.length,
          tiers_updated: allUpdates.length,
          remaining: prospects.length - allToDelete.length,
        },
        deleted_samples: quickAnalysis.toDelete.slice(0, 5).map(p => p.name),
        grok_deleted_samples: grokToDelete.slice(0, 5),
      });
    }

    // Analysis mode - just return what would be done
    return NextResponse.json({
      success: true,
      mode: 'analyze',
      message: 'Analysis complete - run with mode: "execute" to apply changes',
      stats: {
        total_analyzed: prospects.length,
        would_delete_chains: quickAnalysis.toDelete.length,
        would_delete_by_grok: grokToDelete.length,
        would_update_tiers: tierUpdates.length + grokUpdates.length,
        would_keep: quickAnalysis.alreadyGood.length + grokUpdates.length,
      },
      samples: {
        chains_to_delete: quickAnalysis.toDelete.slice(0, 10).map(p => ({
          name: p.name,
          job: p.source_job_title,
        })),
        grok_to_delete: grokToDelete.slice(0, 5),
        tier_updates: tierUpdates.slice(0, 10).map(u => ({
          id: u.id,
          new_tier: u.tier,
          score: u.priority_score,
        })),
      },
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to check cleanup status
export async function GET() {
  const supabase = createServerClient();

  const { data: stats } = await supabase
    .from('prospects')
    .select('tier, stage')
    .then(result => {
      if (!result.data) return { data: null };

      const tiers: Record<string, number> = { hot: 0, warm: 0, cold: 0, unknown: 0 };
      const stages: Record<string, number> = {};

      for (const p of result.data) {
        tiers[p.tier || 'unknown'] = (tiers[p.tier || 'unknown'] || 0) + 1;
        stages[p.stage || 'new'] = (stages[p.stage || 'new'] || 0) + 1;
      }

      return {
        data: {
          total: result.data.length,
          by_tier: tiers,
          by_stage: stages,
        },
      };
    });

  return NextResponse.json({
    current_stats: stats,
    cleanup_url: 'POST /api/cleanup-prospects with { mode: "analyze" | "execute", batchSize: 50 }',
  });
}
