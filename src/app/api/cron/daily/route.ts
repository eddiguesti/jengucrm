import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Single daily cron that handles EVERYTHING:
// 1. Scrape job postings for new prospects
// 2. Mine reviews for pain signals
// 3. Check inbox for replies
// 4. Auto-send emails to high-score NEW prospects
// 5. Send follow-ups to contacted prospects with no reply

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

  const results = {
    scrape_jobs: { success: false, error: null as string | null, stats: null as unknown },
    mine_reviews: { success: false, error: null as string | null, stats: null as unknown },
    check_replies: { success: false, error: null as string | null, stats: null as unknown },
    auto_emails: { success: false, error: null as string | null, stats: null as unknown },
    follow_ups: { success: false, error: null as string | null, stats: null as unknown },
  };

  // 1. Scrape job postings
  try {
    console.log('[Daily Cron] Starting job scraping...');
    const response = await fetch(`${baseUrl}/api/cron/scrape-jobs`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    });
    const data = await response.json();
    results.scrape_jobs = { success: response.ok, error: response.ok ? null : data.error, stats: data.stats };
  } catch (err) {
    results.scrape_jobs.error = String(err);
  }

  // 2. Mine reviews
  try {
    console.log('[Daily Cron] Starting review mining...');
    const response = await fetch(`${baseUrl}/api/cron/mine-reviews`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    });
    const data = await response.json();
    results.mine_reviews = { success: response.ok, error: response.ok ? null : data.error, stats: data.stats };
  } catch (err) {
    results.mine_reviews.error = String(err);
  }

  // 3. Check for email replies
  try {
    console.log('[Daily Cron] Checking for replies...');
    const response = await fetch(`${baseUrl}/api/check-replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours_back: 24 }),
    });
    const data = await response.json();
    results.check_replies = { success: response.ok, error: response.ok ? null : data.error, stats: data.results };
  } catch (err) {
    results.check_replies.error = String(err);
  }

  // 4. Auto-send emails to high-score NEW prospects
  try {
    console.log('[Daily Cron] Auto-sending emails...');
    const response = await fetch(`${baseUrl}/api/auto-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_emails: 10 }), // Send up to 10 new emails per day
    });
    const data = await response.json();
    results.auto_emails = { success: response.ok, error: response.ok ? null : data.error, stats: data };
  } catch (err) {
    results.auto_emails.error = String(err);
  }

  // 5. Send follow-ups to contacted prospects with no reply
  try {
    console.log('[Daily Cron] Sending follow-ups...');
    const response = await fetch(`${baseUrl}/api/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_follow_ups: 10 }), // Send up to 10 follow-ups per day
    });
    const data = await response.json();
    results.follow_ups = { success: response.ok, error: response.ok ? null : data.error, stats: data };
  } catch (err) {
    results.follow_ups.error = String(err);
  }

  // Log the run
  const supabase = createServerClient();
  await supabase.from('activities').insert({
    type: 'system',
    title: 'Daily automation completed',
    description: JSON.stringify(results, null, 2),
  });

  return NextResponse.json({
    success: true,
    message: 'Daily automation completed',
    completed_at: new Date().toISOString(),
    results,
  });
}
