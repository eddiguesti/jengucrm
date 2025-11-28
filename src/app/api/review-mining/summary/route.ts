import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get total pain leads (prospects with lead_source = 'review_mining')
    const { count: totalPainLeads } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('lead_source', 'review_mining');

    // Get total pain signals
    const { count: totalPainSignals } = await supabase
      .from('pain_signals')
      .select('*', { count: 'exact', head: true });

    // Get counts by platform from scrape logs
    const { data: platformCounts } = await supabase
      .from('review_scrape_logs')
      .select('platform, new_leads_created')
      .eq('status', 'completed');

    const byPlatform: Record<string, number> = {};
    for (const log of platformCounts || []) {
      byPlatform[log.platform] = (byPlatform[log.platform] || 0) + (log.new_leads_created || 0);
    }

    // Get recent pain leads with their signal counts
    const { data: recentLeads } = await supabase
      .from('prospects')
      .select(`
        id,
        name,
        city,
        score
      `)
      .eq('lead_source', 'review_mining')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get pain signal counts for each lead
    const leadsWithCounts = await Promise.all(
      (recentLeads || []).map(async (lead) => {
        const { count } = await supabase
          .from('pain_signals')
          .select('*', { count: 'exact', head: true })
          .eq('prospect_id', lead.id);

        return {
          ...lead,
          pain_signal_count: count || 0,
        };
      })
    );

    return NextResponse.json({
      total_pain_leads: totalPainLeads || 0,
      total_pain_signals: totalPainSignals || 0,
      by_platform: byPlatform,
      recent_leads: leadsWithCounts,
    });
  } catch (error) {
    console.error('Failed to fetch summary:', error);
    return NextResponse.json({
      total_pain_leads: 0,
      total_pain_signals: 0,
      by_platform: {},
      recent_leads: [],
    });
  }
}
