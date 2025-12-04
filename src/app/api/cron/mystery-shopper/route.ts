import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * Mystery Shopper Cron Job
 * Runs every 30 minutes from 8am-8pm UTC (25 runs/day)
 *
 * RANDOMIZED SENDING PATTERN:
 * - Random initial delay (0-15 min) before starting
 * - Variable email count per run (0-3 emails, weighted distribution)
 * - Random delay between emails (1-10 min)
 *
 * This creates truly human-like sending patterns even though cron fires
 * at fixed intervals. Emails arrive at unpredictable times throughout the day.
 *
 * Target: ~50 emails/day average (25 runs × ~2 avg emails)
 */

const MAX_QUEUE_ADDITIONS = 10;  // Add up to 10 new prospects to queue per run

/**
 * Get randomized email count for this run (weighted distribution)
 * - 15% chance: 0 emails (skip this run entirely)
 * - 35% chance: 1 email
 * - 35% chance: 2 emails
 * - 15% chance: 3 emails
 * Average: ~1.5 emails per run = ~37/day (conservative)
 */
function getRandomEmailCount(): number {
  const rand = Math.random();
  if (rand < 0.15) return 0;      // 15% skip
  if (rand < 0.50) return 1;      // 35% send 1
  if (rand < 0.85) return 2;      // 35% send 2
  return 3;                       // 15% send 3
}

/**
 * Get random delay in milliseconds
 * Range: 1-10 minutes between emails for natural spread
 */
function getRandomDelay(): number {
  const minDelay = 1 * 60 * 1000;   // 1 minute
  const maxDelay = 10 * 60 * 1000;  // 10 minutes
  return Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
}

/**
 * Get random initial delay before starting
 * Range: 0-15 minutes so emails don't always start at :00/:30
 */
function getRandomInitialDelay(): number {
  return Math.floor(Math.random() * 15 * 60 * 1000); // 0-15 minutes
}

// Generic email prefixes that indicate we should send mystery shopper
const GENERIC_EMAIL_PREFIXES = [
  'info@', 'reservations@', 'reservation@', 'reception@', 'frontdesk@',
  'hello@', 'contact@', 'enquiries@', 'enquiry@', 'booking@', 'bookings@',
  'stay@', 'guest@', 'guests@', 'sales@', 'events@', 'weddings@',
  'groups@', 'meetings@', 'concierge@', 'hotel@', 'resort@'
];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServerClient();
  const stats = {
    added_to_queue: 0,
    new_prospects_found: 0,
    emails_sent: 0,
    emails_target: 0,
    initial_delay_ms: 0,
    removed_from_queue: 0,
    errors: [] as string[],
  };

  try {
    // Determine randomized parameters for this run
    const emailsToSend = getRandomEmailCount();
    const initialDelay = getRandomInitialDelay();
    stats.emails_target = emailsToSend;
    stats.initial_delay_ms = initialDelay;

    logger.info({ emailsToSend, initialDelayMs: initialDelay }, 'Mystery shopper cron starting');

    // Random initial delay (0-15 min) so emails don't always start at :00/:30
    if (initialDelay > 0) {
      logger.debug({ delayMs: initialDelay }, 'Waiting before starting');
      await new Promise(resolve => setTimeout(resolve, initialDelay));
    }

    // Skip this run entirely sometimes (15% chance)
    if (emailsToSend === 0) {
      logger.info('Skipping this run (random skip)');
      await supabase.from('activities').insert({
        type: 'mystery_shopper',
        title: 'Mystery shopper skipped (random)',
        description: 'Random skip to create natural sending pattern.',
      });
      return NextResponse.json({
        success: true,
        message: 'Random skip this run',
        stats,
      });
    }

    // Step 1A: Find NEW prospects with generic emails that haven't received mystery shopper
    // These are automatically eligible - no tag required
    const { data: newProspects, error: newProspectsError } = await supabase
      .from('prospects')
      .select('id, name, email, score, tier, tags')
      .eq('archived', false)
      .not('email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (newProspectsError) {
      logger.error({ error: newProspectsError }, 'New prospects fetch error');
      stats.errors.push(`New prospects fetch error: ${newProspectsError.message}`);
    }

    // Filter to generic emails without mystery-inquiry-sent tag
    const eligibleNewProspects = (newProspects || []).filter(p => {
      if (!p.email) return false;
      const emailLower = p.email.toLowerCase();
      const isGenericEmail = GENERIC_EMAIL_PREFIXES.some(prefix => emailLower.startsWith(prefix));
      const alreadySent = (p.tags || []).includes('mystery-inquiry-sent');
      return isGenericEmail && !alreadySent;
    });

    stats.new_prospects_found = eligibleNewProspects.length;
    logger.info({ count: eligibleNewProspects.length }, 'Found new prospects with generic emails');

    // Step 1B: Also get prospects with 'needs-contact-discovery' tag (legacy behavior)
    const { data: taggedProspects, error: taggedError } = await supabase
      .from('prospects')
      .select('id, name, email, score, tier, tags')
      .contains('tags', ['needs-contact-discovery'])
      .order('score', { ascending: false })
      .limit(50);

    if (taggedError) {
      logger.error({ error: taggedError }, 'Tagged prospects fetch error');
      stats.errors.push(`Tagged fetch error: ${taggedError.message}`);
    }

    // Filter tagged prospects (same criteria)
    const eligibleTaggedProspects = (taggedProspects || []).filter(p => {
      if (!p.email) return false;
      const alreadySent = (p.tags || []).includes('mystery-inquiry-sent');
      return !alreadySent;
    });

    // Combine and dedupe (new prospects first, then tagged)
    const seenIds = new Set<string>();
    const allEligible = [...eligibleNewProspects, ...eligibleTaggedProspects].filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    logger.info({ total: allEligible.length, newCount: eligibleNewProspects.length, taggedCount: eligibleTaggedProspects.length }, 'Total eligible prospects');

    // Check which are already in queue
    if (allEligible.length > 0) {
      const prospectIds = allEligible.map(p => p.id);
      const { data: existingQueue } = await supabase
        .from('mystery_shopper_queue')
        .select('prospect_id')
        .in('prospect_id', prospectIds)
        .not('status', 'in', '("completed","failed")');

      const existingIds = new Set((existingQueue || []).map(q => q.prospect_id));

      // Add new ones to queue
      const toAdd = allEligible
        .filter(p => !existingIds.has(p.id))
        .slice(0, MAX_QUEUE_ADDITIONS);

      for (const prospect of toAdd) {
        const priority = prospect.tier === 'hot' ? 1 : prospect.tier === 'warm' ? 5 : 9;

        const { error: insertError } = await supabase
          .from('mystery_shopper_queue')
          .insert({
            prospect_id: prospect.id,
            status: 'pending',
            priority,
          });

        if (insertError) {
          // Ignore duplicate errors (unique constraint)
          if (!insertError.message.includes('duplicate')) {
            stats.errors.push(`Queue insert error for ${prospect.name}: ${insertError.message}`);
          }
        } else {
          stats.added_to_queue++;
          logger.debug({ prospect: prospect.name, priority }, 'Added to queue');
        }
      }
    }

    // Step 2: Send mystery shopper emails ONE AT A TIME with random delays
    // This creates truly random timing (1 min, 3 min, 7 min, etc.)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    for (let i = 0; i < emailsToSend; i++) {
      // Random delay between emails (1-10 minutes)
      if (i > 0) {
        const delay = getRandomDelay();
        logger.debug({ delayMs: delay, emailNumber: i + 1 }, 'Waiting before next email');
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        const response = await fetch(`${baseUrl}/api/mystery-inquiry`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 1 }), // Send exactly 1 email
        });

        const data = await response.json();

        if (response.ok && data.sent > 0) {
          stats.emails_sent++;
          logger.info({ sent: stats.emails_sent, target: emailsToSend }, 'Mystery shopper email sent');
        } else if (data.error) {
          stats.errors.push(`Email ${i + 1} failed: ${data.error}`);
          break; // Stop if no more eligible prospects
        }
      } catch (err) {
        stats.errors.push(`Email ${i + 1} error: ${String(err)}`);
      }
    }

    logger.info({ sent: stats.emails_sent, target: emailsToSend }, 'Mystery shopper sending complete');

    // Step 3: Clean up old completed/failed entries (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deleted, error: deleteError } = await supabase
      .from('mystery_shopper_queue')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', thirtyDaysAgo)
      .select('id');

    if (deleteError) {
      stats.errors.push(`Cleanup error: ${deleteError.message}`);
    } else {
      stats.removed_from_queue = deleted?.length || 0;
    }

    logger.info({ stats }, 'Mystery shopper cron complete');

    // Log activity with randomization details
    await supabase.from('activities').insert({
      type: 'mystery_shopper',
      title: `Mystery shopper: sent ${stats.emails_sent}/${stats.emails_target} emails`,
      description: `Initial delay: ${Math.round(stats.initial_delay_ms / 1000)}s. Found ${stats.new_prospects_found} new prospects. Added ${stats.added_to_queue} to queue, cleaned ${stats.removed_from_queue} old entries.${stats.errors.length > 0 ? ` Errors: ${stats.errors.join(', ')}` : ''}`,
    });

    return NextResponse.json({
      success: stats.errors.length === 0,
      message: `Sent ${stats.emails_sent}/${stats.emails_target} emails (random pattern)`,
      stats,
    });
  } catch (error) {
    logger.error({ error, stats }, 'Mystery shopper cron fatal error');
    return NextResponse.json({
      success: false,
      error: String(error),
      stats,
    }, { status: 500 });
  }
}
