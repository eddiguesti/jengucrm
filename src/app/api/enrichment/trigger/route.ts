/**
 * Trigger Enrichment API
 * Triggers enrichment on Cloudflare worker (fire-and-forget)
 * Returns immediately so UI can start polling progress
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CLOUDFLARE_WORKER_URL = 'https://jengu-crm.edd-181.workers.dev';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type = 'auto', limit } = body;

    let endpoint = '/enrich/auto';
    if (type === 'websites') endpoint = '/enrich/websites';
    if (type === 'emails') endpoint = '/enrich/emails';

    // Fire-and-forget: Don't await the response
    // This allows the UI to immediately start polling for progress
    fetch(`${CLOUDFLARE_WORKER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
    }).catch(err => {
      console.error('Background enrichment error:', err);
    });

    // Return immediately
    return NextResponse.json({
      success: true,
      type,
      message: 'Enrichment started',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Trigger enrichment error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger enrichment' },
      { status: 500 }
    );
  }
}
