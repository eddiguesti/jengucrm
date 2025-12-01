/**
 * Email type definitions
 * Shared interfaces used across email modules
 */

export interface SmtpInbox {
  email: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  dailyLimit: number;
  name: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  inReplyTo?: string;
  forceAzure?: boolean;
  forceInbox?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveryTime: number;
  sentFrom?: string;
}

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
  inboxEmail: string;
}
