/**
 * API Handler - HTTP endpoints for the CRM
 * Free Tier: No queue references
 */

import { Env, Prospect, CampaignStrategy } from '../types';
import { initializeInboxes, sendEmail } from '../lib/email-sender';
import { generateEmail } from '../lib/ai-gateway';

export async function handleAPI(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Health check
  if (path === '/health' || path === '/') {
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0-free',
    });
  }

  // API routes
  if (path.startsWith('/api/')) {
    const apiPath = path.replace('/api/', '');

    switch (apiPath) {
      // ==================
      // PROSPECT ENDPOINTS
      // ==================
      case 'prospects':
        if (request.method === 'GET') {
          return handleGetProspects(url, env);
        }
        if (request.method === 'POST') {
          return handleCreateProspect(request, env);
        }
        break;

      // ==================
      // EMAIL ENDPOINTS
      // ==================
      case 'emails':
        if (request.method === 'GET') {
          return handleGetEmails(url, env);
        }
        break;

      case 'send-email':
        if (request.method === 'POST') {
          return handleSendEmail(request, env);
        }
        break;

      // ==================
      // STATUS ENDPOINTS
      // ==================
      case 'status/warmup':
        return handleWarmupStatus(env);

      case 'status/inboxes':
        return handleInboxStatus(env);

      case 'status/rate-limits':
        return handleRateLimitStatus(env);

      case 'stats':
        return handleStats(env);

      // ==================
      // ADMIN ENDPOINTS
      // ==================
      case 'admin/initialize-inboxes':
        if (request.method === 'POST') {
          await initializeInboxes(env);
          return Response.json({ success: true });
        }
        break;

      case 'admin/trigger-send':
        if (request.method === 'POST') {
          // Manually trigger email send (useful for testing)
          return handleManualSend(request, env);
        }
        break;
    }
  }

  // Webhook endpoints
  if (path.startsWith('/webhook/')) {
    const webhookPath = path.replace('/webhook/', '');

    switch (webhookPath) {
      case 'email/inbound':
        return handleInboundWebhook(request, env);

      case 'tracking/open':
        return handleOpenTracking(request, env);

      case 'tracking/click':
        return handleClickTracking(request, env);

      case 'bounce':
        return handleBounceWebhook(request, env);
    }
  }

  return new Response('Not Found', { status: 404 });
}

// ==================
// PROSPECT HANDLERS
// ==================

async function handleGetProspects(url: URL, env: Env): Promise<Response> {
  const stage = url.searchParams.get('stage');
  const tier = url.searchParams.get('tier');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = `SELECT * FROM prospects WHERE archived = 0`;
  const params: string[] = [];

  if (stage) {
    query += ` AND stage = ?`;
    params.push(stage);
  }
  if (tier) {
    query += ` AND tier = ?`;
    params.push(tier);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  const stmt = env.DB.prepare(query);
  const result = await stmt.bind(...params, limit, offset).all();

  return Response.json({
    prospects: result.results,
    count: result.results?.length || 0,
  });
}

async function handleCreateProspect(request: Request, env: Env): Promise<Response> {
  const prospect = await request.json<{
    name: string;
    city: string;
    country?: string;
    website?: string;
    contact_email?: string;
    contact_name?: string;
    source?: string;
  }>();

  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO prospects (id, name, city, country, website, contact_email, contact_name, lead_source, stage, tier, score, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', 'cold', 0, datetime('now'), datetime('now'))
  `).bind(
    id,
    prospect.name,
    prospect.city,
    prospect.country || null,
    prospect.website || null,
    prospect.contact_email || null,
    prospect.contact_name || null,
    prospect.source || 'manual'
  ).run();

  return Response.json({ success: true, id });
}

// ==================
// EMAIL HANDLERS
// ==================

async function handleGetEmails(url: URL, env: Env): Promise<Response> {
  const prospectId = url.searchParams.get('prospect_id');
  const direction = url.searchParams.get('direction');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

  let query = `SELECT * FROM emails WHERE 1=1`;
  const params: string[] = [];

  if (prospectId) {
    query += ` AND prospect_id = ?`;
    params.push(prospectId);
  }
  if (direction) {
    query += ` AND direction = ?`;
    params.push(direction);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;

  const stmt = env.DB.prepare(query);
  const result = await stmt.bind(...params, limit).all();

  return Response.json({
    emails: result.results,
    count: result.results?.length || 0,
  });
}

async function handleSendEmail(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    prospectId: string;
    strategy?: string;
  }>();

  // Get prospect
  const row = await env.DB.prepare(
    `SELECT * FROM prospects WHERE id = ?`
  ).bind(body.prospectId).first();

  if (!row) {
    return Response.json({ error: 'Prospect not found' }, { status: 404 });
  }

  if (!row.contact_email) {
    return Response.json({ error: 'Prospect has no email' }, { status: 400 });
  }

  // Check warmup
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );
  const checkResponse = await warmupCounter.fetch(
    new Request('http://do/check', { method: 'POST' })
  );
  const checkResult = await checkResponse.json<{ allowed: boolean; reason?: string }>();

  if (!checkResult.allowed) {
    return Response.json({ error: `Warmup limit: ${checkResult.reason}` }, { status: 429 });
  }

  // Get inbox
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
    return Response.json({ error: 'No healthy inbox available' }, { status: 503 });
  }

  // Generate email
  const prospect = rowToProspect(row);
  const strategy = (body.strategy || 'authority_scarcity') as CampaignStrategy;
  const generated = await generateEmail(prospect, strategy, false, env);

  if (!generated) {
    return Response.json({ error: 'Failed to generate email' }, { status: 500 });
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
    // Record in warmup counter
    await warmupCounter.fetch(
      new Request('http://do/record', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id }),
      })
    );

    // Store in database
    const emailId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO emails (
        id, prospect_id, campaign_id, subject, body,
        to_email, from_email, message_id,
        direction, email_type, status, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'outbound', 'outreach', 'sent', datetime('now'), datetime('now'))
    `).bind(
      emailId,
      prospect.id,
      strategy,
      generated.subject,
      generated.body,
      prospect.contactEmail,
      inbox.email,
      result.messageId || null
    ).run();

    // Update prospect
    await env.DB.prepare(`
      UPDATE prospects
      SET stage = 'contacted', last_contacted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(prospect.id).run();

    return Response.json({ success: true, emailId, messageId: result.messageId });
  } else {
    return Response.json({ error: result.error }, { status: 500 });
  }
}

async function handleManualSend(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ count?: number }>();
  const count = Math.min(body.count || 1, 5);

  // Find eligible prospects
  const result = await env.DB.prepare(`
    SELECT * FROM prospects
    WHERE stage IN ('enriched', 'ready')
      AND archived = 0
      AND contact_email IS NOT NULL
      AND email_bounced = 0
      AND contact_email NOT LIKE 'info@%'
      AND contact_email NOT LIKE 'contact@%'
      AND (last_contacted_at IS NULL OR last_contacted_at < datetime('now', '-3 days'))
    ORDER BY score DESC
    LIMIT ?
  `).bind(count).all();

  const prospects = result.results || [];
  const results: Array<{ prospectId: string; success: boolean; error?: string }> = [];

  for (const row of prospects) {
    try {
      // Send via API handler
      const response = await handleSendEmail(
        new Request('http://internal', {
          method: 'POST',
          body: JSON.stringify({ prospectId: row.id }),
        }),
        env
      );

      const data = await response.json<{ success?: boolean; error?: string }>();
      results.push({
        prospectId: row.id as string,
        success: data.success || false,
        error: data.error,
      });

      // Small delay between sends
      await new Promise(r => setTimeout(r, 5000));
    } catch (error) {
      results.push({
        prospectId: row.id as string,
        success: false,
        error: String(error),
      });
    }
  }

  return Response.json({
    success: true,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  });
}

// ==================
// STATUS HANDLERS
// ==================

async function handleWarmupStatus(env: Env): Promise<Response> {
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );

  const response = await warmupCounter.fetch(new Request('http://do/status'));
  const status = await response.json();

  return Response.json(status);
}

async function handleInboxStatus(env: Env): Promise<Response> {
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  const response = await inboxState.fetch(new Request('http://do/status'));
  const status = await response.json();

  return Response.json(status);
}

async function handleRateLimitStatus(env: Env): Promise<Response> {
  const rateLimiter = env.RATE_LIMITER.get(
    env.RATE_LIMITER.idFromName('global')
  );

  const response = await rateLimiter.fetch(new Request('http://do/status'));
  const status = await response.json();

  return Response.json(status);
}

async function handleStats(env: Env): Promise<Response> {
  // Get prospect stats
  const prospectStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN stage = 'new' THEN 1 ELSE 0 END) as new,
      SUM(CASE WHEN stage = 'enriched' THEN 1 ELSE 0 END) as enriched,
      SUM(CASE WHEN stage = 'contacted' THEN 1 ELSE 0 END) as contacted,
      SUM(CASE WHEN stage = 'engaged' THEN 1 ELSE 0 END) as engaged,
      SUM(CASE WHEN stage = 'meeting' THEN 1 ELSE 0 END) as meeting
    FROM prospects WHERE archived = 0
  `).first();

  // Get email stats for today
  const emailStats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total_sent,
      SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
    FROM emails
    WHERE direction = 'outbound'
      AND sent_at >= date('now')
  `).first();

  return Response.json({
    prospects: prospectStats,
    emails_today: emailStats,
  });
}

// ==================
// WEBHOOK HANDLERS
// ==================

async function handleInboundWebhook(request: Request, env: Env): Promise<Response> {
  const email = await request.json<{
    messageId: string;
    from: string;
    to: string;
    subject: string;
    body: string;
  }>();

  // Check if already processed
  const existing = await env.DB.prepare(
    `SELECT id FROM emails WHERE message_id = ?`
  ).bind(email.messageId).first();

  if (existing) {
    return Response.json({ success: true, duplicate: true });
  }

  // Find matching prospect
  const prospect = await env.DB.prepare(
    `SELECT id, name FROM prospects WHERE contact_email = ?`
  ).bind(email.from).first<{ id: string; name: string }>();

  const emailId = crypto.randomUUID();

  if (prospect) {
    // Store reply and update prospect
    await env.DB.prepare(`
      INSERT INTO emails (
        id, prospect_id, subject, body, to_email, from_email, message_id,
        direction, email_type, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'received', datetime('now'))
    `).bind(emailId, prospect.id, email.subject, email.body, email.to, email.from, email.messageId).run();

    await env.DB.prepare(`
      UPDATE prospects
      SET stage = 'engaged', last_replied_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(prospect.id).run();

    // Alert
    if (env.ALERT_WEBHOOK_URL) {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reply_received',
          prospect: prospect.name,
          prospectId: prospect.id,
          subject: email.subject,
        }),
      }).catch(() => {});
    }
  } else {
    // Store as orphan
    await env.DB.prepare(`
      INSERT INTO emails (
        id, subject, body, to_email, from_email, message_id,
        direction, email_type, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'orphan', datetime('now'))
    `).bind(emailId, email.subject, email.body, email.to, email.from, email.messageId).run();
  }

  return Response.json({ success: true });
}

async function handleOpenTracking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const trackingId = url.searchParams.get('id');

  if (trackingId) {
    await env.DB.prepare(`
      UPDATE emails SET opened_at = datetime('now'), status = 'opened'
      WHERE id = ? AND opened_at IS NULL
    `).bind(trackingId).run();
  }

  // Return 1x1 transparent pixel
  const pixel = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
    0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
    0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
    0x01, 0x00, 0x3b,
  ]);

  return new Response(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

async function handleClickTracking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const trackingId = url.searchParams.get('id');
  const redirect = url.searchParams.get('url');

  if (trackingId) {
    await env.DB.prepare(`
      UPDATE emails SET clicked_at = datetime('now')
      WHERE id = ? AND clicked_at IS NULL
    `).bind(trackingId).run();
  }

  if (redirect) {
    return Response.redirect(redirect, 302);
  }

  return new Response('OK');
}

async function handleBounceWebhook(request: Request, env: Env): Promise<Response> {
  const bounce = await request.json<{
    email: string;
    type: string;
    reason: string;
  }>();

  // Find prospect by email
  const prospect = await env.DB.prepare(
    `SELECT id FROM prospects WHERE contact_email = ?`
  ).bind(bounce.email).first<{ id: string }>();

  if (prospect) {
    await env.DB.prepare(`
      UPDATE prospects SET email_bounced = 1 WHERE id = ?
    `).bind(prospect.id).run();

    await env.DB.prepare(`
      UPDATE emails SET status = 'bounced', bounced_at = datetime('now')
      WHERE prospect_id = ? AND status = 'sent'
      ORDER BY sent_at DESC LIMIT 1
    `).bind(prospect.id).run();
  }

  return Response.json({ success: true });
}

// ==================
// HELPERS
// ==================

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
