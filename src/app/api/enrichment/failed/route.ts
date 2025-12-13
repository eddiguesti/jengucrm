/**
 * Failed Enrichment Tasks API
 * Proxies to Cloudflare worker for retry queue management
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CLOUDFLARE_WORKER_URL = 'https://jengu-crm.edd-181.workers.dev';

export async function GET() {
  try {
    // Get retry queue stats from Cloudflare worker
    const cfResponse = await fetch(`${CLOUDFLARE_WORKER_URL}/api/retry-queue/stats`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!cfResponse.ok) {
      const errorText = await cfResponse.text();
      return NextResponse.json(
        { error: `Cloudflare worker error: ${errorText}` },
        { status: cfResponse.status }
      );
    }

    const stats = await cfResponse.json();

    return NextResponse.json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed enrichment stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retry queue stats' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, taskId, prospectId } = body;

    let endpoint = '/api/retry-queue/stats';
    let method = 'GET';
    let reqBody: string | undefined;

    switch (action) {
      case 'retry':
        endpoint = '/api/retry-queue/retry';
        method = 'POST';
        reqBody = JSON.stringify({ taskId });
        break;
      case 'resolve':
        endpoint = '/api/retry-queue/resolve';
        method = 'POST';
        reqBody = JSON.stringify({ taskId, prospectId });
        break;
      case 'cleanup':
        endpoint = '/api/retry-queue/cleanup';
        method = 'POST';
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const cfResponse = await fetch(`${CLOUDFLARE_WORKER_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: reqBody,
    });

    if (!cfResponse.ok) {
      const errorText = await cfResponse.text();
      return NextResponse.json(
        { error: `Cloudflare worker error: ${errorText}` },
        { status: cfResponse.status }
      );
    }

    const result = await cfResponse.json();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed enrichment action error:', error);
    return NextResponse.json(
      { error: 'Failed to perform action' },
      { status: 500 }
    );
  }
}
