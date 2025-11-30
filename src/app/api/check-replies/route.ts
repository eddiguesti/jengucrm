import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { sendEmail, checkAllInboxesForReplies, getSmtpInboxes, checkGmailForReplies, IncomingEmail, isGmailConfigured } from '@/lib/email';
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
  receivedByInbox?: string; // Which of our inboxes received this (for thread continuity)
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
  analysis: ReplyAnalysis,
  replyFromInbox?: string // Which inbox to send the reply from (for thread continuity)
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

    const prompt = `You are Edd from Jengu. Write a reply to this hotel prospect. Sound like a real person, not a sales bot.

=== THEIR MESSAGE ===
From: ${incomingEmail.from}
Hotel: ${prospect.name}
Subject: ${incomingEmail.subject}
Content: "${incomingEmail.bodyPreview}"

=== YOUR VOICE & STYLE ===
You're friendly, professional, but not corporate or robotic. Warm but direct.
You don't say generic things like "Hey! Thanks for getting back!" - sounds like a template.
You talk about doing a "quick process map" to find "low hanging fruit" with the best ROI.
You explain that it could be API connections, email automation, chatbots, or bigger things like dynamic pricing - depends on their needs.
You always want a quick chat to see if they'd be a good fit for YOU (not the other way around - this subtle framing matters).

=== WHAT JENGU DOES ===
Custom AI agents and automation for hospitality. Could be:
- Email/WhatsApp/chat automation
- Booking bots, voice bots
- Dynamic pricing engine
- API integrations with their PMS/booking systems
- Usually a mix of small automations + bigger projects

The approach: Quick chat → Process map → Find the low hanging fruit → Deploy

Calendly: calendly.com/edd-jengu-6puv/30min

=== HOW TO RESPOND ===

**If they're interested/want to know more:**
Don't over-explain. Say something like:
"We normally do a quick process map to find the low hanging fruit - could be API connections, email automation, chatbots, or bigger stuff like dynamic pricing. Depends on your setup. Worth a quick chat to see if you'd be right for us?"

**If they want to schedule:**
Give them times or the calendly link. Keep it brief.
"Nice one - how's Tuesday 2pm or Thursday 10am? Or grab a slot here: calendly.com/edd-jengu-6puv/30min"

**If they ask about pricing:**
"Depends on what we find in the process map - could be a few small wins or a bigger project. Easier to figure out on a quick call?"

**If they ask specific questions:**
Give a one-liner answer, then push for a call. Don't write essays.

**If they're not interested / bad timing:**
Be cool about it. "No worries, timing is everything. Want me to ping you in the new year?"

**If they confirmed a meeting:**
"Perfect, locked in. Speak then."

=== RULES ===
1. ${looksLikePersonName ? `Start with just "${senderName}," or "Hi ${senderName},"` : 'Start with a warm but not generic opener'}
2. Keep it SHORT - 40-70 words max
3. Sound like a real person, professional but personable
4. End with just "Edd" on its own line
5. Use \\n\\n between paragraphs
6. Be warm and helpful, but not over-the-top or salesy
7. Frame it as YOU qualifying THEM ("see if you'd be right for us")
8. Be genuinely helpful - if they ask something, answer it properly before suggesting a call
9. NEVER include numbers, stats, percentages, or figures - keep it conversational, not data-driven

=== OUTPUT ===
Return ONLY valid JSON:
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

    // Send the reply from the SAME inbox that received it (thread continuity)
    const sendResult = await sendEmail({
      to: incomingEmail.from,
      subject: reply.subject,
      body: reply.body,
      inReplyTo: incomingEmail.messageId,
      forceInbox: replyFromInbox, // Use the same inbox that received the reply
    });

    if (!sendResult.success) {
      return { success: false, error: sendResult.error };
    }

    // Save the outbound reply to database with the actual inbox used
    await supabase.from('emails').insert({
      prospect_id: prospect.id,
      subject: reply.subject,
      body: reply.body,
      to_email: incomingEmail.from,
      from_email: sendResult.sentFrom || replyFromInbox || AZURE_MAIL_FROM,
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
 * POST: Check ALL inboxes for replies and save to CRM
 * Checks: Azure (edd@jengu.ai) + all Spacemail inboxes via IMAP
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
      mysteryShopperReplies: 0,
      inboxesChecked: [] as string[],
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

    // Collect all emails from all sources
    const allEmails: EmailMessage[] = [];

    // 1. Check Azure inbox (edd@jengu.ai)
    if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) {
      results.checked = true;
      results.inboxesChecked.push(AZURE_MAIL_FROM);
      const azureEmails = await checkMicrosoftInbox(sinceDate);
      // Tag each email with which inbox received it
      for (const e of azureEmails) {
        e.receivedByInbox = AZURE_MAIL_FROM;
      }
      allEmails.push(...azureEmails);
    }

    // 2. Check all Spacemail inboxes via IMAP
    const smtpInboxes = getSmtpInboxes();
    if (smtpInboxes.length > 0) {
      results.checked = true;
      for (const inbox of smtpInboxes) {
        results.inboxesChecked.push(inbox.email);
      }

      try {
        const imapEmails = await checkAllInboxesForReplies(sinceDate);
        // Convert IncomingEmail to EmailMessage format
        for (const e of imapEmails) {
          allEmails.push({
            messageId: e.messageId,
            from: e.from,
            to: e.to,
            subject: e.subject,
            bodyPreview: e.bodyPreview,
            body: e.body,
            receivedAt: e.receivedAt,
            inReplyTo: e.inReplyTo,
            conversationId: e.conversationId,
            receivedByInbox: e.inboxEmail, // Which Spacemail inbox received this
          });
        }
      } catch (imapError) {
        results.errors.push(`IMAP check failed: ${String(imapError)}`);
      }
    }

    // 3. Check Gmail inbox for mystery shopper replies (to track response times)
    const gmailUser = process.env.GMAIL_SMTP_USER;
    if (isGmailConfigured() && gmailUser) {
      results.inboxesChecked.push(gmailUser);
      try {
        const gmailEmails = await checkGmailForReplies(sinceDate);
        for (const e of gmailEmails) {
          // Skip emails FROM gmail (our own outbound)
          if (e.from.toLowerCase() === gmailUser.toLowerCase()) {
            continue;
          }
          allEmails.push({
            messageId: e.messageId,
            from: e.from,
            to: e.to,
            subject: e.subject,
            bodyPreview: e.bodyPreview,
            body: e.body,
            receivedAt: e.receivedAt,
            inReplyTo: e.inReplyTo,
            conversationId: e.conversationId,
            receivedByInbox: gmailUser, // Gmail inbox
          });
        }
      } catch (gmailError) {
        results.errors.push(`Gmail IMAP check failed: ${String(gmailError)}`);
      }
    }

    results.found = allEmails.length;

    // Build list of all our inbox addresses to skip
    const ourInboxes = new Set([
      AZURE_MAIL_FROM.toLowerCase(),
      ...smtpInboxes.map(i => i.email.toLowerCase()),
      ...(gmailUser ? [gmailUser.toLowerCase()] : []),
    ]);

    // Process all found emails
    if (allEmails.length > 0) {
      const emails = allEmails;

      for (const email of emails) {
        try {
          // Skip if from any of our inboxes (don't process our own outbound as replies)
          if (ourInboxes.has(email.from.toLowerCase())) {
            continue;
          }

          // Check if we already have this email
          const { data: existing } = await supabase
            .from('emails')
            .select('id')
            .eq('message_id', email.messageId)
            .single();

          if (existing) continue;

          // Check if this is a reply to a mystery shopper email (from Gmail inbox)
          const isMysteryShopperReply = email.receivedByInbox?.toLowerCase() === gmailUser?.toLowerCase();

          if (isMysteryShopperReply) {
            // Find the original mystery shopper email we sent to this address
            const { data: originalEmail } = await supabase
              .from('emails')
              .select('id, prospect_id, sent_at, prospects(id, name)')
              .eq('to_email', email.from)
              .eq('email_type', 'mystery_shopper')
              .order('sent_at', { ascending: false })
              .limit(1)
              .single();

            if (originalEmail && originalEmail.sent_at) {
              const sentAt = new Date(originalEmail.sent_at);
              const replyAt = email.receivedAt;
              const responseTimeMs = replyAt.getTime() - sentAt.getTime();
              const responseTimeMinutes = Math.round(responseTimeMs / 60000);
              const responseTimeHours = (responseTimeMs / 3600000).toFixed(1);

              // Save the reply
              await supabase.from('emails').insert({
                prospect_id: originalEmail.prospect_id,
                subject: email.subject,
                body: email.bodyPreview,
                to_email: gmailUser,
                from_email: email.from,
                message_id: email.messageId,
                email_type: 'mystery_shopper_reply',
                direction: 'inbound',
                status: 'received',
                sent_at: email.receivedAt.toISOString(),
              });

              // Log activity with response time
              const prospectData = originalEmail.prospects as { id: string; name: string } | { id: string; name: string }[] | null;
              const prospectName = Array.isArray(prospectData) ? prospectData[0]?.name : prospectData?.name;
              await supabase.from('activities').insert({
                prospect_id: originalEmail.prospect_id,
                type: 'mystery_shopper_reply',
                title: `Hotel responded to mystery shopper in ${responseTimeMinutes < 60 ? responseTimeMinutes + ' minutes' : responseTimeHours + ' hours'}`,
                description: `Response time: ${responseTimeMinutes} minutes\nSubject: ${email.subject}\n\n${email.bodyPreview.substring(0, 300)}...`,
              });

              // Update prospect notes with response time
              await supabase.rpc('append_prospect_note', {
                p_id: originalEmail.prospect_id,
                p_note: `\n\nMystery shopper response time: ${responseTimeMinutes < 60 ? responseTimeMinutes + ' minutes' : responseTimeHours + ' hours'} (${new Date().toISOString().split('T')[0]})`
              }).catch(() => {
                // Fallback if RPC doesn't exist - just log it
                console.log(`Mystery shopper response time for ${prospectName}: ${responseTimeMinutes} minutes`);
              });

              results.mysteryShopperReplies++;
              results.saved++;
            }
            continue; // Don't process mystery shopper replies as regular sales replies
          }

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
              // Send an AI-generated reply from the SAME inbox that received the reply (thread continuity)
              const autoReplyResult = await sendInstantReply(supabase, prospect, email, analysis, email.receivedByInbox);
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
              // Send from the SAME inbox that received it (thread continuity)
              const autoReplyResult = await sendInstantReply(supabase, prospect, email, analysis, email.receivedByInbox);
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
  const smtpInboxes = getSmtpInboxes();
  const gmailUser = process.env.GMAIL_SMTP_USER;
  const allMailboxes = [AZURE_MAIL_FROM, ...smtpInboxes.map(i => i.email)];
  if (gmailUser && isGmailConfigured()) {
    allMailboxes.push(gmailUser);
  }

  return NextResponse.json({
    configured: !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) || smtpInboxes.length > 0 || isGmailConfigured(),
    mailboxes: allMailboxes,
    primary_mailbox: AZURE_MAIL_FROM,
    smtp_inboxes: smtpInboxes.map(i => i.email),
    gmail_inbox: gmailUser || null,
    gmail_purpose: 'Mystery shopper emails + response time tracking',
    notification_email: NOTIFICATION_EMAIL,
    features: [
      'Email threading by conversation ID',
      'Multi-inbox IMAP checking (Azure + Spacemail + Gmail)',
      'Meeting request detection',
      'Not interested detection + auto-archive',
      'Instant email notification for meetings',
      'Sticky inbox assignment (maintains thread continuity)',
      'Mystery shopper response time tracking',
    ],
    usage: 'POST with { hours_back: 24 } to check for replies',
  });
}
