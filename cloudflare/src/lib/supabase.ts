/**
 * Supabase REST Client for Cloudflare Workers
 *
 * Fetches mailbox configurations from Supabase.
 * The UI (Next.js app) manages mailboxes via /outreach/mailboxes
 * and this client reads them for email sending.
 */

import { Env, SupabaseMailbox, InboxConfig } from '../types';

/**
 * Fetch all active mailboxes from Supabase
 */
export async function fetchMailboxesFromSupabase(env: Env): Promise<SupabaseMailbox[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Supabase credentials not configured, falling back to env vars');
    return [];
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/mailboxes?status=in.(active,warming)&select=*`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to fetch mailboxes from Supabase: ${response.status} - ${error}`);
      return [];
    }

    const mailboxes = await response.json<SupabaseMailbox[]>();
    console.log(`Fetched ${mailboxes.length} mailboxes from Supabase`);
    return mailboxes;
  } catch (error) {
    console.error('Error fetching mailboxes from Supabase:', error);
    return [];
  }
}

/**
 * Convert Supabase mailbox to InboxConfig format used by Durable Objects
 */
export function supabaseMailboxToInboxConfig(mailbox: SupabaseMailbox): InboxConfig {
  return {
    id: mailbox.id,
    provider: 'smtp',
    email: mailbox.email,
    displayName: mailbox.display_name,
    host: mailbox.smtp_host,
    port: mailbox.smtp_port,
    password: mailbox.smtp_pass,
  };
}

/**
 * Update mailbox stats in Supabase (sent_today, bounces_today, etc.)
 */
export async function updateMailboxStats(
  env: Env,
  mailboxId: string,
  updates: {
    sent_today?: number;
    bounces_today?: number;
    total_sent?: number;
    total_bounces?: number;
    health_score?: number;
    last_used_at?: string;
    last_error?: string | null;
    last_error_at?: string | null;
    status?: 'active' | 'warming' | 'paused' | 'error';
  }
): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/mailboxes?id=eq.${mailboxId}`,
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
  } catch (error) {
    console.error('Error updating mailbox stats:', error);
    return false;
  }
}

/**
 * Increment sent count for a mailbox
 */
export async function incrementMailboxSent(env: Env, mailboxId: string): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    // Use Supabase RPC to increment atomically
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/increment_mailbox_sent`,
      {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mailbox_id: mailboxId }),
      }
    );

    if (!response.ok) {
      // Fallback: fetch current value and update
      const getResponse = await fetch(
        `${env.SUPABASE_URL}/rest/v1/mailboxes?id=eq.${mailboxId}&select=sent_today,total_sent`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );

      if (getResponse.ok) {
        const [mailbox] = await getResponse.json<{ sent_today: number; total_sent: number }[]>();
        if (mailbox) {
          await updateMailboxStats(env, mailboxId, {
            sent_today: mailbox.sent_today + 1,
            total_sent: mailbox.total_sent + 1,
            last_used_at: new Date().toISOString(),
          });
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error incrementing mailbox sent:', error);
    return false;
  }
}

/**
 * Record a bounce for a mailbox
 */
export async function recordMailboxBounce(env: Env, mailboxId: string): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    // Fetch current values
    const getResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/mailboxes?id=eq.${mailboxId}&select=bounces_today,total_bounces,sent_today,health_score`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!getResponse.ok) return false;

    const [mailbox] = await getResponse.json<{
      bounces_today: number;
      total_bounces: number;
      sent_today: number;
      health_score: number;
    }[]>();

    if (!mailbox) return false;

    // Calculate new bounce rate and health score
    const newBouncesToday = mailbox.bounces_today + 1;
    const bounceRate = mailbox.sent_today > 0
      ? (newBouncesToday / mailbox.sent_today) * 100
      : 0;

    // Decrease health score (min 0)
    const newHealthScore = Math.max(0, mailbox.health_score - 10);

    // Auto-pause if bounce rate > 5% and sent > 5
    const shouldPause = bounceRate > 5 && mailbox.sent_today >= 5;

    await updateMailboxStats(env, mailboxId, {
      bounces_today: newBouncesToday,
      total_bounces: mailbox.total_bounces + 1,
      health_score: newHealthScore,
      status: shouldPause ? 'paused' : undefined,
      last_error: shouldPause ? `High bounce rate: ${bounceRate.toFixed(1)}%` : undefined,
      last_error_at: shouldPause ? new Date().toISOString() : undefined,
    });

    return true;
  } catch (error) {
    console.error('Error recording mailbox bounce:', error);
    return false;
  }
}

/**
 * Reset daily counters for all mailboxes (called at start of day)
 */
export async function resetDailyCounters(env: Env): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Reset all mailboxes where last_reset_date is not today
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/mailboxes?last_reset_date=neq.${today}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          sent_today: 0,
          bounces_today: 0,
          last_reset_date: today,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    console.log(`Reset daily counters: ${response.ok ? 'success' : 'failed'}`);
    return response.ok;
  } catch (error) {
    console.error('Error resetting daily counters:', error);
    return false;
  }
}

/**
 * Get a single mailbox by email
 */
export async function getMailboxByEmail(env: Env, email: string): Promise<SupabaseMailbox | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/mailboxes?email=eq.${encodeURIComponent(email)}&select=*`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!response.ok) return null;

    const [mailbox] = await response.json<SupabaseMailbox[]>();
    return mailbox || null;
  } catch (error) {
    console.error('Error fetching mailbox by email:', error);
    return null;
  }
}
