/**
 * Email Repository
 * Database operations for emails
 */

import { BaseRepository, PaginatedResult } from './base.repository';
import { logger } from '@/lib/logger';

export interface Email {
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  subject: string;
  body: string;
  to_email: string;
  from_email: string;
  message_id: string | null;
  email_type: 'outreach' | 'follow_up' | 'reply' | 'mystery_shopper';
  direction: 'inbound' | 'outbound';
  status: 'draft' | 'sent' | 'opened' | 'replied' | 'bounced';
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface EmailFilters {
  prospectId?: string;
  campaignId?: string;
  direction?: 'inbound' | 'outbound';
  status?: string;
  emailType?: string;
  sinceDate?: Date;
}

export class EmailRepository extends BaseRepository<Email> {
  constructor() {
    super('emails');
  }

  async findWithProspect(limit = 50, offset = 0): Promise<PaginatedResult<Email & { prospects: unknown }>> {
    const { data, error, count } = await this.supabase
      .from(this.tableName)
      .select('*, prospects(name, city, country)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error }, 'findWithProspect failed');
      throw error;
    }

    return {
      data: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  async findByProspect(prospectId: string): Promise<Email[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, prospectId }, 'findByProspect failed');
      throw error;
    }

    return (data || []) as Email[];
  }

  async findByCampaign(campaignId: string): Promise<Email[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, campaignId }, 'findByCampaign failed');
      throw error;
    }

    return (data || []) as Email[];
  }

  async countSentToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('email_type', 'outreach')
      .gte('sent_at', today.toISOString());

    if (error) {
      logger.error({ error }, 'countSentToday failed');
      throw error;
    }

    return count || 0;
  }

  async countSentTodayByInbox(): Promise<Record<string, number>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('from_email')
      .eq('direction', 'outbound')
      .eq('email_type', 'outreach')
      .gte('sent_at', today.toISOString());

    if (error) {
      logger.error({ error }, 'countSentTodayByInbox failed');
      throw error;
    }

    const counts: Record<string, number> = {};
    for (const e of data || []) {
      if (e.from_email) {
        counts[e.from_email] = (counts[e.from_email] || 0) + 1;
      }
    }

    return counts;
  }

  async countSentTodayByCampaign(): Promise<Record<string, number>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('campaign_id')
      .eq('direction', 'outbound')
      .eq('email_type', 'outreach')
      .gte('sent_at', today.toISOString());

    if (error) {
      logger.error({ error }, 'countSentTodayByCampaign failed');
      throw error;
    }

    const counts: Record<string, number> = {};
    for (const e of data || []) {
      if (e.campaign_id) {
        counts[e.campaign_id] = (counts[e.campaign_id] || 0) + 1;
      }
    }

    return counts;
  }

  async findAlreadyEmailed(prospectIds: string[]): Promise<Set<string>> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('prospect_id')
      .in('prospect_id', prospectIds)
      .eq('direction', 'outbound');

    if (error) {
      logger.error({ error }, 'findAlreadyEmailed failed');
      throw error;
    }

    return new Set((data || []).map(e => e.prospect_id));
  }

  async updateStatus(id: string, status: Email['status']): Promise<Email | null> {
    const updates: Partial<Email> = { status };

    if (status === 'opened') {
      updates.opened_at = new Date().toISOString();
    } else if (status === 'replied') {
      updates.replied_at = new Date().toISOString();
    }

    return this.update(id, updates);
  }
}

export const emailRepository = new EmailRepository();
