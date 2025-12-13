/**
 * Bounce & Complaint Handler
 *
 * Handles all bounce types and spam complaints:
 * - Hard bounce: Permanent block (mailbox doesn't exist)
 * - Soft bounce: Retry up to 3 times (mailbox full, temp issue)
 * - Block bounce: Investigate (policy rejection)
 * - Complaint: Permanent block + exclusion list
 *
 * These signals directly impact sender reputation - handle immediately.
 */

import { Env } from '../types';
import { loggers } from './logger';
import * as Alerting from './alerting';

const logger = loggers.api;

// ==================
// TYPES
// ==================

export type BounceType = 'hard' | 'soft' | 'block' | 'complaint' | 'unknown';

export interface BounceRecord {
  email: string;
  type: BounceType;
  reason: string;
  originalMessageId?: string;
  notificationId?: string;
  smtpCode?: number;
}

export interface BounceStats {
  summary: {
    hard: number;
    soft: number;
    block: number;
    complaint: number;
    total: number;
  };
  byInbox: Array<{
    email: string;
    hardBounces: number;
    softBounces: number;
    complaints: number;
    bounceRate: number;
  }>;
  blockedProspects: number;
  last30Days: {
    bounces: number;
    complaints: number;
  };
}

// ==================
// SMTP ERROR CLASSIFICATION
// ==================

/**
 * Classify SMTP error into bounce type
 */
export function classifySMTPError(error: Error | string, responseCode?: number): BounceType {
  const message = typeof error === 'string' ? error.toLowerCase() : error.message.toLowerCase();
  const code = responseCode ?? extractResponseCode(message);

  // Hard bounces - 5xx permanent failures
  if (code !== undefined && code >= 550 && code < 560) {
    const hardBouncePatterns = [
      'user unknown',
      'mailbox not found',
      'no such user',
      'invalid recipient',
      'recipient rejected',
      'address rejected',
      'does not exist',
      'unknown user',
      'account disabled',
      'account inactive',
      'mailbox unavailable',
      'not found',
    ];

    if (hardBouncePatterns.some(p => message.includes(p))) {
      return 'hard';
    }
  }

  // General 5xx errors are typically hard bounces
  if (code !== undefined && code >= 500 && code < 600) {
    return 'hard';
  }

  // Soft bounces - 4xx temporary failures
  if (code !== undefined && code >= 400 && code < 500) {
    const softBouncePatterns = [
      'mailbox full',
      'over quota',
      'quota exceeded',
      'try again',
      'temporarily',
      'service unavailable',
      'too many connections',
      'rate limit',
      'deferred',
      'greylisted',
    ];

    if (softBouncePatterns.some(p => message.includes(p))) {
      return 'soft';
    }
    return 'soft'; // Default 4xx to soft bounce
  }

  // Block bounces - policy rejections
  const blockPatterns = [
    'blocked',
    'blacklist',
    'blacklisted',
    'spam',
    'rejected',
    'policy',
    'dmarc',
    'spf',
    'dkim',
    'reputation',
    'not allowed',
    'access denied',
    'refused',
  ];

  if (blockPatterns.some(p => message.includes(p))) {
    return 'block';
  }

  return 'unknown';
}

/**
 * Extract SMTP response code from error message
 */
function extractResponseCode(message: string): number | undefined {
  // Match patterns like "550", "4.2.2", "554 5.7.1"
  const match = message.match(/\b([45]\d{2})\b/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Get human-readable bounce reason
 */
export function getBounceReason(type: BounceType, smtpError: string): string {
  switch (type) {
    case 'hard':
      if (smtpError.includes('not found') || smtpError.includes('unknown')) {
        return 'Email address does not exist';
      }
      if (smtpError.includes('disabled') || smtpError.includes('inactive')) {
        return 'Email account disabled or inactive';
      }
      return 'Permanent delivery failure';

    case 'soft':
      if (smtpError.includes('full') || smtpError.includes('quota')) {
        return 'Mailbox full or over quota';
      }
      if (smtpError.includes('temporarily')) {
        return 'Temporary delivery failure';
      }
      return 'Temporary issue - will retry';

    case 'block':
      if (smtpError.includes('blacklist')) {
        return 'Sender on blacklist';
      }
      if (smtpError.includes('spam')) {
        return 'Rejected as spam';
      }
      if (smtpError.includes('dmarc') || smtpError.includes('spf') || smtpError.includes('dkim')) {
        return 'Authentication failure (SPF/DKIM/DMARC)';
      }
      return 'Blocked by recipient policy';

    case 'complaint':
      return 'Marked as spam by recipient';

    default:
      return 'Unknown delivery issue';
  }
}

// ==================
// BOUNCE NOTIFICATION DETECTION
// ==================

/**
 * Check if an incoming email is a bounce notification
 */
export function isBounceNotification(email: {
  from: string;
  subject: string;
  body?: string;
}): boolean {
  const fromLower = email.from.toLowerCase();
  const subjectLower = email.subject.toLowerCase();

  // Check sender
  const bounceSenders = [
    'mailer-daemon',
    'postmaster',
    'mail-daemon',
    'mailerdaemon',
    'bounces',
  ];

  if (bounceSenders.some(s => fromLower.includes(s))) {
    return true;
  }

  // Check subject
  const bounceSubjects = [
    'delivery failed',
    'delivery status',
    'undeliverable',
    'returned mail',
    'mail delivery failed',
    'failure notice',
    'delivery notification',
    'mail could not be delivered',
    'message not delivered',
    'returned to sender',
  ];

  if (bounceSubjects.some(s => subjectLower.includes(s))) {
    return true;
  }

  return false;
}

/**
 * Extract bounced email address from bounce notification
 */
export function extractBouncedEmail(body: string): string | null {
  const patterns = [
    /Original-Recipient:.*?<?([^\s<>@]+@[^\s<>]+)>?/i,
    /Final-Recipient:.*?<?([^\s<>@]+@[^\s<>]+)>?/i,
    /X-Failed-Recipients:\s*<?([^\s<>@]+@[^\s<>]+)>?/i,
    /was not delivered to:\s*<?([^\s<>@]+@[^\s<>]+)>?/i,
    /could not be delivered to:\s*<?([^\s<>@]+@[^\s<>]+)>?/i,
    /delivery to:\s*<?([^\s<>@]+@[^\s<>]+)>?\s*failed/i,
    /recipient[:\s]+<?([^\s<>@]+@[^\s<>]+)>?/i,
    /<([^\s<>@]+@[^\s<>]+)>\s*was rejected/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      return match[1].toLowerCase().trim();
    }
  }

  return null;
}

/**
 * Classify bounce type from notification body
 */
export function classifyBounceFromNotification(body: string): BounceType {
  const bodyLower = body.toLowerCase();

  // Check for hard bounce indicators
  const hardIndicators = [
    'user unknown',
    'mailbox not found',
    'no such user',
    'address rejected',
    'does not exist',
    'invalid address',
    'undeliverable',
    'permanent',
  ];

  if (hardIndicators.some(i => bodyLower.includes(i))) {
    return 'hard';
  }

  // Check for soft bounce indicators
  const softIndicators = [
    'mailbox full',
    'over quota',
    'temporarily',
    'try again later',
    'service unavailable',
    'deferred',
  ];

  if (softIndicators.some(i => bodyLower.includes(i))) {
    return 'soft';
  }

  // Check for block indicators
  const blockIndicators = [
    'blocked',
    'spam',
    'blacklist',
    'policy',
    'rejected',
  ];

  if (blockIndicators.some(i => bodyLower.includes(i))) {
    return 'block';
  }

  // Default to hard if we can't determine
  return 'hard';
}

// ==================
// BOUNCE RECORDING
// ==================

/**
 * Record a bounce and update related records
 */
export async function recordBounce(bounce: BounceRecord, env: Env): Promise<void> {
  logger.info('Recording bounce', {
    email: bounce.email,
    type: bounce.type,
    reason: bounce.reason,
  });

  try {
    // 1. Insert into bounces table
    await env.DB.prepare(`
      INSERT INTO bounces (id, email, type, reason, original_message_id, notification_id, smtp_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      crypto.randomUUID(),
      bounce.email.toLowerCase(),
      bounce.type,
      bounce.reason,
      bounce.originalMessageId || null,
      bounce.notificationId || null,
      bounce.smtpCode || null
    ).run();

    // 2. Update prospect based on bounce type
    if (bounce.type === 'hard' || bounce.type === 'complaint') {
      // Permanent block
      await env.DB.prepare(`
        UPDATE prospects SET
          email_bounced = 1,
          bounce_type = ?,
          bounce_reason = ?,
          bounced_at = datetime('now'),
          updated_at = datetime('now')
        WHERE LOWER(contact_email) = ?
      `).bind(bounce.type, bounce.reason, bounce.email.toLowerCase()).run();

      logger.info('Prospect marked as bounced', {
        email: bounce.email,
        type: bounce.type,
      });
    }

    // 3. Update email record if we have message ID
    if (bounce.originalMessageId) {
      await env.DB.prepare(`
        UPDATE emails SET
          status = 'bounced',
          bounced_at = datetime('now')
        WHERE message_id = ?
      `).bind(bounce.originalMessageId).run();
    }

    // 4. For complaints, add to permanent exclusion list
    if (bounce.type === 'complaint') {
      await addToExclusionList(bounce.email, 'spam_complaint', env);

      // Alert on complaints - they're serious
      await Alerting.alertCritical(
        'email_sending_failure',
        'Spam Complaint Received',
        `Email: ${bounce.email}\nReason: ${bounce.reason}`,
        env,
        { email: bounce.email, type: bounce.type }
      );
    }

    // 5. Check if we need to pause any inbox
    if (bounce.originalMessageId) {
      const { results } = await env.DB.prepare(`
        SELECT from_email FROM emails WHERE message_id = ?
      `).bind(bounce.originalMessageId).all();

      if (results?.[0]?.from_email) {
        await checkInboxHealthAndPause(results[0].from_email as string, env);
      }
    }
  } catch (error) {
    logger.error('Failed to record bounce', error, {
      email: bounce.email,
      type: bounce.type,
    });
    throw error;
  }
}

/**
 * Add email to permanent exclusion list
 */
async function addToExclusionList(email: string, reason: string, env: Env): Promise<void> {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO email_exclusions (id, email, reason, added_by, created_at)
    VALUES (?, ?, ?, 'system', datetime('now'))
  `).bind(crypto.randomUUID(), email.toLowerCase(), reason).run();

  logger.info('Added to exclusion list', { email, reason });
}

/**
 * Check inbox health after bounce and auto-pause if critical
 */
async function checkInboxHealthAndPause(inboxEmail: string, env: Env): Promise<void> {
  const { results } = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
    FROM emails
    WHERE from_email = ?
    AND sent_at > datetime('now', '-7 days')
    AND direction = 'outbound'
  `).bind(inboxEmail).all();

  const total = Number(results?.[0]?.total) || 0;
  const bounced = Number(results?.[0]?.bounced) || 0;
  const bounceRate = total > 0 ? (bounced / total) * 100 : 0;

  if (bounceRate > 5 && total >= 10) {
    // Auto-pause inbox
    await env.DB.prepare(`
      UPDATE mailboxes SET
        status = 'paused',
        last_error = ?,
        updated_at = datetime('now')
      WHERE email = ?
    `).bind(`Auto-paused: ${bounceRate.toFixed(1)}% bounce rate`, inboxEmail).run();

    await Alerting.alertCritical(
      'email_sending_failure',
      `Inbox Auto-Paused: ${inboxEmail}`,
      `Bounce rate: ${bounceRate.toFixed(1)}% (${bounced}/${total} in 7 days)`,
      env,
      { inboxEmail, bounceRate, total, bounced }
    );
  }
}

// ==================
// COMPLAINT HANDLING
// ==================

/**
 * Record a spam complaint
 */
export async function recordComplaint(
  email: string,
  source: 'feedback_loop' | 'manual' | 'reply' | 'webhook',
  env: Env,
  originalMessageId?: string
): Promise<void> {
  logger.warn('Recording spam complaint', { email, source });

  await recordBounce({
    email,
    type: 'complaint',
    reason: `Spam complaint via ${source}`,
    originalMessageId,
  }, env);

  // Update prospect to lost stage
  await env.DB.prepare(`
    UPDATE prospects SET
      stage = 'lost',
      updated_at = datetime('now')
    WHERE LOWER(contact_email) = ?
  `).bind(email.toLowerCase()).run();
}

// ==================
// SOFT BOUNCE RETRY
// ==================

/**
 * Handle soft bounce - determine if we should retry
 */
export async function handleSoftBounce(
  prospectId: string,
  email: string,
  env: Env
): Promise<{ shouldRetry: boolean; retryCount: number; reason: string }> {
  // Get retry count from recent soft bounces
  const { results } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM bounces
    WHERE email = ?
    AND type = 'soft'
    AND created_at > datetime('now', '-7 days')
  `).bind(email.toLowerCase()).all();

  const retryCount = Number(results?.[0]?.count) || 0;

  if (retryCount >= 3) {
    // Promote to hard bounce after 3 soft bounces
    await env.DB.prepare(`
      UPDATE prospects SET
        email_bounced = 1,
        bounce_type = 'hard',
        bounce_reason = 'Promoted from soft bounce after 3 retries',
        bounced_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(prospectId).run();

    logger.info('Soft bounce promoted to hard bounce', {
      prospectId,
      email,
      retryCount,
    });

    return {
      shouldRetry: false,
      retryCount,
      reason: 'Max retries exceeded - promoted to hard bounce',
    };
  }

  // Calculate next retry delay (exponential backoff: 24h, 48h, 96h)
  const retryDelayHours = Math.pow(2, retryCount) * 24;

  logger.info('Soft bounce - will retry', {
    prospectId,
    email,
    retryCount,
    nextRetryInHours: retryDelayHours,
  });

  return {
    shouldRetry: true,
    retryCount,
    reason: `Will retry in ${retryDelayHours} hours (attempt ${retryCount + 1}/3)`,
  };
}

// ==================
// PRE-SEND CHECKS
// ==================

/**
 * Check if email is blocked before sending
 */
export async function isEmailBlocked(email: string, env: Env): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  const emailLower = email.toLowerCase();

  // 1. Check prospects table
  const { results: prospect } = await env.DB.prepare(`
    SELECT email_bounced, bounce_type, bounce_reason FROM prospects
    WHERE LOWER(contact_email) = ?
  `).bind(emailLower).all();

  if (prospect?.[0]?.email_bounced) {
    return {
      blocked: true,
      reason: `${prospect[0].bounce_type} bounce: ${prospect[0].bounce_reason}`,
    };
  }

  // 2. Check exclusion list
  const { results: excluded } = await env.DB.prepare(`
    SELECT reason FROM email_exclusions WHERE email = ?
  `).bind(emailLower).all();

  if (excluded?.length) {
    return {
      blocked: true,
      reason: `Excluded: ${excluded[0].reason}`,
    };
  }

  // 3. Check recent hard bounces
  const { results: recentBounce } = await env.DB.prepare(`
    SELECT type, reason FROM bounces
    WHERE email = ? AND type IN ('hard', 'complaint')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(emailLower).all();

  if (recentBounce?.length) {
    return {
      blocked: true,
      reason: `Recent ${recentBounce[0].type}: ${recentBounce[0].reason}`,
    };
  }

  return { blocked: false };
}

// ==================
// BOUNCE STATS
// ==================

/**
 * Get bounce statistics
 */
export async function getBounceStats(env: Env): Promise<BounceStats> {
  // Summary by type (last 30 days)
  const { results: summary } = await env.DB.prepare(`
    SELECT
      type,
      COUNT(*) as count
    FROM bounces
    WHERE created_at > datetime('now', '-30 days')
    GROUP BY type
  `).all();

  const summaryMap: Record<BounceType, number> = {
    hard: 0,
    soft: 0,
    block: 0,
    complaint: 0,
    unknown: 0,
  };

  for (const row of summary || []) {
    summaryMap[row.type as BounceType] = Number(row.count);
  }

  // By inbox
  const { results: byInbox } = await env.DB.prepare(`
    SELECT
      e.from_email as email,
      COUNT(DISTINCT CASE WHEN b.type = 'hard' THEN b.id END) as hard_bounces,
      COUNT(DISTINCT CASE WHEN b.type = 'soft' THEN b.id END) as soft_bounces,
      COUNT(DISTINCT CASE WHEN b.type = 'complaint' THEN b.id END) as complaints,
      COUNT(DISTINCT e.id) as total_sent
    FROM emails e
    LEFT JOIN bounces b ON e.message_id = b.original_message_id
    WHERE e.sent_at > datetime('now', '-30 days')
    AND e.direction = 'outbound'
    GROUP BY e.from_email
  `).all();

  const byInboxMapped = (byInbox || []).map(row => ({
    email: row.email as string,
    hardBounces: Number(row.hard_bounces) || 0,
    softBounces: Number(row.soft_bounces) || 0,
    complaints: Number(row.complaints) || 0,
    bounceRate: row.total_sent
      ? ((Number(row.hard_bounces) + Number(row.soft_bounces)) / Number(row.total_sent)) * 100
      : 0,
  }));

  // Blocked prospects count
  const { results: blocked } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM prospects WHERE email_bounced = 1
  `).all();

  // Last 30 days totals
  const last30DaysBounces = Object.values(summaryMap).reduce((a, b) => a + b, 0);

  return {
    summary: {
      hard: summaryMap.hard,
      soft: summaryMap.soft,
      block: summaryMap.block,
      complaint: summaryMap.complaint,
      total: last30DaysBounces,
    },
    byInbox: byInboxMapped,
    blockedProspects: Number(blocked?.[0]?.count) || 0,
    last30Days: {
      bounces: last30DaysBounces - summaryMap.complaint,
      complaints: summaryMap.complaint,
    },
  };
}

// ==================
// PROCESS INCOMING BOUNCE
// ==================

/**
 * Process an incoming bounce notification email
 */
export async function processBounceNotification(
  email: { from: string; subject: string; body: string; messageId: string },
  env: Env
): Promise<{ processed: boolean; bouncedEmail?: string; type?: BounceType }> {
  // Check if it's a bounce notification
  if (!isBounceNotification(email)) {
    return { processed: false };
  }

  // Extract the bounced email
  const bouncedEmail = extractBouncedEmail(email.body);
  if (!bouncedEmail) {
    logger.warn('Could not extract bounced email from notification', {
      subject: email.subject,
      from: email.from,
    });
    return { processed: false };
  }

  // Classify the bounce type
  const bounceType = classifyBounceFromNotification(email.body);

  // Record the bounce
  await recordBounce({
    email: bouncedEmail,
    type: bounceType,
    reason: getBounceReason(bounceType, email.body),
    notificationId: email.messageId,
  }, env);

  logger.info('Processed bounce notification', {
    bouncedEmail,
    type: bounceType,
    notificationSubject: email.subject,
  });

  return {
    processed: true,
    bouncedEmail,
    type: bounceType,
  };
}
