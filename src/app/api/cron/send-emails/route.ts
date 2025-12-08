import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Old batch email sender
 *
 * DO NOT USE THIS ENDPOINT - it sends all emails at once!
 *
 * Use /api/cron/hourly-email instead, which sends 1 email at a time
 * with human-like randomness (every 5-15 minutes).
 *
 * This endpoint now redirects to the new human-like approach.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Redirect to the new human-like email endpoint
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    const response = await fetch(`${baseUrl}/api/cron/hourly-email`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
      },
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'DEPRECATED: Redirected to /api/cron/hourly-email (sends 1 email with human-like timing)',
      warning: 'Please update your external cron to call /api/cron/hourly-email every 5 minutes instead',
      result,
      executed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron send-emails error:', error);
    return NextResponse.json(
      { error: 'Cron job failed', details: String(error) },
      { status: 500 }
    );
  }
}
