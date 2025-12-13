/**
 * Email Sender - Production Email Sending
 *
 * Supports:
 * - Resend API (primary, recommended for production)
 * - Mailchannels (fallback for Workers)
 *
 * Features: Round-robin inboxes, health tracking, automatic failover
 *
 * NOTE: Azure/jengu.ai is disabled per configuration
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
 * 1. Resend API (if RESEND_API_KEY is set)
 * 2. Mailchannels (free for Workers, but limited)
 */
export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const { to, subject, body, from, displayName, env } = params;
  const startTime = Date.now();

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

  // Try Resend first if available (more reliable for production)
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
      console.error('Resend failed, trying Mailchannels:', error);
      // Fall through to Mailchannels
    }
  }

  // Fallback to Mailchannels
  try {
    const result = await sendViaMailchannels(
      { email: from, displayName } as InboxConfig,
      to,
      subject,
      body
    );
    result.latencyMs = Date.now() - startTime;
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      provider: 'smtp',
      inbox: from,
      error: errorMessage,
      latencyMs: Date.now() - startTime,
    };
  }
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
 * Send via Mailchannels (free for Cloudflare Workers)
 * https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/
 *
 * Note: Mailchannels free tier has been discontinued for new users.
 * Use Resend API as the primary provider instead.
 */
async function sendViaMailchannels(
  inbox: InboxConfig,
  to: string,
  subject: string,
  body: string
): Promise<SendResult> {
  const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: {
        email: inbox.email,
        name: inbox.displayName,
      },
      subject,
      content: [
        {
          type: 'text/plain',
          value: body,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mailchannels send failed: ${response.status} - ${error}`);
  }

  return {
    success: true,
    messageId: `mc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    provider: 'mailchannels',
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
