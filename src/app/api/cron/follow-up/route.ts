import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { campaignSequenceRepository, campaignLeadRepository } from '@/repositories/campaign-sequence.repository';
import { sendEmail } from '@/lib/email';
import { aiGateway } from '@/lib/ai-gateway';
import { logger } from '@/lib/logger';
import { EMAIL, getWarmupDailyLimit, getWarmupStatus } from '@/lib/constants';

/**
 * Follow-up Cron Job
 * Runs at 10am UTC Mon-Fri to send follow-up emails
 *
 * Logic:
 * 1. Find campaign leads with status='active' and next_email_at <= NOW
 * 2. For each lead, get the next sequence step
 * 3. Send the follow-up email (using A/B variant)
 * 4. Update lead's current_step and schedule next email
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Check emergency stop
    if (EMAIL.EMERGENCY_STOP) {
      return NextResponse.json({
        success: true,
        message: 'EMERGENCY STOP - Follow-ups disabled',
        disabled: true,
        emergency_stop: true,
      });
    }

    // Check warmup limits
    const warmupStatus = getWarmupStatus();
    const dailyLimit = getWarmupDailyLimit();

    if (dailyLimit === 0) {
      return NextResponse.json({
        success: true,
        message: 'Email sending disabled - daily limit set to 0',
        disabled: true,
        warmup: warmupStatus,
      });
    }

    const supabase = createServerClient();

    // Get today's sent count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('sent_at', today.toISOString());

    const remainingCapacity = Math.max(0, dailyLimit - (sentToday || 0));

    if (remainingCapacity <= 0) {
      return NextResponse.json({
        success: true,
        message: `Warmup daily limit reached (${dailyLimit}/day)`,
        sent: 0,
        warmup: warmupStatus,
      });
    }

    // Find leads ready for follow-up (max 10 per run to avoid timeout)
    const maxFollowUps = Math.min(10, remainingCapacity);
    const readyLeads = await campaignLeadRepository.findReadyForEmail(maxFollowUps);

    if (readyLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No leads ready for follow-up',
        sent: 0,
        checked: 0,
      });
    }

    logger.info({ leadsFound: readyLeads.length }, '[Follow-up] Found leads ready for email');

    const results = {
      sent: 0,
      skipped: 0,
      completed: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const lead of readyLeads) {
      try {
        // Get the campaign and next sequence step
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', lead.campaign_id)
          .single();

        if (!campaign || !campaign.active) {
          results.skipped++;
          continue;
        }

        // Get all sequences for this campaign
        const sequences = await campaignSequenceRepository.findByCampaign(lead.campaign_id);

        if (sequences.length === 0) {
          logger.warn({ campaignId: lead.campaign_id }, 'Campaign has no sequences');
          results.skipped++;
          continue;
        }

        // Get the next step (current_step is 0-indexed, step_number is 1-indexed)
        const nextStepNumber = lead.current_step + 1;
        const nextSequence = sequences.find(s => s.step_number === nextStepNumber);

        if (!nextSequence) {
          // No more steps - mark as completed
          await campaignLeadRepository.markComplete(lead.id);
          results.completed++;
          logger.info({ leadId: lead.id }, 'Lead completed all sequence steps');
          continue;
        }

        // Get prospect info
        const prospect = lead.prospect as { id: string; name: string; email: string; city: string; country: string; contact_name: string } | null;

        if (!prospect || !prospect.email) {
          results.skipped++;
          continue;
        }

        // Select variant (A/B testing)
        const useVariantB = nextSequence.variant_b_subject && Math.random() * 100 < (nextSequence.variant_split || 50);
        const variant = useVariantB ? 'B' : 'A';

        let subject = useVariantB ? nextSequence.variant_b_subject! : nextSequence.variant_a_subject;
        let body = useVariantB ? nextSequence.variant_b_body! : nextSequence.variant_a_body;

        // If using AI generation, generate personalized content
        if (nextSequence.use_ai_generation && aiGateway.isConfigured()) {
          try {
            const aiPrompt = `Write a follow-up email for:
Company: ${prospect.name}
Location: ${prospect.city}, ${prospect.country}
Contact: ${prospect.contact_name || 'the manager'}
This is follow-up #${nextStepNumber}.
Context: ${nextSequence.ai_prompt_context || 'B2B SaaS for hotels'}

Return JSON with: { "subject": "...", "body": "..." }`;

            const result = await aiGateway.generateJSON<{ subject: string; body: string }>({
              prompt: aiPrompt,
              maxTokens: 400,
            });

            if (result.data) {
              subject = result.data.subject;
              body = result.data.body;
            }
          } catch (aiError) {
            logger.warn({ error: aiError }, 'AI generation failed, using template');
          }
        }

        // Personalize template
        subject = subject
          .replace(/\{\{name\}\}/g, prospect.name)
          .replace(/\{\{contact_name\}\}/g, prospect.contact_name || 'there')
          .replace(/\{\{city\}\}/g, prospect.city || '');

        body = body
          .replace(/\{\{name\}\}/g, prospect.name)
          .replace(/\{\{contact_name\}\}/g, prospect.contact_name || 'there')
          .replace(/\{\{city\}\}/g, prospect.city || '');

        // Send the follow-up email
        const sendResult = await sendEmail({
          to: prospect.email,
          subject,
          body,
        });

        if (!sendResult.success) {
          results.failed++;
          results.errors.push(`Failed to send to ${prospect.email}: ${sendResult.error}`);

          // If bounced, update lead status
          if (sendResult.bounceType) {
            await campaignLeadRepository.updateStatus(lead.id, 'bounced');
          }
          continue;
        }

        // Save email to database
        await supabase.from('emails').insert({
          prospect_id: prospect.id,
          campaign_id: lead.campaign_id,
          subject,
          body,
          to_email: prospect.email,
          from_email: sendResult.sentFrom,
          message_id: sendResult.messageId,
          email_type: 'follow_up',
          direction: 'outbound',
          status: 'sent',
          sent_at: new Date().toISOString(),
          sequence_step: nextStepNumber,
          variant_used: variant,
        });

        // Update sequence metrics
        await campaignSequenceRepository.incrementMetrics(nextSequence.id, 'sent_count', variant);

        // Advance lead to next step
        const nextNextStep = sequences.find(s => s.step_number === nextStepNumber + 1);
        if (nextNextStep) {
          await campaignLeadRepository.advanceStep(lead.id, {
            days: nextNextStep.delay_days || 0,
            hours: nextNextStep.delay_hours || 0,
          });
        } else {
          // No more steps after this
          await campaignLeadRepository.markComplete(lead.id);
          results.completed++;
        }

        // Log activity
        await supabase.from('activities').insert({
          prospect_id: prospect.id,
          type: 'follow_up_sent',
          title: `Follow-up #${nextStepNumber} sent`,
          description: `Subject: ${subject}`,
        });

        results.sent++;
        logger.info({ to: prospect.email, step: nextStepNumber, variant }, 'Follow-up sent');

        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (leadError) {
        results.failed++;
        results.errors.push(`Error processing lead ${lead.id}: ${String(leadError)}`);
        logger.error({ error: leadError, leadId: lead.id }, 'Follow-up processing error');
      }
    }

    logger.info(results, '[Follow-up Cron] Completed');

    return NextResponse.json({
      success: true,
      message: `Follow-ups: ${results.sent} sent, ${results.completed} completed, ${results.skipped} skipped, ${results.failed} failed`,
      ...results,
      warmup: {
        ...warmupStatus,
        sent_today: (sentToday || 0) + results.sent,
        remaining: remainingCapacity - results.sent,
      },
    });
  } catch (error) {
    console.error('[Follow-up Cron] Error:', error);
    logger.error({ error }, '[Follow-up Cron] Fatal error');
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
