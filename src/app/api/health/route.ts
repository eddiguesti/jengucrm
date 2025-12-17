/**
 * Health Check Endpoint
 * Returns system status for monitoring
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {
      database: 'unknown',
      cloudflare: 'unknown',
      enrichment: 'unknown',
    },
    details: {} as Record<string, any>,
  };

  try {
    // Check Supabase connection
    const { error: dbError, count } = await supabase
      .from('prospects')
      .select('id', { count: 'exact', head: true });

    if (dbError) {
      checks.checks.database = 'unhealthy';
      checks.status = 'degraded';
      checks.details.database_error = dbError.message;
    } else {
      checks.checks.database = 'healthy';
      checks.details.prospect_count = count;
    }

    // Check Cloudflare Workers (if configured)
    const cloudflareUrl = process.env.CLOUDFLARE_WORKER_URL;
    if (cloudflareUrl) {
      try {
        const cfResponse = await fetch(`${cloudflareUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });

        if (cfResponse.ok) {
          checks.checks.cloudflare = 'healthy';
          const cfData = await cfResponse.json();
          checks.details.cloudflare = cfData;
        } else {
          checks.checks.cloudflare = 'unhealthy';
          checks.status = 'degraded';
          checks.details.cloudflare_status = cfResponse.status;
        }
      } catch (error) {
        checks.checks.cloudflare = 'unreachable';
        checks.status = 'degraded';
        checks.details.cloudflare_error = error instanceof Error ? error.message : String(error);
      }
    } else {
      checks.checks.cloudflare = 'not_configured';
    }

    // Check enrichment API
    try {
      const enrichmentResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:3000'}/api/enrichment/status`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (enrichmentResponse.ok) {
        checks.checks.enrichment = 'healthy';
        const enrichmentData = await enrichmentResponse.json();
        checks.details.enrichment = enrichmentData;
      } else {
        checks.checks.enrichment = 'unhealthy';
        checks.details.enrichment_status = enrichmentResponse.status;
      }
    } catch (error) {
      checks.checks.enrichment = 'unreachable';
      checks.details.enrichment_error = error instanceof Error ? error.message : String(error);
    }

    // Determine overall status
    const unhealthyCount = Object.values(checks.checks).filter(
      (s) => s === 'unhealthy' || s === 'unreachable'
    ).length;

    if (unhealthyCount > 0) {
      checks.status = unhealthyCount >= 2 ? 'unhealthy' : 'degraded';
    }

    const statusCode = checks.status === 'healthy' ? 200 : checks.status === 'degraded' ? 200 : 503;

    return NextResponse.json(checks, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
