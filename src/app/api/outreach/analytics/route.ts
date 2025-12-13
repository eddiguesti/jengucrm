/**
 * Analytics API
 * GET /api/outreach/analytics - Get outreach analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Fetch mailbox stats
    const { data: mailboxes } = await supabase
      .from('mailboxes')
      .select('status, health_score, daily_limit, sent_today, total_sent, total_bounces, total_replies, total_opens');

    const mailboxStats = {
      total: mailboxes?.length || 0,
      active: mailboxes?.filter(m => m.status === 'active').length || 0,
      warming: mailboxes?.filter(m => m.status === 'warming').length || 0,
      paused: mailboxes?.filter(m => m.status === 'paused').length || 0,
      averageHealth: mailboxes?.length
        ? Math.round(mailboxes.reduce((sum, m) => sum + (m.health_score || 0), 0) / mailboxes.length)
        : 100,
      totalCapacity: mailboxes?.reduce((sum, m) => sum + (m.daily_limit || 0), 0) || 0,
      usedCapacity: mailboxes?.reduce((sum, m) => sum + (m.sent_today || 0), 0) || 0,
    };

    // Fetch campaign stats
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('active');

    const { data: campaignLeads } = await supabase
      .from('campaign_leads')
      .select('status');

    const campaignStats = {
      total: campaigns?.length || 0,
      active: campaigns?.filter(c => c.active).length || 0,
      totalLeads: campaignLeads?.length || 0,
      activeLeads: campaignLeads?.filter(l => l.status === 'active').length || 0,
    };

    // Calculate email stats from mailboxes
    const totalSent = mailboxes?.reduce((sum, m) => sum + (m.total_sent || 0), 0) || 0;
    const totalOpens = mailboxes?.reduce((sum, m) => sum + (m.total_opens || 0), 0) || 0;
    const totalReplies = mailboxes?.reduce((sum, m) => sum + (m.total_replies || 0), 0) || 0;
    const totalBounces = mailboxes?.reduce((sum, m) => sum + (m.total_bounces || 0), 0) || 0;

    const emailStats = {
      totalSent,
      totalOpens,
      totalReplies,
      totalBounces,
      openRate: totalSent > 0 ? (totalOpens / totalSent) * 100 : 0,
      replyRate: totalSent > 0 ? (totalReplies / totalSent) * 100 : 0,
      bounceRate: totalSent > 0 ? (totalBounces / totalSent) * 100 : 0,
    };

    // Fetch inbox stats
    const { count: totalInbox } = await supabase
      .from('inbox_items')
      .select('*', { count: 'exact', head: true });

    const { count: unreadInbox } = await supabase
      .from('inbox_items')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    const { count: starredInbox } = await supabase
      .from('inbox_items')
      .select('*', { count: 'exact', head: true })
      .eq('is_starred', true);

    const { count: positiveReplies } = await supabase
      .from('inbox_items')
      .select('*', { count: 'exact', head: true })
      .eq('sentiment', 'positive');

    const { count: negativeReplies } = await supabase
      .from('inbox_items')
      .select('*', { count: 'exact', head: true })
      .eq('sentiment', 'negative');

    const inboxStats = {
      total: totalInbox || 0,
      unread: unreadInbox || 0,
      starred: starredInbox || 0,
      positiveReplies: positiveReplies || 0,
      negativeReplies: negativeReplies || 0,
    };

    return NextResponse.json({
      mailboxes: mailboxStats,
      campaigns: campaignStats,
      emails: emailStats,
      inbox: inboxStats,
    });
  } catch (error) {
    console.error('GET /api/outreach/analytics error:', error);
    return NextResponse.json({
      mailboxes: { total: 0, active: 0, warming: 0, paused: 0, averageHealth: 100, totalCapacity: 0, usedCapacity: 0 },
      campaigns: { total: 0, active: 0, totalLeads: 0, activeLeads: 0 },
      emails: { totalSent: 0, totalOpens: 0, totalReplies: 0, totalBounces: 0, openRate: 0, replyRate: 0, bounceRate: 0 },
      inbox: { total: 0, unread: 0, starred: 0, positiveReplies: 0, negativeReplies: 0 },
    });
  }
}
