/**
 * Campaign Repository
 * Database operations for campaigns
 */

import { BaseRepository, PaginatedResult } from './base.repository';
import { logger } from '@/lib/logger';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  strategy_key: string;
  active: boolean;
  daily_limit: number;
  emails_sent: number;
  created_at: string;
}

export interface CampaignWithStats extends Campaign {
  emails_today: number;
  replies_received: number;
  meetings_booked: number;
  open_rate: number;
  reply_rate: number;
  meeting_rate: number;
}

export class CampaignRepository extends BaseRepository<Campaign> {
  constructor() {
    super('campaigns');
  }

  async findActive(): Promise<Campaign[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ error }, 'findActive failed');
      throw error;
    }

    return (data || []) as Campaign[];
  }

  async findWithEmailCounts(): Promise<Campaign[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('id, name, description, strategy_key, active, daily_limit, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ error }, 'findWithEmailCounts failed');
      throw error;
    }

    return (data || []) as Campaign[];
  }

  async incrementEmailCount(campaignId: string): Promise<void> {
    try {
      const { error: rpcError } = await this.supabase.rpc('increment_counter', {
        table_name: 'campaigns',
        column_name: 'emails_sent',
        row_id: campaignId,
      });

      if (rpcError) {
        // Fallback to direct update if RPC doesn't exist
        const campaign = await this.findById(campaignId);
        if (campaign) {
          await this.update(campaignId, {
            emails_sent: campaign.emails_sent + 1,
          });
        }
      }
    } catch {
      // Fallback to direct update
      const campaign = await this.findById(campaignId);
      if (campaign) {
        await this.update(campaignId, {
          emails_sent: campaign.emails_sent + 1,
        });
      }
    }
  }

  async toggleActive(campaignId: string, active: boolean): Promise<Campaign | null> {
    return this.update(campaignId, { active });
  }

  async updateDailyLimit(campaignId: string, dailyLimit: number): Promise<Campaign | null> {
    return this.update(campaignId, { daily_limit: dailyLimit });
  }
}

export const campaignRepository = new CampaignRepository();
