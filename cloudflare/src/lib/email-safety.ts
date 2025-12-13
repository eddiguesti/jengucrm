/**
 * Email Sending Safety System
 *
 * Multi-layer protection to prevent bad emails from being sent.
 * Sending the wrong email is irreversible - these checks prevent:
 * - Emails to wrong people
 * - Duplicate emails
 * - Emails to bounced addresses
 * - Broken personalization
 * - Off-hours sending
 * - Emails to competitors/blocked domains
 */

import { Env, Prospect } from '../types';
import { loggers } from './logger';
import { calculateSpamScore } from './spam-checker';

const logger = loggers.api;

// ==================
// TYPES
// ==================

export interface SafetyCheck {
  name: string;
  passed: boolean;
  reason?: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface SafetyCheckResult {
  safe: boolean;
  checks: SafetyCheck[];
  score: number; // 0-100, higher is safer
  blockedBy?: string; // Name of first critical check that failed
}

export interface EmailContent {
  subject: string;
  body: string;
}

export interface PreflightResult {
  issues: string[];
  score: number;
  passable: boolean;
}

// ==================
// EXCLUSION LIST
// ==================

const EXCLUSION_LIST = {
  // Domains that should never receive emails
  domains: [
    // Competitors (add yours)
    'mews.com',
    'cloudbeds.com',
    'guesty.com',
    'hostaway.com',
    'lodgify.com',
    // Test/spam domains
    'test.com',
    'example.com',
    'localhost',
    'mailinator.com',
    'guerrillamail.com',
    'tempmail.com',
    'throwaway.email',
    '10minutemail.com',
    'yopmail.com',
    'maildrop.cc',
    'sharklasers.com',
    'spam4.me',
    // Jengu's own domains
    'jengu.ai',
    'jengu.com',
  ],

  // Email prefixes that should never receive emails
  prefixes: [
    'spam@',
    'abuse@',
    'postmaster@',
    'noreply@',
    'no-reply@',
    'donotreply@',
    'do-not-reply@',
    'mailer-daemon@',
    'admin@',
    'root@',
    'webmaster@',
    'hostmaster@',
    'info@',         // Generic emails are not personal
    'contact@',
    'hello@',
    'support@',
    'sales@',
    'marketing@',
    'reservations@',
    'booking@',
    'reception@',
    'frontdesk@',
    'office@',
  ],

  // Regex patterns
  patterns: [
    /^test/i,           // test@, testing@, etc.
    /^fake/i,           // fake@
    /\+test@/i,         // person+test@gmail.com
    /^temp/i,           // temp@, temporary@
    /^demo/i,           // demo@
    /^sample/i,         // sample@
  ],
};

// Forbidden content that should never appear in emails
const FORBIDDEN_CONTENT = [
  // AI artifacts
  { pattern: /As an AI/i, reason: 'Contains AI disclosure' },
  { pattern: /I cannot/i, reason: 'Contains refusal phrase' },
  { pattern: /I'm unable to/i, reason: 'Contains inability phrase' },
  { pattern: /language model/i, reason: 'Contains AI reference' },

  // Spam triggers
  { pattern: /\bguarantee\b/i, reason: 'Contains guarantee claim' },
  { pattern: /\bfree money\b/i, reason: 'Contains free money phrase' },
  { pattern: /\burgent\b/i, reason: 'Contains urgent trigger' },
  { pattern: /\bact now\b/i, reason: 'Contains urgency phrase' },
  { pattern: /100% free/i, reason: 'Contains spam phrase' },
  { pattern: /\bcongratulations\b/i, reason: 'Contains spam trigger' },
  { pattern: /\bwinner\b/i, reason: 'Contains spam trigger' },
  { pattern: /click here immediately/i, reason: 'Contains spam phrase' },

  // Generic greetings (personalization failed)
  { pattern: /Dear Customer/i, reason: 'Generic greeting detected' },
  { pattern: /Dear Sir\/Madam/i, reason: 'Generic greeting detected' },
  { pattern: /To Whom It May Concern/i, reason: 'Generic greeting detected' },

  // Unresolved variables
  { pattern: /\{\{[^}]+\}\}/g, reason: 'Unresolved template variables' },
  { pattern: /\[FIRST_NAME\]/i, reason: 'Unresolved placeholder' },
  { pattern: /\[NAME\]/i, reason: 'Unresolved placeholder' },
  { pattern: /\[COMPANY\]/i, reason: 'Unresolved placeholder' },
  { pattern: /\[HOTEL\]/i, reason: 'Unresolved placeholder' },

  // Broken formatting
  { pattern: /\\n/g, reason: 'Escaped newlines in content' },
  { pattern: /undefined/i, reason: 'Contains undefined value' },
  { pattern: /null/i, reason: 'Contains null value' },
  { pattern: /NaN/, reason: 'Contains NaN value' },
];

// ==================
// SAFETY CHECKS
// ==================

/**
 * Run all safety checks before sending an email
 */
export async function runSafetyChecks(
  prospect: Prospect,
  email: EmailContent,
  env: Env
): Promise<SafetyCheckResult> {
  const checks: SafetyCheck[] = [];

  // 1. Emergency stop check (CRITICAL)
  const emergencyStop = await isEmergencyStopActive(env);
  checks.push({
    name: 'emergency_stop',
    passed: !emergencyStop,
    reason: emergencyStop ? 'Emergency stop is active' : undefined,
    severity: 'critical',
  });

  // 2. Prospect eligibility (CRITICAL)
  const validStages = ['enriched', 'ready', 'contacted'];
  checks.push({
    name: 'prospect_stage',
    passed: validStages.includes(prospect.stage),
    reason: !validStages.includes(prospect.stage)
      ? `Invalid stage: ${prospect.stage}`
      : undefined,
    severity: 'critical',
  });

  // 3. Not bounced (CRITICAL)
  checks.push({
    name: 'not_bounced',
    passed: !prospect.emailBounced,
    reason: prospect.emailBounced ? 'Email previously bounced' : undefined,
    severity: 'critical',
  });

  // 4. Has valid email format (CRITICAL)
  const hasValidEmail = isValidEmailFormat(prospect.contactEmail);
  checks.push({
    name: 'valid_email',
    passed: hasValidEmail,
    reason: !hasValidEmail ? 'Invalid email format' : undefined,
    severity: 'critical',
  });

  // 5. Not on exclusion list (CRITICAL)
  const excluded = isExcluded(prospect.contactEmail || '');
  checks.push({
    name: 'not_excluded',
    passed: !excluded.excluded,
    reason: excluded.excluded ? `Excluded: ${excluded.reason}` : undefined,
    severity: 'critical',
  });

  // 6. Not recently emailed (CRITICAL)
  const recentlyEmailed = await wasRecentlyEmailed(prospect.id, 24, env);
  checks.push({
    name: 'not_recently_emailed',
    passed: !recentlyEmailed,
    reason: recentlyEmailed ? 'Emailed within last 24 hours' : undefined,
    severity: 'critical',
  });

  // 7. Subject not empty (CRITICAL)
  checks.push({
    name: 'subject_not_empty',
    passed: email.subject.trim().length > 0,
    reason: email.subject.trim().length === 0 ? 'Subject is empty' : undefined,
    severity: 'critical',
  });

  // 8. Body not empty (CRITICAL)
  checks.push({
    name: 'body_not_empty',
    passed: email.body.trim().length > 0,
    reason: email.body.trim().length === 0 ? 'Body is empty' : undefined,
    severity: 'critical',
  });

  // 9. No forbidden content (CRITICAL) - uses basic check
  const forbiddenContent = checkForbiddenContent(email.subject + ' ' + email.body);
  checks.push({
    name: 'no_forbidden_content',
    passed: !forbiddenContent.found,
    reason: forbiddenContent.found
      ? `Forbidden content: ${forbiddenContent.reasons.join(', ')}`
      : undefined,
    severity: 'critical',
  });

  // 10. Spam score check (CRITICAL) - uses comprehensive spam checker
  const spamResult = calculateSpamScore(email);
  checks.push({
    name: 'spam_score',
    passed: spamResult.passable,
    reason: !spamResult.passable
      ? `Spam score ${spamResult.score} (${spamResult.level}): ${spamResult.suggestions[0] || 'Too spammy'}`
      : undefined,
    severity: spamResult.brokenTemplate.length > 0 || spamResult.aiArtifacts.length > 0
      ? 'critical'
      : spamResult.level === 'danger' ? 'critical' : 'warning',
  });

  // 11. Mailbox available (CRITICAL)
  const mailboxAvailable = await hasAvailableMailbox(env);
  checks.push({
    name: 'mailbox_available',
    passed: mailboxAvailable,
    reason: !mailboxAvailable ? 'No mailbox with capacity' : undefined,
    severity: 'critical',
  });

  // 11. Business hours (WARNING - doesn't block but logs)
  const inBusinessHours = isBusinessHours();
  checks.push({
    name: 'business_hours',
    passed: inBusinessHours,
    reason: !inBusinessHours ? 'Outside business hours' : undefined,
    severity: 'warning',
  });

  // 12. Subject length reasonable (WARNING)
  checks.push({
    name: 'subject_length',
    passed: email.subject.length <= 100,
    reason: email.subject.length > 100 ? 'Subject too long (>100 chars)' : undefined,
    severity: 'warning',
  });

  // 13. Body length reasonable (WARNING)
  const bodyTooShort = email.body.length < 50;
  const bodyTooLong = email.body.length > 5000;
  checks.push({
    name: 'body_length',
    passed: !bodyTooShort && !bodyTooLong,
    reason: bodyTooShort
      ? 'Body too short (<50 chars)'
      : bodyTooLong
        ? 'Body too long (>5000 chars)'
        : undefined,
    severity: 'warning',
  });

  // 14. Has personalization (INFO)
  const hasPersonalization = email.body.includes(prospect.contactName || '') ||
    email.body.includes(prospect.name || '');
  checks.push({
    name: 'has_personalization',
    passed: hasPersonalization,
    reason: !hasPersonalization ? 'No personalization detected' : undefined,
    severity: 'info',
  });

  // Calculate results
  const criticalFailed = checks.filter(c => !c.passed && c.severity === 'critical');
  const warningFailed = checks.filter(c => !c.passed && c.severity === 'warning');

  const safe = criticalFailed.length === 0;
  const score = Math.max(0, 100 - criticalFailed.length * 25 - warningFailed.length * 5);

  return {
    safe,
    checks,
    score,
    blockedBy: criticalFailed[0]?.name,
  };
}

// ==================
// HELPER FUNCTIONS
// ==================

/**
 * Check if emergency stop is active
 */
export async function isEmergencyStopActive(env: Env): Promise<boolean> {
  try {
    const stop = await env.KV_CONFIG.get('EMERGENCY_STOP');
    return stop === 'true';
  } catch {
    // If we can't check, assume stop is active for safety
    logger.error('Failed to check emergency stop, assuming active');
    return true;
  }
}

/**
 * Set emergency stop state
 */
export async function setEmergencyStop(active: boolean, env: Env): Promise<void> {
  await env.KV_CONFIG.put('EMERGENCY_STOP', active ? 'true' : 'false');
  logger.info(`Emergency stop ${active ? 'ACTIVATED' : 'deactivated'}`);
}

/**
 * Check if email format is valid
 */
function isValidEmailFormat(email: string | null | undefined): boolean {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Check if email is on exclusion list
 */
function isExcluded(email: string): { excluded: boolean; reason?: string } {
  if (!email) return { excluded: true, reason: 'No email' };

  const lowerEmail = email.toLowerCase().trim();
  const domain = lowerEmail.split('@')[1];

  // Check domain exclusion
  if (domain && EXCLUSION_LIST.domains.includes(domain)) {
    return { excluded: true, reason: `Domain ${domain} is excluded` };
  }

  // Check prefix exclusion
  for (const prefix of EXCLUSION_LIST.prefixes) {
    if (lowerEmail.startsWith(prefix)) {
      return { excluded: true, reason: `Prefix ${prefix} is excluded` };
    }
  }

  // Check patterns
  for (const pattern of EXCLUSION_LIST.patterns) {
    if (pattern.test(lowerEmail)) {
      return { excluded: true, reason: `Matches exclusion pattern` };
    }
  }

  return { excluded: false };
}

/**
 * Check if prospect was emailed recently
 */
async function wasRecentlyEmailed(
  prospectId: string,
  hoursAgo: number,
  env: Env
): Promise<boolean> {
  try {
    const result = await env.DB.prepare(`
      SELECT 1 FROM emails
      WHERE prospect_id = ?
        AND direction = 'outbound'
        AND created_at > datetime('now', '-' || ? || ' hours')
      LIMIT 1
    `).bind(prospectId, hoursAgo).first();

    return result !== null;
  } catch {
    // If we can't check, be safe and assume recently emailed
    return true;
  }
}

/**
 * Check for forbidden content
 */
function checkForbiddenContent(text: string): { found: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const { pattern, reason } of FORBIDDEN_CONTENT) {
    if (pattern.test(text)) {
      reasons.push(reason);
    }
  }

  return { found: reasons.length > 0, reasons };
}

/**
 * Check if there's a mailbox with sending capacity
 */
async function hasAvailableMailbox(env: Env): Promise<boolean> {
  try {
    const warmupCounter = env.WARMUP_COUNTER.get(
      env.WARMUP_COUNTER.idFromName('global')
    );

    const statusResponse = await warmupCounter.fetch(
      new Request('http://do/status')
    );
    const status = await statusResponse.json<{
      summary: { remaining: number };
    }>();

    return (status.summary?.remaining || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Check if it's business hours (8am-6pm UTC, Mon-Sat)
 */
function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay(); // 0 = Sunday

  // Monday (1) through Saturday (6), 8am-6pm UTC
  return day >= 1 && day <= 6 && hour >= 8 && hour <= 18;
}

// ==================
// PREFLIGHT CHECK
// ==================

/**
 * Run preflight content validation
 * More detailed checks on email content quality
 */
export function preflightCheck(email: EmailContent): PreflightResult {
  const issues: string[] = [];

  // Length checks
  if (email.subject.length > 100) {
    issues.push('Subject too long (>100 chars)');
  }
  if (email.subject.length < 5) {
    issues.push('Subject too short (<5 chars)');
  }
  if (email.body.length < 50) {
    issues.push('Body too short (<50 chars)');
  }
  if (email.body.length > 5000) {
    issues.push('Body too long (>5000 chars)');
  }

  // Common AI mistakes
  if (email.body.includes('As an AI')) {
    issues.push('Contains "As an AI" phrase');
  }
  if (email.body.includes('I cannot')) {
    issues.push('Contains "I cannot" phrase');
  }
  if (email.body.includes("I'm sorry, but")) {
    issues.push('Contains apologetic refusal');
  }

  // Personalization check
  if (email.body.includes('Dear Customer')) {
    issues.push('Generic greeting "Dear Customer"');
  }
  if (email.body.includes('[NAME]') || email.body.includes('[HOTEL]')) {
    issues.push('Unresolved placeholder');
  }

  // Template variable check
  const unresolvedVars = email.body.match(/\{\{[^}]+\}\}/g) || [];
  if (unresolvedVars.length > 0) {
    issues.push(`Unresolved variables: ${unresolvedVars.join(', ')}`);
  }

  // Formatting issues
  if (email.body.includes('\\n')) {
    issues.push('Escaped newlines in body');
  }
  if (email.body.includes('undefined')) {
    issues.push('Contains "undefined"');
  }

  // Spam score estimation
  const spamScore = estimateSpamScore(email);
  if (spamScore > 5) {
    issues.push(`High estimated spam score: ${spamScore}`);
  }

  const score = Math.max(0, 100 - issues.length * 10 - spamScore * 2);

  return {
    issues,
    score,
    passable: issues.length === 0 && score >= 70,
  };
}

/**
 * Estimate spam score (simplified)
 */
function estimateSpamScore(email: EmailContent): number {
  let score = 0;
  const text = (email.subject + ' ' + email.body).toLowerCase();

  // ALL CAPS words
  const capsWords = (email.subject + ' ' + email.body).match(/\b[A-Z]{4,}\b/g) || [];
  score += capsWords.length;

  // Exclamation marks
  const exclamations = (text.match(/!/g) || []).length;
  score += Math.floor(exclamations / 2);

  // Money references
  if (/\$\d+/.test(text)) score += 2;
  if (/free/i.test(text)) score += 1;
  if (/discount/i.test(text)) score += 1;
  if (/limited time/i.test(text)) score += 2;
  if (/click here/i.test(text)) score += 2;
  if (/act now/i.test(text)) score += 2;

  return score;
}

// ==================
// SEND LOGGING
// ==================

export interface SendLogEntry {
  prospectId: string;
  subject: string;
  sent: boolean;
  reason?: string;
  safetyScore: number;
  failedChecks: string[];
  blockedBy?: string;
}

/**
 * Log a send attempt (successful or blocked)
 */
export async function logSendAttempt(
  entry: SendLogEntry,
  env: Env
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO send_log (
        id, prospect_id, subject_hash, sent, reason,
        safety_score, failed_checks, blocked_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      crypto.randomUUID(),
      entry.prospectId,
      await hashString(entry.subject),
      entry.sent ? 1 : 0,
      entry.reason || null,
      entry.safetyScore,
      JSON.stringify(entry.failedChecks),
      entry.blockedBy || null
    ).run();
  } catch (error) {
    logger.error('Failed to log send attempt', error, { prospectId: entry.prospectId });
  }
}

/**
 * Get recent blocked sends for debugging
 */
export async function getRecentBlockedSends(
  limit: number,
  env: Env
): Promise<Array<Record<string, unknown>>> {
  const { results } = await env.DB.prepare(`
    SELECT * FROM send_log
    WHERE sent = 0
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(limit).all();

  return results || [];
}

/**
 * Simple string hash for subject deduplication
 */
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
