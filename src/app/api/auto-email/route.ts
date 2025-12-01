import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, isSmtpConfigured, getInboxStats, getTotalRemainingCapacity, getSmtpInboxes, syncInboxCountsFromDb } from '@/lib/email';
import { getStrategy, CAMPAIGN_STRATEGIES } from '@/lib/campaign-strategies';
import Anthropic from '@anthropic-ai/sdk';

const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';

interface Campaign {
  id: string;
  name: string;
  strategy_key: string;
  active: boolean;
  daily_limit: number;
  emails_sent: number;
}

interface JobPainPoints {
  responsibilities?: string[];
  pain_points?: string[];
  communication_tasks?: string[];
  admin_tasks?: string[];
  speed_requirements?: string[];
  summary?: string;
}

interface Prospect {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  country: string | null;
  property_type: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  source_job_title: string | null;
  job_pain_points: JobPainPoints | null;
  pain_signals?: { keyword_matched: string; review_snippet: string }[];
  score: number;
  tier: string;
}

// Generate personalized email using Claude with campaign strategy
async function generateEmail(
  prospect: Prospect,
  campaign: Campaign
): Promise<{ subject: string; body: string } | null> {
  const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Get the strategy for this campaign
  const strategy = getStrategy(campaign.strategy_key);
  if (!strategy) {
    console.error(`Unknown strategy: ${campaign.strategy_key}`);
    return null;
  }

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_API_KEY ? 'https://api.x.ai' : undefined,
    });

    // Build prospect context for strategy
    const jp = prospect.job_pain_points;
    const prospectContext = {
      name: prospect.name,
      city: prospect.city,
      country: prospect.country,
      propertyType: prospect.property_type,
      jobTitle: prospect.source_job_title,
      painSignals: prospect.pain_signals?.map(ps => ({
        keyword: ps.keyword_matched,
        snippet: ps.review_snippet,
      })),
      jobPainPoints: jp ? {
        summary: jp.summary,
        communicationTasks: jp.communication_tasks,
        adminTasks: jp.admin_tasks,
        speedRequirements: jp.speed_requirements,
      } : undefined,
    };

    // Generate prompt using campaign strategy
    const prompt = strategy.generatePrompt(prospectContext);

    const response = await anthropic.messages.create({
      model: process.env.XAI_API_KEY ? 'grok-4-1-fast-non-reasoning' : 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    // Grok returns thinking blocks first, so find the text block
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return null;

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Email generation error:', err);
    return null;
  }
}


export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const maxEmails = body.max_emails || 10;
    const minScore = body.min_score || 50; // Only email prospects with score >= 50
    const staggerDelay = body.stagger_delay || false; // Add random delays between emails

    // Check if email sending is configured
    if (!isSmtpConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Email sending not configured (missing Azure credentials)',
        sent: 0,
      });
    }

    // Sync inbox counts from database (handles server restarts/deploys)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todaysEmails } = await supabase
      .from('emails')
      .select('from_email')
      .eq('direction', 'outbound')
      .eq('email_type', 'outreach')
      .gte('sent_at', today.toISOString());

    const sentTodayByInbox: Record<string, number> = {};
    for (const e of todaysEmails || []) {
      if (e.from_email) {
        sentTodayByInbox[e.from_email] = (sentTodayByInbox[e.from_email] || 0) + 1;
      }
    }
    syncInboxCountsFromDb(sentTodayByInbox);

    // Fetch active campaigns for A/B testing
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, strategy_key, active, daily_limit, emails_sent')
      .eq('active', true);

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active campaigns found. Create campaigns in the database first.',
        sent: 0,
      });
    }

    // Count emails sent today per campaign
    const { data: campaignEmailsToday } = await supabase
      .from('emails')
      .select('campaign_id')
      .eq('direction', 'outbound')
      .eq('email_type', 'outreach')
      .gte('sent_at', today.toISOString());

    const sentTodayByCampaign: Record<string, number> = {};
    for (const e of campaignEmailsToday || []) {
      if (e.campaign_id) {
        sentTodayByCampaign[e.campaign_id] = (sentTodayByCampaign[e.campaign_id] || 0) + 1;
      }
    }

    // Filter campaigns that haven't hit their daily limit
    const availableCampaigns = campaigns.filter(c =>
      (sentTodayByCampaign[c.id] || 0) < c.daily_limit
    );

    if (availableCampaigns.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'All campaigns have hit their daily limit',
        sent: 0,
        campaigns: campaigns.map(c => ({
          name: c.name,
          sent_today: sentTodayByCampaign[c.id] || 0,
          daily_limit: c.daily_limit,
        })),
      });
    }

    // Find prospects to email:
    // - Stage is 'new' or 'researching'
    // - Has email address
    // - Score >= minScore
    // - Not archived
    // - Never been emailed before
    // PRIORITY ORDER: hot leads first, then warm, then cold (by score within each tier)
    let prospects;
    const baseSelect = `id, name, email, city, country, property_type,
        google_rating, google_review_count, source_job_title,
        score, tier, lead_quality, pain_signals(keyword_matched, review_snippet)`;

    // First: Get HOT leads (job boards, review pain points)
    const { data: hotLeads } = await supabase
      .from('prospects')
      .select(`${baseSelect}, job_pain_points`)
      .in('stage', ['new', 'researching'])
      .eq('archived', false)
      .eq('lead_quality', 'hot')
      .not('email', 'is', null)
      .gte('score', minScore)
      .order('score', { ascending: false })
      .limit(maxEmails);

    // Second: Get WARM leads if not enough hot
    let warmLeads: typeof hotLeads = [];
    if ((hotLeads?.length || 0) < maxEmails) {
      const { data } = await supabase
        .from('prospects')
        .select(`${baseSelect}, job_pain_points`)
        .in('stage', ['new', 'researching'])
        .eq('archived', false)
        .eq('lead_quality', 'warm')
        .not('email', 'is', null)
        .gte('score', minScore)
        .order('score', { ascending: false })
        .limit(maxEmails - (hotLeads?.length || 0));
      warmLeads = data || [];
    }

    // Third: Get COLD leads only if hot + warm not enough
    let coldLeads: typeof hotLeads = [];
    const hotWarmCount = (hotLeads?.length || 0) + (warmLeads?.length || 0);
    if (hotWarmCount < maxEmails) {
      const { data } = await supabase
        .from('prospects')
        .select(`${baseSelect}, job_pain_points`)
        .in('stage', ['new', 'researching'])
        .eq('archived', false)
        .eq('lead_quality', 'cold')
        .not('email', 'is', null)
        .gte('score', Math.max(minScore - 20, 30)) // Lower threshold for cold
        .order('score', { ascending: false })
        .limit(maxEmails - hotWarmCount);
      coldLeads = data || [];
    }

    // Combine all leads (hot first, then warm, then cold)
    prospects = [...(hotLeads || []), ...(warmLeads || []), ...(coldLeads || [])];

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No eligible prospects to email',
        sent: 0,
        checked: 0,
      });
    }

    // Filter out prospects who have already been emailed
    const prospectIds = prospects.map(p => p.id);
    const { data: existingEmails } = await supabase
      .from('emails')
      .select('prospect_id')
      .in('prospect_id', prospectIds)
      .eq('direction', 'outbound');

    const emailedIds = new Set((existingEmails || []).map(e => e.prospect_id));
    const eligibleProspects = prospects.filter(p => !emailedIds.has(p.id));

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
      byCampaign: {} as Record<string, { name: string; sent: number }>,
    };

    // Initialize campaign tracking
    for (const c of availableCampaigns) {
      results.byCampaign[c.id] = { name: c.name, sent: 0 };
    }

    // Campaign round-robin index
    let campaignIndex = 0;

    // Process up to maxEmails
    for (const prospect of eligibleProspects.slice(0, maxEmails)) {
      if (!prospect.email) {
        results.skipped++;
        continue;
      }

      // Round-robin campaign assignment
      const campaign = availableCampaigns[campaignIndex % availableCampaigns.length];
      campaignIndex++;

      // Generate personalized email using campaign strategy
      const email = await generateEmail(prospect as Prospect, campaign as Campaign);
      if (!email) {
        results.failed++;
        results.errors.push(`Failed to generate email for ${prospect.name} (${campaign.name})`);
        continue;
      }

      // Send the email with HTML formatting and signature
      const sendResult = await sendEmail({
        to: prospect.email,
        subject: email.subject,
        body: email.body,
      });

      if (!sendResult.success) {
        results.failed++;
        results.errors.push(`Failed to send to ${prospect.email}: ${sendResult.error}`);
        continue;
      }

      // Save to database - use the actual inbox that sent the email
      const { data: savedEmail } = await supabase.from('emails').insert({
        prospect_id: prospect.id,
        campaign_id: campaign.id, // Track which campaign
        subject: email.subject,
        body: email.body,
        to_email: prospect.email,
        from_email: sendResult.sentFrom || AZURE_MAIL_FROM,
        message_id: sendResult.messageId,
        email_type: 'outreach',
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).select().single();

      // Update campaign metrics
      await supabase
        .from('campaigns')
        .update({ emails_sent: campaign.emails_sent + 1 })
        .eq('id', campaign.id);

      // Track results by campaign
      results.byCampaign[campaign.id].sent++;

      // Update prospect stage
      await supabase
        .from('prospects')
        .update({
          stage: 'contacted',
          last_contacted_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);

      // Log activity
      await supabase.from('activities').insert({
        prospect_id: prospect.id,
        type: 'email_sent',
        title: `Auto-email sent to ${prospect.email}`,
        description: `Subject: ${email.subject}`,
        email_id: savedEmail?.id,
      });

      results.sent++;

      // Delay between emails - staggered for natural sending pattern
      if (staggerDelay) {
        // Random delay between 30-90 seconds to look more human
        const delay = 30000 + Math.random() * 60000;
        console.log(`Stagger delay: waiting ${Math.round(delay/1000)}s before next email...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-email completed: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`,
      ...results,
      checked: eligibleProspects.length,
    });
  } catch (error) {
    console.error('Auto-email error:', error);
    return NextResponse.json(
      { error: 'Auto-email failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET: Check auto-email status with lead quality breakdown
export async function GET() {
  const supabase = createServerClient();

  // Count eligible prospects by lead quality
  const { count: hotCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .eq('lead_quality', 'hot')
    .not('email', 'is', null)
    .gte('score', 50);

  const { count: warmCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .eq('lead_quality', 'warm')
    .not('email', 'is', null)
    .gte('score', 50);

  const { count: coldCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .eq('lead_quality', 'cold')
    .not('email', 'is', null)
    .gte('score', 30);

  // Count emails sent today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: sentToday } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .eq('email_type', 'outreach')
    .gte('sent_at', today.toISOString());

  const totalEligible = (hotCount || 0) + (warmCount || 0) + (coldCount || 0);

  // Get inbox stats for warmup monitoring
  const inboxStats = getInboxStats();
  const remainingCapacity = getTotalRemainingCapacity();
  const smtpInboxCount = getSmtpInboxes().length;

  return NextResponse.json({
    configured: isSmtpConfigured(),
    eligible_prospects: {
      hot: hotCount || 0,
      warm: warmCount || 0,
      cold: coldCount || 0,
      total: totalEligible,
    },
    sent_today: sentToday || 0,
    sender: AZURE_MAIL_FROM,
    // Inbox rotation stats (for warmup monitoring)
    inboxes: {
      count: smtpInboxCount,
      remaining_capacity: remainingCapacity,
      daily_limit: parseInt(process.env.SMTP_DAILY_LIMIT || '20'),
      details: inboxStats,
    },
    recommendation: remainingCapacity === 0
      ? 'All inboxes at daily limit! Wait for tomorrow or add more inboxes.'
      : (hotCount || 0) < 20
        ? 'Hot leads running low! Run job board scrapers or scrape cold leads from Google Maps.'
        : 'Hot lead pool healthy - prioritizing high-intent prospects.',
  });
}
