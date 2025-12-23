/**
 * CRON Handler - Scheduled task orchestration
 * Free Tier: All processing happens synchronously
 *
 * Triggers:
 * - Every 5 min, 8am-6pm Mon-Sat: Email sending window
 * - 7am daily: Daily pipeline (reset counters)
 * - Every minute: Check replies (DISABLED - no Azure)
 * - 10am Mon-Fri: Follow-ups
 * - Every 5 min, 6-7am and 7pm-11pm: Enrichment (find websites/emails)
 *
 * NOTE: Azure/jengu.ai is disabled - only SMTP inboxes are used
 */

import { Env, Prospect, CampaignStrategy } from '../types';
import { generateEmail } from '../lib/ai-gateway';
import { sendEmail, getAvailableInbox, recordSend } from '../lib/email-sender';
import { resetDailyCounters } from '../lib/supabase';
import { handleEnrich } from './enrich';
import { loggers } from '../lib/logger';
import * as DataIntegrity from '../lib/data-integrity';
import * as DataSync from '../lib/data-sync';
import * as Alerting from '../lib/alerting';
import * as EmailSafety from '../lib/email-safety';
import * as BounceHandler from '../lib/bounce-handler';

const logger = loggers.cron;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      controller.signal.addEventListener('abort', () => reject(new Error('timeout')))
    ),
  ]).finally(() => clearTimeout(timeout));
}

async function triggerSalesNavigatorEnrichment(env: Env): Promise<void> {
  const baseUrl = (env.VERCEL_APP_URL || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    console.log('Sales Nav enrichment: VERCEL_APP_URL not set, skipping');
    return;
  }

  const secret = env.VERCEL_CRON_SECRET;
  if (!secret) {
    console.log('Sales Nav enrichment: VERCEL_CRON_SECRET not set, skipping');
    return;
  }

  const url = `${baseUrl}/api/cron/sales-nav-enrichment`;

  try {
    const res = await withTimeout(
      fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          'User-Agent': 'jengu-crm-worker/cron',
          Accept: 'application/json',
        },
      }),
      20000
    );

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.log(`Sales Nav enrichment trigger failed: HTTP ${res.status} ${text.slice(0, 300)}`);
      return;
    }

    console.log(`Sales Nav enrichment triggered OK: ${text.slice(0, 300)}`);
  } catch (error) {
    console.log(`Sales Nav enrichment trigger error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function handleCron(
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const dayOfWeek = new Date().getUTCDay(); // 0 = Sunday, 6 = Saturday

  logger.info('CRON triggered', { hour, minute, dayOfWeek });

  try {
    // Route based on cron schedule pattern
    // Pattern: "*/5 8-18 * * 1-6" - Every 5 min, 8am-6pm, Mon-Sat
    if (minute % 5 === 0 && hour >= 8 && hour <= 18 && dayOfWeek >= 1 && dayOfWeek <= 6) {
      logger.info('Email sending window - triggering batch');
      await sendEmailBatch(env);
      return;
    }

    // Pattern: "0 7 * * *" - 7am daily
    if (hour === 7 && minute === 0) {
      await runDailyPipeline(env);
      return;
    }

    // Pattern: "0 10 * * 1-5" - 10am weekdays
    if (hour === 10 && minute === 0 && dayOfWeek >= 1 && dayOfWeek <= 5) {
      await sendFollowUps(env);
      return;
    }

    // Enrichment: Off-hours only (6-7am and 7pm-11pm) to not conflict with email sending
    // Pattern: "*/5 6,19-23 * * *" - runs EVERY DAY including Sunday
    // Goal: Use all 100 Google searches per day + unlimited free tiers
    const isEnrichmentHour = hour === 6 || (hour >= 19 && hour <= 23);
    if (minute % 5 === 0 && isEnrichmentHour) {
      logger.info('Running enrichment batch (auto-daily, uses all search APIs)');
      await runEnrichmentBatch(env);
      return;
    }

    // Sales Navigator enrichment (Supabase-backed, runs on Vercel/Next.js)
    // Pattern in wrangler.toml: "2-59/10 * * * *"
    // Picked to avoid overlapping the */5 email sending/enrichment minutes.
    if (minute % 10 === 2) {
      logger.info('Triggering Sales Navigator enrichment (Vercel)');
      await triggerSalesNavigatorEnrichment(env);
      return;
    }

    // Integrity checks and data sync - runs at 3am daily
    if (hour === 3 && minute === 0) {
      logger.info('Running daily integrity checks and sync');
      await runIntegrityAndSync(env);
      return;
    }

    // Pattern: "*/1 * * * *" - Every minute
    // Send pending reply notifications to edd@jengu.ai
    await sendPendingNotifications(env);
  } catch (error) {
    logger.error('CRON job failed', error, { hour, minute, dayOfWeek });

    // Send alert on critical cron failures
    await Alerting.alertOnError(error, 'system_error', 'CRON Job Failed', env, {
      hour,
      minute,
      dayOfWeek,
    });

    throw error;
  }
}

/**
 * Send a batch of emails synchronously
 */
async function sendEmailBatch(env: Env): Promise<void> {
  // Get warmup status to determine batch size
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  const statusResponse = await warmupCounter.fetch(new Request('http://do/status'));
  const status = await statusResponse.json<{
    summary: { remaining: number };
  }>();

  const remaining = status.summary?.remaining || 0;

  if (remaining <= 0) {
    console.log('Daily limit reached, skipping send');
    return;
  }

  // Send 1-3 emails per cycle
  const batchSize = Math.min(Math.ceil(remaining / 20), 3);

  // Find prospects ready to email
  const result = await env.DB.prepare(`
    SELECT
      id, name, city, country, property_type,
      contact_name, contact_email, contact_title,
      website, stage, tier, score, lead_source,
      source_job_title, job_pain_points, research_notes
    FROM prospects
    WHERE stage IN ('enriched', 'ready')
      AND archived = 0
      AND contact_email IS NOT NULL
      AND email_bounced = 0
      AND contact_email NOT LIKE 'info@%'
      AND contact_email NOT LIKE 'contact@%'
      AND contact_email NOT LIKE 'reservations@%'
      AND contact_email NOT LIKE 'reception@%'
      AND contact_email NOT LIKE 'booking@%'
      AND contact_email NOT LIKE 'hello@%'
      AND contact_email NOT LIKE 'support@%'
      AND contact_email NOT LIKE 'sales@%'
      AND contact_email NOT LIKE 'admin@%'
      AND contact_email NOT LIKE 'office@%'
      AND (last_contacted_at IS NULL OR last_contacted_at < datetime('now', '-3 days'))
    ORDER BY score DESC, created_at ASC
    LIMIT ?
  `).bind(batchSize).all();

  const prospects = result.results || [];

  console.log(`Found ${prospects.length} prospects ready for emailing`);

  for (const row of prospects) {
    try {
      const prospect = rowToProspect(row);
      await processAndSendEmail(prospect, env, false);

      // Random delay between emails (30-90 seconds)
      await sleep(30000 + Math.random() * 60000);
    } catch (error) {
      console.error(`Failed to send email to ${row.contact_email}:`, error);
    }
  }
}

/**
 * Daily pipeline - reset counters, cleanup
 */
async function runDailyPipeline(env: Env): Promise<void> {
  console.log('Running daily pipeline...');

  // Reset warmup counters for new day (Durable Object)
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  await warmupCounter.fetch(new Request('http://do/daily-reset', { method: 'POST' }));

  // Reset daily counters in Supabase
  await resetDailyCounters(env);

  // Weekly maintenance on Sundays
  const dayOfWeek = new Date().getUTCDay();
  if (dayOfWeek === 0) {
    await runWeeklyMaintenance(env);
  }

  console.log('Daily pipeline complete');
}

/**
 * Process a prospect and send email
 * NOTE: Only uses SMTP inboxes (Azure disabled)
 */
async function processAndSendEmail(
  prospect: Prospect,
  env: Env,
  isFollowUp: boolean
): Promise<void> {
  // SAFETY CHECK 1: Check emergency stop first
  if (await EmailSafety.isEmergencyStopActive(env)) {
    logger.warn('Emergency stop active - skipping email send', {
      prospectId: prospect.id,
    });
    return;
  }

  // SAFETY CHECK 2: Check if email is blocked (hard bounce, complaint, etc.)
  const blockCheck = await BounceHandler.isEmailBlocked(prospect.contactEmail!, env);
  if (blockCheck.blocked) {
    logger.warn('Email blocked - skipping send', {
      prospectId: prospect.id,
      email: prospect.contactEmail,
      reason: blockCheck.reason,
    });
    return;
  }

  // Get available SMTP inbox
  const inbox = await getAvailableInbox(env);

  if (!inbox) {
    console.log('No healthy SMTP inbox available');
    await Alerting.alertAllInboxesUnhealthy(env);
    return;
  }

  // Check warmup allowance for this inbox
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  const checkResponse = await warmupCounter.fetch(
    new Request('http://do/can-send', {
      method: 'POST',
      body: JSON.stringify({ inboxId: inbox.id }),
    })
  );
  const checkResult = await checkResponse.json<{ allowed: boolean; reason?: string }>();

  if (!checkResult.allowed) {
    console.log(`Warmup limit reached for ${inbox.email}: ${checkResult.reason}`);
    return;
  }

  // Determine strategy
  const strategy = getStrategyForSource(prospect.leadSource) as CampaignStrategy;

  // Generate email using AI
  let generated;
  try {
    generated = await generateEmail(prospect, strategy, isFollowUp, env);
  } catch (error) {
    console.error(`Failed to generate email for ${prospect.contactEmail}:`, error);
    return;
  }

  if (!generated) {
    console.error('Failed to generate email - empty response');
    return;
  }

  // SAFETY CHECK 2: Run all safety checks before sending
  const safetyResult = await EmailSafety.runSafetyChecks(
    prospect,
    { subject: generated.subject, body: generated.body },
    env
  );

  if (!safetyResult.safe) {
    const failedChecks = safetyResult.checks
      .filter(c => !c.passed)
      .map(c => c.name);

    logger.warn('Safety checks failed - email blocked', {
      prospectId: prospect.id,
      prospectEmail: prospect.contactEmail,
      blockedBy: safetyResult.blockedBy,
      failedChecks,
      safetyScore: safetyResult.score,
    });

    // Log the blocked send for audit trail
    await EmailSafety.logSendAttempt({
      prospectId: prospect.id,
      subject: generated.subject,
      sent: false,
      reason: `Safety check failed: ${safetyResult.blockedBy}`,
      safetyScore: safetyResult.score,
      failedChecks,
      blockedBy: safetyResult.blockedBy,
    }, env);

    return;
  }

  // SAFETY CHECK 3: Preflight content validation
  const preflight = EmailSafety.preflightCheck({
    subject: generated.subject,
    body: generated.body,
  });

  if (!preflight.passable) {
    logger.warn('Preflight check failed - email blocked', {
      prospectId: prospect.id,
      issues: preflight.issues,
      score: preflight.score,
    });

    await EmailSafety.logSendAttempt({
      prospectId: prospect.id,
      subject: generated.subject,
      sent: false,
      reason: `Preflight failed: ${preflight.issues[0]}`,
      safetyScore: preflight.score,
      failedChecks: preflight.issues,
    }, env);

    return;
  }

  // All safety checks passed - send email via SMTP
  const result = await sendEmail({
    to: prospect.contactEmail!,
    subject: generated.subject,
    body: generated.body,
    from: inbox.email,
    displayName: inbox.displayName,
    provider: inbox.provider,
    env,
  });

  // Get inbox state for recording
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  if (result.success) {
    // Record send in warmup counter (Durable Object)
    await warmupCounter.fetch(
      new Request('http://do/increment', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id }),
      })
    );

    // Record success in inbox state (Durable Object)
    await inboxState.fetch(
      new Request('http://do/mark-success', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id, latencyMs: result.latencyMs }),
      })
    );

    // Record send in Supabase (if mailbox ID is a UUID from Supabase)
    await recordSend(inbox.id, env);

    // Update D1 database
    const emailId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO emails (
        id, prospect_id, campaign_id, subject, body,
        to_email, from_email, message_id,
        direction, email_type, status, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'outbound', ?, 'sent', datetime('now'), datetime('now'))
    `).bind(
      emailId,
      prospect.id,
      strategy,
      generated.subject,
      generated.body,
      prospect.contactEmail,
      inbox.email,
      result.messageId || null,
      isFollowUp ? 'follow_up' : 'outreach'
    ).run();

    await env.DB.prepare(`
      UPDATE prospects
      SET stage = 'contacted', last_contacted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(prospect.id).run();

    // Log successful send
    await EmailSafety.logSendAttempt({
      prospectId: prospect.id,
      subject: generated.subject,
      sent: true,
      safetyScore: safetyResult.score,
      failedChecks: [],
    }, env);

    logger.info('Email sent successfully', {
      prospectId: prospect.id,
      prospectEmail: prospect.contactEmail,
      inbox: inbox.email,
      safetyScore: safetyResult.score,
    });
  } else {
    // Record failure
    await inboxState.fetch(
      new Request('http://do/mark-failure', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id, error: result.error }),
      })
    );

    console.error(`✗ Failed to send email to ${prospect.contactEmail}: ${result.error}`);

    // Classify the error and record bounce
    const bounceType = BounceHandler.classifySMTPError(
      result.error || 'Unknown error'
    );

    if (bounceType !== 'unknown') {
      const reason = BounceHandler.getBounceReason(bounceType, result.error || '');

      // Record the bounce
      await BounceHandler.recordBounce({
        email: prospect.contactEmail!,
        type: bounceType,
        reason,
        originalMessageId: result.messageId,
      }, env);

      // Handle soft bounces with retry logic
      if (bounceType === 'soft') {
        const retryResult = await BounceHandler.handleSoftBounce(
          prospect.id,
          prospect.contactEmail!,
          env
        );
        logger.info('Soft bounce handling', {
          prospectId: prospect.id,
          email: prospect.contactEmail,
          shouldRetry: retryResult.shouldRetry,
          retryCount: retryResult.retryCount,
          reason: retryResult.reason,
        });
      }
    }

    // Alert on email sending failure
    await Alerting.alertEmailSendingFailure(
      prospect.contactEmail!,
      result.error || 'Unknown error',
      inbox.id,
      env
    );
  }
}

/**
 * Send follow-up emails
 */
async function sendFollowUps(env: Env): Promise<void> {
  // Find prospects who haven't replied after 3+ days
  const result = await env.DB.prepare(`
    SELECT
      p.id, p.name, p.city, p.country, p.property_type,
      p.contact_name, p.contact_email, p.contact_title,
      p.website, p.stage, p.tier, p.score, p.lead_source,
      p.source_job_title, p.job_pain_points, p.research_notes,
      COUNT(e.id) as email_count
    FROM prospects p
    LEFT JOIN emails e ON e.prospect_id = p.id AND e.direction = 'outbound'
    WHERE p.stage = 'contacted'
      AND p.archived = 0
      AND p.last_contacted_at < datetime('now', '-3 days')
      AND p.last_replied_at IS NULL
    GROUP BY p.id
    HAVING email_count < 4
    ORDER BY p.last_contacted_at ASC
    LIMIT 10
  `).all();

  const prospects = result.results || [];

  console.log(`Found ${prospects.length} prospects needing follow-up`);

  for (const row of prospects) {
    try {
      const prospect = rowToProspect(row);
      await processAndSendEmail(prospect, env, true);
      await sleep(30000 + Math.random() * 60000);
    } catch (error) {
      console.error(`Follow-up failed for ${row.contact_email}:`, error);
    }
  }
}

/**
 * Run enrichment batch - finds websites and emails for prospects
 * Called during off-hours to not conflict with email sending
 *
 * RUNS EVERY DAY automatically - uses all search APIs including Google (100/day)
 * Schedule: Every 5 min from 6am-7am and 7pm-midnight = ~72 runs/day
 * Batch size: 100 prospects per run = ~7200 prospects/day capacity
 */
async function runEnrichmentBatch(env: Env): Promise<void> {
  try {
    // Create a mock request to trigger enrichment with higher batch size
    const request = new Request('https://internal/enrich/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }), // Process 100 prospects per batch
    });
    const response = await handleEnrich(request, env);
    const result = await response.json();
    console.log('Enrichment batch result:', JSON.stringify(result));
  } catch (error) {
    console.error('Enrichment batch failed:', error);
  }
}

// NOTE: checkInboxForReplies and processInboundEmail are DISABLED
// Azure/jengu.ai is not being used - replies handled via webhook at /webhook/email/inbound

/**
 * Weekly maintenance tasks
 */
async function runWeeklyMaintenance(env: Env): Promise<void> {
  // Archive stale prospects
  await env.DB.prepare(`
    UPDATE prospects
    SET archived = 1, stage = 'lost'
    WHERE stage IN ('new', 'enriched', 'contacted')
      AND archived = 0
      AND updated_at < datetime('now', '-30 days')
      AND last_replied_at IS NULL
  `).run();

  // Clean up old emails (keep last 90 days)
  await env.DB.prepare(`
    DELETE FROM emails
    WHERE created_at < datetime('now', '-90 days')
  `).run();

  console.log('Weekly maintenance completed');
}

/**
 * Convert DB row to Prospect type
 */
function rowToProspect(row: Record<string, unknown>): Prospect {
  return {
    id: row.id as string,
    name: row.name as string,
    city: row.city as string,
    country: row.country as string | null,
    propertyType: row.property_type as string | null,
    contactName: row.contact_name as string | null,
    contactEmail: row.contact_email as string | null,
    contactTitle: row.contact_title as string | null,
    phone: row.phone as string | null,
    website: row.website as string | null,
    stage: row.stage as Prospect['stage'],
    tier: row.tier as Prospect['tier'],
    score: row.score as number,
    leadSource: row.lead_source as string,
    sourceUrl: row.source_url as string | null,
    sourceJobTitle: row.source_job_title as string | null,
    jobPainPoints: row.job_pain_points ? JSON.parse(row.job_pain_points as string) : null,
    researchNotes: row.research_notes as string | null,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
    lastContactedAt: row.last_contacted_at as string | null,
    lastRepliedAt: row.last_replied_at as string | null,
    archived: Boolean(row.archived),
    emailVerified: Boolean(row.email_verified),
    emailBounced: Boolean(row.email_bounced),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    // Website scraper data for personalization
    starRating: row.star_rating as number | null,
    chainAffiliation: row.chain_affiliation as string | null,
    estimatedRooms: row.estimated_rooms as number | null,
    googleRating: row.google_rating as number | null,
    googleReviewCount: row.google_review_count as number | null,
  };
}

/**
 * Get email strategy based on lead source
 * Default: simple_personalized for all new prospects
 */
function getStrategyForSource(_source: string): string {
  // Use simple_personalized for all prospects - fixed template with website personalization
  return 'simple_personalized';
}

/**
 * Run integrity checks and data sync
 * Scheduled to run at 3am daily
 */
async function runIntegrityAndSync(env: Env): Promise<void> {
  logger.info('Starting integrity checks and sync');
  const startTime = Date.now();

  try {
    // Step 1: Run integrity checks
    logger.info('Running integrity checks...');
    const integrityResult = await DataIntegrity.runIntegrityChecks(env);
    logger.info('Integrity checks complete', {
      success: integrityResult.success,
      issueCount: integrityResult.issues.length,
      orphanedEmails: integrityResult.stats.orphanedEmails,
      duplicateProspects: integrityResult.stats.duplicateProspects,
      invalidStates: integrityResult.stats.invalidStates,
      durationMs: integrityResult.durationMs,
    });

    // Send alert if integrity issues found
    if (integrityResult.issues.length > 0) {
      const criticalCount = integrityResult.issues.filter(
        i => i.severity === 'critical' || i.severity === 'error'
      ).length;

      await Alerting.alertIntegrityIssue(
        integrityResult.issues.length,
        criticalCount,
        `Found ${integrityResult.issues.length} data integrity issues (${criticalCount} critical). ` +
        `Orphaned emails: ${integrityResult.stats.orphanedEmails}, ` +
        `Duplicate prospects: ${integrityResult.stats.duplicateProspects}, ` +
        `Invalid states: ${integrityResult.stats.invalidStates}`,
        env
      );
    }

    // Step 2: Auto-fix issues where possible
    if (integrityResult.issues.length > 0) {
      logger.info('Auto-fixing issues...');
      const fixResult = await DataIntegrity.autoFixIssues(env);
      logger.info('Auto-fix complete', {
        fixed: fixResult.fixed,
        skipped: fixResult.skipped,
      });
    }

    // Step 3: Sync data between D1 and Supabase
    logger.info('Running data sync...');
    const syncResult = await DataSync.runFullSync(env);
    logger.info('Data sync complete', {
      prospects: {
        processed: syncResult.prospects.recordsProcessed,
        failed: syncResult.prospects.recordsFailed,
      },
      campaigns: {
        processed: syncResult.campaigns.recordsProcessed,
        failed: syncResult.campaigns.recordsFailed,
      },
      emails: {
        processed: syncResult.emails.recordsProcessed,
        failed: syncResult.emails.recordsFailed,
      },
    });

    // Alert if sync had failures
    const totalSyncFailures =
      syncResult.prospects.recordsFailed +
      syncResult.campaigns.recordsFailed +
      syncResult.emails.recordsFailed;

    if (totalSyncFailures > 0) {
      await Alerting.alertWarning(
        'database_error',
        'Data Sync Partial Failure',
        `Sync completed with ${totalSyncFailures} failed records`,
        env,
        {
          prospectsFailed: syncResult.prospects.recordsFailed,
          campaignsFailed: syncResult.campaigns.recordsFailed,
          emailsFailed: syncResult.emails.recordsFailed,
        }
      );
    }

    // Step 4: Clean up old resolved issues (older than 30 days)
    const cleanedUp = await DataIntegrity.cleanupOldIssues(env, 30);
    if (cleanedUp > 0) {
      logger.info('Cleaned up old issues', { count: cleanedUp });
    }

    const totalDurationMs = Date.now() - startTime;
    logger.info('Integrity and sync complete', {
      totalDurationMs,
      success: integrityResult.success && syncResult.prospects.success && syncResult.emails.success,
    });

  } catch (error) {
    logger.error('Integrity and sync failed', error);
    await Alerting.alertOnError(error, 'database_error', 'Integrity/Sync Failed', env);
    throw error;
  }
}

/**
 * Send pending reply notifications to edd@jengu.ai
 */
async function sendPendingNotifications(env: Env): Promise<void> {
  // Get pending notifications (max 5 per minute)
  const result = await env.DB.prepare(`
    SELECT id, type, recipient, subject, body, prospect_id, reply_id
    FROM notifications
    WHERE sent = 0
    ORDER BY created_at ASC
    LIMIT 5
  `).all<{
    id: string;
    type: string;
    recipient: string;
    subject: string;
    body: string;
    prospect_id: string | null;
    reply_id: string | null;
  }>();

  const notifications = result.results || [];

  if (notifications.length === 0) {
    return;
  }

  logger.info(`Sending ${notifications.length} pending notification(s)`);

  if (!env.RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY not configured, skipping notifications');
    return;
  }

  for (const notification of notifications) {
    try {
      // Send via Resend
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Jengu CRM <notifications@updates.jengu.ai>',
          to: [notification.recipient],
          subject: notification.subject,
          text: notification.body,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Resend error: ${response.status} - ${error}`);
      }

      // Mark as sent
      await env.DB.prepare(`
        UPDATE notifications
        SET sent = 1, sent_at = datetime('now')
        WHERE id = ?
      `).bind(notification.id).run();

      logger.info('Notification sent', {
        id: notification.id,
        type: notification.type,
        recipient: notification.recipient,
      });

      // Small delay between notifications
      await sleep(1000);

    } catch (error) {
      // Mark error but don't fail the entire batch
      await env.DB.prepare(`
        UPDATE notifications
        SET error = ?
        WHERE id = ?
      `).bind(
        error instanceof Error ? error.message : 'Unknown error',
        notification.id
      ).run();

      logger.error('Failed to send notification', error, {
        id: notification.id,
      });
    }
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
