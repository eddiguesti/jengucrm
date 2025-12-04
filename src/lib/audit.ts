import { createServerClient } from './supabase';
import { logger } from './logger';

/**
 * Audit logging for critical operations
 * Tracks who did what, when, and the before/after state
 */

export type AuditAction =
  | 'prospect.create'
  | 'prospect.update'
  | 'prospect.delete'
  | 'prospect.archive'
  | 'email.send'
  | 'email.delete'
  | 'campaign.create'
  | 'campaign.update'
  | 'campaign.delete'
  | 'settings.update'
  | 'cron.run'
  | 'cron.fail'
  | 'enrichment.run'
  | 'mystery_shopper.send'
  | 'reply.process'
  | 'stage.change';

interface AuditEntry {
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  request_id?: string;
  ip_address?: string;
}

/**
 * Log an audit entry
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const supabase = createServerClient();

  try {
    await supabase.from('audit_log').insert({
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      changes: entry.changes,
      metadata: entry.metadata,
      request_id: entry.request_id,
      ip_address: entry.ip_address,
      created_at: new Date().toISOString(),
    });

    logger.info({
      audit: true,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
    }, `Audit: ${entry.action}`);
  } catch (err) {
    // Don't fail the operation if audit logging fails
    logger.warn({ error: err, entry }, 'Failed to write audit log');
  }
}

/**
 * Audit helper for prospect updates
 */
export async function auditProspectUpdate(
  prospectId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  // Only log fields that changed
  const changes: { before: Record<string, unknown>; after: Record<string, unknown> } = {
    before: {},
    after: {},
  };

  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.before[key] = before[key];
      changes.after[key] = after[key];
    }
  }

  // Only log if there were actual changes
  if (Object.keys(changes.after).length > 0) {
    await audit({
      action: 'prospect.update',
      entity_type: 'prospect',
      entity_id: prospectId,
      changes,
      request_id: requestId,
    });
  }
}

/**
 * Audit helper for email sending
 */
export async function auditEmailSend(
  prospectId: string,
  emailType: string,
  metadata: {
    to: string;
    subject: string;
    from_inbox?: string;
    message_id?: string;
  },
  requestId?: string
): Promise<void> {
  await audit({
    action: 'email.send',
    entity_type: 'email',
    entity_id: prospectId,
    metadata: {
      email_type: emailType,
      ...metadata,
    },
    request_id: requestId,
  });
}

/**
 * Audit helper for stage changes
 */
export async function auditStageChange(
  prospectId: string,
  fromStage: string,
  toStage: string,
  reason?: string,
  requestId?: string
): Promise<void> {
  await audit({
    action: 'stage.change',
    entity_type: 'prospect',
    entity_id: prospectId,
    changes: {
      before: { stage: fromStage },
      after: { stage: toStage },
    },
    metadata: reason ? { reason } : undefined,
    request_id: requestId,
  });
}

/**
 * Audit helper for cron runs
 */
export async function auditCronRun(
  cronName: string,
  success: boolean,
  stats: Record<string, unknown>,
  error?: string
): Promise<void> {
  await audit({
    action: success ? 'cron.run' : 'cron.fail',
    entity_type: 'cron',
    entity_id: cronName,
    metadata: {
      stats,
      ...(error ? { error } : {}),
    },
  });
}

/**
 * Get audit history for an entity
 */
export async function getAuditHistory(
  entityType: string,
  entityId: string,
  limit = 50
): Promise<AuditEntry[]> {
  const supabase = createServerClient();

  try {
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return data || [];
  } catch (err) {
    logger.error({ error: err, entityType, entityId }, 'Failed to get audit history');
    return [];
  }
}
