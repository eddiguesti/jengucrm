/**
 * Email Sender - Production Email Sending
 *
 * Supports:
 * - Vercel SMTP proxy (primary - uses your existing SMTP credentials via Vercel)
 * - Resend API (if configured)
 *
 * Features: Round-robin inboxes, health tracking, automatic failover
 *
 * NOTE: Cloudflare Workers can't do direct SMTP (no TCP sockets).
 * We proxy through Vercel/Next.js which CAN send via SMTP.
 */

import { Env, InboxConfig } from '../types';
import {
  fetchMailboxesFromSupabase,
  supabaseMailboxToInboxConfig,
  incrementMailboxSent,
  recordMailboxBounce,
} from './supabase';

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  from: string;
  displayName: string;
  provider: 'azure' | 'smtp' | 'resend';
  env: Env;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  inbox: string;
  error?: string;
  latencyMs: number;
}

/**
 * Send email via specified inbox
 * Called by cron.ts and api.ts with explicit inbox selection
 *
 * Priority:
 * 1. Vercel SMTP proxy (uses your existing SMTP credentials)
 * 2. Resend API (if RESEND_API_KEY is set)
 */
export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const { to, subject, body, from, displayName, env } = params;
  const startTime = Date.now();

  // Debug: Log available email providers
  console.log('[sendEmail] Checking providers:', {
    vercelUrl: env.VERCEL_APP_URL ? 'configured' : 'missing',
    vercelSecret: env.VERCEL_CRON_SECRET ? 'configured' : 'missing',
    resendKey: env.RESEND_API_KEY ? 'configured' : 'missing',
  });

  // Skip Azure - only use SMTP/Resend
  if (params.provider === 'azure') {
    return {
      success: false,
      provider: 'azure',
      inbox: from,
      error: 'Azure sending is disabled - use SMTP inboxes only',
      latencyMs: Date.now() - startTime,
    };
  }

  // Try Vercel SMTP proxy first (uses your existing SMTP credentials)
  const vercelUrl = (env.VERCEL_APP_URL || '').trim().replace(/\/+$/, '');
  if (vercelUrl) {
    try {
      const result = await sendViaVercelProxy(
        { email: from, displayName } as InboxConfig,
        to,
        subject,
        body,
        vercelUrl,
        env.VERCEL_CRON_SECRET || ''
      );
      result.latencyMs = Date.now() - startTime;
      return result;
    } catch (error) {
      console.error('Vercel proxy failed:', error);
      // Fall through to Resend if available
    }
  }

  // Try Resend if available
  if (env.RESEND_API_KEY) {
    try {
      const result = await sendViaResend(
        { email: from, displayName } as InboxConfig,
        to,
        subject,
        body,
        env.RESEND_API_KEY
      );
      result.latencyMs = Date.now() - startTime;
      return result;
    } catch (error) {
      console.error('Resend failed:', error);
    }
  }

  // No working email provider
  return {
    success: false,
    provider: 'none',
    inbox: from,
    error: 'No email provider available. Configure VERCEL_APP_URL or RESEND_API_KEY.',
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Get an available SMTP inbox (skips Azure)
 */
export async function getAvailableInbox(env: Env): Promise<{
  id: string;
  email: string;
  displayName: string;
  provider: 'smtp';
} | null> {
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  // Try to get next inbox (will be filtered to SMTP only)
  const response = await inboxState.fetch(new Request('http://do/next-inbox'));

  if (!response.ok) {
    return null;
  }

  const inbox = await response.json<InboxConfig & { circuitState: string }>();

  // Skip Azure inboxes - only return SMTP
  if (inbox.provider === 'azure') {
    console.log('Skipping Azure inbox, looking for SMTP...');
    // Return null to force caller to handle no inbox case
    // The SMTP inboxes should still be available
    return null;
  }

  return {
    id: inbox.id,
    email: inbox.email,
    displayName: inbox.displayName,
    provider: 'smtp',
  };
}

// NOTE: sendViaAzure is DISABLED - Azure/jengu.ai is not being used

/**
 * Send via Resend API (recommended for production)
 * https://resend.com/docs/api-reference/emails/send-email
 */
async function sendViaResend(
  inbox: InboxConfig,
  to: string,
  subject: string,
  body: string,
  apiKey: string
): Promise<SendResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${inbox.displayName} <${inbox.email}>`,
      to: [to],
      subject,
      text: body,
      // Optional: Add reply-to for better deliverability
      reply_to: inbox.email,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${response.status} - ${error}`);
  }

  const data = await response.json<{ id: string }>();

  return {
    success: true,
    messageId: data.id,
    provider: 'resend',
    inbox: inbox.email,
    latencyMs: 0,
  };
}

/**
 * Send via Vercel SMTP proxy
 * Calls the Next.js app which has SMTP credentials configured
 * This allows Cloudflare Workers to send email via your existing SMTP inboxes
 */
async function sendViaVercelProxy(
  inbox: InboxConfig,
  to: string,
  subject: string,
  body: string,
  vercelUrl: string,
  cronSecret: string
): Promise<SendResult> {
  const response = await fetch(`${vercelUrl}/api/email/send-raw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({
      to,
      subject,
      body,
      fromEmail: inbox.email,
      fromName: inbox.displayName,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vercel SMTP proxy failed: ${response.status} - ${error}`);
  }

  const data = await response.json<{ success: boolean; messageId?: string; error?: string }>();

  if (!data.success) {
    throw new Error(data.error || 'Unknown error from Vercel proxy');
  }

  return {
    success: true,
    messageId: data.messageId || `vercel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    provider: 'smtp-via-vercel',
    inbox: inbox.email,
    latencyMs: 0,
  };
}

/**
 * Record bounce - updates both Durable Objects and Supabase
 */
export async function recordBounce(
  inboxId: string,
  email: string,
  env: Env
): Promise<void> {
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  await Promise.all([
    // Update Durable Objects
    warmupCounter.fetch(
      new Request('http://do/record-bounce', {
        method: 'POST',
        body: JSON.stringify({ inboxId, email }),
      })
    ),
    inboxState.fetch(
      new Request('http://do/mark-bounce', {
        method: 'POST',
        body: JSON.stringify({ inboxId }),
      })
    ),
    // Update Supabase (inboxId is the UUID from Supabase)
    recordMailboxBounce(env, inboxId),
  ]);
}

/**
 * Record successful send - updates Supabase
 */
export async function recordSend(inboxId: string, env: Env): Promise<void> {
  await incrementMailboxSent(env, inboxId);
}

/**
 * Initialize inboxes from Supabase (primary) or environment variables (fallback)
 *
 * Priority:
 * 1. Supabase mailboxes table (managed via /outreach/mailboxes UI)
 * 2. SMTP_INBOX_* environment variables (legacy/fallback)
 */
export async function initializeInboxes(env: Env): Promise<void> {
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  // Try to fetch from Supabase first
  const supabaseMailboxes = await fetchMailboxesFromSupabase(env);

  if (supabaseMailboxes.length > 0) {
    console.log(`Initializing ${supabaseMailboxes.length} mailboxes from Supabase`);

    for (const mailbox of supabaseMailboxes) {
      // Skip paused or error mailboxes
      if (mailbox.status === 'paused' || mailbox.status === 'error') {
        console.log(`Skipping ${mailbox.email} (status: ${mailbox.status})`);
        continue;
      }

      const inboxConfig = supabaseMailboxToInboxConfig(mailbox);

      // Register with Durable Objects
      await inboxState.fetch(
        new Request('http://do/register', {
          method: 'POST',
          body: JSON.stringify(inboxConfig),
        })
      );

      await warmupCounter.fetch(
        new Request('http://do/register-inbox', {
          method: 'POST',
          body: JSON.stringify({
            id: inboxConfig.id,
            email: inboxConfig.email,
            provider: inboxConfig.provider,
          }),
        })
      );

      console.log(`Registered mailbox from Supabase: ${mailbox.email} (${mailbox.status})`);
    }

    return;
  }

  // Fallback to environment variables
  console.log('No Supabase mailboxes found, falling back to env vars');

  const smtpInboxes = [
    env.SMTP_INBOX_1,
    env.SMTP_INBOX_2,
    env.SMTP_INBOX_3,
    env.SMTP_INBOX_4,
  ].filter(Boolean);

  console.log(`Initializing ${smtpInboxes.length} SMTP inboxes from env vars`);

  for (let i = 0; i < smtpInboxes.length; i++) {
    const [email, password, host, port, displayName] = smtpInboxes[i]!.split('|');

    const smtpInbox: InboxConfig = {
      id: `smtp-${i + 1}`,
      provider: 'smtp',
      email,
      displayName: displayName || `Jengu Team ${i + 1}`,
      host,
      port: parseInt(port, 10),
      password,
    };

    await inboxState.fetch(
      new Request('http://do/register', {
        method: 'POST',
        body: JSON.stringify(smtpInbox),
      })
    );

    await warmupCounter.fetch(
      new Request('http://do/register-inbox', {
        method: 'POST',
        body: JSON.stringify({
          id: smtpInbox.id,
          email: smtpInbox.email,
          provider: smtpInbox.provider,
        }),
      })
    );

    console.log(`Registered SMTP inbox from env: ${email}`);
  }
}
