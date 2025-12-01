import { NextRequest, NextResponse } from 'next/server';

/**
 * Follow-up Cron Job
 * Runs at 10am UTC Mon-Fri to send follow-up emails
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    console.log('[Follow-up Cron] Sending follow-ups...');

    const response = await fetch(`${baseUrl}/api/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_follow_ups: 20 }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Follow-up Cron] Failed:', data.error);
      return NextResponse.json({
        success: false,
        error: data.error,
      }, { status: 500 });
    }

    console.log('[Follow-up Cron] Complete:', data.sent || 0, 'follow-ups sent');

    return NextResponse.json({
      success: true,
      message: `Sent ${data.sent || 0} follow-up emails`,
      stats: data,
    });
  } catch (error) {
    console.error('[Follow-up Cron] Error:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
