/**
 * State Machine - Valid transitions for prospects and emails
 *
 * Ensures data integrity by preventing invalid state changes
 */

import { ProspectStage } from '../types';

// ==================
// PROSPECT STAGE MACHINE
// ==================

/**
 * Valid stage transitions for prospects
 *
 * State flow:
 * new → enriching → enriched → ready → contacted → engaged → meeting → won
 *                                  ↓          ↓         ↓         ↓
 *                                lost      lost      lost      lost
 *                                  ↓
 *                              contacted (re-engage)
 */
export const VALID_PROSPECT_TRANSITIONS: Record<ProspectStage, ProspectStage[]> = {
  'new': ['enriching', 'enriched', 'ready'],
  'enriching': ['enriched', 'new', 'ready'],
  'enriched': ['ready', 'contacted'],
  'ready': ['contacted'],
  'contacted': ['engaged', 'meeting', 'lost'],
  'engaged': ['meeting', 'won', 'lost'],
  'meeting': ['won', 'lost'],
  'won': [],
  'lost': ['contacted'], // Can re-engage a lost prospect
};

/**
 * Check if a prospect stage transition is valid
 */
export function canTransitionProspect(from: ProspectStage, to: ProspectStage): boolean {
  // Same state is always allowed (no-op)
  if (from === to) return true;

  const validTargets = VALID_PROSPECT_TRANSITIONS[from];
  return validTargets?.includes(to) || false;
}

/**
 * Get all valid next stages for a prospect
 */
export function getValidNextStages(currentStage: ProspectStage): ProspectStage[] {
  return VALID_PROSPECT_TRANSITIONS[currentStage] || [];
}

/**
 * Validate and throw if transition is invalid
 */
export function assertValidProspectTransition(
  from: ProspectStage,
  to: ProspectStage,
  prospectId?: string
): void {
  if (!canTransitionProspect(from, to)) {
    throw new InvalidTransitionError(
      `Invalid prospect transition: ${from} → ${to}`,
      'prospect',
      from,
      to,
      prospectId
    );
  }
}

// ==================
// EMAIL STATUS MACHINE
// ==================

export type EmailStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'failed';

/**
 * Valid status transitions for emails
 *
 * Status flow:
 * pending → sent → delivered → opened → clicked → replied
 *    ↓        ↓        ↓
 *  failed  bounced  bounced
 *    ↓
 * pending (retry)
 */
export const VALID_EMAIL_TRANSITIONS: Record<EmailStatus, EmailStatus[]> = {
  'pending': ['sent', 'failed'],
  'sent': ['delivered', 'bounced', 'opened', 'replied'], // Some skip delivered
  'delivered': ['opened', 'clicked', 'replied', 'bounced'],
  'opened': ['clicked', 'replied'],
  'clicked': ['replied'],
  'replied': [], // Terminal state
  'bounced': [], // Terminal state
  'failed': ['pending'], // Can retry
};

/**
 * Check if an email status transition is valid
 */
export function canTransitionEmail(from: EmailStatus, to: EmailStatus): boolean {
  // Same status is always allowed (no-op)
  if (from === to) return true;

  const validTargets = VALID_EMAIL_TRANSITIONS[from];
  return validTargets?.includes(to) || false;
}

/**
 * Get all valid next statuses for an email
 */
export function getValidNextEmailStatuses(currentStatus: EmailStatus): EmailStatus[] {
  return VALID_EMAIL_TRANSITIONS[currentStatus] || [];
}

/**
 * Validate and throw if transition is invalid
 */
export function assertValidEmailTransition(
  from: EmailStatus,
  to: EmailStatus,
  emailId?: string
): void {
  if (!canTransitionEmail(from, to)) {
    throw new InvalidTransitionError(
      `Invalid email transition: ${from} → ${to}`,
      'email',
      from,
      to,
      emailId
    );
  }
}

// ==================
// TERMINAL STATE CHECKS
// ==================

/**
 * Check if a prospect is in a terminal state (can't progress further)
 */
export function isTerminalProspectStage(stage: ProspectStage): boolean {
  return stage === 'won' || stage === 'lost';
}

/**
 * Check if an email is in a terminal state
 */
export function isTerminalEmailStatus(status: EmailStatus): boolean {
  return status === 'replied' || status === 'bounced';
}

// ==================
// STATE VALIDATION
// ==================

export interface StateValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Validate prospect state consistency
 */
export function validateProspectState(prospect: {
  stage: ProspectStage;
  contactEmail?: string | null;
  lastContactedAt?: string | null;
  emailBounced?: boolean;
}): StateValidationResult {
  const issues: string[] = [];

  // If contacted, must have email
  if (['contacted', 'engaged', 'meeting'].includes(prospect.stage) && !prospect.contactEmail) {
    issues.push(`Prospect in ${prospect.stage} stage but has no contact email`);
  }

  // If contacted, should have last_contacted_at
  if (['contacted', 'engaged', 'meeting', 'won'].includes(prospect.stage) && !prospect.lastContactedAt) {
    issues.push(`Prospect in ${prospect.stage} stage but no last_contacted_at timestamp`);
  }

  // If email bounced, shouldn't be in active stage
  if (prospect.emailBounced && ['contacted', 'engaged'].includes(prospect.stage)) {
    issues.push(`Prospect has bounced email but is in ${prospect.stage} stage`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Validate email state consistency
 */
export function validateEmailState(email: {
  status: EmailStatus;
  sentAt?: string | null;
  bouncedAt?: string | null;
  openedAt?: string | null;
  repliedAt?: string | null;
}): StateValidationResult {
  const issues: string[] = [];

  // If sent, must have sent_at
  if (email.status !== 'pending' && email.status !== 'failed' && !email.sentAt) {
    issues.push(`Email status is ${email.status} but no sent_at timestamp`);
  }

  // If bounced, must have bounced_at
  if (email.status === 'bounced' && !email.bouncedAt) {
    issues.push('Email status is bounced but no bounced_at timestamp');
  }

  // If replied, must have replied_at
  if (email.status === 'replied' && !email.repliedAt) {
    issues.push('Email status is replied but no replied_at timestamp');
  }

  // If opened, should have opened_at
  if (['opened', 'clicked', 'replied'].includes(email.status) && !email.openedAt) {
    // This is a soft warning - some systems don't track opens
    // issues.push(`Email status is ${email.status} but no opened_at timestamp`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ==================
// CUSTOM ERROR
// ==================

export class InvalidTransitionError extends Error {
  public readonly entityType: 'prospect' | 'email';
  public readonly fromState: string;
  public readonly toState: string;
  public readonly entityId?: string;

  constructor(
    message: string,
    entityType: 'prospect' | 'email',
    fromState: string,
    toState: string,
    entityId?: string
  ) {
    super(message);
    this.name = 'InvalidTransitionError';
    this.entityType = entityType;
    this.fromState = fromState;
    this.toState = toState;
    this.entityId = entityId;
  }
}
