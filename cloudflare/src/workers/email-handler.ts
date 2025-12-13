/**
 * Email Handler - Cloudflare Email Routing
 *
 * This handles inbound emails directly at the Cloudflare edge.
 * No IMAP polling needed - emails are processed in real-time.
 *
 * Setup:
 * 1. Domain must be on Cloudflare DNS
 * 2. Enable Email Routing in Cloudflare dashboard
 * 3. Create catch-all rule pointing to this worker
 *
 * Features:
 * - Processes emails and stores in DB
 * - Analyzes reply intent with AI
 * - Forwards copy to your Spacemail inbox
 */

import { Env } from '../types';
import { analyzeReplyIntent } from '../lib/ai-gateway';

// Email message interface from Cloudflare
interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;

  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  reply(message: EmailMessage): Promise<void>;
}

// Map your Cloudflare domains to Spacemail forwarding addresses
// Format: cloudflare-inbox -> spacemail-inbox
const FORWARD_MAP: Record<string, string> = {
  // Add your mappings here - emails received at key will be forwarded to value
  // Example: 'edd@jengu.me': 'edd@spacemail-inbox.com'
};

/**
 * Handle inbound email from Cloudflare Email Routing
 */
export async function handleEmail(
  message: EmailMessage,
  env: Env
): Promise<void> {
  const from = message.from;
  const to = message.to;

  console.log(`📧 Inbound email from ${from} to ${to}`);

  try {
    // Parse email content
    const rawEmail = await streamToString(message.raw);
    const parsed = parseRawEmail(rawEmail, message.headers);

    // Skip if it's from one of our own inboxes
    const ourInboxes = [
      env.SMTP_INBOX_1?.split('|')[0],
      env.SMTP_INBOX_2?.split('|')[0],
      env.SMTP_INBOX_3?.split('|')[0],
      env.SMTP_INBOX_4?.split('|')[0],
    ].filter(Boolean);

    if (ourInboxes.includes(from.toLowerCase())) {
      console.log('Skipping our own outbound email');
      return;
    }

    // Generate unique message ID
    const messageId = message.headers.get('Message-ID') ||
      `cf-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Check if already processed
    const existing = await env.DB.prepare(
      `SELECT id FROM emails WHERE message_id = ?`
    ).bind(messageId).first();

    if (existing) {
      console.log('Duplicate email, already processed');
      return;
    }

    // Find matching prospect
    const prospect = await env.DB.prepare(
      `SELECT id, name, stage FROM prospects WHERE LOWER(contact_email) = LOWER(?)`
    ).bind(from).first<{ id: string; name: string; stage: string }>();

    const emailId = crypto.randomUUID();

    if (prospect) {
      console.log(`✓ Reply from prospect: ${prospect.name}`);

      // Analyze reply intent with AI
      let replyAnalysis = null;
      try {
        replyAnalysis = await analyzeReplyIntent(parsed.subject, parsed.textBody, env);
        console.log(`Reply intent: ${replyAnalysis.intent} (${replyAnalysis.confidence}% confidence)`);
      } catch (error) {
        console.error('Failed to analyze reply:', error);
      }

      // Store the email
      await env.DB.prepare(`
        INSERT INTO emails (
          id, prospect_id, subject, body, to_email, from_email, message_id,
          direction, email_type, status, reply_intent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'received', ?, datetime('now'))
      `).bind(
        emailId,
        prospect.id,
        parsed.subject,
        parsed.textBody,
        to,
        from,
        messageId,
        replyAnalysis?.intent || null
      ).run();

      // Update prospect stage based on reply
      const newStage = getNewStage(prospect.stage, replyAnalysis?.intent);
      if (newStage !== prospect.stage) {
        await env.DB.prepare(`
          UPDATE prospects
          SET stage = ?, last_replied_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).bind(newStage, prospect.id).run();
      }

      // Send alert for important replies
      if (env.ALERT_WEBHOOK_URL && shouldAlert(replyAnalysis?.intent)) {
        await sendAlert(env.ALERT_WEBHOOK_URL, {
          type: 'reply_received',
          priority: replyAnalysis?.intent === 'meeting_request' ? 'high' : 'normal',
          prospect: prospect.name,
          prospectId: prospect.id,
          from,
          subject: parsed.subject,
          intent: replyAnalysis?.intent,
          summary: replyAnalysis?.summary,
          preview: parsed.textBody.slice(0, 300),
        });
      }

    } else {
      console.log(`? Email from unknown sender: ${from}`);

      // Store as orphan for manual review
      await env.DB.prepare(`
        INSERT INTO emails (
          id, subject, body, to_email, from_email, message_id,
          direction, email_type, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'orphan', datetime('now'))
      `).bind(emailId, parsed.subject, parsed.textBody, to, from, messageId).run();
    }

    // Forward to Spacemail inbox if configured
    await forwardToSpacemail(message, to, env);

  } catch (error) {
    console.error('Failed to process email:', error);
    // Still try to forward even if processing fails
    try {
      await forwardToSpacemail(message, message.to, env);
    } catch (fwdError) {
      console.error('Failed to forward email:', fwdError);
    }
  }
}

/**
 * Forward email to Spacemail inbox
 * This ensures you get a copy in your regular inbox
 */
async function forwardToSpacemail(
  message: EmailMessage,
  to: string,
  env: Env
): Promise<void> {
  // Check if there's a forward address configured
  const forwardTo = FORWARD_MAP[to.toLowerCase()];

  // Also check environment variable for default forward
  const defaultForward = env.EMAIL_FORWARD_TO;

  const targetAddress = forwardTo || defaultForward;

  if (targetAddress) {
    try {
      await message.forward(targetAddress);
      console.log(`📨 Forwarded to ${targetAddress}`);
    } catch (error) {
      console.error(`Failed to forward to ${targetAddress}:`, error);
    }
  }
}

// ============================================
// HELPERS
// ============================================

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result;
}

function parseRawEmail(raw: string, headers: Headers): {
  subject: string;
  textBody: string;
  htmlBody: string;
} {
  const subject = headers.get('Subject') || '(no subject)';

  // Simple body extraction (for production, use a proper email parser)
  let textBody = '';
  let htmlBody = '';

  // Find body after headers (double newline)
  const bodyStart = raw.indexOf('\r\n\r\n') || raw.indexOf('\n\n');
  if (bodyStart > 0) {
    const body = raw.slice(bodyStart + 4);

    // Check content type
    const contentType = headers.get('Content-Type') || '';

    if (contentType.includes('multipart')) {
      // Extract parts from multipart message
      const boundary = contentType.match(/boundary="?([^";\s]+)"?/)?.[1];
      if (boundary) {
        const parts = body.split(`--${boundary}`);
        for (const part of parts) {
          if (part.includes('text/plain')) {
            textBody = extractBodyFromPart(part);
          } else if (part.includes('text/html')) {
            htmlBody = extractBodyFromPart(part);
          }
        }
      }
    } else if (contentType.includes('text/html')) {
      htmlBody = body;
      textBody = stripHtml(body);
    } else {
      textBody = body;
    }
  }

  // Clean up
  textBody = textBody.trim();
  if (!textBody && htmlBody) {
    textBody = stripHtml(htmlBody);
  }

  return { subject, textBody, htmlBody };
}

function extractBodyFromPart(part: string): string {
  const bodyStart = part.indexOf('\r\n\r\n') || part.indexOf('\n\n');
  if (bodyStart > 0) {
    return part.slice(bodyStart + 4).trim();
  }
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNewStage(
  currentStage: string,
  replyIntent?: string
): string {
  const laterStages = ['meeting', 'proposal', 'won', 'lost'];

  if (laterStages.includes(currentStage)) {
    return currentStage; // Don't regress
  }

  switch (replyIntent) {
    case 'meeting_request':
      return 'meeting';
    case 'interested':
    case 'needs_info':
      return 'engaged';
    case 'not_interested':
      return 'lost';
    default:
      return 'engaged';
  }
}

function shouldAlert(intent?: string): boolean {
  const alertIntents = ['meeting_request', 'interested', 'delegation'];
  return !intent || alertIntents.includes(intent);
}

async function sendAlert(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to send alert:', error);
  }
}
