/**
 * Campaign Sequences Worker
 * Handles campaign sequences and lead assignment
 */

import { Env } from '../types';

export interface CampaignSequence {
  id: string;
  campaignId: string;
  stepNumber: number;
  delayDays: number;
  delayHours: number;
  variantASubject: string;
  variantABody: string;
  variantBSubject: string | null;
  variantBBody: string | null;
  variantSplit: number;
  sentCount: number;
  variantASent: number;
  variantBSent: number;
  openCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLead {
  id: string;
  campaignId: string;
  prospectId: string;
  mailboxId: string | null;
  currentStep: number;
  status: 'active' | 'paused' | 'completed' | 'replied' | 'bounced' | 'unsubscribed';
  assignedVariant: 'a' | 'b';
  lastEmailAt: string | null;
  nextEmailAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  prospectName?: string;
  prospectEmail?: string;
}

/**
 * Handle campaign API requests
 */
export async function handleCampaigns(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // GET /api/campaigns - List campaigns
  if (path === '/api/campaigns' && request.method === 'GET') {
    return listCampaigns(env);
  }

  // Campaign sequences
  const sequenceMatch = path.match(/^\/api\/campaigns\/([^/]+)\/sequences$/);
  if (sequenceMatch) {
    const campaignId = sequenceMatch[1];
    if (request.method === 'GET') {
      return listSequences(campaignId, env);
    }
    if (request.method === 'POST') {
      return createSequence(campaignId, request, env);
    }
  }

  // Single sequence
  const singleSequenceMatch = path.match(/^\/api\/campaigns\/([^/]+)\/sequences\/([^/]+)$/);
  if (singleSequenceMatch) {
    const [, campaignId, sequenceId] = singleSequenceMatch;
    if (request.method === 'PUT') {
      return updateSequence(campaignId, sequenceId, request, env);
    }
    if (request.method === 'DELETE') {
      return deleteSequence(campaignId, sequenceId, env);
    }
  }

  // Campaign leads
  const leadsMatch = path.match(/^\/api\/campaigns\/([^/]+)\/leads$/);
  if (leadsMatch) {
    const campaignId = leadsMatch[1];
    if (request.method === 'GET') {
      return listCampaignLeads(campaignId, url, env);
    }
    if (request.method === 'POST') {
      return addLeadsToCampaign(campaignId, request, env);
    }
  }

  // Single lead
  const singleLeadMatch = path.match(/^\/api\/campaigns\/([^/]+)\/leads\/([^/]+)$/);
  if (singleLeadMatch) {
    const [, campaignId, leadId] = singleLeadMatch;
    if (request.method === 'PUT') {
      return updateCampaignLead(campaignId, leadId, request, env);
    }
    if (request.method === 'DELETE') {
      return removeCampaignLead(campaignId, leadId, env);
    }
  }

  return new Response('Not Found', { status: 404 });
}

/**
 * List all campaigns with sequence count
 */
async function listCampaigns(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM campaign_sequences WHERE campaign_id = c.id) as sequence_count,
      (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = c.id AND status = 'active') as active_leads
    FROM campaigns c
    ORDER BY c.created_at DESC
  `).all();

  return Response.json({
    campaigns: result.results || [],
    count: result.results?.length || 0,
  });
}

/**
 * List sequences for a campaign
 */
async function listSequences(campaignId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM campaign_sequences
    WHERE campaign_id = ?
    ORDER BY step_number ASC
  `).bind(campaignId).all();

  return Response.json({
    sequences: (result.results || []).map(rowToSequence),
    count: result.results?.length || 0,
  });
}

/**
 * Create a new sequence step
 */
async function createSequence(
  campaignId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<{
    stepNumber: number;
    delayDays?: number;
    delayHours?: number;
    variantASubject: string;
    variantABody: string;
    variantBSubject?: string;
    variantBBody?: string;
    variantSplit?: number;
  }>();

  const id = `seq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  await env.DB.prepare(`
    INSERT INTO campaign_sequences (
      id, campaign_id, step_number, delay_days, delay_hours,
      variant_a_subject, variant_a_body, variant_b_subject, variant_b_body, variant_split
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    campaignId,
    body.stepNumber,
    body.delayDays || 0,
    body.delayHours || 0,
    body.variantASubject,
    body.variantABody,
    body.variantBSubject || null,
    body.variantBBody || null,
    body.variantSplit || 50
  ).run();

  // Update campaign sequence_count
  await env.DB.prepare(`
    UPDATE campaigns SET sequence_count = (
      SELECT COUNT(*) FROM campaign_sequences WHERE campaign_id = ?
    ) WHERE id = ?
  `).bind(campaignId, campaignId).run();

  return Response.json({ success: true, id });
}

/**
 * Update a sequence step
 */
async function updateSequence(
  campaignId: string,
  sequenceId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<Partial<{
    stepNumber: number;
    delayDays: number;
    delayHours: number;
    variantASubject: string;
    variantABody: string;
    variantBSubject: string | null;
    variantBBody: string | null;
    variantSplit: number;
  }>>();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.stepNumber !== undefined) {
    updates.push('step_number = ?');
    values.push(body.stepNumber);
  }
  if (body.delayDays !== undefined) {
    updates.push('delay_days = ?');
    values.push(body.delayDays);
  }
  if (body.delayHours !== undefined) {
    updates.push('delay_hours = ?');
    values.push(body.delayHours);
  }
  if (body.variantASubject !== undefined) {
    updates.push('variant_a_subject = ?');
    values.push(body.variantASubject);
  }
  if (body.variantABody !== undefined) {
    updates.push('variant_a_body = ?');
    values.push(body.variantABody);
  }
  if (body.variantBSubject !== undefined) {
    updates.push('variant_b_subject = ?');
    values.push(body.variantBSubject);
  }
  if (body.variantBBody !== undefined) {
    updates.push('variant_b_body = ?');
    values.push(body.variantBBody);
  }
  if (body.variantSplit !== undefined) {
    updates.push('variant_split = ?');
    values.push(body.variantSplit);
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");

  await env.DB.prepare(`
    UPDATE campaign_sequences
    SET ${updates.join(', ')}
    WHERE id = ? AND campaign_id = ?
  `).bind(...values, sequenceId, campaignId).run();

  return Response.json({ success: true });
}

/**
 * Delete a sequence step
 */
async function deleteSequence(
  campaignId: string,
  sequenceId: string,
  env: Env
): Promise<Response> {
  await env.DB.prepare(`
    DELETE FROM campaign_sequences WHERE id = ? AND campaign_id = ?
  `).bind(sequenceId, campaignId).run();

  // Update campaign sequence_count
  await env.DB.prepare(`
    UPDATE campaigns SET sequence_count = (
      SELECT COUNT(*) FROM campaign_sequences WHERE campaign_id = ?
    ) WHERE id = ?
  `).bind(campaignId, campaignId).run();

  return Response.json({ success: true });
}

/**
 * List leads assigned to a campaign
 */
async function listCampaignLeads(
  campaignId: string,
  url: URL,
  env: Env
): Promise<Response> {
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  let query = `
    SELECT cl.*, p.name as prospect_name, p.contact_email as prospect_email
    FROM campaign_leads cl
    LEFT JOIN prospects p ON p.id = cl.prospect_id
    WHERE cl.campaign_id = ?
  `;
  const params: unknown[] = [campaignId];

  if (status) {
    query += ' AND cl.status = ?';
    params.push(status);
  }

  query += ' ORDER BY cl.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...params).all();

  // Get total count
  const countResult = await env.DB.prepare(`
    SELECT COUNT(*) as total FROM campaign_leads WHERE campaign_id = ?
  `).bind(campaignId).first<{ total: number }>();

  return Response.json({
    leads: (result.results || []).map(rowToLead),
    count: result.results?.length || 0,
    total: countResult?.total || 0,
  });
}

/**
 * Add leads to a campaign
 */
async function addLeadsToCampaign(
  campaignId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<{
    prospectIds: string[];
    mailboxId?: string;
    variant?: 'a' | 'b' | 'random';
  }>();

  const added: string[] = [];
  const skipped: string[] = [];

  for (const prospectId of body.prospectIds) {
    try {
      const id = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Determine variant
      let variant: 'a' | 'b' = 'a';
      if (body.variant === 'b') {
        variant = 'b';
      } else if (body.variant === 'random') {
        variant = Math.random() < 0.5 ? 'a' : 'b';
      }

      // Get first sequence step delay
      const firstStep = await env.DB.prepare(`
        SELECT delay_days, delay_hours FROM campaign_sequences
        WHERE campaign_id = ? ORDER BY step_number ASC LIMIT 1
      `).bind(campaignId).first<{ delay_days: number; delay_hours: number }>();

      const delayMs = ((firstStep?.delay_days || 0) * 24 * 60 + (firstStep?.delay_hours || 0)) * 60 * 1000;
      const nextEmailAt = new Date(Date.now() + delayMs).toISOString();

      await env.DB.prepare(`
        INSERT INTO campaign_leads (id, campaign_id, prospect_id, mailbox_id, assigned_variant, next_email_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, campaignId, prospectId, body.mailboxId || null, variant, nextEmailAt).run();

      added.push(prospectId);
    } catch {
      skipped.push(prospectId);
    }
  }

  // Update campaign leads_count
  await env.DB.prepare(`
    UPDATE campaigns SET leads_count = (
      SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = ?
    ) WHERE id = ?
  `).bind(campaignId, campaignId).run();

  return Response.json({
    success: true,
    added: added.length,
    skipped: skipped.length,
  });
}

/**
 * Update a campaign lead
 */
async function updateCampaignLead(
  campaignId: string,
  leadId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<Partial<{
    status: string;
    currentStep: number;
    mailboxId: string | null;
    nextEmailAt: string | null;
  }>>();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.status !== undefined) {
    updates.push('status = ?');
    values.push(body.status);
  }
  if (body.currentStep !== undefined) {
    updates.push('current_step = ?');
    values.push(body.currentStep);
  }
  if (body.mailboxId !== undefined) {
    updates.push('mailbox_id = ?');
    values.push(body.mailboxId);
  }
  if (body.nextEmailAt !== undefined) {
    updates.push('next_email_at = ?');
    values.push(body.nextEmailAt);
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");

  await env.DB.prepare(`
    UPDATE campaign_leads
    SET ${updates.join(', ')}
    WHERE id = ? AND campaign_id = ?
  `).bind(...values, leadId, campaignId).run();

  return Response.json({ success: true });
}

/**
 * Remove a lead from a campaign
 */
async function removeCampaignLead(
  campaignId: string,
  leadId: string,
  env: Env
): Promise<Response> {
  await env.DB.prepare(`
    DELETE FROM campaign_leads WHERE id = ? AND campaign_id = ?
  `).bind(leadId, campaignId).run();

  // Update campaign leads_count
  await env.DB.prepare(`
    UPDATE campaigns SET leads_count = (
      SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = ?
    ) WHERE id = ?
  `).bind(campaignId, campaignId).run();

  return Response.json({ success: true });
}

/**
 * Convert database row to CampaignSequence
 */
function rowToSequence(row: Record<string, unknown>): CampaignSequence {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    stepNumber: row.step_number as number,
    delayDays: row.delay_days as number,
    delayHours: row.delay_hours as number,
    variantASubject: row.variant_a_subject as string,
    variantABody: row.variant_a_body as string,
    variantBSubject: row.variant_b_subject as string | null,
    variantBBody: row.variant_b_body as string | null,
    variantSplit: row.variant_split as number,
    sentCount: row.sent_count as number,
    variantASent: row.variant_a_sent as number,
    variantBSent: row.variant_b_sent as number,
    openCount: row.open_count as number,
    replyCount: row.reply_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Convert database row to CampaignLead
 */
function rowToLead(row: Record<string, unknown>): CampaignLead {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    prospectId: row.prospect_id as string,
    mailboxId: row.mailbox_id as string | null,
    currentStep: row.current_step as number,
    status: row.status as CampaignLead['status'],
    assignedVariant: row.assigned_variant as 'a' | 'b',
    lastEmailAt: row.last_email_at as string | null,
    nextEmailAt: row.next_email_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    prospectName: row.prospect_name as string | undefined,
    prospectEmail: row.prospect_email as string | undefined,
  };
}
