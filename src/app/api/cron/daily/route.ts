import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { alertCronFailure, checkAndAlertBounceRate } from '@/lib/alerts';
import { auditCronRun } from '@/lib/audit';
import { dbCache } from '@/lib/cache';

/**
 * MASTER DAILY CRON - Complete automation pipeline
 *
 * Flow:
 * 1. Scrape job boards → hot leads with job pain points
 * 2. Enrich new prospects → website scrape, GM name, WHOIS, email finding
 * 3. Mine reviews → pain signals for personalization
 * 4. Check replies → process inbound, auto-respond
 * 5. Auto-email → send to high-score prospects with real emails
 * 6. Follow-ups → nudge contacted prospects with no reply
 * 7. Cleanup → clear expired cache and old data
 *
 * Note: Mystery shopper runs separately every 30 mins (8am-8pm) for 50 emails/day
 * This runs at 7am UTC to prepare prospects before 8am email send
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);

  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn({ requestId }, 'Daily cron: Unauthorized attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  logger.info({ requestId }, 'Daily cron: Starting automation pipeline');

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const results: Record<string, { success: boolean; error: string | null; stats: unknown }> = {
    scrape_jobs: { success: false, error: null, stats: null },
    enrich: { success: false, error: null, stats: null },
    mine_reviews: { success: false, error: null, stats: null },
    check_replies: { success: false, error: null, stats: null },
    auto_emails: { success: false, error: null, stats: null },
    follow_ups: { success: false, error: null, stats: null },
    cleanup: { success: false, error: null, stats: null },
  };

  // 1. Scrape job postings → hot leads with hiring signals
  try {
    logger.info({ requestId, step: 1 }, 'Daily cron: Job scraping...');
    const response = await fetch(`${baseUrl}/api/cron/scrape-jobs`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    });
    const data = await response.json();
    results.scrape_jobs = { success: response.ok, error: response.ok ? null : data.error, stats: data.stats };
    logger.info({ requestId, step: 1, success: response.ok }, 'Daily cron: Job scraping complete');
  } catch (err) {
    results.scrape_jobs.error = String(err);
    logger.error({ requestId, step: 1, error: err }, 'Daily cron: Job scraping failed');
  }

  // 2. Enrich new prospects → website, GM name, WHOIS, email
  try {
    logger.info({ requestId, step: 2 }, 'Daily cron: Enriching prospects...');
    const response = await fetch(`${baseUrl}/api/enrich`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 20 }),
    });
    const data = await response.json();
    results.enrich = { success: response.ok, error: response.ok ? null : data.error, stats: data };
    logger.info({ requestId, step: 2, success: response.ok, enriched: data.enriched || 0 }, 'Daily cron: Enrichment complete');
  } catch (err) {
    results.enrich.error = String(err);
    logger.error({ requestId, step: 2, error: err }, 'Daily cron: Enrichment failed');
  }

  // 3. Mine reviews for pain signals
  // Note: Mystery shopper runs separately every 30 mins for natural drip (50 emails/day)
  try {
    logger.info({ requestId, step: 3 }, 'Daily cron: Review mining...');
    const response = await fetch(`${baseUrl}/api/cron/mine-reviews`, {
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    });
    const data = await response.json();
    results.mine_reviews = { success: response.ok, error: response.ok ? null : data.error, stats: data.stats };
    logger.info({ requestId, step: 3, success: response.ok }, 'Daily cron: Review mining complete');
  } catch (err) {
    results.mine_reviews.error = String(err);
    logger.error({ requestId, step: 3, error: err }, 'Daily cron: Review mining failed');
  }

  // 4. Check for email replies
  try {
    logger.info({ requestId, step: 4 }, 'Daily cron: Checking replies...');
    const response = await fetch(`${baseUrl}/api/check-replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours_back: 24 }),
    });
    const data = await response.json();
    results.check_replies = { success: response.ok, error: response.ok ? null : data.error, stats: data.results };
    logger.info({ requestId, step: 4, success: response.ok }, 'Daily cron: Check replies complete');
  } catch (err) {
    results.check_replies.error = String(err);
    logger.error({ requestId, step: 4, error: err }, 'Daily cron: Check replies failed');
  }

  // 5. Auto-send emails to high-score prospects
  try {
    logger.info({ requestId, step: 5 }, 'Daily cron: Auto-sending emails...');
    const response = await fetch(`${baseUrl}/api/auto-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({
        max_emails: 80,
        min_score: 50,
        stagger_delay: true,
      }),
    });
    const data = await response.json();
    results.auto_emails = { success: response.ok, error: response.ok ? null : data.error, stats: data };
    logger.info({ requestId, step: 5, success: response.ok, sent: data.sent || 0 }, 'Daily cron: Auto emails complete');

    // Check bounce rate and alert if high
    if (data.bounced && data.sent) {
      await checkAndAlertBounceRate(data.bounced, data.sent);
    }
  } catch (err) {
    results.auto_emails.error = String(err);
    logger.error({ requestId, step: 5, error: err }, 'Daily cron: Auto emails failed');
  }

  // 6. Send follow-ups
  try {
    logger.info({ requestId, step: 6 }, 'Daily cron: Sending follow-ups...');
    const response = await fetch(`${baseUrl}/api/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_follow_ups: 20 }),
    });
    const data = await response.json();
    results.follow_ups = { success: response.ok, error: response.ok ? null : data.error, stats: data };
    logger.info({ requestId, step: 6, success: response.ok, sent: data.sent || 0 }, 'Daily cron: Follow-ups complete');
  } catch (err) {
    results.follow_ups.error = String(err);
    logger.error({ requestId, step: 6, error: err }, 'Daily cron: Follow-ups failed');
  }

  // 7. Cleanup expired cache and old data
  try {
    logger.info({ requestId, step: 7 }, 'Daily cron: Running cleanup...');
    const cleanedCache = await dbCache.cleanExpired();
    results.cleanup = { success: true, error: null, stats: { cacheEntriesCleaned: cleanedCache } };
    logger.info({ requestId, step: 7, cleaned: cleanedCache }, 'Daily cron: Cleanup complete');
  } catch (err) {
    results.cleanup.error = String(err);
    logger.error({ requestId, step: 7, error: err }, 'Daily cron: Cleanup failed');
  }

  // Calculate summary
  const successCount = Object.values(results).filter(r => r.success).length;
  const totalSteps = Object.keys(results).length;
  const allSuccess = successCount === totalSteps;
  const duration = Date.now() - startTime;

  // Log to activities table
  const supabase = createServerClient();
  await supabase.from('activities').insert({
    type: 'system',
    title: allSuccess ? 'Daily automation completed' : 'Daily automation completed with errors',
    description: JSON.stringify(results, null, 2),
  });

  // Audit the run
  await auditCronRun('daily', allSuccess, {
    successCount,
    totalSteps,
    duration,
    ...results,
  });

  // Alert if there were failures
  if (!allSuccess) {
    const failures = Object.entries(results)
      .filter(([, r]) => !r.success)
      .map(([step, r]) => `${step}: ${r.error}`)
      .join('\n');

    await alertCronFailure('daily', failures, {
      successCount,
      totalSteps,
      duration,
    });
  }

  logger.info({
    requestId,
    success: allSuccess,
    successCount,
    totalSteps,
    duration,
  }, 'Daily cron: Pipeline complete');

  return NextResponse.json({
    success: allSuccess,
    message: `Daily automation: ${successCount}/${totalSteps} steps succeeded`,
    completed_at: new Date().toISOString(),
    duration_ms: duration,
    results,
  });
}
