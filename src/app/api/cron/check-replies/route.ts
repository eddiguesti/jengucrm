import { NextRequest, NextResponse } from 'next/server';

// Cron job to check for email replies
// Runs daily at 9am via Vercel Cron (configured in vercel.json)
export async function GET(request: NextRequest) {
  // Verify this is a cron request (Vercel sets this header)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, verify the cron secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Call the check-replies endpoint
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/check-replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`, // Pass auth through
      },
      body: JSON.stringify({ hours_back: 6 }), // Check last 6 hours (for external cron every 4 hours)
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Reply check completed',
      result,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron check-replies error:', error);
    return NextResponse.json(
      { error: 'Cron job failed', details: String(error) },
      { status: 500 }
    );
  }
}
