/**
 * Activity Repository
 * Database operations for prospect activities
 */

import { BaseRepository } from './base.repository';
import { logger } from '@/lib/logger';

export interface Activity {
  id: string;
  prospect_id: string;
  type: 'email_sent' | 'email_received' | 'call' | 'meeting' | 'note' | 'stage_change';
  title: string;
  description: string | null;
  email_id: string | null;
  created_at: string;
}

export interface CreateActivityInput {
  prospect_id: string;
  type: Activity['type'];
  title: string;
  description?: string;
  email_id?: string;
}

export class ActivityRepository extends BaseRepository<Activity> {
  constructor() {
    super('activities');
  }

  async findByProspect(prospectId: string, limit = 50): Promise<Activity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, prospectId }, 'findByProspect failed');
      throw error;
    }

    return (data || []) as Activity[];
  }

  async createBatch(activities: CreateActivityInput[]): Promise<void> {
    if (activities.length === 0) return;

    const { error } = await this.supabase
      .from(this.tableName)
      .insert(activities);

    if (error) {
      logger.error({ error, count: activities.length }, 'createBatch failed');
      throw error;
    }
  }

  async findRecentByType(
    type: Activity['type'],
    limit = 50
  ): Promise<Activity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, type }, 'findRecentByType failed');
      throw error;
    }

    return (data || []) as Activity[];
  }

  async countByProspect(prospectId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('prospect_id', prospectId);

    if (error) {
      logger.error({ error, prospectId }, 'countByProspect failed');
      throw error;
    }

    return count || 0;
  }
}

export const activityRepository = new ActivityRepository();
