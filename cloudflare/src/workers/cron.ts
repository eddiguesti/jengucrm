/**
 * CRON Handler - Scheduled task orchestration
 * Free Tier: All processing happens synchronously
 *
 * Triggers:
 * - Every 5 min, 8am-6pm Mon-Sat: Email sending window
 * - 7am daily: Daily pipeline
 * - Every minute: Check replies
 * - 10am Mon-Fri: Follow-ups
 */

import { Env, Prospect, CampaignStrategy } from '../types';
import { generateEmail } from '../lib/ai-gateway';
import { sendEmail, getAvailableInbox } from '../lib/email-sender';

export async function handleCron(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const scheduledTime = new Date(event.scheduledTime);
  const hour = scheduledTime.getUTCHours();
  const minute = scheduledTime.getUTCMinutes();
  const day = scheduledTime.getUTCDay(); // 0 = Sunday

  console.log(`CRON triggered at ${scheduledTime.toISOString()} (hour=${hour}, minute=${minute}, day=${day})`);

  try {
    // ==================
    // EVERY MINUTE: Check replies
    // ==================
    await checkInboxForReplies(env);

    // ==================
    // BUSINESS HOURS: Email sending (8am-6pm Mon-Sat)
    // ==================
    const isBusinessHours = hour >= 8 && hour < 18;
    const isWeekday = day >= 1 && day <= 6; // Mon-Sat

    if (isBusinessHours && isWeekday) {
      // Random 30% skip for human-like sending pattern
      if (Math.random() > 0.3) {
        console.log('Triggering email send cycle');
        await sendEmailBatch(env);
      } else {
        console.log('Random skip for human-like pattern');
      }
    }

    // ==================
    // 7AM DAILY: Master pipeline
    // ==================
    if (hour === 7 && minute === 0) {
      console.log('Running daily pipeline');

      // Reset daily counters
      const warmupCounter = env.WARMUP_COUNTER.get(
        env.WARMUP_COUNTER.idFromName('global')
      );
      await warmupCounter.fetch(new Request('http://do/daily-reset', { method: 'POST' }));

      // Clean up old dedup entries
      const prospectDedup = env.PROSPECT_DEDUP.get(
        env.PROSPECT_DEDUP.idFromName('global')
      );
      await prospectDedup.fetch(new Request('http://do/cleanup', { method: 'POST' }));
    }

    // ==================
    // 10AM MON-FRI: Follow-ups
    // ==================
    if (hour === 10 && minute === 0 && day >= 1 && day <= 5) {
      console.log('Triggering follow-up emails');
      await sendFollowUps(env);
    }

    // ==================
    // 6AM SUNDAY: Weekly maintenance
    // ==================
    if (hour === 6 && minute === 0 && day === 0) {
      console.log('Running weekly maintenance');
      await runWeeklyMaintenance(env);
    }

  } catch (error) {
    console.error('CRON error:', error);

    // Alert via webhook if configured
    if (env.ALERT_WEBHOOK_URL) {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cron_error',
          error: String(error),
          time: scheduledTime.toISOString(),
        }),
      }).catch(() => {}); // Don't fail on alert failure
    }
  }
}

/**
 * Send a batch of emails synchronously
 */
async function sendEmailBatch(env: Env): Promise<void> {
  // Get warmup status to determine batch size
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  const statusResponse = await warmupCounter.fetch(new Request('http://do/status'));
  const status = await statusResponse.json<{
    summary: { remaining: number };
  }>();

  const remaining = status.summary?.remaining || 0;

  if (remaining <= 0) {
    console.log('Daily limit reached, skipping send');
    return;
  }

  // Send 1-3 emails per cycle
  const batchSize = Math.min(Math.ceil(remaining / 20), 3);

  // Find prospects ready to email
  const result = await env.DB.prepare(`
    SELECT
      id, name, city, country, property_type,
      contact_name, contact_email, contact_title,
      website, stage, tier, score, lead_source,
      source_job_title, job_pain_points, research_notes
    FROM prospects
    WHERE stage IN ('enriched', 'ready')
      AND archived = 0
      AND contact_email IS NOT NULL
      AND email_bounced = 0
      AND contact_email NOT LIKE 'info@%'
      AND contact_email NOT LIKE 'contact@%'
      AND contact_email NOT LIKE 'reservations@%'
      AND contact_email NOT LIKE 'reception@%'
      AND contact_email NOT LIKE 'booking@%'
      AND contact_email NOT LIKE 'hello@%'
      AND contact_email NOT LIKE 'support@%'
      AND contact_email NOT LIKE 'sales@%'
      AND contact_email NOT LIKE 'admin@%'
      AND contact_email NOT LIKE 'office@%'
      AND (last_contacted_at IS NULL OR last_contacted_at < datetime('now', '-3 days'))
    ORDER BY score DESC, created_at ASC
    LIMIT ?
  `).bind(batchSize).all();

  const prospects = result.results || [];

  console.log(`Found ${prospects.length} prospects ready for emailing`);

  for (const row of prospects) {
    try {
      const prospect = rowToProspect(row);
      await processAndSendEmail(prospect, env, false);

      // Random delay between emails (30-90 seconds)
      await sleep(30000 + Math.random() * 60000);
    } catch (error) {
      console.error(`Failed to send email to ${row.contact_email}:`, error);
    }
  }
}

/**
 * Process a prospect and send email
 */
async function processAndSendEmail(
  prospect: Prospect,
  env: Env,
  isFollowUp: boolean
): Promise<void> {
  // Check warmup allowance
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  const checkResponse = await warmupCounter.fetch(
    new Request('http://do/check', { method: 'POST' })
  );
  const checkResult = await checkResponse.json<{ allowed: boolean; reason?: string }>();

  if (!checkResult.allowed) {
    console.log(`Warmup limit reached: ${checkResult.reason}`);
    return;
  }

  // Get available inbox
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  const inboxResponse = await inboxState.fetch(
    new Request('http://do/get-available')
  );
  const inbox = await inboxResponse.json<{
    id: string;
    email: string;
    displayName: string;
    provider: 'azure' | 'smtp';
  } | null>();

  if (!inbox) {
    console.log('No healthy inbox available');
    return;
  }

  // Determine strategy
  const strategy = getStrategyForSource(prospect.leadSource) as CampaignStrategy;

  // Generate email using AI
  const generated = await generateEmail(prospect, strategy, isFollowUp, env);

  if (!generated) {
    console.error('Failed to generate email');
    return;
  }

  // Send email
  const result = await sendEmail({
    to: prospect.contactEmail!,
    subject: generated.subject,
    body: generated.body,
    from: inbox.email,
    displayName: inbox.displayName,
    provider: inbox.provider,
    env,
  });

  if (result.success) {
    // Record send in warmup counter
    await warmupCounter.fetch(
      new Request('http://do/record', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id }),
      })
    );

    // Record success in inbox state
    await inboxState.fetch(
      new Request('http://do/record-success', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id }),
      })
    );

    // Update database
    const emailId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO emails (
        id, prospect_id, campaign_id, subject, body,
        to_email, from_email, message_id,
        direction, email_type, status, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'outbound', ?, 'sent', datetime('now'), datetime('now'))
    `).bind(
      emailId,
      prospect.id,
      strategy,
      generated.subject,
      generated.body,
      prospect.contactEmail,
      inbox.email,
      result.messageId || null,
      isFollowUp ? 'follow_up' : 'outreach'
    ).run();

    await env.DB.prepare(`
      UPDATE prospects
      SET stage = 'contacted', last_contacted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(prospect.id).run();

    console.log(`Email sent to ${prospect.contactEmail}`);
  } else {
    // Record failure
    await inboxState.fetch(
      new Request('http://do/record-failure', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id, error: result.error }),
      })
    );

    console.error(`Failed to send email: ${result.error}`);
  }
}

/**
 * Send follow-up emails
 */
async function sendFollowUps(env: Env): Promise<void> {
  // Find prospects who haven't replied after 3+ days
  const result = await env.DB.prepare(`
    SELECT
      p.id, p.name, p.city, p.country, p.property_type,
      p.contact_name, p.contact_email, p.contact_title,
      p.website, p.stage, p.tier, p.score, p.lead_source,
      p.source_job_title, p.job_pain_points, p.research_notes,
      COUNT(e.id) as email_count
    FROM prospects p
    LEFT JOIN emails e ON e.prospect_id = p.id AND e.direction = 'outbound'
    WHERE p.stage = 'contacted'
      AND p.archived = 0
      AND p.last_contacted_at < datetime('now', '-3 days')
      AND p.last_replied_at IS NULL
    GROUP BY p.id
    HAVING email_count < 4
    ORDER BY p.last_contacted_at ASC
    LIMIT 10
  `).all();

  const prospects = result.results || [];

  console.log(`Found ${prospects.length} prospects needing follow-up`);

  for (const row of prospects) {
    try {
      const prospect = rowToProspect(row);
      await processAndSendEmail(prospect, env, true);
      await sleep(30000 + Math.random() * 60000);
    } catch (error) {
      console.error(`Follow-up failed for ${row.contact_email}:`, error);
    }
  }
}

/**
 * Check inbox for new replies
 */
async function checkInboxForReplies(env: Env): Promise<void> {
  try {
    // Get OAuth token for Azure
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.AZURE_CLIENT_ID,
          client_secret: env.AZURE_CLIENT_SECRET,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    if (!tokenResponse.ok) {
      console.error('Azure auth failed');
      return;
    }

    const { access_token } = await tokenResponse.json<{ access_token: string }>();

    // Fetch unread emails
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${env.AZURE_MAIL_FROM}/mailFolders/inbox/messages?$filter=isRead eq false&$top=20&$select=id,from,subject,body,receivedDateTime,internetMessageId`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch emails');
      return;
    }

    const data = await response.json<{
      value: Array<{
        id: string;
        from: { emailAddress: { address: string } };
        subject: string;
        body: { content: string };
        receivedDateTime: string;
        internetMessageId: string;
      }>;
    }>();

    console.log(`Found ${data.value.length} unread emails`);

    for (const item of data.value) {
      // Skip our own emails
      if (item.from.emailAddress.address === env.AZURE_MAIL_FROM) continue;

      await processInboundEmail({
        messageId: item.internetMessageId,
        from: item.from.emailAddress.address,
        to: env.AZURE_MAIL_FROM,
        subject: item.subject,
        body: stripHtml(item.body.content),
        receivedAt: item.receivedDateTime,
      }, env);

      // Mark as read
      await fetch(
        `https://graph.microsoft.com/v1.0/users/${env.AZURE_MAIL_FROM}/messages/${item.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isRead: true }),
        }
      );
    }
  } catch (error) {
    console.error('Reply check error:', error);
  }
}

/**
 * Process an inbound email
 */
async function processInboundEmail(
  email: { messageId: string; from: string; to: string; subject: string; body: string; receivedAt: string },
  env: Env
): Promise<void> {
  // Check if already processed
  const existing = await env.DB.prepare(
    `SELECT id FROM emails WHERE message_id = ?`
  ).bind(email.messageId).first();

  if (existing) return;

  // Find matching prospect
  const prospect = await env.DB.prepare(
    `SELECT id, name, stage FROM prospects WHERE contact_email = ?`
  ).bind(email.from).first<{ id: string; name: string; stage: string }>();

  const emailId = crypto.randomUUID();

  if (!prospect) {
    // Store as orphan
    await env.DB.prepare(`
      INSERT INTO emails (
        id, subject, body, to_email, from_email, message_id,
        direction, email_type, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'orphan', datetime('now'))
    `).bind(emailId, email.subject, email.body, email.to, email.from, email.messageId).run();
    return;
  }

  // Store reply
  await env.DB.prepare(`
    INSERT INTO emails (
      id, prospect_id, subject, body, to_email, from_email, message_id,
      direction, email_type, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'received', datetime('now'))
  `).bind(emailId, prospect.id, email.subject, email.body, email.to, email.from, email.messageId).run();

  // Update prospect
  await env.DB.prepare(`
    UPDATE prospects
    SET stage = 'engaged', last_replied_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(prospect.id).run();

  console.log(`Reply received from ${email.from}`);

  // Alert if webhook configured
  if (env.ALERT_WEBHOOK_URL) {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reply_received',
        prospect: prospect.name,
        prospectId: prospect.id,
        subject: email.subject,
        from: email.from,
      }),
    }).catch(() => {});
  }
}

/**
 * Weekly maintenance tasks
 */
async function runWeeklyMaintenance(env: Env): Promise<void> {
  // Archive stale prospects
  await env.DB.prepare(`
    UPDATE prospects
    SET archived = 1, stage = 'lost'
    WHERE stage IN ('new', 'enriched', 'contacted')
      AND archived = 0
      AND updated_at < datetime('now', '-30 days')
      AND last_replied_at IS NULL
  `).run();

  // Clean up old emails (keep last 90 days)
  await env.DB.prepare(`
    DELETE FROM emails
    WHERE created_at < datetime('now', '-90 days')
  `).run();

  console.log('Weekly maintenance completed');
}

/**
 * Convert DB row to Prospect type
 */
function rowToProspect(row: Record<string, unknown>): Prospect {
  return {
    id: row.id as string,
    name: row.name as string,
    city: row.city as string,
    country: row.country as string | null,
    propertyType: row.property_type as string | null,
    contactName: row.contact_name as string | null,
    contactEmail: row.contact_email as string | null,
    contactTitle: row.contact_title as string | null,
    phone: row.phone as string | null,
    website: row.website as string | null,
    stage: row.stage as Prospect['stage'],
    tier: row.tier as Prospect['tier'],
    score: row.score as number,
    leadSource: row.lead_source as string,
    sourceUrl: row.source_url as string | null,
    sourceJobTitle: row.source_job_title as string | null,
    jobPainPoints: row.job_pain_points ? JSON.parse(row.job_pain_points as string) : null,
    researchNotes: row.research_notes as string | null,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
    lastContactedAt: row.last_contacted_at as string | null,
    lastRepliedAt: row.last_replied_at as string | null,
    archived: Boolean(row.archived),
    emailVerified: Boolean(row.email_verified),
    emailBounced: Boolean(row.email_bounced),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Get email strategy based on lead source
 */
function getStrategyForSource(source: string): string {
  if (source === 'sales_navigator') {
    return Math.random() < 0.5 ? 'cold_direct' : 'cold_pattern_interrupt';
  }
  return Math.random() < 0.5 ? 'authority_scarcity' : 'curiosity_value';
}

/**
 * Strip HTML tags
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
