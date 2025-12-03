/**
 * Email sending functionality
 * Handles SMTP and Microsoft Graph sending with rotation
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import * as nodemailer from 'nodemailer';

import type { SmtpInbox, SendEmailOptions, SendEmailResult } from './types';
import {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  AZURE_MAIL_FROM,
  AZURE_MAIL_FROM_NAME,
  GMAIL_SMTP_USER,
  GMAIL_SMTP_PASS,
  getSmtpInboxes,
  isAzureConfigured,
  isGmailConfigured,
} from './config';
import { getAvailableInbox, incrementInboxSendCount } from './inbox-tracker';
import { formatEmailHtml, formatSimpleHtml } from './templates';
import { logger } from '../logger';
import {
  canSendTo,
  parseBounceFromError,
  recordBounce,
  recordSuccessfulSend,
} from './verification';

/**
 * Create Microsoft Graph client
 */
function createGraphClient(): Client {
  if (!isAzureConfigured()) {
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

/**
 * Send email via SMTP with bounce detection
 */
async function sendViaSmtp(
  inbox: SmtpInbox,
  options: SendEmailOptions & { emailId?: string }
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

    const result = await transporter.sendMail({
      from: `${inbox.name} <${inbox.email}>`,
      to: options.to,
      subject: options.subject,
      html: formatEmailHtml(options.body),
    });

    const deliveryTime = Date.now() - startTime;
    incrementInboxSendCount(inbox.email);

    // Record successful send for reputation tracking
    await recordSuccessfulSend(options.to, inbox.email, options.emailId || null, result.messageId);

    logger.info({ to: options.to, inbox: inbox.email, deliveryTime }, 'Email sent via SMTP');

    return {
      success: true,
      messageId: result.messageId,
      deliveryTime,
      sentFrom: inbox.email,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    const errorStr = String(error);

    // Check if this is a bounce
    const bounceInfo = parseBounceFromError(errorStr);
    if (bounceInfo) {
      await recordBounce(options.to, inbox.email, options.emailId || null, bounceInfo);
      logger.warn({ to: options.to, bounceType: bounceInfo.type, error: errorStr }, 'Email bounced');
    } else {
      logger.error({ inbox: inbox.email, error }, 'SMTP send failed');
    }

    return {
      success: false,
      error: errorStr,
      deliveryTime,
      sentFrom: inbox.email,
      bounceType: bounceInfo?.type,
    };
  }
}

/**
 * Send email via Microsoft Graph API with bounce detection
 */
async function sendViaGraph(options: SendEmailOptions & { emailId?: string }): Promise<SendEmailResult> {
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
    const messageId = `graph-${Date.now()}`;

    // Record successful send
    await recordSuccessfulSend(options.to, AZURE_MAIL_FROM!, options.emailId || null, messageId);

    logger.info({ to: options.to, deliveryTime }, 'Email sent via Graph');

    return {
      success: true,
      messageId,
      deliveryTime,
      sentFrom: AZURE_MAIL_FROM,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    const errorStr = String(error);

    // Check if this is a bounce
    const bounceInfo = parseBounceFromError(errorStr);
    if (bounceInfo && AZURE_MAIL_FROM) {
      await recordBounce(options.to, AZURE_MAIL_FROM, options.emailId || null, bounceInfo);
      logger.warn({ to: options.to, bounceType: bounceInfo.type, error: errorStr }, 'Email bounced (Graph)');
    } else {
      logger.error({ error }, 'Graph send failed');
    }

    return {
      success: false,
      error: errorStr,
      deliveryTime,
      bounceType: bounceInfo?.type,
    };
  }
}

/**
 * Send an email - validates recipient, uses SMTP rotation if available, falls back to Azure
 */
export async function sendEmail(options: SendEmailOptions & { emailId?: string; skipValidation?: boolean }): Promise<SendEmailResult> {
  const hasAzure = isAzureConfigured();

  // Validate recipient email first (unless skipped for replies/follow-ups)
  if (!options.skipValidation) {
    const validation = await canSendTo(options.to);
    if (!validation.canSend) {
      logger.warn({ to: options.to, reason: validation.reason }, 'Email blocked by validation');
      return {
        success: false,
        error: `Cannot send to ${options.to}: ${validation.reason}`,
        deliveryTime: 0,
        blocked: true,
        blockReason: validation.reason,
      };
    }
  }

  // If a specific inbox is forced (for thread continuity)
  if (options.forceInbox) {
    if (options.forceInbox.toLowerCase() === AZURE_MAIL_FROM?.toLowerCase()) {
      if (hasAzure) {
        return sendViaGraph(options);
      }
    }
    const inboxes = getSmtpInboxes();
    const specificInbox = inboxes.find(i => i.email.toLowerCase() === options.forceInbox!.toLowerCase());
    if (specificInbox) {
      return sendViaSmtp(specificInbox, options);
    }
    logger.warn({ forcedInbox: options.forceInbox }, 'Forced inbox not found, using default');
  }

  // Force Azure if explicitly requested
  if (options.forceAzure && hasAzure) {
    return sendViaGraph(options);
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

  return {
    success: false,
    error: 'No email sending capacity available (all inboxes at daily limit)',
    deliveryTime: 0,
  };
}

/**
 * Send a mystery shopper email via Gmail SMTP
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

    logger.info({ to: options.to, deliveryTime }, 'Mystery shopper email sent');

    return {
      success: true,
      messageId: result.messageId,
      deliveryTime,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    logger.error({ error }, 'Gmail SMTP send failed');
    return {
      success: false,
      error: String(error),
      deliveryTime,
    };
  }
}

/**
 * Verify Azure/Graph connection
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isAzureConfigured()) {
    return { success: false, error: 'Azure credentials not configured' };
  }

  try {
    const credential = new ClientSecretCredential(
      AZURE_TENANT_ID!,
      AZURE_CLIENT_ID!,
      AZURE_CLIENT_SECRET!
    );

    await credential.getToken('https://graph.microsoft.com/.default');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
