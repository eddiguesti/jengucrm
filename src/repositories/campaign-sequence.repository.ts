/**
 * Campaign Sequence Repository
 * Database operations for campaign sequences and leads
 */

import { BaseRepository, PaginatedResult } from './base.repository';
import { logger } from '@/lib/logger';
import type {
  CampaignSequence,
  CampaignLead,
  CampaignLeadStatus,
  SequenceCampaign,
  CreateSequenceInput,
  CreateCampaignLeadInput,
} from '@/types';

export class CampaignSequenceRepository extends BaseRepository<CampaignSequence> {
  constructor() {
    super('campaign_sequences');
  }

  /**
   * Get all sequences for a campaign
   */
  async findByCampaign(campaignId: string): Promise<CampaignSequence[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('campaign_id', campaignId)
      .order('step_number', { ascending: true });

    if (error) {
      logger.error({ error, campaignId }, 'findByCampaign failed');
      throw error;
    }

    return (data || []) as CampaignSequence[];
  }

  /**
   * Get a specific step
   */
  async findStep(campaignId: string, stepNumber: number): Promise<CampaignSequence | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('step_number', stepNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error, campaignId, stepNumber }, 'findStep failed');
      throw error;
    }

    return data as CampaignSequence;
  }

  /**
   * Create a sequence step
   */
  async createStep(input: CreateSequenceInput): Promise<CampaignSequence> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        campaign_id: input.campaign_id,
        step_number: input.step_number,
        delay_days: input.delay_days || 0,
        delay_hours: input.delay_hours || 0,
        variant_a_subject: input.variant_a_subject,
        variant_a_body: input.variant_a_body,
        variant_b_subject: input.variant_b_subject || null,
        variant_b_body: input.variant_b_body || null,
        variant_split: input.variant_split || 50,
        use_ai_generation: input.use_ai_generation || false,
        ai_prompt_context: input.ai_prompt_context || null,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, input }, 'createStep failed');
      throw error;
    }

    return data as CampaignSequence;
  }

  /**
   * Update step metrics
   */
  async incrementMetrics(
    id: string,
    field: 'sent_count' | 'open_count' | 'reply_count' | 'bounce_count',
    variant?: 'A' | 'B'
  ): Promise<void> {
    const step = await this.findById(id);
    if (!step) return;

    const updates: Partial<CampaignSequence> = {
      [field]: (step[field] || 0) + 1,
    };

    // Track variant-specific metrics
    if (variant === 'A') {
      if (field === 'sent_count') updates.variant_a_sent = (step.variant_a_sent || 0) + 1;
      if (field === 'open_count') updates.variant_a_opens = (step.variant_a_opens || 0) + 1;
      if (field === 'reply_count') updates.variant_a_replies = (step.variant_a_replies || 0) + 1;
    } else if (variant === 'B') {
      if (field === 'sent_count') updates.variant_b_sent = (step.variant_b_sent || 0) + 1;
      if (field === 'open_count') updates.variant_b_opens = (step.variant_b_opens || 0) + 1;
      if (field === 'reply_count') updates.variant_b_replies = (step.variant_b_replies || 0) + 1;
    }

    await this.update(id, updates);
  }

  /**
   * Delete all steps for a campaign
   */
  async deleteByCampaign(campaignId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('campaign_id', campaignId);

    if (error) {
      logger.error({ error, campaignId }, 'deleteByCampaign failed');
      throw error;
    }
  }

  /**
   * Reorder steps (shift step numbers)
   */
  async reorderSteps(campaignId: string, newOrder: string[]): Promise<void> {
    for (let i = 0; i < newOrder.length; i++) {
      await this.update(newOrder[i], { step_number: i + 1 } as Partial<CampaignSequence>);
    }
  }
}

export class CampaignLeadRepository extends BaseRepository<CampaignLead> {
  constructor() {
    super('campaign_leads');
  }

  /**
   * Find leads for a campaign
   */
  async findByCampaign(
    campaignId: string,
    filters: { status?: CampaignLeadStatus } = {},
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<CampaignLead>> {
    let query = this.supabase
      .from(this.tableName)
      .select(`
        *,
        prospect:prospects(id, name, email, city, country, tier, stage)
      `, { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error, campaignId }, 'findByCampaign failed');
      throw error;
    }

    return {
      data: (data || []) as CampaignLead[],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Find leads ready for next email
   */
  async findReadyForEmail(limit = 50): Promise<CampaignLead[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(`
        *,
        prospect:prospects(id, name, email, city, country, tier, contact_name),
        mailbox:mailboxes(id, email, status, sent_today, daily_limit)
      `)
      .eq('status', 'active')
      .lte('next_email_at', now)
      .not('next_email_at', 'is', null)
      .order('next_email_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'findReadyForEmail failed');
      throw error;
    }

    return (data || []) as CampaignLead[];
  }

  /**
   * Add a lead to a campaign
   */
  async addLead(input: CreateCampaignLeadInput): Promise<CampaignLead> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        campaign_id: input.campaign_id,
        prospect_id: input.prospect_id,
        mailbox_id: input.mailbox_id || null,
        added_by: input.added_by || 'manual',
        status: 'active',
        current_step: 0,
        next_email_at: new Date().toISOString(), // Ready immediately
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, input }, 'addLead failed');
      throw error;
    }

    return data as CampaignLead;
  }

  /**
   * Add multiple leads to a campaign
   */
  async addLeads(campaignId: string, prospectIds: string[], mailboxId?: string): Promise<number> {
    const leads = prospectIds.map(prospectId => ({
      campaign_id: campaignId,
      prospect_id: prospectId,
      mailbox_id: mailboxId || null,
      added_by: 'manual',
      status: 'active',
      current_step: 0,
      next_email_at: new Date().toISOString(),
    }));

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(leads)
      .select();

    if (error) {
      logger.error({ error, campaignId }, 'addLeads failed');
      throw error;
    }

    return data?.length || 0;
  }

  /**
   * Update lead status
   */
  async updateStatus(id: string, status: CampaignLeadStatus): Promise<CampaignLead | null> {
    const updates: Partial<CampaignLead> = { status };

    if (status === 'replied') {
      updates.has_replied = true;
      updates.replied_at = new Date().toISOString();
      updates.next_email_at = null;
    } else if (status === 'completed' || status === 'unsubscribed' || status === 'bounced') {
      updates.next_email_at = null;
    }

    return this.update(id, updates);
  }

  /**
   * Advance lead to next step
   */
  async advanceStep(id: string, nextStepDelay: { days: number; hours: number }): Promise<CampaignLead | null> {
    const lead = await this.findById(id);
    if (!lead) return null;

    const nextEmailAt = new Date();
    nextEmailAt.setDate(nextEmailAt.getDate() + nextStepDelay.days);
    nextEmailAt.setHours(nextEmailAt.getHours() + nextStepDelay.hours);

    return this.update(id, {
      current_step: lead.current_step + 1,
      last_email_at: new Date().toISOString(),
      next_email_at: nextEmailAt.toISOString(),
      emails_sent: lead.emails_sent + 1,
    } as Partial<CampaignLead>);
  }

  /**
   * Mark lead as complete (finished all steps)
   */
  async markComplete(id: string): Promise<CampaignLead | null> {
    return this.update(id, {
      status: 'completed',
      next_email_at: null,
    } as Partial<CampaignLead>);
  }

  /**
   * Get stats for a campaign
   */
  async getCampaignStats(campaignId: string): Promise<{
    total: number;
    active: number;
    completed: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
    paused: number;
  }> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('status')
      .eq('campaign_id', campaignId);

    if (error) {
      logger.error({ error, campaignId }, 'getCampaignStats failed');
      throw error;
    }

    const leads = data || [];
    return {
      total: leads.length,
      active: leads.filter(l => l.status === 'active').length,
      completed: leads.filter(l => l.status === 'completed').length,
      replied: leads.filter(l => l.status === 'replied').length,
      bounced: leads.filter(l => l.status === 'bounced').length,
      unsubscribed: leads.filter(l => l.status === 'unsubscribed').length,
      paused: leads.filter(l => l.status === 'paused').length,
    };
  }

  /**
   * Remove lead from campaign
   */
  async removeFromCampaign(campaignId: string, prospectId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('campaign_id', campaignId)
      .eq('prospect_id', prospectId);

    if (error) {
      logger.error({ error, campaignId, prospectId }, 'removeFromCampaign failed');
      throw error;
    }

    return true;
  }
}

// Singleton instances
export const campaignSequenceRepository = new CampaignSequenceRepository();
export const campaignLeadRepository = new CampaignLeadRepository();
