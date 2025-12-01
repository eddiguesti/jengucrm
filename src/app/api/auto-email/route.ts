import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, isSmtpConfigured, getInboxStats, getTotalRemainingCapacity, getSmtpInboxes, syncInboxCountsFromDb } from '@/lib/email';
import { getStrategy } from '@/lib/campaign-strategies';
import { success, errors } from '@/lib/api-response';
import { parseBody, autoEmailSchema, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';
import { EMAIL, SCORING, FAKE_EMAIL_PATTERNS, GENERIC_CORPORATE_EMAILS } from '@/lib/constants';
import Anthropic from '@anthropic-ai/sdk';

interface Campaign {
  id: string;
  name: string;
  strategy_key: string;
  active: boolean;
  daily_limit: number;
  emails_sent: number;
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
  source_job_description: string | null;
  job_pain_points: {
    summary?: string;
    communicationTasks?: string[];
    adminTasks?: string[];
    speedRequirements?: string[];
  } | null;
  pain_signals?: { keyword_matched: string; review_snippet: string }[];
  score: number;
  tier: string;
}

async function generateEmail(
  prospect: Prospect,
  campaign: Campaign
): Promise<{ subject: string; body: string } | null> {
  if (!config.ai.apiKey) return null;

  const strategy = getStrategy(campaign.strategy_key);
  if (!strategy) {
    logger.error({ strategyKey: campaign.strategy_key }, 'Unknown strategy');
    return null;
  }

  try {
    const anthropic = new Anthropic({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseUrl,
    });

    const prospectContext = {
      name: prospect.name,
      city: prospect.city,
      country: prospect.country,
      propertyType: prospect.property_type,
      jobTitle: prospect.source_job_title,
      jobPainPoints: prospect.job_pain_points || undefined,
      painSignals: prospect.pain_signals?.map(ps => ({
        keyword: ps.keyword_matched,
        snippet: ps.review_snippet,
      })),
    };

    const prompt = strategy.generatePrompt(prospectContext);

    const response = await anthropic.messages.create({
      model: config.ai.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return null;

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error({ error: err, prospect: prospect.name }, 'Email generation failed');
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await parseBody(request, autoEmailSchema);
    const { max_emails: maxEmails, min_score: minScore, stagger_delay: staggerDelay } = body;

    if (!isSmtpConfigured()) {
      return success({ error: 'Email sending not configured', sent: 0 });
    }

    // Sync inbox counts from database
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

    // Fetch active campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, strategy_key, active, daily_limit, emails_sent')
      .eq('active', true);

    if (!campaigns || campaigns.length === 0) {
      return success({ error: 'No active campaigns found', sent: 0 });
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

    const availableCampaigns = campaigns.filter(c =>
      (sentTodayByCampaign[c.id] || 0) < c.daily_limit
    );

    if (availableCampaigns.length === 0) {
      return success({
        error: 'All campaigns have hit their daily limit',
        sent: 0,
        campaigns: campaigns.map(c => ({
          name: c.name,
          sent_today: sentTodayByCampaign[c.id] || 0,
          daily_limit: c.daily_limit,
        })),
      });
    }

    // Find eligible prospects
    const baseSelect = `id, name, email, city, country, property_type,
        google_rating, google_review_count, source_job_title,
        source_job_description, job_pain_points,
        score, tier, pain_signals(keyword_matched, review_snippet)`;

    const { data: prospects } = await supabase
      .from('prospects')
      .select(baseSelect)
      .in('stage', ['new', 'researching'])
      .eq('archived', false)
      .not('email', 'is', null)
      .gte('score', minScore)
      .order('score', { ascending: false })
      .limit(maxEmails * 2);

    if (!prospects || prospects.length === 0) {
      return success({ message: 'No eligible prospects to email', sent: 0, checked: 0 });
    }

    // Filter already-emailed prospects
    const prospectIds = prospects.map(p => p.id);
    const { data: existingEmails } = await supabase
      .from('emails')
      .select('prospect_id')
      .in('prospect_id', prospectIds)
      .eq('direction', 'outbound');

    const emailedIds = new Set((existingEmails || []).map(e => e.prospect_id));

    const eligibleProspects = prospects.filter(p => {
      if (emailedIds.has(p.id)) return false;
      if (!p.email) return false;
      if (FAKE_EMAIL_PATTERNS.some(pattern => pattern.test(p.email!))) return false;
      if (GENERIC_CORPORATE_EMAILS.some(pattern => pattern.test(p.email!))) return false;
      return true;
    });

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
      byCampaign: {} as Record<string, { name: string; sent: number }>,
    };

    const prospectIdsToUpdate: string[] = [];
    const activitiesToInsert: {
      prospect_id: string;
      type: string;
      title: string;
      description: string;
      email_id: string;
    }[] = [];

    for (const c of availableCampaigns) {
      results.byCampaign[c.id] = { name: c.name, sent: 0 };
    }

    let campaignIndex = 0;

    for (const prospect of eligibleProspects.slice(0, maxEmails)) {
      if (!prospect.email) {
        results.skipped++;
        continue;
      }

      const campaign = availableCampaigns[campaignIndex % availableCampaigns.length];
      campaignIndex++;

      const email = await generateEmail(prospect as Prospect, campaign as Campaign);
      if (!email) {
        results.failed++;
        results.errors.push(`Failed to generate email for ${prospect.name}`);
        continue;
      }

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

      const { data: savedEmail, error: emailSaveError } = await supabase.from('emails').insert({
        prospect_id: prospect.id,
        campaign_id: campaign.id,
        subject: email.subject,
        body: email.body,
        to_email: prospect.email,
        from_email: sendResult.sentFrom || config.azure.mailFrom,
        message_id: sendResult.messageId,
        email_type: 'outreach',
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).select().single();

      if (emailSaveError) {
        logger.error({ error: emailSaveError, prospect: prospect.email }, 'Failed to save email');
      }

      // Update campaign metrics atomically
      try {
        const { error: rpcError } = await supabase.rpc('increment_counter', {
          table_name: 'campaigns',
          column_name: 'emails_sent',
          row_id: campaign.id
        });

        if (rpcError) {
          await supabase.from('campaigns').update({ emails_sent: campaign.emails_sent + 1 }).eq('id', campaign.id);
        }
      } catch {
        await supabase.from('campaigns').update({ emails_sent: campaign.emails_sent + 1 }).eq('id', campaign.id);
      }

      results.byCampaign[campaign.id].sent++;
      prospectIdsToUpdate.push(prospect.id);

      if (savedEmail) {
        activitiesToInsert.push({
          prospect_id: prospect.id,
          type: 'email_sent',
          title: `Auto-email sent to ${prospect.email}`,
          description: `Subject: ${email.subject}`,
          email_id: savedEmail.id,
        });
      }

      results.sent++;
      logger.info({ to: prospect.email, campaign: campaign.name }, 'Auto-email sent');

      if (staggerDelay) {
        const delay = EMAIL.STAGGER_DELAY_MIN + Math.random() * (EMAIL.STAGGER_DELAY_MAX - EMAIL.STAGGER_DELAY_MIN);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        await new Promise(resolve => setTimeout(resolve, EMAIL.MIN_DELAY));
      }
    }

    // Batch operations
    if (prospectIdsToUpdate.length > 0) {
      const { error: batchUpdateError } = await supabase
        .from('prospects')
        .update({ stage: 'contacted', last_contacted_at: new Date().toISOString() })
        .in('id', prospectIdsToUpdate);
      if (batchUpdateError) logger.error({ error: batchUpdateError }, 'Batch prospect update failed');
    }

    if (activitiesToInsert.length > 0) {
      const { error: batchInsertError } = await supabase.from('activities').insert(activitiesToInsert);
      if (batchInsertError) logger.error({ error: batchInsertError }, 'Batch activity insert failed');
    }

    logger.info({ sent: results.sent, failed: results.failed }, 'Auto-email completed');
    return success({
      message: `Auto-email completed: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`,
      ...results,
      checked: eligibleProspects.length,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Auto-email failed');
    return errors.internal('Auto-email failed', error);
  }
}

export async function GET() {
  const supabase = createServerClient();

  try {
    const [highResult, mediumResult, lowerResult] = await Promise.all([
      supabase.from('prospects').select('*', { count: 'exact', head: true })
        .in('stage', ['new', 'researching']).eq('archived', false).not('email', 'is', null).gte('score', SCORING.HOT_THRESHOLD),
      supabase.from('prospects').select('*', { count: 'exact', head: true })
        .in('stage', ['new', 'researching']).eq('archived', false).not('email', 'is', null).gte('score', SCORING.AUTO_EMAIL_MIN_SCORE).lt('score', SCORING.HOT_THRESHOLD),
      supabase.from('prospects').select('*', { count: 'exact', head: true })
        .in('stage', ['new', 'researching']).eq('archived', false).not('email', 'is', null).gte('score', 30).lt('score', SCORING.AUTO_EMAIL_MIN_SCORE),
    ]);

    const highPriority = highResult.count || 0;
    const mediumPriority = mediumResult.count || 0;
    const lowerPriority = lowerResult.count || 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase.from('emails').select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound').eq('email_type', 'outreach').gte('sent_at', today.toISOString());

    const inboxStats = getInboxStats();
    const remainingCapacity = getTotalRemainingCapacity();

    return success({
      configured: isSmtpConfigured(),
      eligible_prospects: { high_priority: highPriority, medium_priority: mediumPriority, lower_priority: lowerPriority, total: highPriority + mediumPriority + lowerPriority },
      sent_today: sentToday || 0,
      sender: config.azure.mailFrom,
      inboxes: { count: getSmtpInboxes().length, remaining_capacity: remainingCapacity, daily_limit: config.smtp.dailyLimit, details: inboxStats },
      recommendation: remainingCapacity === 0 ? 'All inboxes at daily limit!' : (highPriority + mediumPriority + lowerPriority) < 20 ? 'Low on prospects!' : 'Ready to send.',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get auto-email status');
    return errors.internal('Failed to get auto-email status', error);
  }
}
