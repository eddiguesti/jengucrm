/**
 * Email configuration
 * Environment variable parsing and validation
 */

import type { SmtpInbox } from './types';

// Azure AD / Microsoft Graph configuration
export const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
export const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
export const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
export const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';
export const AZURE_MAIL_FROM_NAME = process.env.AZURE_MAIL_FROM_NAME || 'Edward Guest';

// Gmail SMTP configuration for mystery shopper emails
export const GMAIL_SMTP_USER = process.env.GMAIL_SMTP_USER;
export const GMAIL_SMTP_PASS = process.env.GMAIL_SMTP_PASS;

/**
 * Parse SMTP inboxes from environment
 * Format uses | (pipe) as delimiter to allow special chars in passwords
 * SMTP_INBOX_N=email|password|host|port|name
 */
export function getSmtpInboxes(): SmtpInbox[] {
  const inboxes: SmtpInbox[] = [];

  const parseInboxConfig = (config: string): SmtpInbox | null => {
    const cleanConfig = config
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\n$/g, '')
      .replace(/\\!/g, '!')
      .trim();

    // Try pipe delimiter first (new format)
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

    // Fall back to colon delimiter (old format)
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

export function isSmtpConfigured(): boolean {
  const hasAzure = !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && AZURE_MAIL_FROM);
  const hasSmtpInboxes = getSmtpInboxes().length > 0;
  return hasAzure || hasSmtpInboxes;
}

export function isAzureConfigured(): boolean {
  return !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);
}

export function isGmailConfigured(): boolean {
  return !!(GMAIL_SMTP_USER && GMAIL_SMTP_PASS);
}
