/**
 * Prospect Repository
 * Database operations for prospects
 */

import { BaseRepository, PaginatedResult } from './base.repository';
import { logger } from '@/lib/logger';

export interface Prospect {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  property_type: string | null;
  contact_name: string | null;
  contact_title: string | null;
  tier: 'hot' | 'warm' | 'cold';
  stage: string;
  score: number;
  tags: string[];
  notes: string | null;
  source: string | null;
  archived: boolean;
  archive_reason: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  source_job_title: string | null;
  source_job_description: string | null;
  job_pain_points: {
    summary?: string;
    communicationTasks?: string[];
    adminTasks?: string[];
    speedRequirements?: string[];
  } | null;
  pain_signals?: { keyword_matched: string; review_snippet: string }[];
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectFilters {
  tier?: 'hot' | 'warm' | 'cold';
  stage?: string;
  search?: string;
  tags?: string;
  archived?: boolean;
  minScore?: number;
  hasEmail?: boolean;
}

export class ProspectRepository extends BaseRepository<Prospect> {
  constructor() {
    super('prospects');
  }

  async findWithFilters(
    filters: ProspectFilters,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<Prospect>> {
    let query = this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .order('score', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.tier) {
      query = query.eq('tier', filters.tier);
    }
    if (filters.stage) {
      query = query.eq('stage', filters.stage);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,city.ilike.%${filters.search}%`);
    }
    if (filters.tags) {
      query = query.contains('tags', [filters.tags]);
    }
    if (filters.archived !== undefined) {
      query = query.eq('archived', filters.archived);
    }
    if (filters.minScore !== undefined) {
      query = query.gte('score', filters.minScore);
    }
    if (filters.hasEmail) {
      query = query.not('email', 'is', null);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error, filters }, 'findWithFilters failed');
      throw error;
    }

    return {
      data: (data || []) as Prospect[],
      total: count || 0,
      limit,
      offset,
    };
  }

  async findEligibleForEmail(minScore: number, maxResults: number): Promise<Prospect[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(`
        id, name, email, city, country, property_type,
        google_rating, google_review_count, source_job_title,
        source_job_description, job_pain_points,
        score, tier, pain_signals(keyword_matched, review_snippet)
      `)
      .in('stage', ['new', 'researching'])
      .eq('archived', false)
      .not('email', 'is', null)
      .gte('score', minScore)
      .order('score', { ascending: false })
      .limit(maxResults);

    if (error) {
      logger.error({ error }, 'findEligibleForEmail failed');
      throw error;
    }

    // Cast through unknown since we're selecting a subset of fields with relations
    return (data || []) as unknown as Prospect[];
  }

  async findByEmail(email: string): Promise<Prospect | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as Prospect;
  }

  async updateStage(id: string, stage: string): Promise<Prospect | null> {
    return this.update(id, {
      stage,
      last_contacted_at: stage === 'contacted' ? new Date().toISOString() : undefined
    } as Partial<Prospect>);
  }

  async batchUpdateStage(ids: string[], stage: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({ stage, last_contacted_at: new Date().toISOString() })
      .in('id', ids);

    if (error) {
      logger.error({ error, ids }, 'batchUpdateStage failed');
      throw error;
    }
  }

  async archive(id: string, reason?: string): Promise<Prospect | null> {
    return this.update(id, {
      archived: true,
      archive_reason: reason
    } as Partial<Prospect>);
  }

  async getStatsByTier(): Promise<Record<string, number>> {
    // Use parallel count queries instead of fetching all rows
    const tiers = ['hot', 'warm', 'cold'] as const;
    const counts = await Promise.all(
      tiers.map(tier =>
        this.supabase
          .from(this.tableName)
          .select('id', { count: 'exact', head: true })
          .eq('tier', tier)
          .eq('archived', false)
      )
    );

    const stats: Record<string, number> = {};
    tiers.forEach((tier, i) => {
      if (counts[i].error) {
        logger.error({ error: counts[i].error, tier }, 'getStatsByTier count failed');
      }
      stats[tier] = counts[i].count || 0;
    });

    return stats;
  }

  async getStatsByStage(): Promise<Record<string, number>> {
    // Use parallel count queries instead of fetching all rows
    const stages = ['new', 'researching', 'outreach', 'contacted', 'engaged', 'meeting', 'proposal', 'won', 'lost'] as const;
    const counts = await Promise.all(
      stages.map(stage =>
        this.supabase
          .from(this.tableName)
          .select('id', { count: 'exact', head: true })
          .eq('stage', stage)
          .eq('archived', false)
      )
    );

    const stats: Record<string, number> = {};
    stages.forEach((stage, i) => {
      if (counts[i].error) {
        logger.error({ error: counts[i].error, stage }, 'getStatsByStage count failed');
      }
      stats[stage] = counts[i].count || 0;
    });

    return stats;
  }
}

export const prospectRepository = new ProspectRepository();
