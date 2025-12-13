/**
 * Enrichment Status API
 * Returns accurate enrichment statistics using single efficient database query
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CLOUDFLARE_WORKER_URL = 'https://jengu-crm.edd-181.workers.dev';

interface EnrichmentStats {
  total: number;
  needsWebsite: number;
  hasWebsite: number;
  needsEmail: number;
  hasEmail: number;
  fullyEnriched: number;
  contacted: number;
  byStage: Record<string, number>;
  last24h: number;
  stuckCount: number;
  hasContactName: number;
  hasStarRating: number;
  hasGoogleRating: number;
}

export async function GET() {
  try {
    const supabase = createServerClient();

    // Get all stats in a single efficient query using RPC function
    const { data: stats, error: statsError } = await supabase.rpc('get_enrichment_stats');

    if (statsError) {
      console.error('RPC error:', statsError);
      // Fall back to basic counts if RPC fails
      const { count: total } = await supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .eq('archived', false);

      return NextResponse.json({
        stats: {
          total: total || 0,
          needsWebsite: 0,
          hasWebsite: 0,
          needsEmail: 0,
          hasEmail: 0,
          fullyEnriched: 0,
          contacted: 0,
          byStage: {},
          last24h: 0,
          stuckCount: 0,
          hasContactName: 0,
          hasStarRating: 0,
          hasGoogleRating: 0,
        },
        needsAttention: [],
        isRunning: false,
        timestamp: new Date().toISOString(),
        error: 'Using fallback - RPC function may need to be deployed',
      });
    }

    const enrichmentStats = stats as EnrichmentStats;

    // Get prospects needing attention (separate query for detailed data)
    const { data: needsAttention } = await supabase
      .from('prospects')
      .select('id, name, city, country, stage, website, email, contact_name, updated_at')
      .eq('archived', false)
      .eq('stage', 'new')
      .order('created_at', { ascending: false })
      .limit(10);

    // Check if enrichment is currently running (from Cloudflare worker)
    let isRunning = false;
    let progress = null;
    try {
      const cfResponse = await fetch(`${CLOUDFLARE_WORKER_URL}/enrich/progress`, {
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 0 }, // No cache
      });
      if (cfResponse.ok) {
        const cfData = await cfResponse.json();
        isRunning = cfData.isRunning ?? false;
        progress = cfData.progress ?? null;
      }
    } catch {
      // Cloudflare worker unavailable - that's okay
    }

    // Calculate pipeline metrics
    const pipeline = {
      waiting: enrichmentStats.needsWebsite || 0,
      hasWebsite: (enrichmentStats.hasWebsite || 0) - (enrichmentStats.hasEmail || 0),
      hasEmail: (enrichmentStats.hasEmail || 0) - (enrichmentStats.contacted || 0),
      contacted: enrichmentStats.contacted || 0,
    };

    // Calculate coverage percentages
    const total = enrichmentStats.total || 1; // Avoid division by zero
    const coverage = {
      website: Math.round(((enrichmentStats.hasWebsite || 0) / total) * 100),
      email: Math.round(((enrichmentStats.hasEmail || 0) / total) * 100),
      overall: Math.round(((enrichmentStats.fullyEnriched || 0) / total) * 100),
    };

    return NextResponse.json({
      // Core stats from RPC
      stats: enrichmentStats,

      // Pipeline visualization data
      pipeline,

      // Coverage percentages
      coverage,

      // Prospects needing attention
      needsAttention: needsAttention || [],

      // Real-time status
      isRunning,
      progress,

      // Metadata
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Enrichment status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrichment status' },
      { status: 500 }
    );
  }
}
