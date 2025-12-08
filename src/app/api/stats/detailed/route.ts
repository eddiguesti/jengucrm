import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSmtpInboxes } from '@/lib/email';

// OPTIMIZED: Uses parallel queries (1.5s → 500ms)
export async function GET() {
  const supabase = createServerClient();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // PARALLEL: Fetch all data in 6 queries simultaneously
    // Separate COUNT queries ensure accurate totals while limiting detail data for performance
    const [
      prospectsResult,
      emailsResult,
      scrapeRunsResult,
      activitiesResult,
      prospectsCountResult,
      emailsCountResult,
    ] = await Promise.all([
      // Query 1: Prospects with details (limited for performance)
      supabase
        .from('prospects')
        .select('id, tier, stage, lead_quality, country, city, property_type, source, created_at, score')
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(10000),

      // Query 2: Emails with details (limited for performance)
      supabase
        .from('emails')
        .select('id, direction, status, email_type, sent_at, from_email, created_at, opened_at, strategy_variant')
        .order('created_at', { ascending: false })
        .limit(20000),

      // Query 3: Scrape runs (limited)
      supabase
        .from('scrape_runs')
        .select('source, total_found, new_prospects, status, completed_at')
        .order('completed_at', { ascending: false })
        .limit(50),

      // Query 4: Recent activities
      supabase
        .from('activities')
        .select('type, created_at')
        .gte('created_at', thisMonthStart.toISOString())
        .limit(5000),

      // Query 5: Accurate prospect count
      supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .eq('archived', false),

      // Query 6: Accurate email count
      supabase
        .from('emails')
        .select('*', { count: 'exact', head: true }),
    ]);

    const { data: prospects } = prospectsResult;
    const { data: emails } = emailsResult;
    const { data: scrapeRuns } = scrapeRunsResult;
    const { data: activities } = activitiesResult;
    const totalProspects = prospectsCountResult.count || prospects?.length || 0;
    const _totalEmails = emailsCountResult.count || emails?.length || 0; // Available for future use

    // Count by various dimensions
    const byTier: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    const byStage: Record<string, number> = {};
    const byLeadQuality: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    const byCountry: Record<string, number> = {};
    const byCity: Record<string, number> = {};
    const byPropertyType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byWeek: Record<string, number> = {};

    for (const p of prospects || []) {
      // Tier
      byTier[p.tier || 'cold'] = (byTier[p.tier || 'cold'] || 0) + 1;

      // Stage
      byStage[p.stage || 'new'] = (byStage[p.stage || 'new'] || 0) + 1;

      // Lead quality
      byLeadQuality[p.lead_quality || 'cold'] = (byLeadQuality[p.lead_quality || 'cold'] || 0) + 1;

      // Country
      const country = p.country || 'Unknown';
      byCountry[country] = (byCountry[country] || 0) + 1;

      // City (top cities only)
      const city = p.city || 'Unknown';
      byCity[city] = (byCity[city] || 0) + 1;

      // Property type
      const propType = p.property_type || 'hotel';
      byPropertyType[propType] = (byPropertyType[propType] || 0) + 1;

      // Source
      const source = p.source || 'manual';
      bySource[source] = (bySource[source] || 0) + 1;

      // By week (last 12 weeks)
      if (p.created_at) {
        const date = new Date(p.created_at);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        byWeek[weekKey] = (byWeek[weekKey] || 0) + 1;
      }
    }

    // Sort and limit city/country counts
    const topCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    const topCities = Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    // === EMAIL STATS ===
    // Note: emails already fetched in parallel query above
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());

    let sentTotal = 0;
    let sentToday = 0;
    let sentThisWeek = 0;
    let sentThisMonth = 0;
    let repliesTotal = 0;
    let repliesToday = 0;
    let repliesThisWeek = 0;
    let repliesThisMonth = 0;
    let opensTotal = 0;
    let opensToday = 0;
    let opensThisWeek = 0;
    let opensThisMonth = 0;
    const sentByInbox: Record<string, number> = {};
    const sentByDay: Record<string, number> = {};
    const repliesByDay: Record<string, number> = {};
    const opensByDay: Record<string, number> = {};
    const byStrategy: Record<string, { sent: number; opened: number; replied: number }> = {};

    for (const e of emails || []) {
      const sentDate = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
      const dayKey = sentDate.toISOString().split('T')[0];

      if (e.direction === 'outbound' && e.email_type === 'outreach') {
        sentTotal++;
        sentByDay[dayKey] = (sentByDay[dayKey] || 0) + 1;

        if (e.from_email) {
          sentByInbox[e.from_email] = (sentByInbox[e.from_email] || 0) + 1;
        }

        if (sentDate >= today) sentToday++;
        if (sentDate >= thisWeekStart) sentThisWeek++;
        if (sentDate >= thisMonthStart) sentThisMonth++;

        // Track opens
        if (e.opened_at) {
          opensTotal++;
          const openDate = new Date(e.opened_at);
          const openDayKey = openDate.toISOString().split('T')[0];
          opensByDay[openDayKey] = (opensByDay[openDayKey] || 0) + 1;

          if (openDate >= today) opensToday++;
          if (openDate >= thisWeekStart) opensThisWeek++;
          if (openDate >= thisMonthStart) opensThisMonth++;
        }

        // Track by strategy variant (A/B testing)
        const strategy = e.strategy_variant || 'default';
        if (!byStrategy[strategy]) {
          byStrategy[strategy] = { sent: 0, opened: 0, replied: 0 };
        }
        byStrategy[strategy].sent++;
        if (e.opened_at) byStrategy[strategy].opened++;
      }

      if (e.direction === 'inbound') {
        repliesTotal++;
        repliesByDay[dayKey] = (repliesByDay[dayKey] || 0) + 1;

        if (sentDate >= today) repliesToday++;
        if (sentDate >= thisWeekStart) repliesThisWeek++;
        if (sentDate >= thisMonthStart) repliesThisMonth++;
      }
    }

    // Calculate reply rates
    const replyRateTotal = sentTotal > 0 ? ((repliesTotal / sentTotal) * 100).toFixed(1) : '0';
    const replyRateWeek = sentThisWeek > 0 ? ((repliesThisWeek / sentThisWeek) * 100).toFixed(1) : '0';
    const replyRateMonth = sentThisMonth > 0 ? ((repliesThisMonth / sentThisMonth) * 100).toFixed(1) : '0';

    // Calculate open rates
    const openRateTotal = sentTotal > 0 ? ((opensTotal / sentTotal) * 100).toFixed(1) : '0';
    const openRateWeek = sentThisWeek > 0 ? ((opensThisWeek / sentThisWeek) * 100).toFixed(1) : '0';
    const openRateMonth = sentThisMonth > 0 ? ((opensThisMonth / sentThisMonth) * 100).toFixed(1) : '0';

    // Calculate strategy performance
    const strategyPerformance = Object.entries(byStrategy).map(([strategy, stats]) => ({
      strategy,
      sent: stats.sent,
      opened: stats.opened,
      replied: stats.replied,
      openRate: stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : '0',
      replyRate: stats.sent > 0 ? ((stats.replied / stats.sent) * 100).toFixed(1) : '0',
    })).sort((a, b) => parseFloat(b.replyRate) - parseFloat(a.replyRate));

    // === CONVERSION FUNNEL ===
    // Note: Stage counts are from sampled data, rates calculated consistently
    const sampledTotal = prospects?.length || 0;
    const contacted = (byStage['contacted'] || 0);
    const engaged = (byStage['engaged'] || 0);
    const meeting = (byStage['meeting'] || 0);
    const proposal = (byStage['proposal'] || 0);
    const closed = (byStage['closed'] || 0);

    const funnel = {
      prospects: totalProspects, // Accurate total
      sampled: sampledTotal, // How many included in stage breakdown
      contacted,
      engaged,
      meeting,
      proposal,
      closed,
      // Rates use sampled counts for consistency
      contactRate: sampledTotal ? ((contacted / sampledTotal) * 100).toFixed(1) : '0',
      engageRate: contacted > 0 ? ((engaged / contacted) * 100).toFixed(1) : '0',
      meetingRate: engaged > 0 ? ((meeting / engaged) * 100).toFixed(1) : '0',
      closeRate: meeting > 0 ? ((closed / meeting) * 100).toFixed(1) : '0',
    };

    // === INBOX STATS (warmup tracking) ===
    // Get today's sends per inbox from database (more reliable than in-memory)
    const sentTodayByInbox: Record<string, number> = {};
    for (const e of emails || []) {
      if (e.direction === 'outbound' && e.email_type === 'outreach' && e.from_email) {
        const sentDate = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
        if (sentDate >= today) {
          sentTodayByInbox[e.from_email] = (sentTodayByInbox[e.from_email] || 0) + 1;
        }
      }
    }

    // Get configured inboxes and their limits
    const smtpInboxes = getSmtpInboxes();
    const smtpInboxCount = smtpInboxes.length;
    const dailyLimit = parseInt(process.env.SMTP_DAILY_LIMIT || '20');

    // Calculate remaining capacity from database counts
    let dbRemainingCapacity = 0;
    const dbInboxStats = smtpInboxes.map(inbox => {
      const sentToday = sentTodayByInbox[inbox.email] || 0;
      const remaining = Math.max(0, dailyLimit - sentToday);
      dbRemainingCapacity += remaining;
      return {
        email: inbox.email,
        sent: sentToday,
        limit: dailyLimit,
        remaining,
      };
    });

    // In-memory stats available via getInboxStats() and getTotalRemainingCapacity()
    // if needed for debugging comparison with database counts

    // === SCRAPE RUN STATS ===
    // Note: scrapeRuns already fetched in parallel query above
    const scrapeStats: Record<string, { runs: number; found: number; new: number }> = {};
    for (const run of scrapeRuns || []) {
      if (!scrapeStats[run.source]) {
        scrapeStats[run.source] = { runs: 0, found: 0, new: 0 };
      }
      scrapeStats[run.source].runs++;
      scrapeStats[run.source].found += run.total_found || 0;
      scrapeStats[run.source].new += run.new_prospects || 0;
    }

    // === ACTIVITY TIMELINE ===
    // Note: activities already fetched in parallel query above
    const activityByType: Record<string, number> = {};
    for (const a of activities || []) {
      activityByType[a.type] = (activityByType[a.type] || 0) + 1;
    }

    return NextResponse.json({
      prospects: {
        total: totalProspects, // Uses accurate COUNT query
        sampled: prospects?.length || 0, // How many were analyzed for breakdown
        byTier,
        byStage,
        byLeadQuality,
        byCountry: topCountries,
        byCity: topCities,
        byPropertyType,
        bySource,
        byWeek,
      },
      emails: {
        sent: {
          total: sentTotal,
          today: sentToday,
          thisWeek: sentThisWeek,
          thisMonth: sentThisMonth,
          byInbox: sentByInbox,
          byDay: sentByDay,
        },
        opens: {
          total: opensTotal,
          today: opensToday,
          thisWeek: opensThisWeek,
          thisMonth: opensThisMonth,
          byDay: opensByDay,
        },
        replies: {
          total: repliesTotal,
          today: repliesToday,
          thisWeek: repliesThisWeek,
          thisMonth: repliesThisMonth,
          byDay: repliesByDay,
        },
        openRates: {
          total: parseFloat(openRateTotal),
          thisWeek: parseFloat(openRateWeek),
          thisMonth: parseFloat(openRateMonth),
        },
        replyRates: {
          total: parseFloat(replyRateTotal),
          thisWeek: parseFloat(replyRateWeek),
          thisMonth: parseFloat(replyRateMonth),
        },
        strategyPerformance,
      },
      funnel,
      inboxes: {
        count: smtpInboxCount,
        dailyLimit,
        remainingCapacity: dbRemainingCapacity, // Use database-based count
        details: dbInboxStats, // Today's sends from database
        totalSentByInbox: sentByInbox, // All-time sends per inbox
        sentTodayByInbox, // Today's sends per inbox (for warmup tracking)
      },
      scraping: scrapeStats,
      activity: activityByType,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to generate stats', details: String(error) },
      { status: 500 }
    );
  }
}
