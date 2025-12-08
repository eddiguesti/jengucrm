import { NextRequest, NextResponse } from 'next/server';
import { getWarmupDailyLimit, getWarmupStatus, isBusinessHours } from '@/lib/constants';
import { createServerClient } from '@/lib/supabase';

/**
 * HUMAN-LIKE EMAIL CRON
 *
 * Sends 1 email at random intervals to mimic human sending patterns.
 * Call every 5 minutes - randomly skips ~30% of calls to create natural gaps.
 * Result: emails sent every 5-15 minutes with variation.
 *
 * Setup: External cron service (cron-job.org) to call every 5 minutes:
 * - URL: https://jengu.ai/api/cron/hourly-email
 * - Schedule: every 5 mins, 8am-6pm Mon-Fri
 * - Method: GET
 * - Header: Authorization: Bearer YOUR_CRON_SECRET
 *
 * Math: ~80 calls/day × 70% send rate = ~56 emails (close to 80 with some doubles)
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, verify the cron secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const warmupStatus = getWarmupStatus();
    const dailyLimit = getWarmupDailyLimit();

    // HUMAN-LIKE RANDOMNESS: Skip ~30% of calls to create natural gaps
    // This makes sending pattern look like: 5min, 10min, 5min, 15min, 5min...
    const skipChance = Math.random();
    if (skipChance < 0.30) {
      return NextResponse.json({
        success: true,
        message: 'Skipped this cycle (human-like randomness)',
        skipped: true,
        skip_reason: 'Random delay for natural pattern',
        warmup: {
          day: warmupStatus.day,
          stage: warmupStatus.stage,
          daily_limit: dailyLimit,
        },
        executed_at: new Date().toISOString(),
      });
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    // Send exactly 1 email
    const response = await fetch(`${baseUrl}/api/auto-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({
        max_emails: 1,
        min_score: 0,
        stagger_delay: false,
      }),
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: result.data?.sent === 1
        ? `Email sent to 1 prospect`
        : result.data?.error || 'No email sent',
      skipped: false,
      warmup: {
        day: warmupStatus.day,
        stage: warmupStatus.stage,
        daily_limit: dailyLimit,
        sent_today: result.data?.warmup?.sent_today || 0,
        remaining: result.data?.warmup?.remaining || dailyLimit,
      },
      result: result.data,
      executed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Email cron error:', error);
    return NextResponse.json(
      { error: 'Email cron failed', details: String(error) },
      { status: 500 }
    );
  }
}
