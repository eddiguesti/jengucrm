/**
 * Enrichment Logs API
 * Fetches recent enrichment activity from prospects
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const type = searchParams.get('type'); // 'website', 'email', or null for all

    const supabase = createServerClient();

    // Get recently updated prospects (enrichment activity)
    let query = supabase
      .from('prospects')
      .select('id, name, city, country, website, email, contact_name, stage, updated_at, created_at')
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .limit(limit);

    // Filter by enrichment type
    if (type === 'website') {
      query = query.not('website', 'is', null);
    } else if (type === 'email') {
      query = query.not('email', 'is', null);
    }

    const { data: recentActivity, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate enrichment stats for the logs
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const logs = (recentActivity || []).map((p) => {
      const updatedAt = new Date(p.updated_at);
      let action = 'updated';

      if (p.email && p.website) {
        action = 'fully_enriched';
      } else if (p.email) {
        action = 'email_found';
      } else if (p.website) {
        action = 'website_found';
      }

      return {
        id: p.id,
        name: p.name,
        location: [p.city, p.country].filter(Boolean).join(', ') || 'Unknown',
        action,
        website: p.website,
        email: p.email,
        contactName: p.contact_name,
        stage: p.stage,
        timestamp: p.updated_at,
        isRecent: updatedAt > last24h,
      };
    });

    // Summary stats
    const stats = {
      total: logs.length,
      last24h: logs.filter((l) => l.isRecent).length,
      websitesFound: logs.filter((l) => l.website).length,
      emailsFound: logs.filter((l) => l.email).length,
      fullyEnriched: logs.filter((l) => l.action === 'fully_enriched').length,
    };

    return NextResponse.json({
      logs,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Enrichment logs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrichment logs' },
      { status: 500 }
    );
  }
}
