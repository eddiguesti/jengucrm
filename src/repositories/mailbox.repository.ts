/**
 * Mailbox Repository
 * Database operations for email mailboxes (SmartLead-style)
 */

import { BaseRepository, PaginatedResult } from './base.repository';
import { logger } from '@/lib/logger';
import type { Mailbox, MailboxDailyStats, MailboxStatus, CreateMailboxInput } from '@/types';

export interface MailboxFilters {
  status?: MailboxStatus;
  warmup_enabled?: boolean;
  search?: string;
  minHealthScore?: number;
}

export class MailboxRepository extends BaseRepository<Mailbox> {
  constructor() {
    super('mailboxes');
  }

  /**
   * Find mailboxes with optional filters
   */
  async findWithFilters(
    filters: MailboxFilters = {},
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<Mailbox>> {
    let query = this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.warmup_enabled !== undefined) {
      query = query.eq('warmup_enabled', filters.warmup_enabled);
    }
    if (filters.search) {
      query = query.or(`email.ilike.%${filters.search}%,display_name.ilike.%${filters.search}%`);
    }
    if (filters.minHealthScore !== undefined) {
      query = query.gte('health_score', filters.minHealthScore);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error, filters }, 'findWithFilters failed');
      throw error;
    }

    return {
      data: (data || []) as Mailbox[],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Find mailbox by email address
   */
  async findByEmail(email: string): Promise<Mailbox | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error, email }, 'findByEmail failed');
      throw error;
    }

    return data as Mailbox;
  }

  /**
   * Get all active mailboxes (not paused or error)
   */
  async findActive(): Promise<Mailbox[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .in('status', ['active', 'warming'])
      .order('health_score', { ascending: false });

    if (error) {
      logger.error({ error }, 'findActive failed');
      throw error;
    }

    return (data || []) as Mailbox[];
  }

  /**
   * Get mailboxes available for sending (under daily limit)
   */
  async findAvailableForSending(): Promise<Mailbox[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .in('status', ['active', 'warming'])
      .gte('health_score', 50)
      .order('sent_today', { ascending: true }); // Prefer least-used

    if (error) {
      logger.error({ error }, 'findAvailableForSending failed');
      throw error;
    }

    // Filter to only those with remaining capacity
    return ((data || []) as Mailbox[]).filter(m => m.sent_today < m.daily_limit);
  }

  /**
   * Get the best mailbox for sending (least used, healthiest)
   */
  async getBestForSending(): Promise<Mailbox | null> {
    const available = await this.findAvailableForSending();
    if (available.length === 0) return null;

    // Sort by: remaining capacity, then health score
    return available.sort((a, b) => {
      const aRemaining = a.daily_limit - a.sent_today;
      const bRemaining = b.daily_limit - b.sent_today;
      if (aRemaining !== bRemaining) return bRemaining - aRemaining;
      return b.health_score - a.health_score;
    })[0];
  }

  /**
   * Increment sent count and update last_used_at
   */
  async recordSend(id: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_mailbox_sent', { mailbox_id: id });

    if (error) {
      // Fallback to regular update if RPC doesn't exist
      const { error: updateError } = await this.supabase
        .from(this.tableName)
        .update({
          sent_today: this.supabase.rpc('increment', { x: 1 }) as unknown as number,
          total_sent: this.supabase.rpc('increment', { x: 1 }) as unknown as number,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        logger.error({ error: updateError, id }, 'recordSend failed');
        throw updateError;
      }
    }
  }

  /**
   * Increment sent count (atomic)
   */
  async incrementSent(id: string): Promise<Mailbox | null> {
    const mailbox = await this.findById(id);
    if (!mailbox) return null;

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        sent_today: mailbox.sent_today + 1,
        total_sent: mailbox.total_sent + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id }, 'incrementSent failed');
      throw error;
    }

    return data as Mailbox;
  }

  /**
   * Record a bounce
   */
  async recordBounce(id: string): Promise<Mailbox | null> {
    const mailbox = await this.findById(id);
    if (!mailbox) return null;

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        bounces_today: mailbox.bounces_today + 1,
        total_bounces: mailbox.total_bounces + 1,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id }, 'recordBounce failed');
      throw error;
    }

    return data as Mailbox;
  }

  /**
   * Record a reply
   */
  async recordReply(id: string): Promise<Mailbox | null> {
    const mailbox = await this.findById(id);
    if (!mailbox) return null;

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        total_replies: mailbox.total_replies + 1,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id }, 'recordReply failed');
      throw error;
    }

    return data as Mailbox;
  }

  /**
   * Record an open
   */
  async recordOpen(id: string): Promise<Mailbox | null> {
    const mailbox = await this.findById(id);
    if (!mailbox) return null;

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        total_opens: mailbox.total_opens + 1,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id }, 'recordOpen failed');
      throw error;
    }

    return data as Mailbox;
  }

  /**
   * Update mailbox status
   */
  async updateStatus(id: string, status: MailboxStatus, error?: string): Promise<Mailbox | null> {
    const updates: Partial<Mailbox> = { status };
    if (error) {
      updates.last_error = error;
      updates.last_error_at = new Date().toISOString();
    }

    return this.update(id, updates);
  }

  /**
   * Pause a mailbox
   */
  async pause(id: string, reason?: string): Promise<Mailbox | null> {
    return this.updateStatus(id, 'paused', reason);
  }

  /**
   * Activate a mailbox
   */
  async activate(id: string): Promise<Mailbox | null> {
    return this.update(id, {
      status: 'active',
      last_error: null,
      last_error_at: null,
    } as Partial<Mailbox>);
  }

  /**
   * Create mailbox with defaults
   */
  async createMailbox(input: CreateMailboxInput): Promise<Mailbox> {
    const mailbox: Partial<Mailbox> = {
      email: input.email,
      display_name: input.display_name || null,
      smtp_host: input.smtp_host,
      smtp_port: input.smtp_port || 465,
      smtp_user: input.smtp_user,
      smtp_pass: input.smtp_pass,
      smtp_secure: input.smtp_secure ?? true,
      imap_host: input.imap_host || null,
      imap_port: input.imap_port || 993,
      imap_user: input.imap_user || null,
      imap_pass: input.imap_pass || null,
      imap_secure: input.imap_secure ?? true,
      warmup_enabled: input.warmup_enabled ?? true,
      warmup_target_per_day: input.warmup_target_per_day || 40,
      warmup_start_date: new Date().toISOString().split('T')[0],
      warmup_stage: 1,
      daily_limit: 5, // Start with warmup limit
      status: 'warming',
    };

    return this.create(mailbox);
  }

  /**
   * Get daily stats for a mailbox
   */
  async getDailyStats(mailboxId: string, days = 30): Promise<MailboxDailyStats[]> {
    const { data, error } = await this.supabase
      .from('mailbox_daily_stats')
      .select('*')
      .eq('mailbox_id', mailboxId)
      .order('date', { ascending: false })
      .limit(days);

    if (error) {
      logger.error({ error, mailboxId }, 'getDailyStats failed');
      throw error;
    }

    return (data || []) as MailboxDailyStats[];
  }

  /**
   * Get summary stats for all mailboxes
   */
  async getSummaryStats(): Promise<{
    total: number;
    active: number;
    warming: number;
    paused: number;
    error: number;
    totalSent: number;
    totalBounces: number;
    totalReplies: number;
    averageHealthScore: number;
    totalDailyCapacity: number;
    remainingDailyCapacity: number;
  }> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('status, health_score, total_sent, total_bounces, total_replies, daily_limit, sent_today');

    if (error) {
      logger.error({ error }, 'getSummaryStats failed');
      throw error;
    }

    const mailboxes = (data || []) as Mailbox[];

    const stats = {
      total: mailboxes.length,
      active: mailboxes.filter(m => m.status === 'active').length,
      warming: mailboxes.filter(m => m.status === 'warming').length,
      paused: mailboxes.filter(m => m.status === 'paused').length,
      error: mailboxes.filter(m => m.status === 'error').length,
      totalSent: mailboxes.reduce((sum, m) => sum + m.total_sent, 0),
      totalBounces: mailboxes.reduce((sum, m) => sum + m.total_bounces, 0),
      totalReplies: mailboxes.reduce((sum, m) => sum + m.total_replies, 0),
      averageHealthScore: mailboxes.length > 0
        ? Math.round(mailboxes.reduce((sum, m) => sum + m.health_score, 0) / mailboxes.length)
        : 100,
      totalDailyCapacity: mailboxes
        .filter(m => m.status === 'active' || m.status === 'warming')
        .reduce((sum, m) => sum + m.daily_limit, 0),
      remainingDailyCapacity: mailboxes
        .filter(m => m.status === 'active' || m.status === 'warming')
        .reduce((sum, m) => sum + Math.max(0, m.daily_limit - m.sent_today), 0),
    };

    return stats;
  }

  /**
   * Verify SMTP connection
   */
  async markSmtpVerified(id: string, verified: boolean): Promise<Mailbox | null> {
    return this.update(id, {
      smtp_verified: verified,
      smtp_verified_at: verified ? new Date().toISOString() : null,
    } as Partial<Mailbox>);
  }

  /**
   * Verify IMAP connection
   */
  async markImapVerified(id: string, verified: boolean): Promise<Mailbox | null> {
    return this.update(id, {
      imap_verified: verified,
      imap_verified_at: verified ? new Date().toISOString() : null,
    } as Partial<Mailbox>);
  }

  /**
   * Reset daily counters (called by cron at midnight)
   */
  async resetDailyCounters(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        sent_today: 0,
        bounces_today: 0,
        last_reset_date: today,
      })
      .neq('last_reset_date', today);

    if (error) {
      logger.error({ error }, 'resetDailyCounters failed');
      throw error;
    }
  }

  /**
   * Advance warmup stage for eligible mailboxes
   */
  async advanceWarmupStages(): Promise<number> {
    const { data: mailboxes, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('warmup_enabled', true)
      .lt('warmup_stage', 5);

    if (error) {
      logger.error({ error }, 'advanceWarmupStages failed');
      throw error;
    }

    let advanced = 0;
    const today = new Date();

    for (const mailbox of (mailboxes || []) as Mailbox[]) {
      const startDate = new Date(mailbox.warmup_start_date);
      const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const expectedStage = Math.min(5, Math.floor(daysSinceStart / 7) + 1);

      if (expectedStage > mailbox.warmup_stage) {
        const newLimit = this.getWarmupLimit(expectedStage, mailbox.warmup_target_per_day);
        await this.update(mailbox.id, {
          warmup_stage: expectedStage,
          daily_limit: newLimit,
          status: expectedStage >= 5 ? 'active' : 'warming',
        } as Partial<Mailbox>);
        advanced++;
      }
    }

    return advanced;
  }

  /**
   * Calculate warmup limit for a stage
   */
  private getWarmupLimit(stage: number, target: number): number {
    switch (stage) {
      case 1: return 5;
      case 2: return 10;
      case 3: return 15;
      case 4: return 20;
      case 5: return Math.min(25, target);
      default: return target;
    }
  }
}

// Singleton instance
export const mailboxRepository = new MailboxRepository();
