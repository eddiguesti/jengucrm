/**
 * Campaign Service
 * Business logic for campaign management
 */

import { createServerClient } from '@/lib/supabase';
import { campaignRepository, emailRepository } from '@/repositories';
import type { Campaign, CampaignWithStats } from '@/repositories';

export interface CampaignSummary {
  total_campaigns: number;
  active_campaigns: number;
  total_emails_sent: number;
  total_replies: number;
  total_meetings: number;
  overall_reply_rate: number;
  overall_meeting_rate: number;
  leading_campaign: { name: string; reply_rate: number } | null;
}

export class CampaignService {
  async getCampaignsWithStats(): Promise<{
    campaigns: CampaignWithStats[];
    summary: CampaignSummary;
  }> {
    const supabase = createServerClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parallel fetch all data
    const [campaigns, allEmailsResult, meetingProspectsResult] = await Promise.all([
      campaignRepository.findWithEmailCounts(),
      supabase
        .from('emails')
        .select('id, campaign_id, prospect_id, direction, sent_at')
        .not('campaign_id', 'is', null),
      supabase.from('prospects').select('id').eq('stage', 'meeting'),
    ]);

    const allEmails = allEmailsResult.data || [];
    const meetingProspectIds = new Set(
      (meetingProspectsResult.data || []).map((p) => p.id)
    );

    // Build lookup maps
    const campaignEmailStats: Record<
      string,
      { total: number; today: number; prospectIds: Set<string> }
    > = {};
    const prospectReplies: Record<string, number> = {};

    for (const email of allEmails) {
      const campaignId = email.campaign_id;
      if (!campaignId) continue;

      if (!campaignEmailStats[campaignId]) {
        campaignEmailStats[campaignId] = { total: 0, today: 0, prospectIds: new Set() };
      }

      if (email.direction === 'outbound') {
        campaignEmailStats[campaignId].total++;
        campaignEmailStats[campaignId].prospectIds.add(email.prospect_id);

        if (email.sent_at && new Date(email.sent_at) >= today) {
          campaignEmailStats[campaignId].today++;
        }
      } else if (email.direction === 'inbound') {
        prospectReplies[email.prospect_id] = (prospectReplies[email.prospect_id] || 0) + 1;
      }
    }

    const campaignStats: CampaignWithStats[] = campaigns.map((campaign) => {
      const stats = campaignEmailStats[campaign.id] || {
        total: 0,
        today: 0,
        prospectIds: new Set(),
      };
      const prospectIds = Array.from(stats.prospectIds);

      let totalReplies = 0;
      let meetingsBooked = 0;
      for (const prospectId of prospectIds) {
        totalReplies += prospectReplies[prospectId] || 0;
        if (meetingProspectIds.has(prospectId)) {
          meetingsBooked++;
        }
      }

      const emailsSent = stats.total;
      const replyRate = emailsSent > 0 ? (totalReplies / emailsSent) * 100 : 0;
      const meetingRate = emailsSent > 0 ? (meetingsBooked / emailsSent) * 100 : 0;

      return {
        ...campaign,
        emails_sent: emailsSent,
        emails_today: stats.today,
        replies_received: totalReplies,
        meetings_booked: meetingsBooked,
        open_rate: 0,
        reply_rate: Math.round(replyRate * 10) / 10,
        meeting_rate: Math.round(meetingRate * 10) / 10,
      };
    });

    const totalSent = campaignStats.reduce((sum, c) => sum + c.emails_sent, 0);
    const totalReplies = campaignStats.reduce((sum, c) => sum + c.replies_received, 0);
    const totalMeetings = campaignStats.reduce((sum, c) => sum + c.meetings_booked, 0);

    const leader = campaignStats.reduce(
      (best, current) => (current.reply_rate > best.reply_rate ? current : best),
      campaignStats[0]
    );

    return {
      campaigns: campaignStats,
      summary: {
        total_campaigns: campaignStats.length,
        active_campaigns: campaignStats.filter((c) => c.active).length,
        total_emails_sent: totalSent,
        total_replies: totalReplies,
        total_meetings: totalMeetings,
        overall_reply_rate:
          totalSent > 0 ? Math.round((totalReplies / totalSent) * 1000) / 10 : 0,
        overall_meeting_rate:
          totalSent > 0 ? Math.round((totalMeetings / totalSent) * 1000) / 10 : 0,
        leading_campaign: leader
          ? { name: leader.name, reply_rate: leader.reply_rate }
          : null,
      },
    };
  }

  async getAvailableCampaigns(): Promise<Campaign[]> {
    const campaigns = await campaignRepository.findActive();
    const sentTodayByCampaign = await emailRepository.countSentTodayByCampaign();

    return campaigns.filter(
      (c) => (sentTodayByCampaign[c.id] || 0) < c.daily_limit
    );
  }

  async createCampaign(data: {
    name: string;
    description: string;
    strategy_key: string;
    daily_limit: number;
  }): Promise<Campaign> {
    return campaignRepository.create({
      ...data,
      active: true,
    });
  }

  async updateCampaign(
    id: string,
    updates: { active?: boolean; daily_limit?: number }
  ): Promise<Campaign | null> {
    return campaignRepository.update(id, updates);
  }
}

export const campaignService = new CampaignService();
