/**
 * Email Service - Production-ready email sending & receiving
 *
 * Sending: Resend API (recommended) or Mailchannels (free)
 * Receiving: Cloudflare Email Routing
 *
 * This is the single source of truth for all email operations.
 */

import { Env, InboxConfig } from '../types';

// ============================================
// TYPES
// ============================================

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  from: string;
  fromName: string;
  replyTo?: string;
  html?: string;
  trackingId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  provider: 'resend' | 'mailchannels' | 'smtp';
  error?: string;
  latencyMs: number;
}

export interface InboundEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  headers: Record<string, string>;
  receivedAt: Date;
}

// ============================================
// SENDING - Resend API (Production)
// ============================================

/**
 * Send email via Resend API
 * https://resend.com - $0 for first 3000 emails/month
 */
export async function sendViaResend(
  params: SendEmailParams,
  apiKey: string
): Promise<SendResult> {
  const startTime = Date.now();

  try {
    // Add tracking pixel if trackingId provided
    let htmlBody = params.html || `<pre style="font-family: sans-serif;">${params.body}</pre>`;
    if (params.trackingId) {
      htmlBody += `<img src="https://jengu-crm.workers.dev/webhook/tracking/open?id=${params.trackingId}" width="1" height="1" style="display:none" />`;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${params.fromName} <${params.from}>`,
        to: [params.to],
        subject: params.subject,
        text: params.body,
        html: htmlBody,
        reply_to: params.replyTo || params.from,
      }),
    });

    const data = await response.json<{ id?: string; message?: string }>();

    if (!response.ok) {
      return {
        success: false,
        provider: 'resend',
        error: data.message || `HTTP ${response.status}`,
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      messageId: data.id,
      provider: 'resend',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'resend',
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - startTime,
    };
  }
}

// ============================================
// SENDING - Mailchannels (Free fallback)
// ============================================

/**
 * Send email via Mailchannels
 * Free for Cloudflare Workers, no API key needed
 */
export async function sendViaMailchannels(
  params: SendEmailParams
): Promise<SendResult> {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: {
          email: params.from,
          name: params.fromName,
        },
        reply_to: {
          email: params.replyTo || params.from,
        },
        subject: params.subject,
        content: [
          { type: 'text/plain', value: params.body },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        provider: 'mailchannels',
        error: `HTTP ${response.status}: ${error}`,
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      messageId: `mc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      provider: 'mailchannels',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'mailchannels',
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - startTime,
    };
  }
}

// ============================================
// UNIFIED SEND FUNCTION
// ============================================

/**
 * Send email with automatic failover
 * 1. Try Resend (if API key configured)
 * 2. Fall back to Mailchannels
 */
export async function sendEmail(
  params: SendEmailParams,
  env: Env
): Promise<SendResult> {
  // Try Resend first if configured
  if (env.RESEND_API_KEY) {
    const result = await sendViaResend(params, env.RESEND_API_KEY);
    if (result.success) {
      return result;
    }
    console.error(`Resend failed: ${result.error}, falling back to Mailchannels`);
  }

  // Fall back to Mailchannels
  return sendViaMailchannels(params);
}

// ============================================
// INBOX MANAGEMENT
// ============================================

/**
 * Get next available inbox with warmup/circuit breaker checks
 */
export async function getNextInbox(env: Env): Promise<{
  email: string;
  displayName: string;
  id: string;
} | null> {
  const inboxState = env.INBOX_STATE.get(env.INBOX_STATE.idFromName('pool'));
  const warmupCounter = env.WARMUP_COUNTER.get(env.WARMUP_COUNTER.idFromName('global'));

  // Get next healthy inbox
  const inboxResponse = await inboxState.fetch(new Request('http://do/next-inbox'));
  if (!inboxResponse.ok) {
    return null;
  }

  const inbox = await inboxResponse.json<InboxConfig & { circuitState: string }>();

  // Check warmup limit
  const warmupResponse = await warmupCounter.fetch(
    new Request('http://do/can-send', {
      method: 'POST',
      body: JSON.stringify({ inboxId: inbox.id }),
    })
  );
  const warmupStatus = await warmupResponse.json<{ allowed: boolean }>();

  if (!warmupStatus.allowed) {
    return null;
  }

  return {
    email: inbox.email,
    displayName: inbox.displayName,
    id: inbox.id,
  };
}

/**
 * Record successful send
 */
export async function recordSendSuccess(
  inboxId: string,
  latencyMs: number,
  env: Env
): Promise<void> {
  const inboxState = env.INBOX_STATE.get(env.INBOX_STATE.idFromName('pool'));
  const warmupCounter = env.WARMUP_COUNTER.get(env.WARMUP_COUNTER.idFromName('global'));

  await Promise.all([
    inboxState.fetch(new Request('http://do/mark-success', {
      method: 'POST',
      body: JSON.stringify({ inboxId, latencyMs }),
    })),
    warmupCounter.fetch(new Request('http://do/increment', {
      method: 'POST',
      body: JSON.stringify({ inboxId }),
    })),
  ]);
}

/**
 * Record send failure
 */
export async function recordSendFailure(
  inboxId: string,
  error: string,
  env: Env
): Promise<void> {
  const inboxState = env.INBOX_STATE.get(env.INBOX_STATE.idFromName('pool'));

  await inboxState.fetch(new Request('http://do/mark-failure', {
    method: 'POST',
    body: JSON.stringify({ inboxId, error }),
  }));
}

// ============================================
// INITIALIZE INBOXES
// ============================================

/**
 * Register inboxes from environment
 */
export async function initializeInboxes(env: Env): Promise<number> {
  const inboxState = env.INBOX_STATE.get(env.INBOX_STATE.idFromName('pool'));
  const warmupCounter = env.WARMUP_COUNTER.get(env.WARMUP_COUNTER.idFromName('global'));

  const inboxConfigs = [
    env.SMTP_INBOX_1,
    env.SMTP_INBOX_2,
    env.SMTP_INBOX_3,
    env.SMTP_INBOX_4,
  ].filter(Boolean) as string[];

  let registered = 0;

  for (let i = 0; i < inboxConfigs.length; i++) {
    const parts = inboxConfigs[i].split('|');
    const email = parts[0];
    const displayName = parts[4] || `Jengu Team ${i + 1}`;

    const config: InboxConfig = {
      id: `inbox-${i + 1}`,
      provider: 'smtp',
      email,
      displayName,
    };

    await inboxState.fetch(new Request('http://do/register', {
      method: 'POST',
      body: JSON.stringify(config),
    }));

    await warmupCounter.fetch(new Request('http://do/register-inbox', {
      method: 'POST',
      body: JSON.stringify({ id: config.id, email, provider: 'smtp' }),
    }));

    registered++;
    console.log(`Registered inbox: ${email}`);
  }

  return registered;
}
