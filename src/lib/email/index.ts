/**
 * Email module
 * Re-exports all email functionality for backwards compatibility
 */

// Types
export type {
  SmtpInbox,
  SendEmailOptions,
  SendEmailResult,
  IncomingEmail,
} from './types';

// Config
export {
  getSmtpInboxes,
  getGmailInboxes,
  isSmtpConfigured,
  isGmailConfigured,
} from './config';

export type { GmailInbox } from './config';

// Inbox tracking
export {
  getInboxSendCount,
  incrementInboxSendCount,
  syncInboxCountsFromDb,
  getAvailableInbox,
  getTotalRemainingCapacity,
  getInboxStats,
  getProspectAssignedInbox,
} from './inbox-tracker';

// Templates
export {
  formatEmailHtml,
  formatSimpleHtml,
} from './templates';

// Sending
export {
  sendEmail,
  sendMysteryShopperEmail,
  verifySmtpConnection,
} from './send';

// IMAP
export {
  checkAllInboxesForReplies,
  checkGmailForReplies,
} from './imap';

// Verification & Bounce Detection
export {
  validateEmail,
  canSendTo,
  parseBounceFromError,
  recordBounce,
  recordSuccessfulSend,
} from './verification';

export type { EmailValidationResult, BounceInfo } from './verification';
