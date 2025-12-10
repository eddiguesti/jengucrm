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

  try {
    console.log('[Follow-up Cron] Email sending disabled - skipping follow-ups...');

    return NextResponse.json({
      success: true,
      message: 'Follow-up emails disabled - email sending disabled',
      disabled: true,
    });
  } catch (error) {
    console.error('[Follow-up Cron] Error:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}