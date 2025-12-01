/**
 * Inbox send tracking
 * Manages daily send counts and rotation for warmup
 */

import type { SmtpInbox } from './types';
import { getSmtpInboxes } from './config';

// In-memory tracking of daily sends per inbox
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

/**
 * Sync in-memory counts from database
 * Call after deploy to restore state
 */
export function syncInboxCountsFromDb(sentTodayByInbox: Record<string, number>): void {
  const today = getTodayKey();
  for (const [email, count] of Object.entries(sentTodayByInbox)) {
    dailySends.set(email, { count, date: today });
  }
}

/**
 * Get next available inbox that hasn't hit daily limit
 * Returns inbox with lowest send count for even distribution
 */
export function getAvailableInbox(): SmtpInbox | null {
  const inboxes = getSmtpInboxes();
  if (inboxes.length === 0) return null;

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

/**
 * Get total remaining sends across all inboxes
 */
export function getTotalRemainingCapacity(): number {
  const inboxes = getSmtpInboxes();
  let remaining = 0;
  for (const inbox of inboxes) {
    const count = getInboxSendCount(inbox.email);
    remaining += Math.max(0, inbox.dailyLimit - count);
  }
  return remaining;
}

/**
 * Get inbox stats for monitoring
 */
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

/**
 * Get the assigned inbox for a prospect based on their last outbound email
 */
export function getProspectAssignedInbox(fromEmail: string | null): string | null {
  return fromEmail || null;
}
