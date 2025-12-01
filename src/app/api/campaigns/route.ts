import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CAMPAIGN_STRATEGIES } from '@/lib/campaign-strategies';
import { success, errors } from '@/lib/api-response';
import { parseBody, createCampaignSchema, updateCampaignSchema, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';

interface CampaignStats {
  id: string;
  name: string;
  description: string;
  strategy_key: string;
  active: boolean;
  daily_limit: number;
  emails_sent: number;
  emails_today: number;
  replies_received: number;
  meetings_booked: number;
  open_rate: number;
  reply_rate: number;
  meeting_rate: number;
  created_at: string;
}

// GET: Fetch all campaigns with live stats
// OPTIMIZED: Uses bulk queries instead of N+1 pattern
export async function GET() {
  const supabase = createServerClient();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // PARALLEL: Fetch all data in 3 bulk queries
    const [campaignsResult, allEmailsResult, meetingProspectsResult] = await Promise.all([
      supabase
        .from('campaigns')
        .select('id, name, description, strategy_key, active, daily_limit, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('emails')
        .select('id, campaign_id, prospect_id, direction, sent_at')
        .not('campaign_id', 'is', null),
      supabase
        .from('prospects')
        .select('id')
        .eq('stage', 'meeting'),
    ]);

    const { data: campaigns, error } = campaignsResult;
    if (error) {
      logger.error({ error }, 'Failed to fetch campaigns');
      return errors.internal('Failed to fetch campaigns', error);
    }

    const allEmails = allEmailsResult.data || [];
    const meetingProspectIds = new Set((meetingProspectsResult.data || []).map(p => p.id));

    // Build lookup maps from bulk data
    const campaignEmailStats: Record<string, {
      total: number;
      today: number;
      prospectIds: Set<string>;
    }> = {};

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

    const campaignStats: CampaignStats[] = (campaigns || []).map((campaign) => {
      const stats = campaignEmailStats[campaign.id] || { total: 0, today: 0, prospectIds: new Set() };
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
      const replyRate = emailsSent > 0 ? ((totalReplies / emailsSent) * 100) : 0;
      const meetingRate = emailsSent > 0 ? ((meetingsBooked / emailsSent) * 100) : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        strategy_key: campaign.strategy_key,
        active: campaign.active,
        daily_limit: campaign.daily_limit,
        emails_sent: emailsSent,
        emails_today: stats.today,
        replies_received: totalReplies,
        meetings_booked: meetingsBooked,
        open_rate: 0,
        reply_rate: Math.round(replyRate * 10) / 10,
        meeting_rate: Math.round(meetingRate * 10) / 10,
        created_at: campaign.created_at,
      };
    });

    const totalSent = campaignStats.reduce((sum, c) => sum + c.emails_sent, 0);
    const totalReplies = campaignStats.reduce((sum, c) => sum + c.replies_received, 0);
    const totalMeetings = campaignStats.reduce((sum, c) => sum + c.meetings_booked, 0);

    const leader = campaignStats.reduce((best, current) =>
      current.reply_rate > best.reply_rate ? current : best
    , campaignStats[0]);

    return success({
      campaigns: campaignStats,
      summary: {
        total_campaigns: campaignStats.length,
        active_campaigns: campaignStats.filter(c => c.active).length,
        total_emails_sent: totalSent,
        total_replies: totalReplies,
        total_meetings: totalMeetings,
        overall_reply_rate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 1000) / 10 : 0,
        overall_meeting_rate: totalSent > 0 ? Math.round((totalMeetings / totalSent) * 1000) / 10 : 0,
        leading_campaign: leader ? {
          name: leader.name,
          reply_rate: leader.reply_rate,
        } : null,
      },
      available_strategies: Object.values(CAMPAIGN_STRATEGIES).map(s => ({
        key: s.key,
        name: s.name,
        description: s.description,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching campaigns');
    return errors.internal('Failed to fetch campaigns', error);
  }
}

// POST: Create a new campaign
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await parseBody(request, createCampaignSchema);

    // Validate strategy exists
    if (!CAMPAIGN_STRATEGIES[body.strategy_key]) {
      return errors.badRequest(`Unknown strategy: ${body.strategy_key}. Available: ${Object.keys(CAMPAIGN_STRATEGIES).join(', ')}`);
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: body.name,
        description: body.description,
        strategy_key: body.strategy_key,
        daily_limit: body.daily_limit,
        active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create campaign');
      return errors.internal('Failed to create campaign', error);
    }

    if (!data) {
      return errors.internal('Failed to create campaign');
    }

    logger.info({ campaignId: data.id, name: data.name }, 'Campaign created');
    return success({ campaign: data }, 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error creating campaign');
    return errors.internal('Failed to create campaign', error);
  }
}

// PATCH: Update campaign
export async function PATCH(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await parseBody(request, updateCampaignSchema);

    const updates: Record<string, unknown> = {};
    if (typeof body.active === 'boolean') updates.active = body.active;
    if (typeof body.daily_limit === 'number') updates.daily_limit = body.daily_limit;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      logger.error({ error, campaignId: body.id }, 'Failed to update campaign');
      return errors.internal('Failed to update campaign', error);
    }

    if (!data) {
      return errors.notFound('Campaign not found');
    }

    logger.info({ campaignId: data.id }, 'Campaign updated');
    return success({ campaign: data });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error updating campaign');
    return errors.internal('Failed to update campaign', error);
  }
}
