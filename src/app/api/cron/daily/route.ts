import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * MASTER DAILY CRON - Complete automation pipeline
 *
 * Flow:
 * 1. Scrape job boards → hot leads with job pain points
 * 2. Enrich new prospects → website scrape, GM name, WHOIS, email finding
 * 3. Mystery shopper → for prospects with only generic emails (info@, reservations@)
 * 4. Mine reviews → pain signals for personalization
 * 5. Check replies → process inbound, auto-respond
 * 6. Auto-email → send to high-score prospects with real emails
 * 7. Follow-ups → nudge contacted prospects with no reply
 *
 * This runs at 7am UTC to prepare prospects before 8am email send
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

  const results: Record<string, { success: boolean; error: string | null; stats: unknown }> = {
    scrape_jobs: { success: false, error: null, stats: null },
    enrich: { success: false, error: null, stats: null },
    mystery_shopper: { success: false, error: null, stats: null },
    mine_reviews: { success: false, error: null, stats: null },
    check_replies: { success: false, error: null, stats: null },
    auto_emails: { success: false, error: null, stats: null },
    follow_ups: { success: false, error: null, stats: null },
  };

  // 1. Scrape job postings → hot leads with hiring signals
  try {
    console.log('[Daily Cron] Step 1: Job scraping...');
    const response = await fetch(`${baseUrl}/api/cron/scrape-jobs`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    });
    const data = await response.json();
    results.scrape_jobs = { success: response.ok, error: response.ok ? null : data.error, stats: data.stats };
    console.log('[Daily Cron] Job scraping:', response.ok ? 'OK' : 'FAILED');
  } catch (err) {
    results.scrape_jobs.error = String(err);
    console.log('[Daily Cron] Job scraping: ERROR', err);
  }

  // 2. Enrich new prospects → website, GM name, WHOIS, email
  // This finds decision-maker contacts and tags generic emails for mystery shopper
  try {
    console.log('[Daily Cron] Step 2: Enriching new prospects...');
    const response = await fetch(`${baseUrl}/api/enrich`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 20 }), // Enrich up to 20 new prospects per day
    });
    const data = await response.json();
    results.enrich = { success: response.ok, error: response.ok ? null : data.error, stats: data };
    console.log('[Daily Cron] Enrichment:', response.ok ? `OK (${data.enriched || 0} enriched)` : 'FAILED');
  } catch (err) {
    results.enrich.error = String(err);
    console.log('[Daily Cron] Enrichment: ERROR', err);
  }

  // 3. Mystery shopper → send to prospects with generic emails to find GM
  // These are prospects tagged 'needs-contact-discovery' during enrichment
  try {
    console.log('[Daily Cron] Step 3: Mystery shopper for generic emails...');
    const response = await fetch(`${baseUrl}/api/mystery-inquiry`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 80, delay_ms: 60000, randomize: true }), // Send 80 mystery inquiries per day (40 per Gmail account), ~1min random delays
    });
    const data = await response.json();
    results.mystery_shopper = { success: response.ok, error: response.ok ? null : data.error, stats: data };
    console.log('[Daily Cron] Mystery shopper:', response.ok ? `OK (${data.sent || 0} sent)` : 'FAILED');
  } catch (err) {
    results.mystery_shopper.error = String(err);
    console.log('[Daily Cron] Mystery shopper: ERROR', err);
  }

  // 4. Mine reviews for pain signals
  try {
    console.log('[Daily Cron] Step 4: Review mining...');
    const response = await fetch(`${baseUrl}/api/cron/mine-reviews`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    });
    const data = await response.json();
    results.mine_reviews = { success: response.ok, error: response.ok ? null : data.error, stats: data.stats };
    console.log('[Daily Cron] Review mining:', response.ok ? 'OK' : 'FAILED');
  } catch (err) {
    results.mine_reviews.error = String(err);
    console.log('[Daily Cron] Review mining: ERROR', err);
  }

  // 5. Check for email replies
  try {
    console.log('[Daily Cron] Step 5: Checking replies...');
    const response = await fetch(`${baseUrl}/api/check-replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours_back: 24 }),
    });
    const data = await response.json();
    results.check_replies = { success: response.ok, error: response.ok ? null : data.error, stats: data.results };
    console.log('[Daily Cron] Check replies:', response.ok ? 'OK' : 'FAILED');
  } catch (err) {
    results.check_replies.error = String(err);
    console.log('[Daily Cron] Check replies: ERROR', err);
  }

  // 6. Auto-send emails to high-score prospects (uses full inbox capacity)
  try {
    console.log('[Daily Cron] Step 6: Auto-sending emails...');
    const response = await fetch(`${baseUrl}/api/auto-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({
        max_emails: 80, // 4 inboxes × 20/day = 80 capacity
        min_score: 50,
        stagger_delay: true,
      }),
    });
    const data = await response.json();
    results.auto_emails = { success: response.ok, error: response.ok ? null : data.error, stats: data };
    console.log('[Daily Cron] Auto emails:', response.ok ? `OK (${data.sent || 0} sent)` : 'FAILED');
  } catch (err) {
    results.auto_emails.error = String(err);
    console.log('[Daily Cron] Auto emails: ERROR', err);
  }

  // 7. Send follow-ups to contacted prospects with no reply
  try {
    console.log('[Daily Cron] Step 7: Sending follow-ups...');
    const response = await fetch(`${baseUrl}/api/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_follow_ups: 20 }), // Send up to 20 follow-ups per day
    });
    const data = await response.json();
    results.follow_ups = { success: response.ok, error: response.ok ? null : data.error, stats: data };
    console.log('[Daily Cron] Follow-ups:', response.ok ? `OK (${data.sent || 0} sent)` : 'FAILED');
  } catch (err) {
    results.follow_ups.error = String(err);
    console.log('[Daily Cron] Follow-ups: ERROR', err);
  }

  // Log the run
  const supabase = createServerClient();
  await supabase.from('activities').insert({
    type: 'system',
    title: 'Daily automation completed',
    description: JSON.stringify(results, null, 2),
  });

  // Summary
  const successCount = Object.values(results).filter(r => r.success).length;
  const totalSteps = Object.keys(results).length;

  return NextResponse.json({
    success: successCount === totalSteps,
    message: `Daily automation: ${successCount}/${totalSteps} steps succeeded`,
    completed_at: new Date().toISOString(),
    results,
  });
}
