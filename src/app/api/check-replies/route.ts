import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { sendEmail } from '@/lib/email';
import Anthropic from '@anthropic-ai/sdk';

// Azure credentials for edd@jengu.ai
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';

// Notification email (where to send alerts)
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'edd@jengu.ai';

interface EmailMessage {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  bodyPreview: string;
  body?: string;
  receivedAt: Date;
  inReplyTo?: string;
  conversationId?: string;
}

interface ReplyAnalysis {
  isMeetingRequest: boolean;
  isNotInterested: boolean;
  isPositive: boolean;
  notInterestedReason?: string;
  confidence: number;
}

// Keywords for detecting intent
const MEETING_KEYWORDS = [
  'meet', 'meeting', 'call', 'schedule', 'calendly', 'demo', 'chat',
  'discuss', 'talk', 'connect', 'catch up', 'available', 'free time',
  'book', 'appointment', 'zoom', 'teams', 'google meet', 'let\'s talk',
  'interested in learning more', 'would love to hear', 'tell me more'
];

const NOT_INTERESTED_KEYWORDS = [
  'not interested', 'no thank', 'no thanks', 'unsubscribe', 'remove me',
  'stop emailing', 'don\'t contact', 'not looking', 'not in the market',
  'already have', 'not for us', 'not a good fit', 'pass on this',
  'decline', 'not at this time', 'maybe later', 'not right now'
];

const POSITIVE_KEYWORDS = [
  'sounds interesting', 'tell me more', 'pricing', 'cost', 'how much',
  'features', 'capabilities', 'would like to know', 'curious about',
  'send more info', 'brochure', 'proposal', 'quote'
];

/**
 * Analyze reply content to detect intent
 */
function analyzeReply(subject: string, body: string): ReplyAnalysis {
  const text = `${subject} ${body}`.toLowerCase();

  // Check for meeting request
  const meetingMatches = MEETING_KEYWORDS.filter(kw => text.includes(kw));
  const isMeetingRequest = meetingMatches.length >= 1;

  // Check for not interested
  const notInterestedMatches = NOT_INTERESTED_KEYWORDS.filter(kw => text.includes(kw));
  const isNotInterested = notInterestedMatches.length >= 1;

  // Check for positive response
  const positiveMatches = POSITIVE_KEYWORDS.filter(kw => text.includes(kw));
  const isPositive = positiveMatches.length >= 1 && !isNotInterested;

  // Determine not interested reason
  let notInterestedReason: string | undefined;
  if (isNotInterested) {
    if (text.includes('already have') || text.includes('existing solution')) {
      notInterestedReason = 'competitor';
    } else if (text.includes('budget') || text.includes('cost') || text.includes('expensive')) {
      notInterestedReason = 'budget';
    } else if (text.includes('later') || text.includes('not right now') || text.includes('timing')) {
      notInterestedReason = 'timing';
    } else if (text.includes('wrong person') || text.includes('not my department')) {
      notInterestedReason = 'wrong_contact';
    } else {
      notInterestedReason = 'not_interested';
    }
  }

  // Calculate confidence
  const totalMatches = meetingMatches.length + notInterestedMatches.length + positiveMatches.length;
  const confidence = Math.min(totalMatches * 0.3, 1);

  return {
    isMeetingRequest,
    isNotInterested,
    isPositive,
    notInterestedReason,
    confidence,
  };
}

/**
 * Send notification email for urgent replies
 */
async function sendNotificationEmail(
  client: Client,
  prospect: { name: string; email: string },
  email: EmailMessage,
  analysis: ReplyAnalysis
): Promise<void> {
  const notificationType = analysis.isMeetingRequest ? 'MEETING REQUEST' : 'POSITIVE REPLY';

  const message = {
    subject: `🔔 ${notificationType}: ${prospect.name} replied!`,
    body: {
      contentType: 'HTML',
      content: `
        <h2>🔔 ${notificationType} from ${prospect.name}</h2>
        <p><strong>From:</strong> ${email.from}</p>
        <p><strong>Subject:</strong> ${email.subject}</p>
        <p><strong>Received:</strong> ${email.receivedAt.toISOString()}</p>
        <hr>
        <h3>Their Message:</h3>
        <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #007bff;">
          ${email.bodyPreview}
        </blockquote>
        <hr>
        <p><a href="https://marketing-agent.vercel.app/prospects/${prospect.email}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in CRM</a></p>
      `,
    },
    toRecipients: [{ emailAddress: { address: NOTIFICATION_EMAIL } }],
  };

  try {
    await client.api(`/users/${AZURE_MAIL_FROM}/sendMail`).post({ message });
  } catch (error) {
    console.error('Failed to send notification email:', error);
  }
}

/**
 * Generate and send an instant AI reply to prospect
 * This shows we "walk the walk" with fast responses
 *
 * Key principles from research:
 * - Answer their questions FIRST, don't push for a meeting if they're not ready
 * - Focus on their needs, not closing
 * - Keep the conversation's momentum going
 * - Be helpful and considerate, not salesy
 * - Match their energy level
 */
async function sendInstantReply(
  supabase: ReturnType<typeof createServerClient>,
  prospect: { id: string; name: string; email: string },
  incomingEmail: EmailMessage,
  analysis: ReplyAnalysis
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'No AI API key configured' };
  }

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_API_KEY ? 'https://api.x.ai' : undefined,
    });

    // Try to extract sender's name from email "From" field or use a generic opener
    // Email format might be "John Smith <john@hotel.com>" or just "john@hotel.com"
    const fromMatch = incomingEmail.from.match(/^([^<@]+)/);
    const senderName = fromMatch ? fromMatch[1].trim().split(' ')[0] : '';
    // Only use name if it looks like a real person's name (not a hotel/company name)
    const looksLikePersonName = senderName &&
      senderName.length > 1 &&
      senderName.length < 15 &&
      /^[A-Z][a-z]+$/.test(senderName);

    const prompt = `You are Edward Guest, Automation Expert at Jengu. A hotel prospect just replied to your cold email. Generate the perfect response.

=== CRITICAL SALES BEST PRACTICE ===
Research shows 35-50% of sales go to the FIRST vendor to respond. Your goal is ALWAYS to get them on a call - NOT to answer all their questions over email. Keep responses under 50 words, give brief teasers but ALWAYS pivot to a call. "Easier to show you than explain" is your mantra.

=== THEIR MESSAGE ===
From: ${incomingEmail.from}
Hotel: ${prospect.name}
Subject: ${incomingEmail.subject}
Content: "${incomingEmail.bodyPreview}"

=== COMPLETE JENGU BUSINESS CONTEXT ===

**What Jengu Does:**
Custom AI agents and automation for tourism & hospitality. We automate guest communications, bookings, and operations through intelligent software integrations.

**Core Products:**
1. AI Guest Communication - Handles emails, WhatsApp, live chat automatically. 40+ languages, 24/7 instant responses. Automates 80% of routine inquiries.
2. Voice & Booking Bots - Phone bots and chatbots for reservations. Direct booking integration and payment processing.
3. Dynamic Pricing Engine - AI-powered rate optimization based on demand/seasonality. Competitor monitoring.
4. System Integrations - Connects PMS, booking engines, CRM, payment systems. Eliminates manual data entry.

**Key Stats (use these!):**
- 30% booking conversion increase
- 80% of customer inquiries automated
- Response time: seconds (vs. industry average 15-20 minutes)
- 40+ hours saved weekly per client
- £85,000 annual labor savings (typical)
- £65,000 annual revenue increase (typical)
- ROI within 3-4 months (300-500% first year)

**Target Customers:**
Hotels, resorts, boutique accommodations, campsites, holiday parks, tour operators, travel agencies, DMCs, activity providers - UK, Europe and beyond.

**Deployment:**
2-6 weeks typical. Four stages: Discover → Process Map → Deploy → Optimize.

**Pricing:**
Custom quotes based on property size and needs. No hidden fees. ROI calculator available. Most clients see payback in 3-4 months.

**Technical:**
- GDPR compliant, AES-256 encryption
- 99.9% uptime SLA
- Integrates with existing PMS, booking engines, CRM

**Links:**
- Website: www.jengu.ai
- Book a call: calendly.com/edd-jengu-6puv/30min
- Email: edd@jengu.ai

=== RESPONSE DECISION TREE ===

READ their message carefully. Then pick ONE scenario:

**SCENARIO A: They want to SCHEDULE A CALL**
Keywords: "let's chat", "call", "meeting", "schedule", "available", "demo"
Response structure:
- Express genuine (not over-the-top) enthusiasm
- Offer 2-3 specific time slots (e.g., "Tuesday 2pm, Wednesday 10am, or Thursday 3pm GMT?")
- Include Calendly link as easy alternative
Example: "Awesome! How's Tuesday 2pm, Wednesday 10am, or Thursday 3pm (GMT)? Or grab any slot: calendly.com/edd-jengu-6puv/30min\\n\\nEdd"

**SCENARIO B: They asked a SPECIFIC QUESTION**
Keywords: "how does", "pricing", "cost", "features", "does it work with", "what about"
Response structure:
- Give a BRIEF teaser answer (1 sentence max - don't give everything away!)
- ALWAYS pivot to a call - "easier to show you than explain over email"
Example for pricing: "Depends on your setup - usually see 10-20x ROI in the first year. Easier to give you an exact number on a quick call?\\n\\nEdd"
Example for features: "Yep, we do that! Easier to show you than explain - fancy a quick 15 min call? calendly.com/edd-jengu-6puv/30min\\n\\nEdd"

**SCENARIO C: They said FORWARD to someone else / wrong person**
Response structure:
- Thank them warmly
- Ask who handles guest communications or operations
Example: "Thanks so much for letting me know! Any chance you could point me to whoever handles guest communications or operations?\\n\\nEdd"

**SCENARIO D: They said BAD TIMING / too busy**
Response structure:
- Respect it completely, no guilt
- Offer to follow up in specific timeframe
Example: "Totally get it - timing is everything. Want me to circle back in January when things calm down?\\n\\nEdd"

**SCENARIO E: They have an OBJECTION** (already have solution, not interested, etc.)
Response structure:
- Acknowledge without arguing
- Ask a curious question
Example: "Makes sense! What are you using currently? Always curious what's working well for hotels.\\n\\nEdd"

**SCENARIO F: General POSITIVE response** (interested but not specific)
Response structure:
- Be appreciative
- Suggest one clear next step
Example: "Great to hear! Would a quick 15-min call be useful to show you how it works? Here's my calendar: calendly.com/edd-jengu-6puv/30min\\n\\nEdd"

**SCENARIO G: They CONFIRMED a time/booked via Calendly**
Keywords: "booked", "confirmed", "see you", "looking forward", "scheduled", "got it", "sounds good", "perfect", "works for me"
Response structure:
- Confirm you received it
- Express brief enthusiasm
- Mention you'll send any prep materials if needed
Example: "Perfect, got it locked in! Looking forward to chatting. I'll send over a quick agenda beforehand.\\n\\nEdd"

**SCENARIO H: They're asking FOLLOW-UP questions after initial interest**
Response structure:
- Give brief teaser (1 sentence)
- ALWAYS push for a call - much better to discuss face-to-face/phone
Example: "Good question! Short answer is yes - but honestly easier to show you than explain. Fancy jumping on a quick call? calendly.com/edd-jengu-6puv/30min\\n\\nEdd"

=== STRICT OUTPUT RULES ===
1. LENGTH: 30-50 words maximum. Be concise.
2. START: ${looksLikePersonName ? `Begin with "${senderName}!" or "Hey ${senderName}!"` : 'Begin with "Hey!" or "Thanks for getting back!" (we don\'t know their name)'}
3. TONE: Conversational, friendly, professional - like texting a business contact
4. TEASER ONLY: Give brief 1-sentence answers but ALWAYS pivot to a call. Don't give everything away over email.
5. ONE CTA: Only one call-to-action per reply - usually book a call
6. LINKS: Include Calendly link (calendly.com/edd-jengu-6puv/30min) when scheduling
7. ROI CALCULATOR: If they ask about pricing/ROI, mention our calculator: "Check out our ROI calculator at jengu.ai/roi-calculator - most hotels are surprised by the numbers"
8. END: Sign off with just "Edd" on its own line - NO "Best", "Regards", "Thanks", etc.
9. PARAGRAPHS: Use \\n\\n between paragraphs
10. NO SIGNATURE: Signature is added automatically - don't include one
11. MATCH THEIR VIBE: If they're casual, be casual. If more formal, adjust slightly.
12. NEVER USE: Hotel name, company name, or generic words as a greeting - only use actual person names.
13. ALWAYS PUSH FOR CALL: Every response should move toward a meeting/call. Best practice: 35-50% of sales go to first responder.

=== OUTPUT FORMAT ===
Return ONLY valid JSON, nothing else:
{"subject": "Re: ${incomingEmail.subject}", "body": "your reply here"}`;

    const response = await anthropic.messages.create({
      model: process.env.XAI_API_KEY ? 'grok-4-1-fast-non-reasoning' : 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return { success: false, error: 'No text in AI response' };
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'No JSON in AI response' };
    }

    const reply = JSON.parse(jsonMatch[0]) as { subject: string; body: string };

    // Send the reply with threading
    const sendResult = await sendEmail({
      to: incomingEmail.from,
      subject: reply.subject,
      body: reply.body,
      inReplyTo: incomingEmail.messageId,
    });

    if (!sendResult.success) {
      return { success: false, error: sendResult.error };
    }

    // Save the outbound reply to database
    await supabase.from('emails').insert({
      prospect_id: prospect.id,
      subject: reply.subject,
      body: reply.body,
      to_email: incomingEmail.from,
      from_email: AZURE_MAIL_FROM,
      message_id: sendResult.messageId,
      email_type: 'auto_reply',
      direction: 'outbound',
      status: 'sent',
      sent_at: new Date().toISOString(),
      thread_id: incomingEmail.conversationId,
    });

    // Log activity
    await supabase.from('activities').insert({
      prospect_id: prospect.id,
      type: 'auto_reply_sent',
      title: `Instant AI reply sent to ${prospect.name}`,
      description: `Replied in < 30 seconds!\nSubject: ${reply.subject}`,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send instant reply:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check Microsoft 365 inbox for replies
 */
async function checkMicrosoftInbox(sinceDate: Date): Promise<EmailMessage[]> {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    return [];
  }

  try {
    const credential = new ClientSecretCredential(
      AZURE_TENANT_ID,
      AZURE_CLIENT_ID,
      AZURE_CLIENT_SECRET
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    const client = Client.initWithMiddleware({ authProvider });

    const messages = await client
      .api(`/users/${AZURE_MAIL_FROM}/messages`)
      .filter(`receivedDateTime ge ${sinceDate.toISOString()}`)
      .select('id,subject,from,toRecipients,bodyPreview,body,receivedDateTime,internetMessageId,conversationId,internetMessageHeaders')
      .top(100)
      .get();

    const emails: EmailMessage[] = [];

    for (const msg of messages.value || []) {
      const headers = msg.internetMessageHeaders || [];
      const inReplyToHeader = headers.find((h: { name: string }) =>
        h.name.toLowerCase() === 'in-reply-to'
      );

      emails.push({
        messageId: msg.internetMessageId || msg.id,
        from: msg.from?.emailAddress?.address || '',
        to: AZURE_MAIL_FROM,
        subject: msg.subject || '',
        bodyPreview: msg.bodyPreview || '',
        body: msg.body?.content || '',
        receivedAt: new Date(msg.receivedDateTime),
        inReplyTo: inReplyToHeader?.value,
        conversationId: msg.conversationId,
      });
    }

    return emails;
  } catch (error) {
    console.error('Error checking Microsoft inbox:', error);
    return [];
  }
}

/**
 * Match incoming email to a prospect
 */
async function matchEmailToProspect(
  supabase: ReturnType<typeof createServerClient>,
  fromEmail: string
): Promise<{ id: string; name: string; email: string } | null> {
  // Check if we've sent an email to this address
  const { data: sentEmail } = await supabase
    .from('emails')
    .select('prospect_id, prospects(id, name, email)')
    .eq('to_email', fromEmail)
    .eq('direction', 'outbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  if (sentEmail?.prospect_id && sentEmail.prospects) {
    // Supabase can return array or object for relations
    const prospectData = sentEmail.prospects;
    const p = Array.isArray(prospectData) ? prospectData[0] : prospectData;
    if (p) {
      return { id: sentEmail.prospect_id, name: p.name, email: p.email || fromEmail };
    }
  }

  // Check if this email matches a prospect's email
  const { data: prospect } = await supabase
    .from('prospects')
    .select('id, name, email')
    .eq('email', fromEmail)
    .limit(1)
    .single();

  return prospect || null;
}

/**
 * POST: Check inbox for replies and save to CRM
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const hoursBack = body.hours_back || 24;
    const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const results = {
      checked: false,
      found: 0,
      saved: 0,
      matched: 0,
      meetingRequests: 0,
      notInterested: 0,
      archived: 0,
      notifications: 0,
      autoReplies: 0,
      errors: [] as string[],
    };

    // Create Graph client for notifications
    let graphClient: Client | null = null;
    if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) {
      const credential = new ClientSecretCredential(
        AZURE_TENANT_ID,
        AZURE_CLIENT_ID,
        AZURE_CLIENT_SECRET
      );
      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });
      graphClient = Client.initWithMiddleware({ authProvider });
    }

    if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) {
      results.checked = true;
      const emails = await checkMicrosoftInbox(sinceDate);
      results.found = emails.length;

      for (const email of emails) {
        try {
          // Skip if from ourselves
          if (email.from.toLowerCase() === AZURE_MAIL_FROM.toLowerCase()) {
            continue;
          }

          // Check if we already have this email
          const { data: existing } = await supabase
            .from('emails')
            .select('id')
            .eq('message_id', email.messageId)
            .single();

          if (existing) continue;

          // Match to prospect
          const prospect = await matchEmailToProspect(supabase, email.from);

          if (prospect) {
            results.matched++;

            // Analyze the reply content
            const analysis = analyzeReply(email.subject, email.bodyPreview);

            // Determine email type based on analysis
            let emailType = 'reply';
            if (analysis.isMeetingRequest) {
              emailType = 'meeting_request';
              results.meetingRequests++;
            } else if (analysis.isNotInterested) {
              emailType = 'not_interested';
              results.notInterested++;
            } else if (analysis.isPositive) {
              emailType = 'positive_reply';
            }

            // Save the reply
            const { data: savedEmail } = await supabase.from('emails').insert({
              prospect_id: prospect.id,
              subject: email.subject,
              body: email.bodyPreview,
              to_email: email.to,
              from_email: email.from,
              message_id: email.messageId,
              email_type: emailType,
              direction: 'inbound',
              status: 'replied',
              sent_at: email.receivedAt.toISOString(),
              thread_id: email.conversationId,
            }).select().single();

            // Update original outbound email
            if (email.inReplyTo) {
              await supabase
                .from('emails')
                .update({
                  status: 'replied',
                  replied_at: email.receivedAt.toISOString(),
                })
                .eq('message_id', email.inReplyTo);
            }

            // Handle based on intent
            if (analysis.isNotInterested) {
              // Archive the prospect
              await supabase
                .from('prospects')
                .update({
                  archived: true,
                  archived_at: new Date().toISOString(),
                  archive_reason: analysis.notInterestedReason,
                  stage: 'lost',
                })
                .eq('id', prospect.id);

              results.archived++;

              // Log activity
              await supabase.from('activities').insert({
                prospect_id: prospect.id,
                type: 'archived',
                title: `Prospect archived: ${analysis.notInterestedReason}`,
                description: `Auto-archived based on reply: "${email.bodyPreview.substring(0, 100)}..."`,
                email_id: savedEmail?.id,
              });
            } else if (analysis.isMeetingRequest || analysis.isPositive) {
              // Update stage to meeting if meeting request
              const newStage = analysis.isMeetingRequest ? 'meeting' : 'engaged';
              await supabase
                .from('prospects')
                .update({ stage: newStage })
                .eq('id', prospect.id);

              // Create notification
              await supabase.from('notifications').insert({
                prospect_id: prospect.id,
                email_id: savedEmail?.id,
                type: analysis.isMeetingRequest ? 'meeting_request' : 'positive_reply',
                title: analysis.isMeetingRequest
                  ? `🔥 Meeting request from ${prospect.name}!`
                  : `✨ Positive reply from ${prospect.name}`,
                message: email.bodyPreview.substring(0, 300),
              });

              // Send instant email notification to us
              if (graphClient && analysis.isMeetingRequest) {
                await sendNotificationEmail(graphClient, prospect, email, analysis);
                results.notifications++;
              }

              // INSTANT AI REPLY - Walk the walk with fast responses!
              // Send an AI-generated reply within seconds of receiving their message
              const autoReplyResult = await sendInstantReply(supabase, prospect, email, analysis);
              if (autoReplyResult.success) {
                results.autoReplies++;
              } else {
                results.errors.push(`Auto-reply failed for ${prospect.name}: ${autoReplyResult.error}`);
              }

              // Log activity
              await supabase.from('activities').insert({
                prospect_id: prospect.id,
                type: analysis.isMeetingRequest ? 'meeting_request' : 'positive_reply',
                title: analysis.isMeetingRequest
                  ? `Meeting request received!`
                  : `Positive reply received`,
                description: `Subject: ${email.subject}\n${email.bodyPreview.substring(0, 200)}...`,
                email_id: savedEmail?.id,
              });
            } else {
              // Regular reply - update stage and send instant response
              await supabase
                .from('prospects')
                .update({ stage: 'engaged' })
                .eq('id', prospect.id);

              // INSTANT AI REPLY for any reply - show we're responsive!
              const autoReplyResult = await sendInstantReply(supabase, prospect, email, analysis);
              if (autoReplyResult.success) {
                results.autoReplies++;
              } else {
                results.errors.push(`Auto-reply failed for ${prospect.name}: ${autoReplyResult.error}`);
              }

              await supabase.from('activities').insert({
                prospect_id: prospect.id,
                type: 'email_reply',
                title: `Reply received from ${email.from}`,
                description: `Subject: ${email.subject}\n${email.bodyPreview.substring(0, 200)}...`,
                email_id: savedEmail?.id,
              });
            }

            results.saved++;
          }
        } catch (err) {
          results.errors.push(String(err));
        }
      }
    }

    return NextResponse.json({
      success: true,
      checked_since: sinceDate.toISOString(),
      mailbox: AZURE_MAIL_FROM,
      results,
    });
  } catch (error) {
    console.error('Check replies error:', error);
    return NextResponse.json(
      { error: 'Failed to check replies', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET: Check configuration status
 */
export async function GET() {
  return NextResponse.json({
    configured: !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET),
    mailbox: AZURE_MAIL_FROM,
    notification_email: NOTIFICATION_EMAIL,
    features: [
      'Email threading by conversation ID',
      'Meeting request detection',
      'Not interested detection + auto-archive',
      'Instant email notification for meetings',
    ],
    usage: 'POST with { hours_back: 24 } to check for replies',
  });
}
