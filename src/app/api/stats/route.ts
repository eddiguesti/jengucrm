import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';

// Generic email prefixes for enrichment success tracking
const GENERIC_EMAIL_PREFIXES = [
  'info@', 'reservations@', 'reservation@', 'reception@', 'frontdesk@',
  'hello@', 'contact@', 'enquiries@', 'enquiry@', 'booking@', 'bookings@',
  'stay@', 'guest@', 'guests@', 'sales@', 'events@', 'weddings@',
  'groups@', 'meetings@', 'concierge@', 'hotel@', 'resort@'
];

export async function GET() {
  const supabase = createServerClient();

  try {
    // Get all prospects with email info for enrichment tracking
    const result = await supabase.from('prospects').select('tier, stage, lead_source, email, contact_name');
    const data = result.data;
    const error = result.error;

    if (error) {
      logger.error({ error }, 'Failed to fetch prospect stats');
      return errors.internal('Failed to fetch stats', error);
    }

    const stats = {
      total: data?.length || 0,
      byTier: { hot: 0, warm: 0, cold: 0 } as Record<string, number>,
      byStage: {} as Record<string, number>,
      painLeads: 0,
    };

    // Enrichment tracking
    const enrichment = {
      withEmail: 0,
      withGenericEmail: 0,
      withPersonalEmail: 0,
      withContactName: 0,
      successRate: 0,
    };

    for (const p of data || []) {
      stats.byTier[p.tier] = (stats.byTier[p.tier] || 0) + 1;
      stats.byStage[p.stage] = (stats.byStage[p.stage] || 0) + 1;
      if ('lead_source' in p && p.lead_source === 'review_mining') {
        stats.painLeads++;
      }

      // Track enrichment success
      if (p.email) {
        enrichment.withEmail++;
        const emailLower = p.email.toLowerCase();
        const isGeneric = GENERIC_EMAIL_PREFIXES.some(prefix => emailLower.startsWith(prefix));
        if (isGeneric) {
          enrichment.withGenericEmail++;
        } else {
          enrichment.withPersonalEmail++;
        }
      }
      if (p.contact_name) {
        enrichment.withContactName++;
      }
    }

    // Calculate enrichment success rate (personal emails / total with email)
    enrichment.successRate = enrichment.withEmail > 0
      ? Math.round((enrichment.withPersonalEmail / enrichment.withEmail) * 100)
      : 0;

    // Get pain signals count
    let painSignals = 0;
    try {
      const { count } = await supabase
        .from('pain_signals')
        .select('*', { count: 'exact', head: true });
      painSignals = count || 0;
    } catch {
      // Table doesn't exist yet
    }

    // Get automation stats
    const automation = {
      mysteryShopperQueue: 0,
      mysteryShopperSent: 0,
      outreachSent: 0,
      repliesReceived: 0,
      bouncedEmails: 0,
    };

    // Queue priority breakdown
    const queueByTier = { hot: 0, warm: 0, cold: 0 };

    try {
      // Mystery shopper queue with tier breakdown
      const { data: queueData } = await supabase
        .from('mystery_shopper_queue')
        .select('prospect_id, status, prospects(tier)')
        .eq('status', 'pending');

      automation.mysteryShopperQueue = queueData?.length || 0;
      for (const q of queueData || []) {
        const prospectData = q.prospects as { tier: string } | { tier: string }[] | null;
        const tier = (Array.isArray(prospectData) ? prospectData[0]?.tier : prospectData?.tier) || 'cold';
        queueByTier[tier as keyof typeof queueByTier] = (queueByTier[tier as keyof typeof queueByTier] || 0) + 1;
      }

      // Emails by type
      const { data: emailStats } = await supabase
        .from('emails')
        .select('email_type, direction, status')
        .in('email_type', ['mystery_shopper', 'outreach', 'follow_up']);

      for (const email of emailStats || []) {
        if (email.email_type === 'mystery_shopper' && email.direction === 'outbound' && email.status === 'sent') {
          automation.mysteryShopperSent++;
        } else if ((email.email_type === 'outreach' || email.email_type === 'follow_up') && email.direction === 'outbound' && email.status === 'sent') {
          automation.outreachSent++;
        }
        if (email.status === 'bounced') {
          automation.bouncedEmails++;
        }
      }

      // Count inbound replies
      const { count: replyCount } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'inbound');
      automation.repliesReceived = replyCount || 0;
    } catch {
      // Tables might not exist yet
    }

    // Weekly trends - this week vs last week
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const trends = {
      thisWeek: { sent: 0, replies: 0, meetings: 0 },
      lastWeek: { sent: 0, replies: 0, meetings: 0 },
      change: { sent: 0, replies: 0, meetings: 0 },
    };

    try {
      // This week emails
      const { data: thisWeekEmails } = await supabase
        .from('emails')
        .select('direction, email_type')
        .gte('sent_at', startOfThisWeek.toISOString())
        .eq('status', 'sent');

      for (const e of thisWeekEmails || []) {
        if (e.direction === 'outbound') trends.thisWeek.sent++;
        if (e.direction === 'inbound') trends.thisWeek.replies++;
        if (e.email_type === 'meeting_request') trends.thisWeek.meetings++;
      }

      // Last week emails
      const { data: lastWeekEmails } = await supabase
        .from('emails')
        .select('direction, email_type')
        .gte('sent_at', startOfLastWeek.toISOString())
        .lt('sent_at', startOfThisWeek.toISOString())
        .eq('status', 'sent');

      for (const e of lastWeekEmails || []) {
        if (e.direction === 'outbound') trends.lastWeek.sent++;
        if (e.direction === 'inbound') trends.lastWeek.replies++;
        if (e.email_type === 'meeting_request') trends.lastWeek.meetings++;
      }

      // Calculate change percentages
      trends.change.sent = trends.lastWeek.sent > 0
        ? Math.round(((trends.thisWeek.sent - trends.lastWeek.sent) / trends.lastWeek.sent) * 100)
        : (trends.thisWeek.sent > 0 ? 100 : 0);
      trends.change.replies = trends.lastWeek.replies > 0
        ? Math.round(((trends.thisWeek.replies - trends.lastWeek.replies) / trends.lastWeek.replies) * 100)
        : (trends.thisWeek.replies > 0 ? 100 : 0);
      trends.change.meetings = trends.lastWeek.meetings > 0
        ? Math.round(((trends.thisWeek.meetings - trends.lastWeek.meetings) / trends.lastWeek.meetings) * 100)
        : (trends.thisWeek.meetings > 0 ? 100 : 0);
    } catch {
      // Continue without trends
    }

    // Response time analytics (mystery shopper replies)
    const responseTime = {
      avgMinutes: 0,
      fastest: 0,
      slowest: 0,
      totalReplies: 0,
    };

    try {
      // Get mystery shopper replies with timing
      const { data: mysteryReplies } = await supabase
        .from('activities')
        .select('description')
        .eq('type', 'mystery_shopper_reply')
        .limit(100);

      const times: number[] = [];
      for (const reply of mysteryReplies || []) {
        // Parse "Response time: X minutes" from description
        const match = reply.description?.match(/Response time: (\d+) minutes/);
        if (match) {
          times.push(parseInt(match[1]));
        }
      }

      if (times.length > 0) {
        responseTime.totalReplies = times.length;
        responseTime.avgMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        responseTime.fastest = Math.min(...times);
        responseTime.slowest = Math.max(...times);
      }
    } catch {
      // Continue without response time
    }

    // Last cron run status
    let lastCronRun = null;
    try {
      const { data: lastActivity } = await supabase
        .from('activities')
        .select('created_at, title, description')
        .eq('type', 'system')
        .ilike('title', '%automation completed%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastActivity) {
        lastCronRun = {
          at: lastActivity.created_at,
          title: lastActivity.title,
          success: !lastActivity.description?.includes('"success":false'),
        };
      }
    } catch {
      // No cron runs yet
    }

    // Conversion funnel
    const funnel = {
      total: stats.total,
      contacted: stats.byStage['contacted'] || 0,
      engaged: stats.byStage['engaged'] || 0,
      meeting: stats.byStage['meeting'] || 0,
      won: stats.byStage['won'] || 0,
      lost: stats.byStage['lost'] || 0,
    };

    return success({
      ...stats,
      painSignals,
      automation,
      queueByTier,
      enrichment,
      trends,
      responseTime,
      lastCronRun,
      funnel,
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching stats');
    return errors.internal('Failed to fetch stats', error);
  }
}
