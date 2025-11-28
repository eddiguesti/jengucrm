import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();

  // Try to get lead_source column, fall back if it doesn't exist yet
  let data;
  let error;

  const result = await supabase.from('prospects').select('tier, stage, lead_source');
  if (result.error?.message?.includes('lead_source does not exist')) {
    // Column doesn't exist yet, query without it
    const fallback = await supabase.from('prospects').select('tier, stage');
    data = fallback.data;
    error = fallback.error;
  } else {
    data = result.data;
    error = result.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = {
    total: data?.length || 0,
    byTier: { hot: 0, warm: 0, cold: 0 } as Record<string, number>,
    byStage: {} as Record<string, number>,
    painLeads: 0,
  };

  for (const p of data || []) {
    stats.byTier[p.tier] = (stats.byTier[p.tier] || 0) + 1;
    stats.byStage[p.stage] = (stats.byStage[p.stage] || 0) + 1;
    if ('lead_source' in p && p.lead_source === 'review_mining') {
      stats.painLeads++;
    }
  }

  // Get pain signals count (table might not exist yet)
  let painSignals = 0;
  try {
    const { count } = await supabase
      .from('pain_signals')
      .select('*', { count: 'exact', head: true });
    painSignals = count || 0;
  } catch {
    // Table doesn't exist yet
  }

  return NextResponse.json({
    ...stats,
    painSignals,
  });
}
