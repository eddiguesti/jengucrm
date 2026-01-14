import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  sendEmail,
  isSmtpConfigured,
  getInboxStats,
  getTotalRemainingCapacity,
  getSmtpInboxes,
  syncInboxCountsFromDb,
  canSendTo,
} from "@/lib/email";
import { getStrategy } from "@/lib/campaign-strategies";
import { success, errors } from "@/lib/api-response";
import { parseBody, autoEmailSchema, ValidationError } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { config } from "@/lib/config";
import {
  EMAIL,
  SCORING,
  FAKE_EMAIL_PATTERNS,
  GENERIC_CORPORATE_EMAILS,
  GENERIC_EMAIL_PREFIXES,
  getWarmupDailyLimit,
  getWarmupStatus,
  isBusinessHours,
  getLocalHour,
} from "@/lib/constants";
import { aiGateway } from "@/lib/ai-gateway";
import { flags } from "@/lib/feature-flags";
import { CACHE_TTL } from "@/lib/cache";

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
  source: string | null;
  contact_name: string | null;
  score: number;
  tier: string;
}

async function generateEmail(
  prospect: Prospect,
  campaign: Campaign,
): Promise<{ subject: string; body: string } | null> {
  if (!aiGateway.isConfigured()) return null;

  const strategy = getStrategy(campaign.strategy_key);
  if (!strategy) {
    logger.error({ strategyKey: campaign.strategy_key }, "Unknown strategy");
    return null;
  }

  try {
    const prospectContext = {
      name: prospect.name,
      city: prospect.city,
      country: prospect.country,
      propertyType: prospect.property_type,
      jobTitle: prospect.source_job_title,
      contactName: prospect.contact_name,
    };

    const prompt = strategy.generatePrompt(prospectContext);

    // Use AI Gateway with caching for similar prompts
    // Cache key includes strategy and location to avoid mixing responses
    const cacheKey = flags.AI_CACHING_ENABLED
      ? `email:${campaign.strategy_key}:${prospect.city || "unknown"}:${prospect.property_type || "hotel"}`
      : undefined;

    const result = await aiGateway.generateJSON<{
      subject: string;
      body: string;
    }>({
      prompt,
      maxTokens: 500,
      // Don't cache personalized emails (each prospect is unique)
      // Only cache if we want to reuse similar templates
      cacheTTL: 0, // No caching for personalized emails
      cacheKey,
      context: `email-gen:${prospect.name}`,
    });

    if (!result.data) {
      logger.warn(
        { prospect: prospect.name, raw: result.raw?.slice(0, 200) },
        "Failed to parse email JSON",
      );
      return null;
    }

    return result.data;
  } catch (err) {
    logger.error(
      { error: err, prospect: prospect.name },
      "Email generation failed",
    );
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    // EMERGENCY STOP - All email sending disabled
    if (EMAIL.EMERGENCY_STOP) {
      return success({
        error: "EMERGENCY STOP - All email sending disabled",
        disabled: true,
        emergency_stop: true,
        sent: 0,
        attempted: 0,
        warmup: getWarmupStatus(),
      });
    }

    const body = await parseBody(request, autoEmailSchema);
    const {
      max_emails: requestedMax,
      min_score: minScore,
      stagger_delay: staggerDelay,
    } = body;

    // Enforce warmup schedule limits
    const warmupStatus = getWarmupStatus();
    const warmupLimit = getWarmupDailyLimit();

    // EMAIL SENDING DISABLED - Check if limit is 0
    if (warmupLimit === 0) {
      return success({
        error: "Email sending disabled - daily limit set to 0",
        sent: 0,
        disabled: true,
        warmup: {
          day: warmupStatus.day,
          stage: warmupStatus.stage,
          daily_limit: warmupLimit,
        },
      });
    }

    if (!isSmtpConfigured()) {
      return success({ error: "Email sending not configured", sent: 0 });
    }

    // OPTIMIZED: Parallel fetch of all initial data
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Run all three initial queries in parallel
    const [
      { data: todaysEmails },
      { data: campaigns },
      { data: campaignEmailsToday },
    ] = await Promise.all([
      // Query 1: Get today's emails by inbox (for inbox capacity tracking)
      supabase
        .from("emails")
        .select("from_email, campaign_id")
        .eq("direction", "outbound")
        .eq("email_type", "outreach")
        .gte("sent_at", todayIso),
      // Query 2: Get active campaigns
      supabase
        .from("campaigns")
        .select("id, name, strategy_key, active, daily_limit, emails_sent")
        .eq("active", true),
      // Query 3: Get today's emails by campaign (could be combined with Query 1 but keeping separate for clarity)
      supabase
        .from("emails")
        .select("campaign_id")
        .eq("direction", "outbound")
        .eq("email_type", "outreach")
        .gte("sent_at", todayIso),
    ]);

    // Process inbox counts
    const sentTodayByInbox: Record<string, number> = {};
    for (const e of todaysEmails || []) {
      if (e.from_email) {
        sentTodayByInbox[e.from_email] =
          (sentTodayByInbox[e.from_email] || 0) + 1;
      }
    }
    syncInboxCountsFromDb(sentTodayByInbox);

    // Calculate remaining capacity based on warmup schedule
    const totalSentToday = todaysEmails?.length || 0;
    const remainingWarmupCapacity = Math.max(0, warmupLimit - totalSentToday);

    // Use the minimum of requested max and remaining warmup capacity
    const maxEmails = Math.min(requestedMax, remainingWarmupCapacity);

    logger.info(
      {
        warmupDay: warmupStatus.day,
        warmupStage: warmupStatus.stage,
        warmupLimit,
        totalSentToday,
        remainingCapacity: remainingWarmupCapacity,
        requestedMax,
        effectiveMax: maxEmails,
      },
      "Warmup limits applied",
    );

    if (remainingWarmupCapacity <= 0) {
      return success({
        error: `Warmup daily limit reached (${warmupLimit}/day on day ${warmupStatus.day})`,
        sent: 0,
        warmup: warmupStatus,
        sent_today: totalSentToday,
      });
    }

    if (!campaigns || campaigns.length === 0) {
      return success({ error: "No active campaigns found", sent: 0 });
    }

    const sentTodayByCampaign: Record<string, number> = {};
    for (const e of campaignEmailsToday || []) {
      if (e.campaign_id) {
        sentTodayByCampaign[e.campaign_id] =
          (sentTodayByCampaign[e.campaign_id] || 0) + 1;
      }
    }

    const availableCampaigns = campaigns.filter(
      (c) => (sentTodayByCampaign[c.id] || 0) < c.daily_limit,
    );

    if (availableCampaigns.length === 0) {
      return success({
        error: "All campaigns have hit their daily limit",
        sent: 0,
        campaigns: campaigns.map((c) => ({
          name: c.name,
          sent_today: sentTodayByCampaign[c.id] || 0,
          daily_limit: c.daily_limit,
        })),
      });
    }

    // Find eligible prospects
    const baseSelect = `id, name, email, city, country, property_type,
        google_rating, google_review_count, source_job_title,
        source, contact_name, score, tier`;

    const { data: prospects, error: prospectsError } = await supabase
      .from("prospects")
      .select(baseSelect)
      .in("stage", ["new", "researching", "enriched", "ready"])
      .eq("archived", false)
      .not("email", "is", null)
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(Math.max(maxEmails * 100, 500)); // Min 500: top prospects often have generic emails

    if (prospectsError) {
      logger.error({ error: prospectsError }, "Prospects query failed");
      return success({ message: "Query failed", sent: 0, checked: 0 });
    }

    if (!prospects || prospects.length === 0) {
      // Debug: check if we can read ANY prospects
      const { count: totalCount } = await supabase
        .from("prospects")
        .select("*", { count: "exact", head: true });

      const { count: stageCount } = await supabase
        .from("prospects")
        .select("*", { count: "exact", head: true })
        .in("stage", ["new", "researching", "enriched", "ready"])
        .eq("archived", false);

      return success({
        message: "No eligible prospects to email",
        sent: 0,
        checked: 0,
        debug: {
          totalProspects: totalCount,
          eligibleStageCount: stageCount,
          minScore,
          stages: ["new", "researching", "enriched", "ready"],
        },
      });
    }

    logger.info(
      { prospectCount: prospects.length, minScore, maxEmails },
      "Initial prospects fetched",
    );

    // Filter already-emailed prospects
    const prospectIds = prospects.map((p) => p.id);
    const { data: existingEmails } = await supabase
      .from("emails")
      .select("prospect_id")
      .in("prospect_id", prospectIds)
      .eq("direction", "outbound");

    const emailedIds = new Set(
      (existingEmails || []).map((e) => e.prospect_id),
    );

    // Check if timezone-aware sending is enabled
    const timezoneAwareSending = process.env.TIMEZONE_AWARE_SENDING !== "false";

    // Debug counters
    const filterStats = {
      total: prospects.length,
      alreadyEmailed: 0,
      noEmail: 0,
      fakeEmail: 0,
      corpEmail: 0,
      genericPrefix: 0,
      outsideHours: 0,
      passed: 0,
    };

    const eligibleProspects = prospects.filter((p) => {
      if (emailedIds.has(p.id)) {
        filterStats.alreadyEmailed++;
        return false;
      }
      if (!p.email) {
        filterStats.noEmail++;
        return false;
      }
      if (FAKE_EMAIL_PATTERNS.some((pattern) => pattern.test(p.email!))) {
        filterStats.fakeEmail++;
        return false;
      }
      if (GENERIC_CORPORATE_EMAILS.some((pattern) => pattern.test(p.email!))) {
        filterStats.corpEmail++;
        return false;
      }
      // Skip generic email prefixes (info@, reception@, etc.) - we want personal emails
      if (GENERIC_EMAIL_PREFIXES.some((pattern) => pattern.test(p.email!))) {
        filterStats.genericPrefix++;
        return false;
      }
      // Timezone-aware sending: only email during their business hours (9am-5pm local)
      if (timezoneAwareSending && p.country && !isBusinessHours(p.country)) {
        filterStats.outsideHours++;
        return false;
      }
      filterStats.passed++;
      return true;
    });

    logger.info({ filterStats }, "Prospect filtering stats");

    logger.info(
      {
        eligibleCount: eligibleProspects.length,
        sources: eligibleProspects
          .slice(0, 5)
          .map((p) => ({ name: p.name, source: p.source, email: p.email })),
      },
      "After filtering",
    );

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      bounced: 0,
      errors: [] as string[],
      blockedEmails: [] as { email: string; reason: string }[],
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

      // Pre-validate email before generating content
      const validation = await canSendTo(prospect.email);
      if (!validation.canSend) {
        results.blocked++;
        results.blockedEmails.push({
          email: prospect.email,
          reason: validation.reason || "Unknown",
        });
        logger.info(
          { email: prospect.email, reason: validation.reason },
          "Email blocked by validation",
        );
        continue;
      }

      // Match campaigns to prospect source:
      // - Sales Navigator prospects → cold strategies (cold_direct, cold_pattern_interrupt)
      // - Job board prospects → job board strategies (authority_scarcity, curiosity_value)
      const coldStrategyKeys = ["cold_direct", "cold_pattern_interrupt"];
      const jobBoardStrategyKeys = ["authority_scarcity", "curiosity_value"];

      const isSalesNav = prospect.source === "sales_navigator";
      const relevantStrategyKeys = isSalesNav
        ? coldStrategyKeys
        : jobBoardStrategyKeys;
      const relevantCampaigns = availableCampaigns.filter((c) =>
        relevantStrategyKeys.includes(c.strategy_key),
      );

      // If no matching campaigns for this prospect type, skip
      if (relevantCampaigns.length === 0) {
        logger.warn(
          { prospect: prospect.name, source: prospect.source },
          "No matching campaigns for prospect source",
        );
        results.skipped++;
        continue;
      }

      const campaign =
        relevantCampaigns[campaignIndex % relevantCampaigns.length];
      campaignIndex++;

      const email = await generateEmail(
        prospect as Prospect,
        campaign as Campaign,
      );
      if (!email) {
        results.failed++;
        results.errors.push(`Failed to generate email for ${prospect.name}`);
        continue;
      }

      const sendResult = await sendEmail({
        to: prospect.email,
        subject: email.subject,
        body: email.body,
        skipValidation: true, // Already validated above
      });

      if (!sendResult.success) {
        if (sendResult.blocked) {
          results.blocked++;
          results.blockedEmails.push({
            email: prospect.email,
            reason: sendResult.blockReason || "Unknown",
          });
        } else if (sendResult.bounceType) {
          results.bounced++;
          results.errors.push(
            `Bounced (${sendResult.bounceType}): ${prospect.email}`,
          );
        } else {
          results.failed++;
          results.errors.push(
            `Failed to send to ${prospect.email}: ${sendResult.error}`,
          );
        }
        continue;
      }

      const { data: savedEmail, error: emailSaveError } = await supabase
        .from("emails")
        .insert({
          prospect_id: prospect.id,
          campaign_id: campaign.id,
          subject: email.subject,
          body: email.body,
          to_email: prospect.email,
          from_email: sendResult.sentFrom || config.azure.mailFrom,
          message_id: sendResult.messageId,
          email_type: "outreach",
          direction: "outbound",
          status: "sent",
          sent_at: new Date().toISOString(),
          campaign_strategy: campaign.strategy_key, // Use existing column for A/B tracking
        })
        .select()
        .single();

      if (emailSaveError) {
        logger.error(
          { error: emailSaveError, prospect: prospect.email },
          "Failed to save email",
        );
      }

      // Update campaign metrics atomically using raw SQL for accurate increment
      // This avoids race conditions by using SQL's emails_sent = emails_sent + 1
      try {
        const { error: rpcError } = await supabase.rpc("increment_counter", {
          table_name: "campaigns",
          column_name: "emails_sent",
          row_id: campaign.id,
        });

        if (rpcError) {
          // Fallback: fetch current value and update (less ideal but works)
          const { data: currentCampaign } = await supabase
            .from("campaigns")
            .select("emails_sent")
            .eq("id", campaign.id)
            .single();
          await supabase
            .from("campaigns")
            .update({ emails_sent: (currentCampaign?.emails_sent || 0) + 1 })
            .eq("id", campaign.id);
        }
      } catch {
        // Same fallback for catch block
        const { data: currentCampaign } = await supabase
          .from("campaigns")
          .select("emails_sent")
          .eq("id", campaign.id)
          .single();
        await supabase
          .from("campaigns")
          .update({ emails_sent: (currentCampaign?.emails_sent || 0) + 1 })
          .eq("id", campaign.id);
      }

      results.byCampaign[campaign.id].sent++;
      prospectIdsToUpdate.push(prospect.id);

      if (savedEmail) {
        activitiesToInsert.push({
          prospect_id: prospect.id,
          type: "email_sent",
          title: `Auto-email sent to ${prospect.email}`,
          description: `Subject: ${email.subject}`,
          email_id: savedEmail.id,
        });
      }

      results.sent++;
      logger.info(
        { to: prospect.email, campaign: campaign.name },
        "Auto-email sent",
      );

      if (staggerDelay) {
        const delay =
          EMAIL.STAGGER_DELAY_MIN +
          Math.random() * (EMAIL.STAGGER_DELAY_MAX - EMAIL.STAGGER_DELAY_MIN);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        await new Promise((resolve) => setTimeout(resolve, EMAIL.MIN_DELAY));
      }
    }

    // Batch operations
    if (prospectIdsToUpdate.length > 0) {
      const { error: batchUpdateError } = await supabase
        .from("prospects")
        .update({
          stage: "contacted",
          last_contacted_at: new Date().toISOString(),
        })
        .in("id", prospectIdsToUpdate);
      if (batchUpdateError)
        logger.error(
          { error: batchUpdateError },
          "Batch prospect update failed",
        );
    }

    if (activitiesToInsert.length > 0) {
      const { error: batchInsertError } = await supabase
        .from("activities")
        .insert(activitiesToInsert);
      if (batchInsertError)
        logger.error(
          { error: batchInsertError },
          "Batch activity insert failed",
        );
    }

    logger.info(
      {
        sent: results.sent,
        failed: results.failed,
        blocked: results.blocked,
        bounced: results.bounced,
      },
      "Auto-email completed",
    );
    return success({
      message: `Auto-email completed: ${results.sent} sent, ${results.failed} failed, ${results.blocked} blocked, ${results.bounced} bounced, ${results.skipped} skipped`,
      ...results,
      checked: eligibleProspects.length,
      filterStats,
      warmup: {
        ...warmupStatus,
        sent_today: totalSentToday + results.sent,
        remaining: Math.max(0, warmupLimit - totalSentToday - results.sent),
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, "Auto-email failed");
    return errors.internal("Auto-email failed", error);
  }
}

export async function GET() {
  const supabase = createServerClient();

  try {
    // Get warmup status
    const warmupStatus = getWarmupStatus();

    const [highResult, mediumResult, lowerResult] = await Promise.all([
      supabase
        .from("prospects")
        .select("*", { count: "exact", head: true })
        .in("stage", ["new", "researching"])
        .eq("archived", false)
        .not("email", "is", null)
        .gte("score", SCORING.HOT_THRESHOLD),
      supabase
        .from("prospects")
        .select("*", { count: "exact", head: true })
        .in("stage", ["new", "researching"])
        .eq("archived", false)
        .not("email", "is", null)
        .gte("score", SCORING.AUTO_EMAIL_MIN_SCORE)
        .lt("score", SCORING.HOT_THRESHOLD),
      supabase
        .from("prospects")
        .select("*", { count: "exact", head: true })
        .in("stage", ["new", "researching"])
        .eq("archived", false)
        .not("email", "is", null)
        .gte("score", 30)
        .lt("score", SCORING.AUTO_EMAIL_MIN_SCORE),
    ]);

    const highPriority = highResult.count || 0;
    const mediumPriority = mediumResult.count || 0;
    const lowerPriority = lowerResult.count || 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase
      .from("emails")
      .select("*", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("email_type", "outreach")
      .gte("sent_at", today.toISOString());

    const inboxStats = getInboxStats();
    const remainingCapacity = getTotalRemainingCapacity();

    // Calculate warmup remaining capacity
    const warmupRemaining = Math.max(0, warmupStatus.limit - (sentToday || 0));

    return success({
      configured: isSmtpConfigured(),
      eligible_prospects: {
        high_priority: highPriority,
        medium_priority: mediumPriority,
        lower_priority: lowerPriority,
        total: highPriority + mediumPriority + lowerPriority,
      },
      sent_today: sentToday || 0,
      sender: config.azure.mailFrom,
      inboxes: {
        count: getSmtpInboxes().length,
        remaining_capacity: remainingCapacity,
        daily_limit: config.smtp.dailyLimit,
        details: inboxStats,
      },
      warmup: {
        day: warmupStatus.day,
        stage: warmupStatus.stage,
        daily_limit: warmupStatus.limit,
        remaining: warmupRemaining,
      },
      recommendation:
        warmupRemaining === 0
          ? `Warmup limit reached (${warmupStatus.limit}/day on day ${warmupStatus.day})`
          : highPriority + mediumPriority + lowerPriority < 20
            ? "Low on prospects!"
            : `Ready to send (${warmupRemaining} remaining today)`,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get auto-email status");
    return errors.internal("Failed to get auto-email status", error);
  }
}
