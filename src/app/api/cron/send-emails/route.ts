import { NextRequest, NextResponse } from 'next/server';

// Cron job to send outreach emails
// Runs Mon-Fri at 9am UTC - sends 40 emails with staggered delays
// Hobby plan only allows 1 cron per day, so we send more per batch
export async function GET(request: NextRequest) {
  // Verify this is a cron request (Vercel sets this header)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, verify the cron secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Call the auto-email endpoint
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/auto-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({
        max_emails: 80, // 4 inboxes × 20/day = 80 capacity (auto-email respects inbox limits)
        min_score: 50,
        stagger_delay: true, // Random delays between emails
      }),
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Email send completed',
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
