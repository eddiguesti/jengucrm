/**
 * API Handler - HTTP endpoints for the CRM
 * Free Tier: No queue references
 *
 * NOTE: Azure/jengu.ai is disabled - only SMTP inboxes are used
 */

import { Env, Prospect, CampaignStrategy } from '../types';
import { initializeInboxes, sendEmail, getAvailableInbox } from '../lib/email-sender';
import { generateEmail } from '../lib/ai-gateway';
import { handleEnrich } from './enrich';
import { handleCampaigns } from './campaigns';
import * as RetryQueue from '../lib/retry-queue';
import { RequestContext, success, createRequestContext } from '../lib/request-context';
import { HealthCheckData, DependencyStatus } from '../lib/contracts';
import { getAllCircuitBreakerStatus } from '../lib/circuit-breaker';
import * as DataSync from '../lib/data-sync';
import * as DataIntegrity from '../lib/data-integrity';
import * as EmailSafety from '../lib/email-safety';
import * as Alerting from '../lib/alerting';
import * as SpamChecker from '../lib/spam-checker';
import * as BounceHandler from '../lib/bounce-handler';
import * as ReplyHandler from '../lib/reply-handler';

export async function handleAPI(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  ctx?: RequestContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const reqCtx = ctx || createRequestContext(request);

  // Health check with dependency status
  if (path === '/health' || path === '/') {
    return handleHealthCheck(env, reqCtx);
  }

  // Enrichment routes (cloud-based website/email finding)
  if (path.startsWith('/enrich/')) {
    return handleEnrich(request, env);
  }

  // Campaign sequences routes
  if (path.match(/^\/api\/campaigns(\/|$)/)) {
    return handleCampaigns(request, env);
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

      case 'status/circuit-breakers':
        return handleCircuitBreakerStatus(reqCtx);

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

      case 'admin/emergency-stop':
        if (request.method === 'GET') {
          return handleGetEmergencyStop(env);
        }
        if (request.method === 'POST') {
          return handleSetEmergencyStop(request, env);
        }
        break;

      case 'admin/blocked-sends':
        if (request.method === 'GET') {
          return handleGetBlockedSends(url, env);
        }
        break;

      case 'admin/clear-inboxes':
        if (request.method === 'POST') {
          return handleClearInboxes(env);
        }
        break;

      case 'admin/remove-inbox':
        if (request.method === 'POST') {
          return handleRemoveInbox(request, env);
        }
        break;

      case 'admin/clear-warmup':
        if (request.method === 'POST') {
          return handleClearWarmup(env);
        }
        break;

      // ==================
      // DELIVERABILITY ENDPOINTS
      // ==================
      case 'deliverability/status':
        return handleDeliverabilityStatus(env);

      case 'deliverability/bounce-rates':
        return handleBounceRates(env);

      case 'deliverability/auto-pause':
        if (request.method === 'POST') {
          return handleAutoPauseInboxes(env);
        }
        break;

      case 'deliverability/clean-list':
        if (request.method === 'POST') {
          return handleCleanList(env);
        }
        break;

      case 'deliverability/spam-check':
        if (request.method === 'POST') {
          return handleSpamCheck(request);
        }
        break;

      // ==================
      // BOUNCE ENDPOINTS
      // ==================
      case 'bounces/stats':
        return handleBounceStats(env);

      case 'bounces/check':
        if (request.method === 'POST') {
          return handleBounceCheck(request, env);
        }
        break;

      case 'bounces/record':
        if (request.method === 'POST') {
          return handleRecordBounce(request, env);
        }
        break;

      case 'bounces/complaint':
        if (request.method === 'POST') {
          return handleRecordComplaint(request, env);
        }
        break;

      // ==================
      // REPLY APPROVAL ENDPOINTS
      // ==================
      case 'reply/approve':
        if (request.method === 'GET') {
          return handleReplyApproval(url, env);
        }
        break;

      case 'reply/pending':
        if (request.method === 'GET') {
          return handlePendingReplies(url, env);
        }
        break;

      // ==================
      // SYNC ENDPOINTS
      // ==================
      case 'sync/status':
        return handleSyncStatus(env, reqCtx);

      case 'sync/prospects':
        if (request.method === 'POST') {
          return handleSyncProspects(env, reqCtx);
        }
        break;

      case 'sync/campaigns':
        if (request.method === 'POST') {
          return handleSyncCampaigns(env, reqCtx);
        }
        break;

      case 'sync/emails':
        if (request.method === 'POST') {
          return handleSyncEmails(env, reqCtx);
        }
        break;

      case 'sync/full':
        if (request.method === 'POST') {
          return handleFullSync(env, reqCtx);
        }
        break;

      // ==================
      // INTEGRITY ENDPOINTS
      // ==================
      case 'integrity/check':
        if (request.method === 'POST') {
          return handleIntegrityCheck(env, reqCtx);
        }
        break;

      case 'integrity/issues':
        return handleIntegrityIssues(env, reqCtx);

      case 'integrity/fix':
        if (request.method === 'POST') {
          return handleAutoFixIssues(env, reqCtx);
        }
        break;

      // ==================
      // RETRY QUEUE ENDPOINTS
      // ==================
      case 'retry-queue/stats':
        return handleRetryQueueStats(env);

      case 'retry-queue/pending':
        return handleRetryQueuePending(url, env);

      case 'retry-queue/retry':
        if (request.method === 'POST') {
          return handleRetryTask(request, env);
        }
        break;

      case 'retry-queue/resolve':
        if (request.method === 'POST') {
          return handleResolveTask(request, env);
        }
        break;

      case 'retry-queue/cleanup':
        if (request.method === 'POST') {
          return handleRetryQueueCleanup(env);
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

  // Get available SMTP inbox (Azure is disabled)
  const inbox = await getAvailableInbox(env);

  if (!inbox) {
    return Response.json({ error: 'No healthy SMTP inbox available' }, { status: 503 });
  }

  // Check warmup for this specific inbox
  const warmupCounter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName('global')
  );
  const checkResponse = await warmupCounter.fetch(
    new Request('http://do/can-send', {
      method: 'POST',
      body: JSON.stringify({ inboxId: inbox.id }),
    })
  );
  const checkResult = await checkResponse.json<{ allowed: boolean; reason?: string }>();

  if (!checkResult.allowed) {
    return Response.json({ error: `Warmup limit: ${checkResult.reason}` }, { status: 429 });
  }

  // Generate email
  const prospect = rowToProspect(row);
  const strategy = (body.strategy || 'authority_scarcity') as CampaignStrategy;

  let generated;
  try {
    generated = await generateEmail(prospect, strategy, false, env);
  } catch (error) {
    return Response.json({ error: `Failed to generate email: ${error}` }, { status: 500 });
  }

  if (!generated) {
    return Response.json({ error: 'Failed to generate email' }, { status: 500 });
  }

  // Send email via SMTP
  const result = await sendEmail({
    to: prospect.contactEmail!,
    subject: generated.subject,
    body: generated.body,
    from: inbox.email,
    displayName: inbox.displayName,
    provider: inbox.provider,
    env,
  });

  // Get inbox state for recording
  const inboxState = env.INBOX_STATE.get(
    env.INBOX_STATE.idFromName('pool')
  );

  if (result.success) {
    // Record in warmup counter
    await warmupCounter.fetch(
      new Request('http://do/increment', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id }),
      })
    );

    // Record success in inbox state
    await inboxState.fetch(
      new Request('http://do/mark-success', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id, latencyMs: result.latencyMs }),
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
    // Record failure in inbox state
    await inboxState.fetch(
      new Request('http://do/mark-failure', {
        method: 'POST',
        body: JSON.stringify({ inboxId: inbox.id, error: result.error }),
      })
    );

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

function handleCircuitBreakerStatus(ctx: RequestContext): Response {
  const breakers = getAllCircuitBreakerStatus();
  return success(ctx, { circuitBreakers: breakers });
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
  let email: {
    messageId: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string[];
    headers?: Record<string, string>;
    receivedAt?: string;
  };

  try {
    email = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate required fields
  if (!email.from || !email.subject) {
    return Response.json({ error: 'Missing required fields: from, subject' }, { status: 400 });
  }

  // Generate messageId if not provided
  const messageId = email.messageId || `imap-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  console.log(`Inbound email from ${email.from}: "${email.subject}"`);

  // Use the reply handler for comprehensive processing
  // This handles: bounce detection, auto-reply filtering, prospect matching,
  // sentiment analysis, suggested replies, and notifications
  const result = await ReplyHandler.processReply({
    messageId,
    from: email.from,
    to: email.to || '',
    subject: email.subject,
    body: email.body || '',
    inReplyTo: email.inReplyTo,
    references: email.references,
    headers: email.headers,
    receivedAt: email.receivedAt,
  }, env);

  // Log result
  if (result.processed) {
    if (result.intent === 'bounce') {
      console.log(`✓ Processed bounce notification`);
    } else if (result.intent === 'auto_reply') {
      console.log(`✓ Auto-reply detected, ignored`);
    } else if (result.intent === 'duplicate') {
      console.log(`✓ Duplicate reply ignored`);
    } else if (result.prospectId) {
      console.log(`✓ Reply processed: ${result.prospectName} (${result.intent})`);
    }
  } else {
    console.log(`? Reply not matched to prospect: ${email.from}`);
  }

  return Response.json({
    success: result.processed,
    prospectId: result.prospectId,
    prospectName: result.prospectName,
    intent: result.intent,
    replyId: result.replyId,
    error: result.error,
  });
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
// RETRY QUEUE HANDLERS
// ==================

async function handleRetryQueueStats(env: Env): Promise<Response> {
  const stats = await RetryQueue.getStats(env);
  return Response.json(stats);
}

async function handleRetryQueuePending(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const tasks = await RetryQueue.getPendingTasks(env, limit);
  return Response.json({ tasks, count: tasks.length });
}

async function handleRetryTask(request: Request, env: Env): Promise<Response> {
  const { taskId } = await request.json<{ taskId: string }>();

  if (!taskId) {
    return Response.json({ error: 'taskId is required' }, { status: 400 });
  }

  const task = await RetryQueue.getTask(env, taskId);
  if (!task) {
    return Response.json({ error: 'Task not found' }, { status: 404 });
  }

  // Mark as retrying
  await RetryQueue.markRetrying(env, taskId);

  // Attempt the retry based on task type
  let success = false;
  let error: string | null = null;

  try {
    // Get prospect data
    const prospect = await env.DB.prepare(
      `SELECT id, name, city, country, website, contact_name FROM prospects WHERE id = ?`
    ).bind(task.prospectId).first<Record<string, unknown>>();

    if (!prospect) {
      await RetryQueue.markResolved(env, taskId);
      return Response.json({ success: false, error: 'Prospect not found' });
    }

    if (task.type === 'find_website' || task.type === 'find_email') {
      // Mark task as retrying - it will be picked up by the next enrichment batch
      // The retry queue uses exponential backoff (5min, 30min, 2h)
      success = true;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (success) {
    await RetryQueue.markResolved(env, taskId);
  }

  return Response.json({ success, error });
}

async function handleResolveTask(request: Request, env: Env): Promise<Response> {
  const { taskId, prospectId } = await request.json<{ taskId?: string; prospectId?: string }>();

  if (taskId) {
    await RetryQueue.markResolved(env, taskId);
    return Response.json({ success: true });
  }

  if (prospectId) {
    await RetryQueue.resolveByProspect(env, prospectId);
    return Response.json({ success: true });
  }

  return Response.json({ error: 'taskId or prospectId required' }, { status: 400 });
}

async function handleRetryQueueCleanup(env: Env): Promise<Response> {
  const deleted = await RetryQueue.cleanup(env);
  return Response.json({ success: true, deleted });
}

// ==================
// SYNC HANDLERS
// ==================

async function handleSyncStatus(env: Env, ctx: RequestContext): Promise<Response> {
  const status = await DataSync.getSyncStatus(env);
  return success(ctx, status);
}

async function handleSyncProspects(env: Env, ctx: RequestContext): Promise<Response> {
  const result = await DataSync.syncProspectsToD1(env);
  return success(ctx, result);
}

async function handleSyncCampaigns(env: Env, ctx: RequestContext): Promise<Response> {
  const result = await DataSync.syncCampaignsToD1(env);
  return success(ctx, result);
}

async function handleSyncEmails(env: Env, ctx: RequestContext): Promise<Response> {
  const result = await DataSync.syncEmailsToSupabase(env);
  return success(ctx, result);
}

async function handleFullSync(env: Env, ctx: RequestContext): Promise<Response> {
  const result = await DataSync.runFullSync(env);
  return success(ctx, result);
}

// ==================
// INTEGRITY HANDLERS
// ==================

async function handleIntegrityCheck(env: Env, ctx: RequestContext): Promise<Response> {
  const result = await DataIntegrity.runIntegrityChecks(env);
  return success(ctx, result);
}

async function handleIntegrityIssues(env: Env, ctx: RequestContext): Promise<Response> {
  const issues = await DataIntegrity.getUnresolvedIssues(env);
  return success(ctx, { issues, count: issues.length });
}

async function handleAutoFixIssues(env: Env, ctx: RequestContext): Promise<Response> {
  const result = await DataIntegrity.autoFixIssues(env);
  return success(ctx, result);
}

// ==================
// HEALTH CHECK
// ==================

async function handleHealthCheck(env: Env, ctx: RequestContext): Promise<Response> {
  const startTime = Date.now();

  // Check database health
  const dbStatus = await checkDatabaseHealth(env);

  // Check SMTP health via inbox state
  const smtpStatus = await checkSmtpHealth(env);

  // Check external API health via circuit breakers
  const externalStatus = checkExternalApiHealth();

  // Determine overall status
  const statuses = [dbStatus.status, smtpStatus.status, externalStatus.status];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (statuses.includes('unhealthy')) {
    overallStatus = 'unhealthy';
  } else if (statuses.includes('degraded')) {
    overallStatus = 'degraded';
  }

  const healthData: HealthCheckData = {
    status: overallStatus,
    version: '1.1.0',
    uptime: Date.now() - startTime,
    dependencies: {
      database: dbStatus,
      smtp: smtpStatus,
      externalApis: externalStatus,
    },
  };

  return success(ctx, healthData);
}

async function checkDatabaseHealth(env: Env): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await env.DB.prepare('SELECT 1').first();
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      lastError: err instanceof Error ? err.message : String(err),
      lastErrorAt: new Date().toISOString(),
    };
  }
}

async function checkSmtpHealth(env: Env): Promise<DependencyStatus> {
  try {
    const inboxState = env.INBOX_STATE.get(
      env.INBOX_STATE.idFromName('pool')
    );

    const response = await inboxState.fetch(new Request('http://do/status'));
    const status = await response.json<{
      inboxes: Array<{ healthy: boolean; lastError?: string; lastErrorAt?: number }>;
    }>();

    const healthyCount = status.inboxes?.filter((i) => i.healthy).length || 0;
    const totalCount = status.inboxes?.length || 0;

    if (totalCount === 0) {
      return { status: 'unhealthy', lastError: 'No inboxes configured' };
    }

    if (healthyCount === 0) {
      const lastError = status.inboxes.find((i) => i.lastError)?.lastError;
      return {
        status: 'unhealthy',
        lastError: lastError || 'All inboxes unhealthy',
      };
    }

    if (healthyCount < totalCount) {
      return {
        status: 'degraded',
        lastError: `${totalCount - healthyCount}/${totalCount} inboxes unhealthy`,
      };
    }

    return { status: 'healthy' };
  } catch (err) {
    return {
      status: 'unhealthy',
      lastError: err instanceof Error ? err.message : String(err),
      lastErrorAt: new Date().toISOString(),
    };
  }
}

function checkExternalApiHealth(): DependencyStatus {
  const breakers = getAllCircuitBreakerStatus();
  const breakerNames = Object.keys(breakers);

  if (breakerNames.length === 0) {
    return { status: 'healthy' };
  }

  const openBreakers = breakerNames.filter((name) => breakers[name].state === 'open');
  const halfOpenBreakers = breakerNames.filter((name) => breakers[name].state === 'half-open');

  if (openBreakers.length > 0) {
    return {
      status: 'unhealthy',
      lastError: `Circuit breakers open: ${openBreakers.join(', ')}`,
    };
  }

  if (halfOpenBreakers.length > 0) {
    return {
      status: 'degraded',
      lastError: `Circuit breakers recovering: ${halfOpenBreakers.join(', ')}`,
    };
  }

  return { status: 'healthy' };
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
    // Website scraper data for personalization
    starRating: row.star_rating as number | null,
    chainAffiliation: row.chain_affiliation as string | null,
    estimatedRooms: row.estimated_rooms as number | null,
    googleRating: row.google_rating as number | null,
    googleReviewCount: row.google_review_count as number | null,
  };
}

// ==================
// EMERGENCY STOP HANDLERS
// ==================

async function handleGetEmergencyStop(env: Env): Promise<Response> {
  const active = await EmailSafety.isEmergencyStopActive(env);
  return Response.json({
    emergencyStop: active,
    message: active
      ? 'Emergency stop is ACTIVE - no emails will be sent'
      : 'Emergency stop is inactive - emails can be sent',
  });
}

async function handleSetEmergencyStop(request: Request, env: Env): Promise<Response> {
  try {
    const { active } = await request.json<{ active: boolean }>();

    if (typeof active !== 'boolean') {
      return Response.json({ error: 'active must be a boolean' }, { status: 400 });
    }

    await EmailSafety.setEmergencyStop(active, env);

    // Send alert
    await Alerting.sendAlert(
      {
        type: 'system_error',
        severity: active ? 'critical' : 'info',
        title: active ? 'EMERGENCY STOP ACTIVATED' : 'Emergency Stop Deactivated',
        message: active
          ? 'All email sending has been halted. No automated emails will be sent until deactivated.'
          : 'Email sending has been resumed.',
        context: {
          activatedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
      env
    );

    return Response.json({
      success: true,
      emergencyStop: active,
      message: active
        ? 'Emergency stop ACTIVATED - all email sending halted'
        : 'Emergency stop deactivated - email sending resumed',
    });
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

async function handleGetBlockedSends(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const blockedSends = await EmailSafety.getRecentBlockedSends(limit, env);

  return Response.json({
    blockedSends,
    count: blockedSends.length,
    limit,
  });
}

async function handleClearInboxes(env: Env): Promise<Response> {
  const inboxState = env.INBOX_STATE.get(env.INBOX_STATE.idFromName('pool'));
  const response = await inboxState.fetch(new Request('http://do/clear', { method: 'POST' }));
  const result = await response.json();
  return Response.json(result);
}

async function handleRemoveInbox(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ inboxId: string }>();
  const inboxState = env.INBOX_STATE.get(env.INBOX_STATE.idFromName('pool'));
  const response = await inboxState.fetch(
    new Request('http://do/remove', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
  const result = await response.json();
  return Response.json(result);
}

async function handleClearWarmup(env: Env): Promise<Response> {
  const warmupCounter = env.WARMUP_COUNTER.get(env.WARMUP_COUNTER.idFromName('global'));
  const response = await warmupCounter.fetch(new Request('http://do/clear', { method: 'POST' }));
  const result = await response.json();
  return Response.json(result);
}

// ==================
// DELIVERABILITY HANDLERS
// ==================

async function handleDeliverabilityStatus(env: Env): Promise<Response> {
  const status = await SpamChecker.getDeliverabilityStatus(env);
  return Response.json({
    success: true,
    data: status,
  });
}

async function handleBounceRates(env: Env): Promise<Response> {
  const bounceRates = await SpamChecker.checkAllBounceRates(env);
  return Response.json({
    success: true,
    data: bounceRates,
    summary: {
      total: bounceRates.length,
      healthy: bounceRates.filter(r => r.status === 'healthy').length,
      warning: bounceRates.filter(r => r.status === 'warning').length,
      critical: bounceRates.filter(r => r.status === 'critical').length,
    },
  });
}

async function handleAutoPauseInboxes(env: Env): Promise<Response> {
  const result = await SpamChecker.autoPauseUnhealthyInboxes(env);

  // Send alert if any inboxes were paused
  if (result.paused.length > 0) {
    await Alerting.alertWarning(
      'email_sending_failure',
      'Inboxes Auto-Paused',
      `${result.paused.length} inbox(es) paused due to high bounce rates: ${result.paused.join(', ')}`,
      env,
      { paused: result.paused }
    );
  }

  return Response.json({
    success: true,
    data: result,
    message: result.paused.length > 0
      ? `Paused ${result.paused.length} inbox(es) with high bounce rates`
      : 'All inboxes healthy',
  });
}

async function handleCleanList(env: Env): Promise<Response> {
  const result = await SpamChecker.cleanProspectList(env);
  return Response.json({
    success: true,
    data: result,
    message: `Cleaned ${result.removed} prospects from list`,
  });
}

async function handleSpamCheck(request: Request): Promise<Response> {
  try {
    const { subject, body } = await request.json<{ subject: string; body: string }>();

    if (!subject || !body) {
      return Response.json({ error: 'subject and body are required' }, { status: 400 });
    }

    const result = SpamChecker.calculateSpamScore({ subject, body });

    return Response.json({
      success: true,
      data: result,
      assessment: SpamChecker.getSpamAssessment({ subject, body }),
    });
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

// ==================
// BOUNCE HANDLERS
// ==================

async function handleBounceStats(env: Env): Promise<Response> {
  const stats = await BounceHandler.getBounceStats(env);
  return Response.json({
    success: true,
    data: stats,
  });
}

async function handleBounceCheck(request: Request, env: Env): Promise<Response> {
  try {
    const { email } = await request.json<{ email: string }>();

    if (!email) {
      return Response.json({ error: 'email is required' }, { status: 400 });
    }

    const result = await BounceHandler.isEmailBlocked(email, env);

    return Response.json({
      success: true,
      email,
      blocked: result.blocked,
      reason: result.reason,
    });
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

async function handleRecordBounce(request: Request, env: Env): Promise<Response> {
  try {
    const bounce = await request.json<{
      email: string;
      type: 'hard' | 'soft' | 'block' | 'complaint' | 'unknown';
      reason: string;
      originalMessageId?: string;
      smtpCode?: number;
    }>();

    if (!bounce.email || !bounce.type || !bounce.reason) {
      return Response.json({ error: 'email, type, and reason are required' }, { status: 400 });
    }

    await BounceHandler.recordBounce(bounce, env);

    return Response.json({
      success: true,
      message: `Recorded ${bounce.type} bounce for ${bounce.email}`,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to record bounce',
    }, { status: 500 });
  }
}

async function handleRecordComplaint(request: Request, env: Env): Promise<Response> {
  try {
    const { email, source, originalMessageId } = await request.json<{
      email: string;
      source: 'feedback_loop' | 'manual' | 'reply' | 'webhook';
      originalMessageId?: string;
    }>();

    if (!email || !source) {
      return Response.json({ error: 'email and source are required' }, { status: 400 });
    }

    await BounceHandler.recordComplaint(email, source, env, originalMessageId);

    return Response.json({
      success: true,
      message: `Recorded spam complaint for ${email}`,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Failed to record complaint',
    }, { status: 500 });
  }
}

// ==================
// REPLY APPROVAL HANDLERS
// ==================

/**
 * Handle one-click reply approval
 * GET /api/reply/approve?token=xxx
 */
async function handleReplyApproval(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(generateApprovalPage({
      success: false,
      error: 'Missing approval token',
    }), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Validate token
  const approval = await ReplyHandler.validateApprovalToken(token, env);

  if (!approval) {
    return new Response(generateApprovalPage({
      success: false,
      error: 'Invalid or expired approval token',
    }), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Check if already sent
  if (approval.sent) {
    return new Response(generateApprovalPage({
      success: true,
      alreadySent: true,
      sentAt: approval.sentAt,
      prospectName: approval.prospectName,
      recipientEmail: approval.recipientEmail,
    }), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Send the reply via Resend
  try {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }

    // Get the original reply to construct proper subject
    const originalReply = await env.DB.prepare(`
      SELECT subject, from_email FROM emails WHERE id = ?
    `).bind(approval.replyId).first<{ subject: string; from_email: string }>();

    const subject = originalReply?.subject?.startsWith('Re:')
      ? originalReply.subject
      : `Re: ${originalReply?.subject || 'Your inquiry'}`;

    // Send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Edd <edd@updates.jengu.ai>',
        to: [approval.recipientEmail],
        subject,
        text: approval.suggestedReply,
        reply_to: 'edd@jengu.ai',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${response.status} - ${error}`);
    }

    const data = await response.json<{ id: string }>();

    // Mark approval as sent
    await ReplyHandler.markApprovalUsed(token, env);

    // Store the outbound reply in emails table
    const replyEmailId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO emails (
        id, prospect_id, subject, body,
        to_email, from_email, message_id,
        direction, email_type, status, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'outbound', 'reply', 'sent', datetime('now'), datetime('now'))
    `).bind(
      replyEmailId,
      approval.prospectId,
      subject,
      approval.suggestedReply,
      approval.recipientEmail,
      'edd@updates.jengu.ai',
      data.id
    ).run();

    // Update prospect
    await env.DB.prepare(`
      UPDATE prospects
      SET last_contacted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(approval.prospectId).run();

    console.log(`✓ Reply sent to ${approval.recipientEmail} (${approval.prospectName})`);

    return new Response(generateApprovalPage({
      success: true,
      prospectName: approval.prospectName,
      recipientEmail: approval.recipientEmail,
      messageId: data.id,
    }), {
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (error) {
    console.error('Failed to send approved reply:', error);
    return new Response(generateApprovalPage({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
      prospectName: approval.prospectName,
    }), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

/**
 * Get pending reply approvals
 */
async function handlePendingReplies(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

  const result = await env.DB.prepare(`
    SELECT ra.*, p.name as hotel_name, p.city, p.country
    FROM reply_approvals ra
    JOIN prospects p ON p.id = ra.prospect_id
    WHERE ra.sent = 0 AND ra.expires_at > datetime('now')
    ORDER BY ra.created_at DESC
    LIMIT ?
  `).bind(limit).all<{
    id: string;
    reply_id: string;
    prospect_id: string;
    suggested_reply: string;
    recipient_email: string;
    prospect_name: string;
    expires_at: string;
    created_at: string;
    hotel_name: string;
    city: string;
    country: string;
  }>();

  return Response.json({
    success: true,
    approvals: result.results?.map(r => ({
      token: r.id,
      replyId: r.reply_id,
      prospectId: r.prospect_id,
      prospectName: r.prospect_name,
      hotel: `${r.hotel_name} (${r.city}${r.country ? ', ' + r.country : ''})`,
      recipientEmail: r.recipient_email,
      suggestedReply: r.suggested_reply,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      approveUrl: `https://jengu-crm.edd-181.workers.dev/api/reply/approve?token=${r.id}`,
    })) || [],
    count: result.results?.length || 0,
  });
}

/**
 * Generate HTML page for approval result
 */
function generateApprovalPage(options: {
  success: boolean;
  error?: string;
  alreadySent?: boolean;
  sentAt?: string;
  prospectName?: string;
  recipientEmail?: string;
  messageId?: string;
}): string {
  const { success, error, alreadySent, sentAt, prospectName, recipientEmail, messageId } = options;

  const statusEmoji = success ? (alreadySent ? '⏰' : '✅') : '❌';
  const statusColor = success ? '#10B981' : '#EF4444';
  const statusText = success
    ? (alreadySent ? 'Already Sent' : 'Reply Sent!')
    : 'Failed to Send';

  let message = '';
  if (success && alreadySent) {
    message = `This reply was already sent on ${sentAt ? new Date(sentAt).toLocaleString() : 'a previous click'}.`;
  } else if (success) {
    message = `Your reply to ${prospectName || 'the prospect'} at ${recipientEmail} has been sent successfully.`;
  } else {
    message = error || 'An unexpected error occurred.';
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${statusText} - Jengu CRM</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .emoji {
      font-size: 64px;
      margin-bottom: 24px;
    }
    .status {
      font-size: 28px;
      font-weight: 700;
      color: ${statusColor};
      margin-bottom: 16px;
    }
    .message {
      font-size: 16px;
      color: #4B5563;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .details {
      background: #F3F4F6;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #E5E7EB;
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #6B7280; font-size: 14px; }
    .detail-value { color: #111827; font-size: 14px; font-weight: 500; }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: #3B82F6;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      transition: background 0.2s;
    }
    .btn:hover { background: #2563EB; }
    .footer {
      margin-top: 32px;
      font-size: 12px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${statusEmoji}</div>
    <div class="status">${statusText}</div>
    <p class="message">${message}</p>
    ${success && !alreadySent ? `
    <div class="details">
      <div class="detail-row">
        <span class="detail-label">To</span>
        <span class="detail-value">${recipientEmail || '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Prospect</span>
        <span class="detail-value">${prospectName || '-'}</span>
      </div>
      ${messageId ? `
      <div class="detail-row">
        <span class="detail-label">Message ID</span>
        <span class="detail-value" style="font-family: monospace; font-size: 12px;">${messageId.slice(0, 20)}...</span>
      </div>
      ` : ''}
    </div>
    ` : ''}
    <a href="https://crm.jengu.ai" class="btn">Go to CRM Dashboard</a>
    <div class="footer">Jengu CRM • Automated Outreach</div>
  </div>
</body>
</html>`;
}
