import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CAMPAIGN_STRATEGIES } from '@/lib/campaign-strategies';

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
export async function GET() {
  const supabase = createServerClient();

  // Fetch campaigns
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get today's date for daily stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate live stats for each campaign
  const campaignStats: CampaignStats[] = await Promise.all(
    (campaigns || []).map(async (campaign) => {
      // Count emails sent today
      const { count: emailsToday } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('direction', 'outbound')
        .gte('sent_at', today.toISOString());

      // Count total emails
      const { count: totalEmails } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('direction', 'outbound');

      // Count replies (inbound emails to prospects in this campaign)
      const { data: campaignProspects } = await supabase
        .from('emails')
        .select('prospect_id')
        .eq('campaign_id', campaign.id)
        .eq('direction', 'outbound');

      const prospectIds = [...new Set((campaignProspects || []).map(e => e.prospect_id))];

      let totalReplies = 0;
      let meetingsBooked = 0;

      if (prospectIds.length > 0) {
        // Count inbound replies
        const { count: replies } = await supabase
          .from('emails')
          .select('*', { count: 'exact', head: true })
          .in('prospect_id', prospectIds)
          .eq('direction', 'inbound');

        totalReplies = replies || 0;

        // Count meetings (prospects in 'meeting' stage)
        const { count: meetings } = await supabase
          .from('prospects')
          .select('*', { count: 'exact', head: true })
          .in('id', prospectIds)
          .eq('stage', 'meeting');

        meetingsBooked = meetings || 0;
      }

      // Calculate rates
      const emailsSent = totalEmails || 0;
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
        emails_today: emailsToday || 0,
        replies_received: totalReplies,
        meetings_booked: meetingsBooked,
        open_rate: 0, // Would need tracking pixel
        reply_rate: Math.round(replyRate * 10) / 10,
        meeting_rate: Math.round(meetingRate * 10) / 10,
        created_at: campaign.created_at,
      };
    })
  );

  // Get comparison data (which campaign is winning?)
  const totalSent = campaignStats.reduce((sum, c) => sum + c.emails_sent, 0);
  const totalReplies = campaignStats.reduce((sum, c) => sum + c.replies_received, 0);
  const totalMeetings = campaignStats.reduce((sum, c) => sum + c.meetings_booked, 0);

  // Find the leader
  const leader = campaignStats.reduce((best, current) =>
    current.reply_rate > best.reply_rate ? current : best
  , campaignStats[0]);

  return NextResponse.json({
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
}

// POST: Create a new campaign
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { name, description, strategy_key, daily_limit = 20 } = body;

    if (!name || !strategy_key) {
      return NextResponse.json(
        { error: 'name and strategy_key are required' },
        { status: 400 }
      );
    }

    // Validate strategy exists
    if (!CAMPAIGN_STRATEGIES[strategy_key]) {
      return NextResponse.json(
        { error: `Unknown strategy: ${strategy_key}. Available: ${Object.keys(CAMPAIGN_STRATEGIES).join(', ')}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name,
        description,
        strategy_key,
        daily_limit,
        active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, campaign: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH: Update campaign (toggle active, change limit)
export async function PATCH(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { id, active, daily_limit } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof active === 'boolean') updates.active = active;
    if (typeof daily_limit === 'number') updates.daily_limit = daily_limit;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, campaign: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
