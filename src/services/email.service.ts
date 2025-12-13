/**
 * Email Service
 * Business logic for email operations
 */

import { createServerClient } from '@/lib/supabase';
import { emailRepository, activityRepository, campaignRepository } from '@/repositories';
import type { Campaign, Prospect } from '@/repositories';
import { sendEmail, syncInboxCountsFromDb, getInboxStats, getTotalRemainingCapacity, getSmtpInboxes, isSmtpConfigured } from '@/lib/email';
import { getStrategy } from '@/lib/campaign-strategies';
import { config } from '@/lib/config';
import { EMAIL, FAKE_EMAIL_PATTERNS, GENERIC_CORPORATE_EMAILS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import Anthropic from '@anthropic-ai/sdk';

export interface AutoEmailResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
  byCampaign: Record<string, { name: string; sent: number }>;
  checked: number;
}

export interface EmailGenerationResult {
  subject: string;
  body: string;
}

export class EmailService {
  async generateEmail(
    prospect: Prospect,
    campaign: Campaign
  ): Promise<EmailGenerationResult | null> {
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
        contactName: prospect.contact_name,
        jobTitle: prospect.source_job_title,
        jobPainPoints: prospect.job_pain_points || undefined,
        painSignals: prospect.pain_signals?.map((ps) => ({
          keyword: ps.keyword_matched,
          snippet: ps.review_snippet,
        })),
        // Website scraper data for personalization
        starRating: prospect.star_rating,
        chainAffiliation: prospect.chain_affiliation,
        estimatedRooms: prospect.estimated_rooms,
        googleRating: prospect.google_rating,
        googleReviewCount: prospect.google_review_count,
      };

      const prompt = strategy.generatePrompt(prospectContext);

      const response = await anthropic.messages.create({
        model: config.ai.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') return null;

      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      logger.error({ error: err, prospect: prospect.name }, 'Email generation failed');
      return null;
    }
  }

  async syncInboxCounts(): Promise<void> {
    const sentTodayByInbox = await emailRepository.countSentTodayByInbox();
    syncInboxCountsFromDb(sentTodayByInbox);
  }

  async getEligibleProspects(
    minScore: number,
    maxCount: number
  ): Promise<Prospect[]> {
    const supabase = createServerClient();

    const baseSelect = `id, name, email, city, country, property_type,
      contact_name, star_rating, chain_affiliation, estimated_rooms,
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
      .limit(maxCount * 2);

    if (!prospects || prospects.length === 0) {
      return [];
    }

    // Filter already-emailed prospects
    const prospectIds = prospects.map((p) => p.id);
    const emailedIds = await emailRepository.findAlreadyEmailed(prospectIds);

    return prospects.filter((p) => {
      if (emailedIds.has(p.id)) return false;
      if (!p.email) return false;
      if (FAKE_EMAIL_PATTERNS.some((pattern) => pattern.test(p.email!))) return false;
      if (GENERIC_CORPORATE_EMAILS.some((pattern) => pattern.test(p.email!))) return false;
      return true;
    }) as Prospect[];
  }

  async sendAutoEmail(
    prospect: Prospect,
    campaign: Campaign,
    email: EmailGenerationResult
  ): Promise<{ success: boolean; emailId?: string; error?: string }> {
    if (!prospect.email) {
      return { success: false, error: 'No email address' };
    }

    const sendResult = await sendEmail({
      to: prospect.email,
      subject: email.subject,
      body: email.body,
    });

    if (!sendResult.success) {
      return { success: false, error: sendResult.error };
    }

    const supabase = createServerClient();

    // Save email to database
    const { data: savedEmail, error: emailSaveError } = await supabase
      .from('emails')
      .insert({
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
      })
      .select()
      .single();

    if (emailSaveError) {
      logger.error({ error: emailSaveError, prospect: prospect.email }, 'Failed to save email');
    }

    // Increment campaign counter
    await campaignRepository.incrementEmailCount(campaign.id);

    return {
      success: true,
      emailId: savedEmail?.id,
    };
  }

  async updateProspectAfterEmail(prospectIds: string[]): Promise<void> {
    if (prospectIds.length === 0) return;

    const supabase = createServerClient();
    const { error } = await supabase
      .from('prospects')
      .update({ stage: 'contacted', last_contacted_at: new Date().toISOString() })
      .in('id', prospectIds);

    if (error) {
      logger.error({ error }, 'Batch prospect update failed');
    }
  }

  async logEmailActivity(
    prospectId: string,
    emailId: string,
    toEmail: string,
    subject: string
  ): Promise<void> {
    await activityRepository.create({
      prospect_id: prospectId,
      type: 'email_sent',
      title: `Auto-email sent to ${toEmail}`,
      description: `Subject: ${subject}`,
      email_id: emailId,
    });
  }

  async applyStaggerDelay(useStagger: boolean): Promise<void> {
    if (useStagger) {
      const delay =
        EMAIL.STAGGER_DELAY_MIN +
        Math.random() * (EMAIL.STAGGER_DELAY_MAX - EMAIL.STAGGER_DELAY_MIN);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      await new Promise((resolve) => setTimeout(resolve, EMAIL.MIN_DELAY));
    }
  }

  getInboxStatus(): {
    configured: boolean;
    count: number;
    remainingCapacity: number;
    dailyLimit: number;
    details: ReturnType<typeof getInboxStats>;
  } {
    return {
      configured: isSmtpConfigured(),
      count: getSmtpInboxes().length,
      remainingCapacity: getTotalRemainingCapacity(),
      dailyLimit: config.smtp.dailyLimit,
      details: getInboxStats(),
    };
  }
}

export const emailService = new EmailService();
