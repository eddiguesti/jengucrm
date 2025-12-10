/**
 * Email Sender - Multi-provider email sending with failover
 *
 * Supports: Azure Graph API, SMTP (multiple inboxes)
 * Features: Round-robin, health tracking, automatic failover
 */

import { Env, InboxConfig } from '../types';

interface SendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  inbox: string;
  error?: string;
  latencyMs: number;
}

/**
 * Send email with automatic inbox selection and failover
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  env: Env
): Promise<SendResult> {
  const startTime = Date.now();

  // Get inbox state DO
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  // Get warmup counter DO
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  // Get next available inbox
  const inboxResponse = await inboxState.fetch(
    new Request('http://do/next-inbox')
  );

  if (!inboxResponse.ok) {
    const error = await inboxResponse.json<{ error: string }>();
    return {
      success: false,
      provider: 'none',
      inbox: 'none',
      error: error.error || 'No healthy inboxes available',
      latencyMs: Date.now() - startTime,
    };
  }

  const inbox = await inboxResponse.json<InboxConfig & { circuitState: string }>();

  // Check warmup limit for this inbox
  const warmupResponse = await warmupCounter.fetch(
    new Request('http://do/can-send', {
      method: 'POST',
      body: JSON.stringify({ inboxId: inbox.id }),
    })
  );

  const warmupStatus = await warmupResponse.json<{
    allowed: boolean;
    sent: number;
    limit: number;
    reason?: string;
  }>();

  if (!warmupStatus.allowed) {
    return {
      success: false,
      provider: inbox.provider,
      inbox: inbox.email,
      error: warmupStatus.reason || `Warmup limit reached (${warmupStatus.sent}/${warmupStatus.limit})`,
      latencyMs: Date.now() - startTime,
    };
  }

  // Attempt to send
  let result: SendResult;

  try {
    if (inbox.provider === 'azure') {
      result = await sendViaAzure(inbox, to, subject, body, env);
    } else {
      result = await sendViaSMTP(inbox, to, subject, body);
    }

    result.latencyMs = Date.now() - startTime;

    if (result.success) {
      // Record success
      await inboxState.fetch(
        new Request('http://do/mark-success', {
          method: 'POST',
          body: JSON.stringify({ inboxId: inbox.id, latencyMs: result.latencyMs }),
        })
      );

      // Increment warmup counter
      await warmupCounter.fetch(
        new Request('http://do/increment', {
          method: 'POST',
          body: JSON.stringify({ inboxId: inbox.id }),
        })
      );
    } else {
      // Record failure
      await inboxState.fetch(
        new Request('http://do/mark-failure', {
          method: 'POST',
          body: JSON.stringify({ inboxId: inbox.id, error: result.error }),
        })
      );
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Record failure
    await inboxState.fetch(
      new Request('http://do/mark-failure', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id, error: errorMessage }),
      })
    );

    return {
      success: false,
      provider: inbox.provider,
      inbox: inbox.email,
      error: errorMessage,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Send via Azure Graph API
 */
async function sendViaAzure(
  inbox: InboxConfig,
  to: string,
  subject: string,
  body: string,
  env: Env
): Promise<SendResult> {
  // Get OAuth token
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.AZURE_CLIENT_ID,
        client_secret: env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(`Azure auth failed: ${tokenResponse.status}`);
  }

  const { access_token } = await tokenResponse.json<{ access_token: string }>();

  // Send email
  const sendResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/${env.AZURE_MAIL_FROM}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: body,
          },
          toRecipients: [
            {
              emailAddress: { address: to },
            },
          ],
          from: {
            emailAddress: {
              address: env.AZURE_MAIL_FROM,
              name: inbox.displayName,
            },
          },
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!sendResponse.ok) {
    const error = await sendResponse.text();
    throw new Error(`Azure send failed: ${sendResponse.status} - ${error}`);
  }

  return {
    success: true,
    messageId: `azure-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    provider: 'azure',
    inbox: inbox.email,
    latencyMs: 0,
  };
}

/**
 * Send via SMTP
 * Note: Cloudflare Workers don't have native SMTP support,
 * so we use an HTTP-to-SMTP bridge service like Mailchannels or
 * forward to a Vercel/external function.
 *
 * For production, consider:
 * 1. Mailchannels (free for Workers)
 * 2. Resend API
 * 3. SendGrid API
 */
async function sendViaSMTP(
  inbox: InboxConfig,
  to: string,
  subject: string,
  body: string
): Promise<SendResult> {
  // Using Mailchannels (free for Cloudflare Workers)
  // See: https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/

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
    throw new Error(`SMTP send failed: ${response.status} - ${error}`);
  }

  return {
    success: true,
    messageId: `smtp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    provider: 'smtp',
    inbox: inbox.email,
    latencyMs: 0,
  };
}

/**
 * Record bounce
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
  ]);
}

/**
 * Initialize inboxes from environment
 */
export async function initializeInboxes(env: Env): Promise<void> {
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  // Register Azure inbox
  const azureInbox: InboxConfig = {
    id: 'azure-primary',
    provider: 'azure',
    email: env.AZURE_MAIL_FROM,
    displayName: 'Edd from Jengu',
  };

  await inboxState.fetch(
    new Request('http://do/register', {
      method: 'POST',
      body: JSON.stringify(azureInbox),
    })
  );

  await warmupCounter.fetch(
    new Request('http://do/register-inbox', {
      method: 'POST',
      body: JSON.stringify({
        id: azureInbox.id,
        email: azureInbox.email,
        provider: azureInbox.provider,
      }),
    })
  );

  // Register SMTP inboxes
  const smtpInboxes = [
    env.SMTP_INBOX_1,
    env.SMTP_INBOX_2,
    env.SMTP_INBOX_3,
    env.SMTP_INBOX_4,
  ].filter(Boolean);

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
  }
}
