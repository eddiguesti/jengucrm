import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import * as nodemailer from 'nodemailer';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';

// Azure AD / Microsoft Graph configuration
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';
const AZURE_MAIL_FROM_NAME = process.env.AZURE_MAIL_FROM_NAME || 'Edward Guest';

// Multi-inbox SMTP configuration for warmup/rotation
// Format: SMTP_INBOXES=email1:pass1:host1:port1,email2:pass2:host2:port2
// Or use individual env vars: SMTP_INBOX_1, SMTP_INBOX_2, etc.
export interface SmtpInbox {
  email: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  dailyLimit: number; // Warmup limit (start at 20, increase over time)
  name: string; // Display name for From field
}

// Parse SMTP inboxes from environment
// Format uses | (pipe) as delimiter to allow special chars in passwords
// SMTP_INBOX_N=email|password|host|port|name
export function getSmtpInboxes(): SmtpInbox[] {
  const inboxes: SmtpInbox[] = [];

  // Helper to parse a single inbox config (supports both | and : delimiters for backwards compat)
  const parseInboxConfig = (config: string): SmtpInbox | null => {
    // Remove surrounding quotes if present (dotenv might include them)
    const cleanConfig = config.replace(/^['"]|['"]$/g, '');

    // Try pipe delimiter first (new format, supports special chars in passwords)
    if (cleanConfig.includes('|')) {
      const [email, password, host, port, name] = cleanConfig.split('|');
      if (email && password && host) {
        return {
          email: email.trim(),
          password: password.trim(),
          host: host.trim(),
          port: parseInt(port) || 465,
          secure: true,
          dailyLimit: parseInt(process.env.SMTP_DAILY_LIMIT || '20'),
          name: name?.trim() || 'Edward Guest',
        };
      }
    }
    // Fall back to colon delimiter (old format) - only works if password has no colons
    const parts = cleanConfig.split(':');
    if (parts.length >= 3) {
      const [email, password, host, port, name] = parts;
      if (email && password && host) {
        return {
          email: email.trim(),
          password: password.trim(),
          host: host.trim(),
          port: parseInt(port) || 465,
          secure: true,
          dailyLimit: parseInt(process.env.SMTP_DAILY_LIMIT || '20'),
          name: name?.trim() || 'Edward Guest',
        };
      }
    }
    return null;
  };

  // Check for SMTP_INBOXES (comma-separated)
  const inboxesEnv = process.env.SMTP_INBOXES;
  if (inboxesEnv) {
    const configs = inboxesEnv.split(',');
    for (const config of configs) {
      const inbox = parseInboxConfig(config);
      if (inbox) inboxes.push(inbox);
    }
  }

  // Also check individual SMTP_INBOX_N env vars (1-10)
  for (let i = 1; i <= 10; i++) {
    const config = process.env[`SMTP_INBOX_${i}`];
    if (config) {
      const inbox = parseInboxConfig(config);
      if (inbox) inboxes.push(inbox);
    }
  }

  return inboxes;
}

// In-memory tracking of daily sends per inbox
// This is synced from database when getAvailableInboxWithDbCheck is called
const dailySends: Map<string, { count: number; date: string }> = new Map();

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function getInboxSendCount(email: string): number {
  const today = getTodayKey();
  const data = dailySends.get(email);
  if (!data || data.date !== today) {
    return 0;
  }
  return data.count;
}

export function incrementInboxSendCount(email: string): void {
  const today = getTodayKey();
  const data = dailySends.get(email);
  if (!data || data.date !== today) {
    dailySends.set(email, { count: 1, date: today });
  } else {
    data.count++;
  }
}

// Sync in-memory counts from database (call this to initialize after deploy)
export function syncInboxCountsFromDb(sentTodayByInbox: Record<string, number>): void {
  const today = getTodayKey();
  for (const [email, count] of Object.entries(sentTodayByInbox)) {
    dailySends.set(email, { count, date: today });
  }
}

// Get next available inbox that hasn't hit daily limit
export function getAvailableInbox(): SmtpInbox | null {
  const inboxes = getSmtpInboxes();
  if (inboxes.length === 0) return null;

  // Find inbox with lowest send count that hasn't hit limit
  let bestInbox: SmtpInbox | null = null;
  let lowestCount = Infinity;

  for (const inbox of inboxes) {
    const count = getInboxSendCount(inbox.email);
    if (count < inbox.dailyLimit && count < lowestCount) {
      bestInbox = inbox;
      lowestCount = count;
    }
  }

  return bestInbox;
}

// Get total remaining sends across all inboxes
export function getTotalRemainingCapacity(): number {
  const inboxes = getSmtpInboxes();
  let remaining = 0;
  for (const inbox of inboxes) {
    const count = getInboxSendCount(inbox.email);
    remaining += Math.max(0, inbox.dailyLimit - count);
  }
  return remaining;
}

// Get inbox stats for monitoring
export function getInboxStats(): { email: string; sent: number; limit: number; remaining: number }[] {
  const inboxes = getSmtpInboxes();
  return inboxes.map(inbox => {
    const sent = getInboxSendCount(inbox.email);
    return {
      email: inbox.email,
      sent,
      limit: inbox.dailyLimit,
      remaining: inbox.dailyLimit - sent,
    };
  });
}

// Check if Azure is configured
export function isSmtpConfigured(): boolean {
  // Either Azure or SMTP inboxes work
  const hasAzure = !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && AZURE_MAIL_FROM);
  const hasSmtpInboxes = getSmtpInboxes().length > 0;
  return hasAzure || hasSmtpInboxes;
}

// Create Microsoft Graph client
function createGraphClient(): Client {
  if (!isSmtpConfigured()) {
    throw new Error('Azure credentials not configured');
  }

  const credential = new ClientSecretCredential(
    AZURE_TENANT_ID!,
    AZURE_CLIENT_ID!,
    AZURE_CLIENT_SECRET!
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  return Client.initWithMiddleware({ authProvider });
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  inReplyTo?: string; // Message ID for threading
  forceAzure?: boolean; // Force use of Azure (for replies)
  forceInbox?: string; // Force use of a specific inbox email (for thread continuity)
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveryTime: number;
  sentFrom?: string; // Which inbox was used
}

/**
 * Send email via SMTP (for warmup inboxes)
 * Note: No reply-to header - replies go directly to the sending inbox
 * to maintain email thread continuity for the customer
 */
async function sendViaSmtp(
  inbox: SmtpInbox,
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const startTime = Date.now();

  try {
    const transporter = nodemailer.createTransport({
      host: inbox.host,
      port: inbox.port,
      secure: inbox.secure,
      auth: {
        user: inbox.email,
        pass: inbox.password,
      },
    });

    // No reply-to header - replies go back to the sending inbox
    // This maintains thread continuity for the customer
    const result = await transporter.sendMail({
      from: `${inbox.name} <${inbox.email}>`,
      to: options.to,
      subject: options.subject,
      html: formatEmailHtml(options.body),
    });

    const deliveryTime = Date.now() - startTime;

    // Track the send
    incrementInboxSendCount(inbox.email);

    return {
      success: true,
      messageId: result.messageId,
      deliveryTime,
      sentFrom: inbox.email,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    console.error(`SMTP error (${inbox.email}):`, error);
    return {
      success: false,
      error: String(error),
      deliveryTime,
      sentFrom: inbox.email,
    };
  }
}

/**
 * Send email via Microsoft Graph API
 */
async function sendViaGraph(options: SendEmailOptions): Promise<SendEmailResult> {
  const startTime = Date.now();

  try {
    const client = createGraphClient();

    const message: Record<string, unknown> = {
      subject: options.subject,
      body: {
        contentType: 'HTML',
        content: formatEmailHtml(options.body),
      },
      toRecipients: [
        {
          emailAddress: {
            address: options.to,
          },
        },
      ],
      from: {
        emailAddress: {
          name: AZURE_MAIL_FROM_NAME,
          address: AZURE_MAIL_FROM,
        },
      },
    };

    await client
      .api(`/users/${AZURE_MAIL_FROM}/sendMail`)
      .post({ message, saveToSentItems: true });

    const deliveryTime = Date.now() - startTime;

    return {
      success: true,
      messageId: `graph-${Date.now()}`,
      deliveryTime,
      sentFrom: AZURE_MAIL_FROM,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    console.error('Microsoft Graph email error:', error);
    return {
      success: false,
      error: String(error),
      deliveryTime,
    };
  }
}

/**
 * Send an email - uses SMTP rotation if available, falls back to Azure
 * Best practice: Rotates across inboxes, respects daily warmup limits
 *
 * For thread continuity:
 * - Use forceInbox to send from a specific inbox (e.g., replying from same inbox that received)
 * - Use forceAzure to force Azure (for internal notifications)
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const hasAzure = !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);

  // If a specific inbox is forced (for thread continuity), use it
  if (options.forceInbox) {
    // Check if it's Azure
    if (options.forceInbox.toLowerCase() === AZURE_MAIL_FROM.toLowerCase()) {
      if (hasAzure) {
        return sendViaGraph(options);
      }
    }
    // Find the specific SMTP inbox
    const inboxes = getSmtpInboxes();
    const specificInbox = inboxes.find(i => i.email.toLowerCase() === options.forceInbox!.toLowerCase());
    if (specificInbox) {
      return sendViaSmtp(specificInbox, options);
    }
    // Inbox not found, fall through to normal logic
    console.warn(`Forced inbox ${options.forceInbox} not found, using default logic`);
  }

  // Force Azure if explicitly requested
  if (options.forceAzure) {
    if (hasAzure) {
      return sendViaGraph(options);
    }
  }

  // Try SMTP inboxes first (with rotation and warmup limits)
  const availableInbox = getAvailableInbox();
  if (availableInbox) {
    return sendViaSmtp(availableInbox, options);
  }

  // Fall back to Azure if no SMTP capacity
  if (hasAzure) {
    return sendViaGraph(options);
  }

  // No sending capacity available
  return {
    success: false,
    error: 'No email sending capacity available (all inboxes at daily limit)',
    deliveryTime: 0,
  };
}

// Edward Guest's professional email signature
const EMAIL_SIGNATURE = `
<table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' emb-background-style width='100%'>
  <tbody>
    <tr>
      <td style="width:100%;">
        <table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' emb-background-style width='500'>
          <tbody>
            <tr>
              <td style='padding:0px;vertical-align:middle;width:150px;font-family:Verdana, Verdana Ref, sans-serif;' width='150'>
                <table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' width='100%' emb-background-style>
                  <tbody>
                    <tr>
                      <td style="color:#666666;font-size:13px;height:173px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;">
                          <img src="https://mediaforce.img.email/images/6914c0d3c92d3.png" width="166" height="173" style="display:block;border:0px;" border="0" alt="Jengu.ai Director of International Business Development" />
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td style='padding-left:30px;padding-top:0px;padding-right:0px;padding-bottom:0px;vertical-align:middle;width:320px;font-family:Verdana, Verdana Ref, sans-serif;' width='320'>
                <table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' width='100%' emb-background-style>
                  <tbody>
                    <tr>
                      <td style="color:#666666;font-size:16px;mso-line-height-rule:exactly;line-height:24px;font-family:Helvetica,Arial,sans-serif;">
                        <p style="margin:.1px;"><span style='font-weight:bold;color:#054E88;letter-spacing:2px;'>Edward Guest</span></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-weight:bold;color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:20px;padding-bottom:7px;border-bottom:solid 2px #054E88;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><span style='font-weight:bold;'>Automation Expert</span> | Jengu</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:20px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><a href="tel:+33759637307" style="color:#0085d1;text-decoration:none;" target="_blank">+33 759637307</a></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:20px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><a href="tel:+441273090340" style="color:#0085d1;text-decoration:none;" target="_blank">+44 1273 090340</a></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:23px;font-family:Helvetica,Arial,sans-serif;">
                        <p style="margin:.1px;"><span style='color:#054E88;font-size:15px;letter-spacing:2px;'><a href="https://www.jengu.ai" style="color:#054E88;text-decoration:none;" target="_blank">www.jengu.ai</a></span></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:9px;height:22px;padding-top:7px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;">
                          <a href="https://www.linkedin.com/in/edwardguest1/" target="_blank" style="display:inline-block;padding-right:4px;vertical-align:middle;">
                            <img src="https://mediaforce.icns.email/social/linkedin-circle-small-0085d1-FFFFFF.png" width="22" height="22" style="border:0px;display:inline-block;" border="0" alt="LinkedIn" />
                          </a>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;height:30px;padding-top:13px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;">
                          <a href="https://calendly.com/edd-jengu-6puv/30min" target="_blank" style="display:inline-block;padding-right:4px;vertical-align:middle;">
                            <img src="https://mediaforce.icns.email/button/schedule4-small-054E88-dark-round.png" width="162" height="30" style="border:0px;display:inline-block;" border="0" alt="Get on My Calendar" />
                          </a>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#A9A9A9;font-size:8px;mso-line-height-rule:exactly;line-height:12px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><span style='font-weight:bold;font-size:8px;'>The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.</span></p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
`;

/**
 * Format plain text email body as professional HTML with signature
 */
function formatEmailHtml(body: string): string {
  // Split by double newlines to get paragraphs, then wrap each in <p> tags
  const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
  const htmlBody = paragraphs
    .map(para => {
      // Convert single newlines within a paragraph to <br>
      const lines = para.split('\n').join('<br>');
      return `<p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #333333;">${lines}</p>`;
    })
    .join('\n');

  // Optimized for maximum response rates based on research:
  // - 16px font size (optimal for mobile - 60%+ of opens)
  // - Arial/Helvetica sans-serif (renders consistently across clients)
  // - #333333 dark grey text (professional, high contrast)
  // - 1.6 line-height (improves readability)
  // - Short paragraphs with spacing (easier to scan)
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333333;
      margin: 0;
      padding: 20px;
      background-color: #ffffff;
    }
    .email-body {
      max-width: 600px;
    }
    .email-body p {
      margin: 0 0 16px 0;
    }
    .signature {
      margin-top: 30px;
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="email-body">
    ${htmlBody}
  </div>
  <div class="signature">
    ${EMAIL_SIGNATURE}
  </div>
</body>
</html>
  `.trim();
}

/**
 * Verify Azure/Graph connection
 * Note: We can't fully verify without Mail.Send permission,
 * so we just check if credentials are configured
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isSmtpConfigured()) {
    return { success: false, error: 'Azure credentials not configured' };
  }

  try {
    // Just verify we can create a Graph client and get a token
    // The actual permission check happens when we try to send
    const credential = new ClientSecretCredential(
      AZURE_TENANT_ID!,
      AZURE_CLIENT_ID!,
      AZURE_CLIENT_SECRET!
    );

    // Try to get a token - this verifies the credentials are valid
    await credential.getToken('https://graph.microsoft.com/.default');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Gmail SMTP configuration for mystery shopper emails
const GMAIL_SMTP_USER = process.env.GMAIL_SMTP_USER;
const GMAIL_SMTP_PASS = process.env.GMAIL_SMTP_PASS;

export function isGmailConfigured(): boolean {
  return !!(GMAIL_SMTP_USER && GMAIL_SMTP_PASS);
}

/**
 * Send a mystery shopper email via Gmail SMTP
 * This sends as Andy to test hotel response times
 */
export async function sendMysteryShopperEmail(options: {
  to: string;
  subject: string;
  body: string;
}): Promise<SendEmailResult> {
  const startTime = Date.now();

  if (!isGmailConfigured()) {
    return {
      success: false,
      error: 'Gmail SMTP not configured',
      deliveryTime: 0,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_SMTP_USER,
        pass: GMAIL_SMTP_PASS,
      },
    });

    const result = await transporter.sendMail({
      from: `Andy Chukwuat <${GMAIL_SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: formatSimpleHtml(options.body),
    });

    const deliveryTime = Date.now() - startTime;

    return {
      success: true,
      messageId: result.messageId,
      deliveryTime,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    console.error('Gmail SMTP error:', error);
    return {
      success: false,
      error: String(error),
      deliveryTime,
    };
  }
}

/**
 * Format plain text as simple HTML (no signature for mystery shopper)
 * Uses same optimized formatting as main emails
 */
function formatSimpleHtml(body: string): string {
  const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
  const htmlBody = paragraphs
    .map(para => {
      const lines = para.split('\n').join('<br>');
      return `<p style="margin: 0 0 16px 0;">${lines}</p>`;
    })
    .join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; padding: 20px; background-color: #ffffff;">
  ${htmlBody}
</body>
</html>
  `.trim();
}

// ============================================================
// IMAP - Check inboxes for replies
// ============================================================

export interface IncomingEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  bodyPreview: string;
  body?: string;
  receivedAt: Date;
  inReplyTo?: string;
  conversationId?: string;
  inboxEmail: string; // Which inbox received this
}

/**
 * Check a single SMTP inbox for new emails via IMAP
 * Spacemail uses the same host for IMAP as SMTP
 */
async function checkImapInbox(inbox: SmtpInbox, sinceDate: Date): Promise<IncomingEmail[]> {
  return new Promise((resolve) => {
    const emails: IncomingEmail[] = [];
    let resolved = false;
    let pendingParsing = 0;

    // Timeout after 30 seconds per inbox
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.log(`IMAP timeout for ${inbox.email} with ${emails.length} emails collected`);
        resolved = true;
        resolve(emails);
      }
    }, 30000);

    // Spacemail IMAP config (same credentials, port 993 for IMAP SSL)
    const imap = new Imap({
      user: inbox.email,
      password: inbox.password,
      host: inbox.host, // mail.spacemail.com
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 5000,
    });

    const finishIfComplete = () => {
      if (pendingParsing <= 0 && !resolved) {
        clearTimeout(timeout);
        resolved = true;
        resolve(emails);
      }
    };

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          console.error(`IMAP error opening inbox ${inbox.email}:`, err);
          clearTimeout(timeout);
          imap.end();
          if (!resolved) {
            resolved = true;
            resolve([]);
          }
          return;
        }

        // Search for emails since the given date
        const searchDate = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        imap.search(['ALL', ['SINCE', searchDate]], (searchErr, results) => {
          if (searchErr || !results || results.length === 0) {
            clearTimeout(timeout);
            imap.end();
            if (!resolved) {
              resolved = true;
              resolve([]);
            }
            return;
          }

          pendingParsing = results.length;

          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', async () => {
                try {
                  const parsed: ParsedMail = await simpleParser(buffer);
                  const fromAddress = parsed.from?.value?.[0]?.address || '';
                  const toAddress = parsed.to && !Array.isArray(parsed.to)
                    ? parsed.to.value?.[0]?.address || inbox.email
                    : inbox.email;

                  // Skip emails from the inbox itself (our own sent items)
                  if (fromAddress.toLowerCase() !== inbox.email.toLowerCase()) {
                    // Get body preview (first 500 chars of text)
                    const textBody = parsed.text || '';
                    const bodyPreview = textBody.substring(0, 500).replace(/\n+/g, ' ').trim();

                    emails.push({
                      messageId: parsed.messageId || `imap-${Date.now()}-${Math.random()}`,
                      from: fromAddress,
                      to: toAddress,
                      subject: parsed.subject || '(No subject)',
                      bodyPreview,
                      body: textBody,
                      receivedAt: parsed.date || new Date(),
                      inReplyTo: parsed.inReplyTo,
                      conversationId: parsed.references?.[0],
                      inboxEmail: inbox.email,
                    });
                  }
                } catch (parseErr) {
                  console.error(`Error parsing email in ${inbox.email}:`, parseErr);
                }
                pendingParsing--;
                finishIfComplete();
              });
            });
          });

          fetch.once('error', (fetchErr) => {
            console.error(`IMAP fetch error for ${inbox.email}:`, fetchErr);
          });

          fetch.once('end', () => {
            // Wait a bit for all parsing to complete, then close
            setTimeout(() => {
              imap.end();
            }, 500);
          });
        });
      });
    });

    imap.once('error', (imapErr: Error) => {
      console.error(`IMAP connection error for ${inbox.email}:`, imapErr);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve([]);
      }
    });

    imap.once('end', () => {
      // Wait for any remaining parsing to complete
      setTimeout(() => {
        finishIfComplete();
      }, 500);
    });

    imap.connect();
  });
}

/**
 * Check all configured SMTP inboxes for replies via IMAP
 */
export async function checkAllInboxesForReplies(sinceDate: Date): Promise<IncomingEmail[]> {
  const inboxes = getSmtpInboxes();
  const allEmails: IncomingEmail[] = [];

  // Check all inboxes in parallel
  const results = await Promise.all(
    inboxes.map(inbox => checkImapInbox(inbox, sinceDate))
  );

  for (const emails of results) {
    allEmails.push(...emails);
  }

  // Sort by received date, newest first
  allEmails.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

  return allEmails;
}

/**
 * Get the assigned inbox for a prospect based on their last outbound email
 * If no previous email, returns null (prospect can be assigned to any inbox)
 */
export function getProspectAssignedInbox(fromEmail: string | null): string | null {
  return fromEmail || null;
}

// ============================================================
// Gmail IMAP - Check mystery shopper inbox for hotel replies
// ============================================================

/**
 * Check Gmail inbox for replies to mystery shopper emails
 * Used to track hotel response times
 */
export async function checkGmailForReplies(sinceDate: Date): Promise<IncomingEmail[]> {
  if (!GMAIL_SMTP_USER || !GMAIL_SMTP_PASS) {
    return [];
  }

  return new Promise((resolve) => {
    const emails: IncomingEmail[] = [];
    let resolved = false;
    let pendingParsing = 0;

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.log(`Gmail IMAP timeout with ${emails.length} emails collected`);
        resolved = true;
        resolve(emails);
      }
    }, 30000);

    const finishIfComplete = () => {
      if (pendingParsing <= 0 && !resolved) {
        clearTimeout(timeout);
        resolved = true;
        resolve(emails);
      }
    };

    const imap = new Imap({
      user: GMAIL_SMTP_USER,
      password: GMAIL_SMTP_PASS,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 5000,
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          console.error('Gmail IMAP error opening inbox:', err);
          clearTimeout(timeout);
          imap.end();
          if (!resolved) {
            resolved = true;
            resolve([]);
          }
          return;
        }

        const searchDate = sinceDate.toISOString().split('T')[0];
        imap.search(['ALL', ['SINCE', searchDate]], (searchErr, results) => {
          if (searchErr || !results || results.length === 0) {
            clearTimeout(timeout);
            imap.end();
            if (!resolved) {
              resolved = true;
              resolve([]);
            }
            return;
          }

          pendingParsing = results.length;

          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', async () => {
                try {
                  const parsed: ParsedMail = await simpleParser(buffer);
                  const fromAddress = parsed.from?.value?.[0]?.address || '';
                  const toAddress = parsed.to && !Array.isArray(parsed.to)
                    ? parsed.to.value?.[0]?.address || GMAIL_SMTP_USER!
                    : GMAIL_SMTP_USER!;

                  const textBody = parsed.text || '';
                  const bodyPreview = textBody.substring(0, 500).replace(/\n+/g, ' ').trim();

                  emails.push({
                    messageId: parsed.messageId || `gmail-${Date.now()}-${Math.random()}`,
                    from: fromAddress,
                    to: toAddress,
                    subject: parsed.subject || '(No subject)',
                    bodyPreview,
                    body: textBody,
                    receivedAt: parsed.date || new Date(),
                    inReplyTo: parsed.inReplyTo,
                    conversationId: parsed.references?.[0],
                    inboxEmail: GMAIL_SMTP_USER!,
                  });
                } catch (parseErr) {
                  console.error('Error parsing Gmail email:', parseErr);
                }
                pendingParsing--;
                finishIfComplete();
              });
            });
          });

          fetch.once('error', (fetchErr) => {
            console.error('Gmail IMAP fetch error:', fetchErr);
          });

          fetch.once('end', () => {
            setTimeout(() => {
              imap.end();
            }, 500);
          });
        });
      });
    });

    imap.once('error', (imapErr: Error) => {
      console.error('Gmail IMAP connection error:', imapErr);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve([]);
      }
    });

    imap.once('end', () => {
      setTimeout(() => {
        finishIfComplete();
      }, 500);
    });

    imap.connect();
  });
}
