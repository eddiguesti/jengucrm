/**
 * Data Integrity Verification
 *
 * Runs periodic checks to ensure data consistency between databases
 * and within the data model (no orphans, no duplicates, valid states)
 */

import { Env } from '../types';
import { validateEmailState } from './state-machine';

// ==================
// TYPES
// ==================

export interface IntegrityIssue {
  id: string;
  issueType: string;
  entityType: string;
  entityId?: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface IntegrityCheckResult {
  success: boolean;
  issues: IntegrityIssue[];
  stats: {
    orphanedEmails: number;
    duplicateProspects: number;
    invalidStates: number;
    countMismatch: boolean;
  };
  durationMs: number;
}

// ==================
// INTEGRITY CHECKS
// ==================

/**
 * Run all integrity checks
 */
export async function runIntegrityChecks(env: Env): Promise<IntegrityCheckResult> {
  const startTime = Date.now();
  const issues: IntegrityIssue[] = [];

  // Run all checks in parallel
  const [
    orphanedEmails,
    duplicateProspects,
    invalidEmailStates,
    invalidProspectStates,
    countMismatch,
  ] = await Promise.all([
    checkOrphanedEmails(env),
    checkDuplicateProspects(env),
    checkInvalidEmailStates(env),
    checkInvalidProspectStates(env),
    checkCountMismatch(env),
  ]);

  issues.push(...orphanedEmails);
  issues.push(...duplicateProspects);
  issues.push(...invalidEmailStates);
  issues.push(...invalidProspectStates);
  if (countMismatch) {
    issues.push(countMismatch);
  }

  // Store issues in database
  await storeIssues(env, issues);

  // Send alert if critical issues found
  const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'error');
  if (criticalIssues.length > 0) {
    await sendIntegrityAlert(env, criticalIssues);
  }

  return {
    success: criticalIssues.length === 0,
    issues,
    stats: {
      orphanedEmails: orphanedEmails.length,
      duplicateProspects: duplicateProspects.length,
      invalidStates: invalidEmailStates.length + invalidProspectStates.length,
      countMismatch: !!countMismatch,
    },
    durationMs: Date.now() - startTime,
  };
}

/**
 * Check for emails without a valid prospect
 */
async function checkOrphanedEmails(env: Env): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  try {
    const { results } = await env.DB.prepare(`
      SELECT e.id, e.prospect_id, e.to_email, e.subject
      FROM emails e
      LEFT JOIN prospects p ON e.prospect_id = p.id
      WHERE e.prospect_id IS NOT NULL AND p.id IS NULL
      LIMIT 100
    `).all();

    for (const email of results || []) {
      issues.push({
        id: crypto.randomUUID(),
        issueType: 'orphaned_email',
        entityType: 'email',
        entityId: email.id as string,
        description: `Email ${email.id} references non-existent prospect ${email.prospect_id}`,
        severity: 'warning',
      });
    }
  } catch (err) {
    console.error('Error checking orphaned emails:', err);
  }

  return issues;
}

/**
 * Check for duplicate prospects (same email)
 */
async function checkDuplicateProspects(env: Env): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  try {
    const { results } = await env.DB.prepare(`
      SELECT LOWER(contact_email) as email, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM prospects
      WHERE contact_email IS NOT NULL AND contact_email != ''
      GROUP BY LOWER(contact_email)
      HAVING count > 1
      LIMIT 50
    `).all();

    for (const row of results || []) {
      issues.push({
        id: crypto.randomUUID(),
        issueType: 'duplicate_prospect',
        entityType: 'prospect',
        entityId: (row.ids as string)?.split(',')[0],
        description: `${row.count} prospects share email ${row.email}: ${row.ids}`,
        severity: 'error',
      });
    }
  } catch (err) {
    console.error('Error checking duplicate prospects:', err);
  }

  return issues;
}

/**
 * Check for emails in invalid states
 */
async function checkInvalidEmailStates(env: Env): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  try {
    // Emails marked as sent but no sent_at
    const { results: sentNoTimestamp } = await env.DB.prepare(`
      SELECT id, status FROM emails
      WHERE status IN ('sent', 'delivered', 'opened', 'clicked', 'replied')
        AND sent_at IS NULL
      LIMIT 50
    `).all();

    for (const email of sentNoTimestamp || []) {
      const validation = validateEmailState({
        status: email.status as 'sent',
        sentAt: null,
      });

      if (!validation.valid) {
        issues.push({
          id: crypto.randomUUID(),
          issueType: 'invalid_state',
          entityType: 'email',
          entityId: email.id as string,
          description: `Email ${email.id}: ${validation.issues.join(', ')}`,
          severity: 'warning',
        });
      }
    }

    // Emails marked as bounced but no bounced_at
    const { results: bouncedNoTimestamp } = await env.DB.prepare(`
      SELECT id FROM emails
      WHERE status = 'bounced' AND bounced_at IS NULL
      LIMIT 50
    `).all();

    for (const email of bouncedNoTimestamp || []) {
      issues.push({
        id: crypto.randomUUID(),
        issueType: 'invalid_state',
        entityType: 'email',
        entityId: email.id as string,
        description: `Email ${email.id} marked as bounced but no bounced_at timestamp`,
        severity: 'warning',
      });
    }

    // Emails marked as replied but no replied_at
    const { results: repliedNoTimestamp } = await env.DB.prepare(`
      SELECT id FROM emails
      WHERE status = 'replied' AND replied_at IS NULL
      LIMIT 50
    `).all();

    for (const email of repliedNoTimestamp || []) {
      issues.push({
        id: crypto.randomUUID(),
        issueType: 'invalid_state',
        entityType: 'email',
        entityId: email.id as string,
        description: `Email ${email.id} marked as replied but no replied_at timestamp`,
        severity: 'warning',
      });
    }
  } catch (err) {
    console.error('Error checking invalid email states:', err);
  }

  return issues;
}

/**
 * Check for prospects in invalid states
 */
async function checkInvalidProspectStates(env: Env): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  try {
    // Prospects in contacted+ stage but no email
    const { results: contactedNoEmail } = await env.DB.prepare(`
      SELECT id, name, stage FROM prospects
      WHERE stage IN ('contacted', 'engaged', 'meeting', 'won')
        AND (contact_email IS NULL OR contact_email = '')
      LIMIT 50
    `).all();

    for (const prospect of contactedNoEmail || []) {
      issues.push({
        id: crypto.randomUUID(),
        issueType: 'invalid_state',
        entityType: 'prospect',
        entityId: prospect.id as string,
        description: `Prospect ${prospect.name} (${prospect.id}) is in ${prospect.stage} stage but has no email`,
        severity: 'warning',
      });
    }

    // Prospects with bounced email still in active stage
    const { results: bouncedActive } = await env.DB.prepare(`
      SELECT id, name, stage FROM prospects
      WHERE email_bounced = 1
        AND stage IN ('ready', 'contacted', 'engaged')
      LIMIT 50
    `).all();

    for (const prospect of bouncedActive || []) {
      issues.push({
        id: crypto.randomUUID(),
        issueType: 'invalid_state',
        entityType: 'prospect',
        entityId: prospect.id as string,
        description: `Prospect ${prospect.name} (${prospect.id}) has bounced email but is in ${prospect.stage} stage`,
        severity: 'error',
      });
    }

    // Prospects in contacted+ stage but no last_contacted_at
    const { results: contactedNoTimestamp } = await env.DB.prepare(`
      SELECT id, name, stage FROM prospects
      WHERE stage IN ('contacted', 'engaged', 'meeting', 'won')
        AND last_contacted_at IS NULL
      LIMIT 50
    `).all();

    for (const prospect of contactedNoTimestamp || []) {
      issues.push({
        id: crypto.randomUUID(),
        issueType: 'invalid_state',
        entityType: 'prospect',
        entityId: prospect.id as string,
        description: `Prospect ${prospect.name} (${prospect.id}) is in ${prospect.stage} stage but no last_contacted_at`,
        severity: 'info',
      });
    }
  } catch (err) {
    console.error('Error checking invalid prospect states:', err);
  }

  return issues;
}

/**
 * Check if D1 and Supabase prospect counts match (approximately)
 */
async function checkCountMismatch(env: Env): Promise<IntegrityIssue | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  try {
    // Get D1 count
    const d1Result = await env.DB.prepare('SELECT COUNT(*) as count FROM prospects').first<{ count: number }>();
    const d1Count = d1Result?.count || 0;

    // Get Supabase count
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/prospects?select=count`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'count=exact',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to get Supabase count');
      return null;
    }

    const countHeader = response.headers.get('content-range');
    const supabaseCount = countHeader ? parseInt(countHeader.split('/')[1] || '0') : 0;

    // Allow 5% difference or 10 records, whichever is greater
    const allowedDiff = Math.max(10, Math.floor(supabaseCount * 0.05));
    const actualDiff = Math.abs(d1Count - supabaseCount);

    if (actualDiff > allowedDiff) {
      return {
        id: crypto.randomUUID(),
        issueType: 'count_mismatch',
        entityType: 'prospect',
        description: `Prospect count mismatch: D1=${d1Count}, Supabase=${supabaseCount} (diff=${actualDiff})`,
        severity: actualDiff > allowedDiff * 2 ? 'error' : 'warning',
      };
    }
  } catch (err) {
    console.error('Error checking count mismatch:', err);
  }

  return null;
}

// ==================
// ISSUE MANAGEMENT
// ==================

/**
 * Store detected issues in database
 */
async function storeIssues(env: Env, issues: IntegrityIssue[]): Promise<void> {
  for (const issue of issues) {
    try {
      await env.DB.prepare(`
        INSERT INTO data_integrity_issues (id, issue_type, entity_type, entity_id, description, severity)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        issue.id,
        issue.issueType,
        issue.entityType,
        issue.entityId || null,
        issue.description,
        issue.severity
      ).run();
    } catch (err) {
      console.error('Failed to store issue:', err);
    }
  }
}

/**
 * Get unresolved issues
 */
export async function getUnresolvedIssues(env: Env, limit: number = 50): Promise<IntegrityIssue[]> {
  const { results } = await env.DB.prepare(`
    SELECT id, issue_type, entity_type, entity_id, description, severity
    FROM data_integrity_issues
    WHERE resolved = 0
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'error' THEN 2
        WHEN 'warning' THEN 3
        ELSE 4
      END,
      detected_at DESC
    LIMIT ?
  `).bind(limit).all();

  return (results || []).map(row => ({
    id: row.id as string,
    issueType: row.issue_type as string,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string | undefined,
    description: row.description as string,
    severity: row.severity as IntegrityIssue['severity'],
  }));
}

/**
 * Mark an issue as resolved
 */
export async function resolveIssue(env: Env, issueId: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE data_integrity_issues
    SET resolved = 1, resolved_at = datetime('now')
    WHERE id = ?
  `).bind(issueId).run();

  return (result.meta?.changes || 0) > 0;
}

/**
 * Auto-fix issues where possible
 */
export async function autoFixIssues(env: Env): Promise<{ fixed: number; skipped: number }> {
  let fixed = 0;
  let skipped = 0;

  const issues = await getUnresolvedIssues(env, 100);

  for (const issue of issues) {
    try {
      if (issue.issueType === 'invalid_state' && issue.entityType === 'email') {
        // Fix: Add missing timestamps
        if (issue.description.includes('no sent_at')) {
          await env.DB.prepare(`
            UPDATE emails SET sent_at = created_at
            WHERE id = ? AND sent_at IS NULL
          `).bind(issue.entityId).run();
          await resolveIssue(env, issue.id);
          fixed++;
          continue;
        }
      }

      if (issue.issueType === 'invalid_state' && issue.entityType === 'prospect') {
        // Fix: Prospects with bounced email should be moved to 'lost'
        if (issue.description.includes('bounced email')) {
          await env.DB.prepare(`
            UPDATE prospects SET stage = 'lost'
            WHERE id = ? AND email_bounced = 1 AND stage IN ('ready', 'contacted', 'engaged')
          `).bind(issue.entityId).run();
          await resolveIssue(env, issue.id);
          fixed++;
          continue;
        }
      }

      // Can't auto-fix
      skipped++;
    } catch (err) {
      console.error(`Failed to auto-fix issue ${issue.id}:`, err);
      skipped++;
    }
  }

  return { fixed, skipped };
}

// ==================
// ALERTING
// ==================

async function sendIntegrityAlert(env: Env, issues: IntegrityIssue[]): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL) {
    return;
  }

  try {
    const message = {
      type: 'data_integrity_alert',
      severity: issues.some(i => i.severity === 'critical') ? 'critical' : 'error',
      issueCount: issues.length,
      issues: issues.slice(0, 10).map(i => ({
        type: i.issueType,
        entity: i.entityType,
        description: i.description,
      })),
      timestamp: new Date().toISOString(),
    };

    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error('Failed to send integrity alert:', err);
  }
}

// ==================
// CLEANUP
// ==================

/**
 * Clean up old resolved issues
 */
export async function cleanupOldIssues(env: Env, daysOld: number = 30): Promise<number> {
  const result = await env.DB.prepare(`
    DELETE FROM data_integrity_issues
    WHERE resolved = 1 AND resolved_at < datetime('now', '-' || ? || ' days')
  `).bind(daysOld).run();

  return result.meta?.changes || 0;
}
