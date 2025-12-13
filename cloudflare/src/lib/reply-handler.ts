/**
 * Reply Handler
 *
 * Processes incoming replies from prospects:
 * 1. Filters auto-replies and OOO messages
 * 2. Matches replies to prospects
 * 3. Analyzes sentiment and intent
 * 4. Generates suggested replies for positive responses
 * 5. Sends notifications to edd@jengu.ai with one-click approval
 *
 * Key requirement: Never miss a positive reply - always notify Edd.
 */

import { Env } from '../types';
import { loggers } from './logger';
import { generateTextWithGrok } from './ai-gateway';
import * as BounceHandler from './bounce-handler';

const logger = loggers.api;

// ==================
// TYPES
// ==================

export interface ParsedEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
  receivedAt?: string;
}

export interface ReplyAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  intent: 'meeting_request' | 'interested' | 'needs_info' | 'not_interested' | 'delegation' | 'out_of_office' | 'unclear';
  urgency: 'high' | 'medium' | 'low';
  suggestedAction: string;
  extractedData?: {
    meetingTimes?: string[];
    alternateContact?: { name: string; email: string };
    objection?: string;
  };
}

export interface ProspectMatch {
  prospectId: string;
  emailId: string;
  campaignId?: string;
  prospectName: string;
  prospectCity: string;
  prospectCountry?: string;
}

// ==================
// AUTO-REPLY DETECTION
// ==================

/**
 * Check if email is an auto-reply (OOO, vacation, etc.)
 */
export function isAutoReply(email: ParsedEmail): boolean {
  // Check headers
  const headers = email.headers || {};
  if (headers['auto-submitted'] === 'auto-replied') return true;
  if (headers['x-auto-response-suppress']) return true;
  if (headers['precedence'] === 'auto_reply') return true;
  if (headers['x-autoreply'] || headers['x-autorespond']) return true;

  // Check subject patterns
  const autoSubjects = [
    /^(re:\s*)?out of office/i,
    /^(re:\s*)?automatic reply/i,
    /^(re:\s*)?auto:/i,
    /^(re:\s*)?away from/i,
    /^(re:\s*)?on vacation/i,
    /^(re:\s*)?i('m| am) (out|away)/i,
    /^(re:\s*)?automat/i,
    /^(re:\s*)?\[auto\]/i,
  ];

  if (autoSubjects.some(p => p.test(email.subject))) return true;

  // Check body for OOO patterns (first 500 chars)
  const bodyStart = email.body.slice(0, 500).toLowerCase();
  const oooPatterns = [
    /i am (currently )?(out of (the )?office|away|on vacation)/i,
    /i will (be )?(out of (the )?office|away|on vacation)/i,
    /thank you for your (email|message).*i am (currently )?away/i,
    /automatic.*reply/i,
    /this is an automated/i,
    /i will respond when i return/i,
    /currently unavailable/i,
    /limited access to email/i,
  ];

  if (oooPatterns.some(p => p.test(bodyStart))) return true;

  return false;
}

// ==================
// REPLY MATCHING
// ==================

/**
 * Match incoming reply to a prospect
 */
export async function matchReplyToProspect(
  email: ParsedEmail,
  env: Env
): Promise<ProspectMatch | null> {
  // Method 1: Match by In-Reply-To header (most reliable)
  if (email.inReplyTo) {
    const match = await env.DB.prepare(`
      SELECT e.prospect_id, e.id as email_id, e.campaign_id,
             p.name as prospect_name, p.city as prospect_city, p.country as prospect_country
      FROM emails e
      JOIN prospects p ON p.id = e.prospect_id
      WHERE e.message_id = ?
    `).bind(email.inReplyTo).first<{
      prospect_id: string;
      email_id: string;
      campaign_id: string;
      prospect_name: string;
      prospect_city: string;
      prospect_country: string;
    }>();

    if (match) {
      return {
        prospectId: match.prospect_id,
        emailId: match.email_id,
        campaignId: match.campaign_id,
        prospectName: match.prospect_name,
        prospectCity: match.prospect_city,
        prospectCountry: match.prospect_country,
      };
    }
  }

  // Method 2: Match by References header
  if (email.references?.length) {
    for (const ref of email.references) {
      const match = await env.DB.prepare(`
        SELECT e.prospect_id, e.id as email_id, e.campaign_id,
               p.name as prospect_name, p.city as prospect_city, p.country as prospect_country
        FROM emails e
        JOIN prospects p ON p.id = e.prospect_id
        WHERE e.message_id = ?
      `).bind(ref).first<{
        prospect_id: string;
        email_id: string;
        campaign_id: string;
        prospect_name: string;
        prospect_city: string;
        prospect_country: string;
      }>();

      if (match) {
        return {
          prospectId: match.prospect_id,
          emailId: match.email_id,
          campaignId: match.campaign_id,
          prospectName: match.prospect_name,
          prospectCity: match.prospect_city,
          prospectCountry: match.prospect_country,
        };
      }
    }
  }

  // Method 3: Match by sender email + recent outbound
  const senderMatch = await env.DB.prepare(`
    SELECT p.id as prospect_id, e.id as email_id, e.campaign_id,
           p.name as prospect_name, p.city as prospect_city, p.country as prospect_country
    FROM prospects p
    JOIN emails e ON e.prospect_id = p.id
    WHERE LOWER(p.contact_email) = LOWER(?)
    AND e.direction = 'outbound'
    ORDER BY e.sent_at DESC
    LIMIT 1
  `).bind(email.from).first<{
    prospect_id: string;
    email_id: string;
    campaign_id: string;
    prospect_name: string;
    prospect_city: string;
    prospect_country: string;
  }>();

  if (senderMatch) {
    return {
      prospectId: senderMatch.prospect_id,
      emailId: senderMatch.email_id,
      campaignId: senderMatch.campaign_id,
      prospectName: senderMatch.prospect_name,
      prospectCity: senderMatch.prospect_city,
      prospectCountry: senderMatch.prospect_country,
    };
  }

  return null;
}

// ==================
// REPLY ANALYSIS
// ==================

/**
 * Quick keyword-based classification
 */
function quickClassify(body: string): { result: ReplyAnalysis; confidence: number } {
  // Meeting request patterns - HIGH PRIORITY
  if (/let'?s (schedule|set up|book|have) a (call|meeting|chat)/i.test(body) ||
      /free (on|this|next|at|tomorrow|monday|tuesday|wednesday|thursday|friday)/i.test(body) ||
      /how about|works for me|available (at|on|this)/i.test(body) ||
      /calendly|zoom|teams|google meet/i.test(body) ||
      /what time|when (can|would|are)/i.test(body)) {
    return {
      result: {
        sentiment: 'positive',
        intent: 'meeting_request',
        urgency: 'high',
        suggestedAction: 'Schedule meeting immediately',
      },
      confidence: 0.9,
    };
  }

  // Interested patterns
  if (/interested|tell me more|sounds (good|interesting|great)|like to (learn|know|hear)/i.test(body) ||
      /send me (more |some )?info/i.test(body) ||
      /what (exactly|specifically) do you/i.test(body) ||
      /how does (it|this) work/i.test(body)) {
    return {
      result: {
        sentiment: 'positive',
        intent: 'interested',
        urgency: 'medium',
        suggestedAction: 'Send more information and suggest call',
      },
      confidence: 0.85,
    };
  }

  // Delegation patterns
  if (/forward(ed|ing)? (this|your|it) to/i.test(body) ||
      /cc'?d|copied|looping in/i.test(body) ||
      /right person (is|would be)|you should (contact|reach out to|speak with)/i.test(body) ||
      /not the (right|best) person/i.test(body)) {
    return {
      result: {
        sentiment: 'neutral',
        intent: 'delegation',
        urgency: 'medium',
        suggestedAction: 'Note delegation and wait for forwarded contact',
      },
      confidence: 0.8,
    };
  }

  // Needs info patterns
  if (/what (is|are|do)|how (does|do|much|long)|can you (explain|tell me)/i.test(body) ||
      /pricing|cost|price/i.test(body) ||
      /\?/.test(body) && body.length < 200) {
    return {
      result: {
        sentiment: 'neutral',
        intent: 'needs_info',
        urgency: 'medium',
        suggestedAction: 'Answer questions and move toward call',
      },
      confidence: 0.7,
    };
  }

  // Not interested patterns - be careful to identify clearly
  if (/not interested|no thank|no thanks|remove me|stop (emailing|contacting)|unsubscribe/i.test(body) ||
      /don'?t (contact|email|reach out)/i.test(body) ||
      /we'?re (all )?set|not (looking|in the market)/i.test(body) ||
      /not a (good )?fit/i.test(body)) {
    return {
      result: {
        sentiment: 'negative',
        intent: 'not_interested',
        urgency: 'low',
        suggestedAction: 'Mark as not interested, stop sequence',
      },
      confidence: 0.9,
    };
  }

  // Default - needs human review
  return {
    result: {
      sentiment: 'neutral',
      intent: 'unclear',
      urgency: 'medium',
      suggestedAction: 'Review manually and respond appropriately',
    },
    confidence: 0.3,
  };
}

/**
 * Analyze reply content using AI when keyword analysis isn't confident
 */
export async function analyzeReply(body: string, env: Env): Promise<ReplyAnalysis> {
  // Quick keyword-based classification first
  const quickAnalysis = quickClassify(body);

  // If confident in quick analysis, use it
  if (quickAnalysis.confidence > 0.75) {
    logger.info('Reply classified by keywords', {
      intent: quickAnalysis.result.intent,
      confidence: quickAnalysis.confidence,
    });
    return quickAnalysis.result;
  }

  // Use AI for nuanced analysis
  try {
    const prompt = `Analyze this email reply from a hotel prospect. Classify it briefly.

Email:
${body.slice(0, 1000)}

Respond ONLY with JSON (no markdown, no explanation):
{
  "sentiment": "positive" or "neutral" or "negative",
  "intent": "meeting_request" or "interested" or "needs_info" or "not_interested" or "delegation" or "unclear",
  "urgency": "high" or "medium" or "low",
  "suggestedAction": "one sentence action"
}`;

    const response = await generateTextWithGrok(prompt, env);
    const parsed = JSON.parse(response.trim());

    return {
      sentiment: parsed.sentiment || 'neutral',
      intent: parsed.intent || 'unclear',
      urgency: parsed.urgency || 'medium',
      suggestedAction: parsed.suggestedAction || 'Review manually',
    };
  } catch (error) {
    logger.warn('AI reply analysis failed, using keyword analysis', { error });
    return quickAnalysis.result;
  }
}

// ==================
// SUGGESTED REPLY GENERATION
// ==================

/**
 * Generate a pre-made reply for Edd to approve
 */
export async function generateSuggestedReply(
  originalReply: ParsedEmail,
  analysis: ReplyAnalysis,
  match: ProspectMatch,
  env: Env
): Promise<string> {
  const firstName = match.prospectName.split(' ')[0];

  // Template-based responses for common intents (fast and consistent)
  if (analysis.intent === 'meeting_request') {
    return `Hey ${firstName},

Great to hear from you! I'd love to set up a call.

How does one of these work for you?
- Tomorrow at 10am or 2pm
- Wednesday at 11am or 3pm
- Or let me know what works better for you

It'll be a quick 15-20 min chat - just to see if we can genuinely help with guest messaging at ${match.prospectName}.

Edd`;
  }

  if (analysis.intent === 'interested') {
    return `Hey ${firstName},

Thanks for getting back to me!

Happy to share more. The quick version: we help hotels automate guest messaging (WhatsApp, SMS, email) so your team spends less time on routine questions and more time on what matters.

Would a 15-min call be useful? I can show you a few examples from hotels similar to yours.

No pressure either way - just let me know.

Edd`;
  }

  if (analysis.intent === 'needs_info') {
    return `Hey ${firstName},

Great question! Happy to explain more.

In short, Jengu handles the repetitive guest messages - check-in info, directions, WiFi passwords, restaurant recs, etc. Your team gets pinged only when it's something that actually needs a human.

Most hotels see their front desk save 1-2 hours daily. Happy to show you how it works if useful.

Let me know what questions you have.

Edd`;
  }

  if (analysis.intent === 'delegation') {
    return `Hey ${firstName},

Thanks for forwarding this along - really appreciate it!

Just a quick note for whoever handles operations: we help hotels automate guest messaging so the front desk spends less time on routine questions.

Happy to do a quick 15-min call to see if it could help. No pressure either way.

Edd`;
  }

  // For unclear or other intents, use AI to generate contextual reply
  try {
    const prompt = `Generate a brief, friendly reply to this email. Keep it conversational.
The prospect's name is ${firstName} from ${match.prospectName} (${match.prospectCity}).

Their message:
${originalReply.body.slice(0, 500)}

Reply rules:
- 3-5 sentences max
- Sound like a real person (not salesy)
- End with just "Edd"
- Try to move toward a call/meeting if appropriate
- Be helpful and genuine

Just output the reply text, no explanation.`;

    return await generateTextWithGrok(prompt, env);
  } catch {
    return `Hey ${firstName},

Thanks for getting back to me! Would love to chat more about this.

What's your availability like this week for a quick 15-min call?

Edd`;
  }
}

// ==================
// REPLY PROCESSING
// ==================

/**
 * Save reply to database
 */
export async function saveReply(
  email: ParsedEmail,
  match: ProspectMatch,
  analysis: ReplyAnalysis,
  env: Env
): Promise<string> {
  const replyId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO emails (
      id, prospect_id, campaign_id, subject, body,
      to_email, from_email, message_id,
      direction, email_type, status,
      sentiment, intent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'received', ?, ?, datetime('now'))
  `).bind(
    replyId,
    match.prospectId,
    match.campaignId || null,
    email.subject,
    email.body,
    email.to,
    email.from,
    email.messageId,
    analysis.sentiment,
    analysis.intent
  ).run();

  return replyId;
}

/**
 * Update prospect status on reply
 */
export async function updateProspectOnReply(
  prospectId: string,
  analysis: ReplyAnalysis,
  env: Env
): Promise<void> {
  const stageMapping: Record<string, string | null> = {
    'meeting_request': 'meeting',
    'interested': 'engaged',
    'needs_info': 'engaged',
    'delegation': null, // Don't change stage
    'not_interested': 'lost',
    'out_of_office': null, // Don't change stage
    'unclear': 'engaged',
  };

  const newStage = stageMapping[analysis.intent];

  // Calculate score boost
  let scoreBoost = 0;
  if (analysis.sentiment === 'positive') scoreBoost = 20;
  else if (analysis.sentiment === 'neutral' && analysis.intent !== 'not_interested') scoreBoost = 10;

  if (newStage) {
    await env.DB.prepare(`
      UPDATE prospects
      SET stage = ?,
          score = score + ?,
          last_replied_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(newStage, scoreBoost, prospectId).run();
  } else {
    await env.DB.prepare(`
      UPDATE prospects
      SET score = score + ?,
          last_replied_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(scoreBoost, prospectId).run();
  }

  logger.info('Prospect updated on reply', {
    prospectId,
    newStage,
    scoreBoost,
    intent: analysis.intent,
  });
}

/**
 * Stop active sequences for a prospect who replied
 */
export async function stopSequenceForProspect(prospectId: string, env: Env): Promise<void> {
  const result = await env.DB.prepare(`
    UPDATE campaign_leads
    SET status = 'replied', updated_at = datetime('now')
    WHERE prospect_id = ? AND status = 'active'
  `).bind(prospectId).run();

  if (result.meta.changes > 0) {
    logger.info('Stopped sequences for prospect', {
      prospectId,
      sequencesStopped: result.meta.changes,
    });
  }
}

// ==================
// REPLY APPROVAL SYSTEM
// ==================

/**
 * Create approval token for one-click send
 */
export async function createApprovalToken(
  replyId: string,
  prospectId: string,
  suggestedReply: string,
  recipientEmail: string,
  prospectName: string,
  env: Env
): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await env.DB.prepare(`
    INSERT INTO reply_approvals (
      id, reply_id, prospect_id, suggested_reply, recipient_email, prospect_name,
      sent, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
  `).bind(
    token,
    replyId,
    prospectId,
    suggestedReply,
    recipientEmail,
    prospectName,
    expiresAt.toISOString()
  ).run();

  return token;
}

/**
 * Validate approval token
 */
export async function validateApprovalToken(token: string, env: Env): Promise<{
  replyId: string;
  prospectId: string;
  suggestedReply: string;
  recipientEmail: string;
  prospectName: string;
  sent: boolean;
  sentAt?: string;
} | null> {
  const approval = await env.DB.prepare(`
    SELECT reply_id, prospect_id, suggested_reply, recipient_email, prospect_name,
           sent, sent_at, expires_at
    FROM reply_approvals
    WHERE id = ?
  `).bind(token).first<{
    reply_id: string;
    prospect_id: string;
    suggested_reply: string;
    recipient_email: string;
    prospect_name: string;
    sent: number;
    sent_at: string | null;
    expires_at: string;
  }>();

  if (!approval) return null;

  // Check expiry
  if (new Date(approval.expires_at) < new Date()) {
    return null;
  }

  return {
    replyId: approval.reply_id,
    prospectId: approval.prospect_id,
    suggestedReply: approval.suggested_reply,
    recipientEmail: approval.recipient_email,
    prospectName: approval.prospect_name,
    sent: approval.sent === 1,
    sentAt: approval.sent_at || undefined,
  };
}

/**
 * Mark approval token as used
 */
export async function markApprovalUsed(token: string, env: Env): Promise<void> {
  await env.DB.prepare(`
    UPDATE reply_approvals
    SET sent = 1, sent_at = datetime('now')
    WHERE id = ?
  `).bind(token).run();
}

// ==================
// NOTIFICATION
// ==================

/**
 * Send reply notification to edd@jengu.ai
 */
export async function sendReplyNotification(
  email: ParsedEmail,
  analysis: ReplyAnalysis,
  match: ProspectMatch,
  replyId: string,
  suggestedReply: string | null,
  env: Env
): Promise<void> {
  const isPositive = analysis.sentiment === 'positive' ||
                     analysis.intent === 'meeting_request' ||
                     analysis.intent === 'interested';

  // Create approval token for one-click send
  let approvalUrl: string | null = null;
  if (isPositive && suggestedReply) {
    const token = await createApprovalToken(
      replyId,
      match.prospectId,
      suggestedReply,
      email.from,
      match.prospectName,
      env
    );
    approvalUrl = `https://jengu-crm.edd-181.workers.dev/api/reply/approve?token=${token}`;
  }

  const urgencyEmoji: Record<string, string> = {
    'high': '🔥',
    'medium': '📬',
    'low': '📩',
  };

  const intentLabel: Record<string, string> = {
    'meeting_request': '📅 MEETING REQUEST',
    'interested': '✅ INTERESTED',
    'needs_info': '❓ NEEDS INFO',
    'delegation': '➡️ DELEGATED',
    'not_interested': '❌ NOT INTERESTED',
    'out_of_office': '🏖️ OUT OF OFFICE',
    'unclear': '🤔 UNCLEAR',
  };

  let emailBody = `
${urgencyEmoji[analysis.urgency] || '📬'} New Reply from ${match.prospectName}!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${intentLabel[analysis.intent] || analysis.intent.toUpperCase()}
Sentiment: ${analysis.sentiment.toUpperCase()}
From: ${email.from}
Hotel: ${match.prospectName} (${match.prospectCity}${match.prospectCountry ? ', ' + match.prospectCountry : ''})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THEIR MESSAGE:
───────────────
${email.body.slice(0, 800)}
${email.body.length > 800 ? '\n...[truncated]' : ''}

`;

  // Include suggested reply with approval link for positive responses
  if (suggestedReply && approvalUrl) {
    emailBody += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 SUGGESTED REPLY (Click to Send)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${suggestedReply}

───────────────
👆 APPROVE & SEND THIS REPLY:
${approvalUrl}

(Click the link above to send this reply immediately)
───────────────
`;
  }

  emailBody += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUICK ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
View Prospect: https://crm.jengu.ai/prospects/${match.prospectId}
Reply Directly: mailto:${email.from}?subject=Re: ${encodeURIComponent(email.subject)}
`;

  // Send notification email
  const subject = `${urgencyEmoji[analysis.urgency] || '📬'} ${intentLabel[analysis.intent] || analysis.intent} - ${match.prospectName}`;

  // Use fetch to send via worker endpoint or external email service
  // For now, store the notification for pickup
  await env.DB.prepare(`
    INSERT INTO notifications (
      id, type, recipient, subject, body, prospect_id, reply_id, sent, created_at
    ) VALUES (?, 'reply_alert', 'edd@jengu.ai', ?, ?, ?, ?, 0, datetime('now'))
  `).bind(
    crypto.randomUUID(),
    subject,
    emailBody,
    match.prospectId,
    replyId
  ).run();

  logger.info('Reply notification created', {
    prospectName: match.prospectName,
    intent: analysis.intent,
    hasApprovalLink: !!approvalUrl,
  });
}

// ==================
// MAIN PROCESSING
// ==================

/**
 * Process an incoming reply
 */
export async function processReply(
  email: ParsedEmail,
  env: Env
): Promise<{
  processed: boolean;
  prospectId?: string;
  prospectName?: string;
  intent?: string;
  replyId?: string;
  error?: string;
}> {
  try {
    // 1. Check if bounce notification (handled by bounce-handler)
    if (BounceHandler.isBounceNotification(email)) {
      await BounceHandler.processBounceNotification({
        from: email.from,
        subject: email.subject,
        body: email.body,
        messageId: email.messageId,
      }, env);

      return {
        processed: true,
        intent: 'bounce',
      };
    }

    // 2. Check if auto-reply
    if (isAutoReply(email)) {
      logger.info('Auto-reply detected, ignoring', {
        from: email.from,
        subject: email.subject,
      });
      return {
        processed: true,
        intent: 'auto_reply',
      };
    }

    // 3. Match to prospect
    const match = await matchReplyToProspect(email, env);

    if (!match) {
      logger.warn('Could not match reply to prospect', {
        from: email.from,
        subject: email.subject,
      });

      // Still save as unmatched for review
      const orphanId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO emails (
          id, subject, body, to_email, from_email, message_id,
          direction, email_type, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'inbound', 'reply', 'orphan', datetime('now'))
      `).bind(
        orphanId,
        email.subject,
        email.body,
        email.to,
        email.from,
        email.messageId
      ).run();

      return {
        processed: false,
        error: 'Could not match reply to prospect',
        replyId: orphanId,
      };
    }

    // 4. Check for duplicate
    if (email.messageId) {
      const existing = await env.DB.prepare(`
        SELECT id FROM emails WHERE message_id = ?
      `).bind(email.messageId).first();

      if (existing) {
        logger.info('Duplicate reply ignored', { messageId: email.messageId });
        return {
          processed: true,
          prospectId: match.prospectId,
          prospectName: match.prospectName,
          intent: 'duplicate',
        };
      }
    }

    // 5. Analyze reply
    const analysis = await analyzeReply(email.body, env);

    // 6. Save reply
    const replyId = await saveReply(email, match, analysis, env);

    // 7. Update prospect
    await updateProspectOnReply(match.prospectId, analysis, env);

    // 8. Stop sequences
    await stopSequenceForProspect(match.prospectId, env);

    // 9. Generate suggested reply for positive responses
    let suggestedReply: string | null = null;
    if (analysis.sentiment === 'positive' ||
        analysis.intent === 'meeting_request' ||
        analysis.intent === 'interested' ||
        analysis.intent === 'needs_info') {
      suggestedReply = await generateSuggestedReply(email, analysis, match, env);
    }

    // 10. Send notification (for all non-negative replies)
    if (analysis.sentiment !== 'negative') {
      await sendReplyNotification(email, analysis, match, replyId, suggestedReply, env);
    }

    logger.info('Reply processed successfully', {
      prospectId: match.prospectId,
      prospectName: match.prospectName,
      intent: analysis.intent,
      sentiment: analysis.sentiment,
    });

    return {
      processed: true,
      prospectId: match.prospectId,
      prospectName: match.prospectName,
      intent: analysis.intent,
      replyId,
    };

  } catch (error) {
    logger.error('Failed to process reply', error, {
      from: email.from,
      subject: email.subject,
    });

    return {
      processed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
