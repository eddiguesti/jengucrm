/**
 * Spam Score Checker
 *
 * Calculates spam likelihood for emails before sending.
 * Protects sender reputation by catching spam-like content.
 *
 * Scoring:
 * - 0-2: Safe to send
 * - 3-5: Warning (review recommended)
 * - 6+: Don't send (too spammy)
 */

import { loggers } from './logger';

const logger = loggers.api;

// ==================
// SPAM TRIGGERS
// ==================

const SPAM_TRIGGERS = {
  // +3 points each - highly spammy
  high: [
    { pattern: /\bfree\b.*\bmoney\b/i, reason: 'free money phrase' },
    { pattern: /\bact now\b/i, reason: 'act now urgency' },
    { pattern: /\bno obligation\b/i, reason: 'no obligation claim' },
    { pattern: /\bclick here\b/i, reason: 'click here CTA' },
    { pattern: /\$\d{4,}/, reason: 'large dollar amount' },
    { pattern: /!!+/, reason: 'multiple exclamation marks' },
    { pattern: /100% (free|guaranteed)/i, reason: '100% guarantee claim' },
    { pattern: /\bwinner\b/i, reason: 'winner trigger' },
    { pattern: /\bcongratulations\b/i, reason: 'congratulations trigger' },
    { pattern: /\bdouble your\b/i, reason: 'double your promise' },
    { pattern: /\bmillion dollars\b/i, reason: 'million dollars phrase' },
    { pattern: /\bno risk\b/i, reason: 'no risk claim' },
    { pattern: /\bonce in a lifetime\b/i, reason: 'once in a lifetime urgency' },
    { pattern: /\bunsubscribe\b/i, reason: 'unsubscribe (cold email shouldn\'t have)' },
  ],

  // +2 points each - moderately spammy
  medium: [
    { pattern: /\burgent\b/i, reason: 'urgent word' },
    { pattern: /\blimited time\b/i, reason: 'limited time urgency' },
    { pattern: /\bdon't miss\b/i, reason: 'don\'t miss urgency' },
    { pattern: /\bspecial offer\b/i, reason: 'special offer phrase' },
    { pattern: /\bexclusive\b/i, reason: 'exclusive claim' },
    { pattern: /[A-Z]{5,}/, reason: 'all caps word' },
    { pattern: /\bguarantee\b/i, reason: 'guarantee claim' },
    { pattern: /\brisk.?free\b/i, reason: 'risk-free claim' },
    { pattern: /\bno cost\b/i, reason: 'no cost claim' },
    { pattern: /\bfree trial\b/i, reason: 'free trial offer' },
    { pattern: /\bincredible\b/i, reason: 'incredible superlative' },
    { pattern: /\bamazing\b/i, reason: 'amazing superlative' },
    { pattern: /\bexpires?\b/i, reason: 'expiration urgency' },
    { pattern: /\bact fast\b/i, reason: 'act fast urgency' },
    { pattern: /\bwhile supplies last\b/i, reason: 'scarcity tactic' },
  ],

  // +1 point each - mildly spammy
  low: [
    { pattern: /\bdeal\b/i, reason: 'deal word' },
    { pattern: /\bdiscount\b/i, reason: 'discount word' },
    { pattern: /\bsale\b/i, reason: 'sale word' },
    { pattern: /\bsave\b/i, reason: 'save word' },
    { pattern: /!/, reason: 'exclamation mark' },
    { pattern: /\bpromise\b/i, reason: 'promise word' },
    { pattern: /\bbonus\b/i, reason: 'bonus word' },
    { pattern: /\bcash\b/i, reason: 'cash word' },
    { pattern: /\bearn\b/i, reason: 'earn word' },
    { pattern: /\bprofit\b/i, reason: 'profit word' },
    { pattern: /\binvestment\b/i, reason: 'investment word' },
  ],
};

// AI artifacts that should never appear
const AI_ARTIFACTS = [
  { pattern: /As an AI/i, reason: 'AI disclosure' },
  { pattern: /I cannot/i, reason: 'AI refusal' },
  { pattern: /I'm unable to/i, reason: 'AI inability' },
  { pattern: /language model/i, reason: 'AI reference' },
  { pattern: /I don't have access/i, reason: 'AI limitation' },
  { pattern: /I apologize/i, reason: 'AI apology' },
  { pattern: /I'm sorry, but/i, reason: 'AI apologetic refusal' },
  { pattern: /I'm happy to help/i, reason: 'AI greeting' },
  { pattern: /As a large language/i, reason: 'AI self-reference' },
];

// Content that indicates broken templates
const BROKEN_TEMPLATE = [
  { pattern: /\{\{[^}]+\}\}/, reason: 'unresolved variable' },
  { pattern: /\[FIRST_NAME\]/i, reason: 'unresolved placeholder' },
  { pattern: /\[NAME\]/i, reason: 'unresolved placeholder' },
  { pattern: /\[COMPANY\]/i, reason: 'unresolved placeholder' },
  { pattern: /\[HOTEL\]/i, reason: 'unresolved placeholder' },
  { pattern: /undefined/, reason: 'undefined value' },
  { pattern: /null/, reason: 'null value' },
  { pattern: /NaN/, reason: 'NaN value' },
  { pattern: /\\n/, reason: 'escaped newlines' },
];

// ==================
// TYPES
// ==================

export interface SpamCheckResult {
  score: number;
  level: 'safe' | 'warning' | 'danger';
  passable: boolean;
  triggers: string[];
  aiArtifacts: string[];
  brokenTemplate: string[];
  suggestions: string[];
}

// ==================
// CORE FUNCTIONS
// ==================

/**
 * Calculate spam score for an email
 */
export function calculateSpamScore(email: { subject: string; body: string }): SpamCheckResult {
  const text = `${email.subject} ${email.body}`;
  const triggers: string[] = [];
  const aiArtifacts: string[] = [];
  const brokenTemplate: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // Check high severity triggers (+3 each)
  for (const { pattern, reason } of SPAM_TRIGGERS.high) {
    if (pattern.test(text)) {
      score += 3;
      triggers.push(reason);
    }
  }

  // Check medium severity triggers (+2 each)
  for (const { pattern, reason } of SPAM_TRIGGERS.medium) {
    if (pattern.test(text)) {
      score += 2;
      triggers.push(reason);
    }
  }

  // Check low severity triggers (+1 each)
  for (const { pattern, reason } of SPAM_TRIGGERS.low) {
    if (pattern.test(text)) {
      score += 1;
      triggers.push(reason);
    }
  }

  // Check for AI artifacts (+5 each - critical)
  for (const { pattern, reason } of AI_ARTIFACTS) {
    if (pattern.test(text)) {
      score += 5;
      aiArtifacts.push(reason);
    }
  }

  // Check for broken templates (+10 each - must not send)
  for (const { pattern, reason } of BROKEN_TEMPLATE) {
    if (pattern.test(text)) {
      score += 10;
      brokenTemplate.push(reason);
    }
  }

  // Additional content checks
  const bodyLength = email.body.length;
  const subjectLength = email.subject.length;

  // Length checks
  if (bodyLength < 50) {
    score += 2;
    suggestions.push('Body too short (<50 chars)');
  }
  if (bodyLength > 2000) {
    score += 1;
    suggestions.push('Body quite long (>2000 chars)');
  }
  if (subjectLength > 100) {
    score += 2;
    suggestions.push('Subject too long (>100 chars)');
  }
  if (subjectLength < 3) {
    score += 3;
    suggestions.push('Subject too short (<3 chars)');
  }

  // Link count
  const linkCount = (text.match(/https?:\/\//g) || []).length;
  if (linkCount > 3) {
    score += 2;
    suggestions.push(`Too many links (${linkCount})`);
  }

  // Image count (cold emails shouldn't have images)
  const imageCount = (text.match(/<img/gi) || []).length;
  if (imageCount > 0) {
    score += 2;
    suggestions.push(`Contains images (${imageCount})`);
  }

  // Determine level
  let level: 'safe' | 'warning' | 'danger';
  if (score <= 2) {
    level = 'safe';
  } else if (score <= 5) {
    level = 'warning';
  } else {
    level = 'danger';
  }

  // Add suggestions based on findings
  if (triggers.length > 0) {
    suggestions.push(`Remove or rephrase: ${triggers.slice(0, 3).join(', ')}`);
  }
  if (aiArtifacts.length > 0) {
    suggestions.push('Regenerate email - contains AI artifacts');
  }
  if (brokenTemplate.length > 0) {
    suggestions.push('Template error - missing personalization');
  }

  return {
    score,
    level,
    passable: score <= 5 && brokenTemplate.length === 0 && aiArtifacts.length === 0,
    triggers,
    aiArtifacts,
    brokenTemplate,
    suggestions,
  };
}

/**
 * Quick check if email is too spammy to send
 */
export function isSpammy(email: { subject: string; body: string }): boolean {
  const result = calculateSpamScore(email);
  return !result.passable;
}

/**
 * Get human-readable spam assessment
 */
export function getSpamAssessment(email: { subject: string; body: string }): string {
  const result = calculateSpamScore(email);

  if (result.brokenTemplate.length > 0) {
    return `BLOCKED: Template errors (${result.brokenTemplate.join(', ')})`;
  }

  if (result.aiArtifacts.length > 0) {
    return `BLOCKED: AI artifacts (${result.aiArtifacts.join(', ')})`;
  }

  if (result.level === 'danger') {
    return `HIGH RISK (score: ${result.score}): ${result.triggers.slice(0, 3).join(', ')}`;
  }

  if (result.level === 'warning') {
    return `MODERATE RISK (score: ${result.score}): Consider revising`;
  }

  return `LOW RISK (score: ${result.score}): Safe to send`;
}

// ==================
// BOUNCE RATE MONITORING
// ==================

export interface BounceRateResult {
  inboxId: string;
  email: string;
  totalSent: number;
  bounced: number;
  rate: number;
  status: 'healthy' | 'warning' | 'critical';
  recommendation: string;
}

/**
 * Check bounce rate for a specific inbox
 */
export async function checkBounceRate(
  inboxId: string,
  inboxEmail: string,
  env: { DB: D1Database }
): Promise<BounceRateResult> {
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
  const rate = total > 0 ? (bounced / total) * 100 : 0;

  let status: 'healthy' | 'warning' | 'critical';
  let recommendation: string;

  if (rate > 5) {
    status = 'critical';
    recommendation = 'PAUSE IMMEDIATELY: Bounce rate exceeds 5%. Investigate and clean list.';
  } else if (rate > 2) {
    status = 'warning';
    recommendation = 'CAUTION: Bounce rate elevated. Reduce volume and verify emails before sending.';
  } else {
    status = 'healthy';
    recommendation = 'Healthy bounce rate. Continue normal operations.';
  }

  return {
    inboxId,
    email: inboxEmail,
    totalSent: total,
    bounced,
    rate,
    status,
    recommendation,
  };
}

/**
 * Check bounce rates for all active inboxes
 * NOTE: Queries emails table for unique from_email addresses since mailboxes are in Supabase
 */
export async function checkAllBounceRates(
  env: { DB: D1Database }
): Promise<BounceRateResult[]> {
  // Get unique from_email addresses from recent outbound emails
  const { results: inboxes } = await env.DB.prepare(`
    SELECT DISTINCT from_email as email
    FROM emails
    WHERE direction = 'outbound'
      AND sent_at > datetime('now', '-30 days')
      AND from_email IS NOT NULL
  `).all<{ email: string }>();

  const results: BounceRateResult[] = [];

  for (const inbox of inboxes || []) {
    // Use email as ID since we don't have inbox IDs in D1
    const result = await checkBounceRate(inbox.email, inbox.email, env);
    results.push(result);
  }

  return results;
}

/**
 * Auto-pause inboxes with critical bounce rates
 * NOTE: Since mailboxes are in Supabase, this function identifies critical inboxes
 * but pausing must be done via Supabase. Returns list of inboxes that should be paused.
 */
export async function autoPauseUnhealthyInboxes(
  env: { DB: D1Database }
): Promise<{ paused: string[]; checked: number }> {
  const bounceRates = await checkAllBounceRates(env);
  const shouldPause: string[] = [];

  for (const result of bounceRates) {
    if (result.status === 'critical') {
      shouldPause.push(result.email);
      logger.warn('Inbox should be paused due to high bounce rate', {
        email: result.email,
        bounceRate: result.rate,
        recommendation: 'Pause inbox in Supabase mailboxes table',
      });
    }
  }

  return { paused: shouldPause, checked: bounceRates.length };
}

// ==================
// LIST HYGIENE
// ==================

export interface ListCleanupResult {
  removed: number;
  reasons: {
    hardBounce: number;
    invalidEmail: number;
    duplicate: number;
    genericEmail: number;
  };
}

/**
 * Clean prospect list by removing/archiving problematic entries
 */
export async function cleanProspectList(
  env: { DB: D1Database }
): Promise<ListCleanupResult> {
  const reasons = {
    hardBounce: 0,
    invalidEmail: 0,
    duplicate: 0,
    genericEmail: 0,
  };

  // 1. Archive hard bounces
  const bounced = await env.DB.prepare(`
    UPDATE prospects
    SET archived = 1, archive_reason = 'hard_bounce', updated_at = datetime('now')
    WHERE email_bounced = 1 AND archived = 0
  `).run();
  reasons.hardBounce = bounced.meta.changes || 0;

  // 2. Archive invalid emails (basic format check)
  const invalid = await env.DB.prepare(`
    UPDATE prospects
    SET archived = 1, archive_reason = 'invalid_email', updated_at = datetime('now')
    WHERE contact_email IS NOT NULL
      AND contact_email NOT LIKE '%@%.%'
      AND archived = 0
  `).run();
  reasons.invalidEmail = invalid.meta.changes || 0;

  // 3. Archive duplicates (keep the one with most recent activity)
  // This is a bit complex - we'll mark duplicates based on email
  const duplicates = await env.DB.prepare(`
    UPDATE prospects
    SET archived = 1, archive_reason = 'duplicate', updated_at = datetime('now')
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY LOWER(contact_email)
          ORDER BY
            CASE WHEN stage IN ('engaged', 'meeting', 'won') THEN 0 ELSE 1 END,
            last_contacted_at DESC NULLS LAST,
            created_at DESC
        ) as rn
        FROM prospects
        WHERE contact_email IS NOT NULL AND archived = 0
      ) WHERE rn = 1
    )
    AND contact_email IS NOT NULL
    AND archived = 0
  `).run();
  reasons.duplicate = duplicates.meta.changes || 0;

  // 4. Archive generic emails (info@, contact@, etc.)
  const generic = await env.DB.prepare(`
    UPDATE prospects
    SET archived = 1, archive_reason = 'generic_email', updated_at = datetime('now')
    WHERE archived = 0
      AND contact_email IS NOT NULL
      AND (
        LOWER(contact_email) LIKE 'info@%'
        OR LOWER(contact_email) LIKE 'contact@%'
        OR LOWER(contact_email) LIKE 'hello@%'
        OR LOWER(contact_email) LIKE 'reservations@%'
        OR LOWER(contact_email) LIKE 'booking@%'
        OR LOWER(contact_email) LIKE 'reception@%'
        OR LOWER(contact_email) LIKE 'frontdesk@%'
        OR LOWER(contact_email) LIKE 'sales@%'
        OR LOWER(contact_email) LIKE 'marketing@%'
        OR LOWER(contact_email) LIKE 'support@%'
        OR LOWER(contact_email) LIKE 'noreply@%'
        OR LOWER(contact_email) LIKE 'no-reply@%'
      )
  `).run();
  reasons.genericEmail = generic.meta.changes || 0;

  const total = reasons.hardBounce + reasons.invalidEmail + reasons.duplicate + reasons.genericEmail;

  logger.info('List cleanup complete', {
    removed: total,
    ...reasons,
  });

  return {
    removed: total,
    reasons,
  };
}

// ==================
// DELIVERABILITY STATUS
// ==================

export interface DeliverabilityStatus {
  warmup: {
    currentWeek: number;
    dailyLimit: number;
    sentToday: number;
    remaining: number;
  };
  inboxHealth: BounceRateResult[];
  listQuality: {
    totalProspects: number;
    withEmail: number;
    verified: number;
    bounced: number;
    archived: number;
  };
  recentSends: {
    last24h: number;
    last7d: number;
    bounceRate7d: number;
  };
}

/**
 * Get overall deliverability status
 */
export async function getDeliverabilityStatus(
  env: { DB: D1Database; WARMUP_COUNTER: DurableObjectNamespace }
): Promise<DeliverabilityStatus> {
  // Get warmup status
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );
  const warmupResponse = await warmupCounter.fetch(new Request('http://do/status'));
  const warmupData = await warmupResponse.json<{
    summary: { totalSent: number; remaining: number; dailyLimit: number };
    warmupWeek: number;
  }>();

  // Get inbox health
  const inboxHealth = await checkAllBounceRates(env);

  // Get list quality stats
  const { results: listStats } = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN contact_email IS NOT NULL THEN 1 ELSE 0 END) as with_email,
      SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN email_bounced = 1 THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) as archived
    FROM prospects
  `).all();

  // Get recent send stats
  const { results: sendStats } = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN sent_at > datetime('now', '-1 day') THEN 1 ELSE 0 END) as last_24h,
      SUM(CASE WHEN sent_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as last_7d,
      SUM(CASE WHEN sent_at > datetime('now', '-7 days') AND status = 'bounced' THEN 1 ELSE 0 END) as bounced_7d
    FROM emails
    WHERE direction = 'outbound'
  `).all();

  const last7d = Number(sendStats?.[0]?.last_7d) || 0;
  const bounced7d = Number(sendStats?.[0]?.bounced_7d) || 0;

  return {
    warmup: {
      currentWeek: warmupData.warmupWeek || 1,
      dailyLimit: warmupData.summary?.dailyLimit || 0,
      sentToday: warmupData.summary?.totalSent || 0,
      remaining: warmupData.summary?.remaining || 0,
    },
    inboxHealth,
    listQuality: {
      totalProspects: Number(listStats?.[0]?.total) || 0,
      withEmail: Number(listStats?.[0]?.with_email) || 0,
      verified: Number(listStats?.[0]?.verified) || 0,
      bounced: Number(listStats?.[0]?.bounced) || 0,
      archived: Number(listStats?.[0]?.archived) || 0,
    },
    recentSends: {
      last24h: Number(sendStats?.[0]?.last_24h) || 0,
      last7d,
      bounceRate7d: last7d > 0 ? (bounced7d / last7d) * 100 : 0,
    },
  };
}
