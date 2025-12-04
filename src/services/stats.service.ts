/**
 * Stats Service
 * Business logic for dashboard statistics
 */

import { createServerClient } from '@/lib/supabase';
import { emailRepository } from '@/repositories';
import { logger } from '@/lib/logger';

export interface DashboardStats {
  total: number;
  byTier: Record<string, number>;
  byStage: Record<string, number>;
  painLeads: number;
  painSignals: number;
}

export interface EmailStats {
  sentToday: number;
  sentTodayByInbox: Record<string, number>;
  sentTodayByCampaign: Record<string, number>;
}

export class StatsService {
  async getDashboardStats(): Promise<DashboardStats> {
    const supabase = createServerClient();

    try {
      // Try to get lead_source column, fall back if it doesn't exist
      let data;
      let error;

      const result = await supabase.from('prospects').select('tier, stage, lead_source');
      if (result.error?.message?.includes('lead_source does not exist')) {
        const fallback = await supabase.from('prospects').select('tier, stage');
        data = fallback.data;
        error = fallback.error;
      } else {
        data = result.data;
        error = result.error;
      }

      if (error) {
        logger.error({ error }, 'Failed to fetch prospect stats');
        throw error;
      }

      const stats: DashboardStats = {
        total: data?.length || 0,
        byTier: { hot: 0, warm: 0, cold: 0 },
        byStage: {},
        painLeads: 0,
        painSignals: 0,
      };

      for (const p of data || []) {
        stats.byTier[p.tier] = (stats.byTier[p.tier] || 0) + 1;
        stats.byStage[p.stage] = (stats.byStage[p.stage] || 0) + 1;
        if ('lead_source' in p && p.lead_source === 'review_mining') {
          stats.painLeads++;
        }
      }

      // Get pain signals count
      try {
        const { count } = await supabase
          .from('pain_signals')
          .select('*', { count: 'exact', head: true });
        stats.painSignals = count || 0;
      } catch {
        // Table doesn't exist yet
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'getDashboardStats failed');
      throw error;
    }
  }

  async getEmailStats(): Promise<EmailStats> {
    const [sentToday, sentTodayByInbox, sentTodayByCampaign] = await Promise.all([
      emailRepository.countSentToday(),
      emailRepository.countSentTodayByInbox(),
      emailRepository.countSentTodayByCampaign(),
    ]);

    return {
      sentToday,
      sentTodayByInbox,
      sentTodayByCampaign,
    };
  }

  async getProspectCountsByScore(): Promise<{
    highPriority: number;
    mediumPriority: number;
    lowerPriority: number;
    total: number;
  }> {
    const supabase = createServerClient();
    const { SCORING } = await import('@/lib/constants');

    const [highResult, mediumResult, lowerResult] = await Promise.all([
      supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .in('stage', ['new', 'researching'])
        .eq('archived', false)
        .not('email', 'is', null)
        .gte('score', SCORING.HOT_THRESHOLD),
      supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .in('stage', ['new', 'researching'])
        .eq('archived', false)
        .not('email', 'is', null)
        .gte('score', SCORING.AUTO_EMAIL_MIN_SCORE)
        .lt('score', SCORING.HOT_THRESHOLD),
      supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .in('stage', ['new', 'researching'])
        .eq('archived', false)
        .not('email', 'is', null)
        .gte('score', 30)
        .lt('score', SCORING.AUTO_EMAIL_MIN_SCORE),
    ]);

    const highPriority = highResult.count || 0;
    const mediumPriority = mediumResult.count || 0;
    const lowerPriority = lowerResult.count || 0;

    return {
      highPriority,
      mediumPriority,
      lowerPriority,
      total: highPriority + mediumPriority + lowerPriority,
    };
  }
}

export const statsService = new StatsService();
