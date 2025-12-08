import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSmtpInboxes } from '@/lib/email';
import { getGmailInboxes } from '@/lib/email/config';

const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';

export async function GET() {
  const supabase = createServerClient();

  try {
    // Get all configured inboxes (agents)
    const smtpInboxes = getSmtpInboxes();
    const configuredAgents = [
      { email: AZURE_MAIL_FROM, name: 'Azure (Primary)' },
      ...smtpInboxes.map(i => ({ email: i.email, name: i.name })),
    ];

    // Get Gmail inboxes (mystery shopper only - exclude from sales agents)
    const gmailInboxes = getGmailInboxes();
    const mysteryShopperEmails = new Set(gmailInboxes.map(i => i.email.toLowerCase()));

    // Also discover agents from OUTREACH emails only (not mystery_shopper)
    const { data: sentEmails } = await supabase
      .from('emails')
      .select('from_email')
      .eq('direction', 'outbound')
      .eq('email_type', 'outreach') // Only sales emails, not mystery shopper
      .not('from_email', 'is', null);

    const discoveredEmails = new Set<string>();
    for (const e of sentEmails || []) {
      // Skip Gmail inboxes (mystery shopper only) and configured agents
      if (e.from_email &&
          !configuredAgents.some(a => a.email === e.from_email) &&
          !mysteryShopperEmails.has(e.from_email.toLowerCase())) {
        discoveredEmails.add(e.from_email);
      }
    }

    // Combine configured + discovered agents (excluding mystery shopper Gmail)
    const allAgents = [
      ...configuredAgents,
      ...Array.from(discoveredEmails).map(email => ({
        email,
        name: email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      })),
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get all emails for stats
    const { data: emails } = await supabase
      .from('emails')
      .select('id, direction, status, email_type, sent_at, from_email, to_email, prospect_id, created_at');

    // Get all prospects with their assigned agent (from_email of first outreach)
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, name, email, stage, tier, lead_quality, score, archived, created_at')
      .eq('archived', false);

    // Calculate stats per agent
    const agentStats = allAgents.map(agent => {
      // Outbound emails from this agent
      const outbound = (emails || []).filter(
        e => e.direction === 'outbound' && e.from_email === agent.email
      );

      // Inbound replies to this agent's emails
      const prospectsSentTo = new Set(outbound.map(e => e.prospect_id));
      const inbound = (emails || []).filter(
        e => e.direction === 'inbound' && prospectsSentTo.has(e.prospect_id)
      );

      // Time-based counts
      const sentToday = outbound.filter(e => {
        const d = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
        return d >= today;
      }).length;

      const sentThisWeek = outbound.filter(e => {
        const d = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
        return d >= thisWeekStart;
      }).length;

      const sentThisMonth = outbound.filter(e => {
        const d = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
        return d >= thisMonthStart;
      }).length;

      const repliesThisWeek = inbound.filter(e => {
        const d = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
        return d >= thisWeekStart;
      }).length;

      // Prospects assigned to this agent (first email sent by this agent)
      const assignedProspects = (prospects || []).filter(p =>
        outbound.some(e => e.prospect_id === p.id)
      );

      // Stage breakdown
      const stageBreakdown = {
        contacted: 0,
        engaged: 0,
        meeting: 0,
        proposal: 0,
        closed: 0,
        lost: 0,
      };
      for (const p of assignedProspects) {
        const stage = p.stage as keyof typeof stageBreakdown;
        if (stageBreakdown[stage] !== undefined) {
          stageBreakdown[stage]++;
        }
      }

      // Meeting requests for this agent's prospects (only actual meeting requests)
      const meetingRequests = inbound.filter(e =>
        e.email_type === 'meeting_request'
      ).length;

      const replyRate = outbound.length > 0
        ? ((inbound.length / outbound.length) * 100).toFixed(1)
        : '0';

      return {
        email: agent.email,
        name: agent.name,
        stats: {
          sent: {
            total: outbound.length,
            today: sentToday,
            thisWeek: sentThisWeek,
            thisMonth: sentThisMonth,
          },
          replies: {
            total: inbound.length,
            thisWeek: repliesThisWeek,
          },
          replyRate: parseFloat(replyRate),
          assignedProspects: assignedProspects.length,
          stageBreakdown,
          meetingRequests,
        },
      };
    });

    // Calculate totals
    const totals = {
      sent: agentStats.reduce((sum, a) => sum + a.stats.sent.total, 0),
      sentToday: agentStats.reduce((sum, a) => sum + a.stats.sent.today, 0),
      replies: agentStats.reduce((sum, a) => sum + a.stats.replies.total, 0),
      prospects: agentStats.reduce((sum, a) => sum + a.stats.assignedProspects, 0),
      meetingRequests: agentStats.reduce((sum, a) => sum + a.stats.meetingRequests, 0),
    };

    return NextResponse.json({
      agents: agentStats,
      totals,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Agents stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get agent stats', details: String(error) },
      { status: 500 }
    );
  }
}
