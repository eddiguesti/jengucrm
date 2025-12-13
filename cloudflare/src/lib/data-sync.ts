/**
 * Data Sync Service - Synchronization between Supabase and D1
 *
 * Source of Truth Matrix:
 * - Prospects: Supabase → D1 (Supabase authoritative)
 * - Campaigns: Supabase → D1 (Supabase authoritative)
 * - Mailboxes: Supabase → D1 (Supabase authoritative)
 * - Emails: D1 → Supabase (D1 authoritative)
 * - Email metrics: D1 only
 * - Failed tasks: D1 only
 */

import { Env } from '../types';
import { CircuitBreakers } from './circuit-breaker';

// ==================
// TYPES
// ==================

export interface SyncResult {
  success: boolean;
  syncType: 'supabase_to_d1' | 'd1_to_supabase';
  entityType: string;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
  durationMs: number;
}

interface SyncLogEntry {
  id: string;
  sync_type: string;
  entity_type: string;
  records_processed: number;
  records_failed: number;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
}

// ==================
// SUPABASE → D1 SYNC
// ==================

/**
 * Sync prospects from Supabase to D1
 * Only syncs records updated since last sync
 */
export async function syncProspectsToD1(env: Env): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let processed = 0;
  let failed = 0;

  const syncLogId = crypto.randomUUID();
  await logSyncStart(env, syncLogId, 'supabase_to_d1', 'prospects');

  try {
    // Get last sync timestamp
    const lastSync = await env.KV_CONFIG.get('last_prospect_sync') || '1970-01-01T00:00:00Z';

    // Fetch updated prospects from Supabase
    const prospects = await fetchUpdatedProspectsFromSupabase(env, lastSync);

    if (!prospects || prospects.length === 0) {
      await logSyncComplete(env, syncLogId, 0, 0, 'completed');
      return {
        success: true,
        syncType: 'supabase_to_d1',
        entityType: 'prospects',
        recordsProcessed: 0,
        recordsFailed: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    console.log(`Syncing ${prospects.length} prospects from Supabase to D1`);

    // Upsert each prospect into D1
    for (const prospect of prospects) {
      try {
        await upsertProspectToD1(env, prospect);
        processed++;
      } catch (err) {
        failed++;
        errors.push(`Failed to sync prospect ${prospect.id}: ${err}`);
        console.error(`Failed to sync prospect ${prospect.id}:`, err);
      }
    }

    // Update last sync timestamp
    await env.KV_CONFIG.put('last_prospect_sync', new Date().toISOString());
    await logSyncComplete(env, syncLogId, processed, failed, failed === 0 ? 'completed' : 'completed');

    return {
      success: failed === 0,
      syncType: 'supabase_to_d1',
      entityType: 'prospects',
      recordsProcessed: processed,
      recordsFailed: failed,
      errors,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logSyncComplete(env, syncLogId, processed, failed, 'failed', errorMsg);

    return {
      success: false,
      syncType: 'supabase_to_d1',
      entityType: 'prospects',
      recordsProcessed: processed,
      recordsFailed: failed,
      errors: [...errors, errorMsg],
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Sync campaigns from Supabase to D1
 */
export async function syncCampaignsToD1(env: Env): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let processed = 0;
  let failed = 0;

  const syncLogId = crypto.randomUUID();
  await logSyncStart(env, syncLogId, 'supabase_to_d1', 'campaigns');

  try {
    const lastSync = await env.KV_CONFIG.get('last_campaign_sync') || '1970-01-01T00:00:00Z';
    const campaigns = await fetchUpdatedCampaignsFromSupabase(env, lastSync);

    if (!campaigns || campaigns.length === 0) {
      await logSyncComplete(env, syncLogId, 0, 0, 'completed');
      return {
        success: true,
        syncType: 'supabase_to_d1',
        entityType: 'campaigns',
        recordsProcessed: 0,
        recordsFailed: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    for (const campaign of campaigns) {
      try {
        await upsertCampaignToD1(env, campaign);
        processed++;
      } catch (err) {
        failed++;
        errors.push(`Failed to sync campaign ${campaign.id}: ${err}`);
      }
    }

    await env.KV_CONFIG.put('last_campaign_sync', new Date().toISOString());
    await logSyncComplete(env, syncLogId, processed, failed, failed === 0 ? 'completed' : 'completed');

    return {
      success: failed === 0,
      syncType: 'supabase_to_d1',
      entityType: 'campaigns',
      recordsProcessed: processed,
      recordsFailed: failed,
      errors,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logSyncComplete(env, syncLogId, processed, failed, 'failed', errorMsg);

    return {
      success: false,
      syncType: 'supabase_to_d1',
      entityType: 'campaigns',
      recordsProcessed: processed,
      recordsFailed: failed,
      errors: [...errors, errorMsg],
      durationMs: Date.now() - startTime,
    };
  }
}

// ==================
// D1 → SUPABASE SYNC
// ==================

/**
 * Sync emails from D1 to Supabase
 * Only syncs records not yet synced
 */
export async function syncEmailsToSupabase(env: Env): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let processed = 0;
  let failed = 0;

  const syncLogId = crypto.randomUUID();
  await logSyncStart(env, syncLogId, 'd1_to_supabase', 'emails');

  try {
    // Get unsynced emails from D1
    const { results: emails } = await env.DB.prepare(`
      SELECT * FROM emails
      WHERE synced_to_supabase = 0
      ORDER BY created_at ASC
      LIMIT 100
    `).all();

    if (!emails || emails.length === 0) {
      await logSyncComplete(env, syncLogId, 0, 0, 'completed');
      return {
        success: true,
        syncType: 'd1_to_supabase',
        entityType: 'emails',
        recordsProcessed: 0,
        recordsFailed: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    console.log(`Syncing ${emails.length} emails from D1 to Supabase`);

    // Use circuit breaker for Supabase calls
    const supabaseBreaker = CircuitBreakers.supabase();

    for (const email of emails) {
      try {
        await supabaseBreaker.call(async () => {
          await upsertEmailToSupabase(env, email as Record<string, unknown>);
        });

        // Mark as synced in D1
        await env.DB.prepare(`
          UPDATE emails SET synced_to_supabase = 1 WHERE id = ?
        `).bind(email.id).run();

        processed++;
      } catch (err) {
        failed++;
        errors.push(`Failed to sync email ${email.id}: ${err}`);
        console.error(`Failed to sync email ${email.id}:`, err);
      }
    }

    await logSyncComplete(env, syncLogId, processed, failed, failed === 0 ? 'completed' : 'completed');

    return {
      success: failed === 0,
      syncType: 'd1_to_supabase',
      entityType: 'emails',
      recordsProcessed: processed,
      recordsFailed: failed,
      errors,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logSyncComplete(env, syncLogId, processed, failed, 'failed', errorMsg);

    return {
      success: false,
      syncType: 'd1_to_supabase',
      entityType: 'emails',
      recordsProcessed: processed,
      recordsFailed: failed,
      errors: [...errors, errorMsg],
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Sync prospect stage updates from D1 back to Supabase
 * (e.g., when an email is sent/replied)
 */
export async function syncProspectUpdatesToSupabase(env: Env, prospectId: string, updates: {
  stage?: string;
  last_contacted_at?: string;
  last_replied_at?: string;
  email_bounced?: boolean;
}): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Supabase not configured, skipping sync');
    return false;
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/prospects?id=eq.${prospectId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return response.ok;
  } catch (err) {
    console.error(`Failed to sync prospect ${prospectId} to Supabase:`, err);
    return false;
  }
}

// ==================
// HELPER FUNCTIONS
// ==================

async function fetchUpdatedProspectsFromSupabase(env: Env, since: string): Promise<Record<string, unknown>[] | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/prospects?updated_at=gte.${since}&order=updated_at.asc&limit=500`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch prospects: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('Error fetching prospects from Supabase:', err);
    return null;
  }
}

async function fetchUpdatedCampaignsFromSupabase(env: Env, since: string): Promise<Record<string, unknown>[] | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/campaigns?updated_at=gte.${since}&order=updated_at.asc&limit=100`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Error fetching campaigns from Supabase:', err);
    return null;
  }
}

async function upsertProspectToD1(env: Env, prospect: Record<string, unknown>): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO prospects (
      id, name, city, country, property_type, contact_name, contact_email, contact_title,
      phone, website, stage, tier, score, lead_source, source_url, source_job_title,
      job_pain_points, research_notes, tags, last_contacted_at, last_replied_at,
      archived, email_verified, email_bounced, created_at, updated_at, supabase_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      city = excluded.city,
      country = excluded.country,
      property_type = excluded.property_type,
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_title = excluded.contact_title,
      phone = excluded.phone,
      website = excluded.website,
      stage = excluded.stage,
      tier = excluded.tier,
      score = excluded.score,
      lead_source = excluded.lead_source,
      source_url = excluded.source_url,
      source_job_title = excluded.source_job_title,
      job_pain_points = excluded.job_pain_points,
      research_notes = excluded.research_notes,
      tags = excluded.tags,
      last_contacted_at = excluded.last_contacted_at,
      last_replied_at = excluded.last_replied_at,
      archived = excluded.archived,
      email_verified = excluded.email_verified,
      email_bounced = excluded.email_bounced,
      updated_at = excluded.updated_at,
      supabase_updated_at = excluded.supabase_updated_at
  `).bind(
    prospect.id,
    prospect.name,
    prospect.city,
    prospect.country || null,
    prospect.property_type || null,
    prospect.contact_name || null,
    prospect.contact_email || null,
    prospect.contact_title || null,
    prospect.phone || null,
    prospect.website || null,
    prospect.stage || 'new',
    prospect.tier || 'cold',
    prospect.score || 0,
    prospect.lead_source || 'manual',
    prospect.source_url || null,
    prospect.source_job_title || null,
    prospect.job_pain_points ? JSON.stringify(prospect.job_pain_points) : null,
    prospect.research_notes || null,
    prospect.tags ? JSON.stringify(prospect.tags) : '[]',
    prospect.last_contacted_at || null,
    prospect.last_replied_at || null,
    prospect.archived ? 1 : 0,
    prospect.email_verified ? 1 : 0,
    prospect.email_bounced ? 1 : 0,
    prospect.created_at || new Date().toISOString(),
    prospect.updated_at || new Date().toISOString(),
    prospect.updated_at || new Date().toISOString() // supabase_updated_at
  ).run();
}

async function upsertCampaignToD1(env: Env, campaign: Record<string, unknown>): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO campaigns (
      id, name, strategy_key, description, active, daily_limit,
      emails_sent, emails_opened, replies_received, meetings_booked,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      strategy_key = excluded.strategy_key,
      description = excluded.description,
      active = excluded.active,
      daily_limit = excluded.daily_limit,
      emails_sent = excluded.emails_sent,
      emails_opened = excluded.emails_opened,
      replies_received = excluded.replies_received,
      meetings_booked = excluded.meetings_booked,
      updated_at = excluded.updated_at
  `).bind(
    campaign.id,
    campaign.name,
    campaign.strategy_key || campaign.campaign_strategy || 'authority_scarcity',
    campaign.description || '',
    campaign.active ? 1 : 0,
    campaign.daily_limit || 20,
    campaign.emails_sent || 0,
    campaign.emails_opened || 0,
    campaign.replies_received || 0,
    campaign.meetings_booked || 0,
    campaign.created_at || new Date().toISOString(),
    campaign.updated_at || new Date().toISOString()
  ).run();
}

async function upsertEmailToSupabase(env: Env, email: Record<string, unknown>): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured');
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/emails`,
    {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: email.id,
        prospect_id: email.prospect_id,
        campaign_id: email.campaign_id,
        subject: email.subject,
        body: email.body,
        to_email: email.to_email,
        from_email: email.from_email,
        message_id: email.message_id,
        in_reply_to: email.in_reply_to,
        direction: email.direction,
        email_type: email.email_type,
        status: email.status,
        sent_at: email.sent_at,
        opened_at: email.opened_at,
        replied_at: email.replied_at,
        bounced_at: email.bounced_at,
        created_at: email.created_at,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase upsert failed: ${response.status} - ${errorText}`);
  }
}

// ==================
// SYNC LOGGING
// ==================

async function logSyncStart(
  env: Env,
  syncLogId: string,
  syncType: string,
  entityType: string
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO sync_log (id, sync_type, entity_type, started_at, status)
      VALUES (?, ?, ?, datetime('now'), 'running')
    `).bind(syncLogId, syncType, entityType).run();
  } catch (err) {
    console.error('Failed to log sync start:', err);
  }
}

async function logSyncComplete(
  env: Env,
  syncLogId: string,
  processed: number,
  failed: number,
  status: 'completed' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    await env.DB.prepare(`
      UPDATE sync_log
      SET records_processed = ?, records_failed = ?, completed_at = datetime('now'),
          status = ?, error_message = ?
      WHERE id = ?
    `).bind(processed, failed, status, errorMessage || null, syncLogId).run();
  } catch (err) {
    console.error('Failed to log sync complete:', err);
  }
}

// ==================
// SYNC STATUS
// ==================

export interface SyncStatus {
  lastProspectSync: string | null;
  lastCampaignSync: string | null;
  lastEmailSync: string | null;
  unsyncedEmails: number;
  recentSyncs: SyncLogEntry[];
}

export async function getSyncStatus(env: Env): Promise<SyncStatus> {
  const [lastProspectSync, lastCampaignSync, unsyncedResult, recentLogs] = await Promise.all([
    env.KV_CONFIG.get('last_prospect_sync'),
    env.KV_CONFIG.get('last_campaign_sync'),
    env.DB.prepare('SELECT COUNT(*) as count FROM emails WHERE synced_to_supabase = 0').first<{ count: number }>(),
    env.DB.prepare(`
      SELECT * FROM sync_log
      ORDER BY created_at DESC
      LIMIT 10
    `).all(),
  ]);

  const recentSyncs: SyncLogEntry[] = (recentLogs.results || []).map(row => ({
    id: row.id as string,
    sync_type: row.sync_type as string,
    entity_type: row.entity_type as string,
    records_processed: row.records_processed as number,
    records_failed: row.records_failed as number,
    started_at: row.started_at as string,
    completed_at: row.completed_at as string | null,
    status: row.status as 'running' | 'completed' | 'failed',
    error_message: row.error_message as string | null,
  }));

  return {
    lastProspectSync,
    lastCampaignSync,
    lastEmailSync: null, // Calculated from email sync log
    unsyncedEmails: unsyncedResult?.count || 0,
    recentSyncs,
  };
}

// ==================
// FULL SYNC
// ==================

/**
 * Run a full sync of all entities
 * Use sparingly - can be slow
 */
export async function runFullSync(env: Env): Promise<{
  prospects: SyncResult;
  campaigns: SyncResult;
  emails: SyncResult;
}> {
  console.log('Starting full sync...');

  const [prospects, campaigns, emails] = await Promise.all([
    syncProspectsToD1(env),
    syncCampaignsToD1(env),
    syncEmailsToSupabase(env),
  ]);

  console.log('Full sync complete:', {
    prospects: { processed: prospects.recordsProcessed, failed: prospects.recordsFailed },
    campaigns: { processed: campaigns.recordsProcessed, failed: campaigns.recordsFailed },
    emails: { processed: emails.recordsProcessed, failed: emails.recordsFailed },
  });

  return { prospects, campaigns, emails };
}
