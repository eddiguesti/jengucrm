import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { sendEmail, checkAllInboxesForReplies, getSmtpInboxes, checkGmailForReplies, isGmailConfigured } from '@/lib/email';
import { getGmailInboxes } from '@/lib/email/config';
import { processHotelReply, findGmailInboxByEmail, analyzeHotelReply } from '@/lib/email/mystery-shopper-responder';
import { JENGU_KNOWLEDGE } from '@/lib/jengu-knowledge';
import { analyzeReplyWithAI, getActionPriority, type ReplyAnalysis as AIReplyAnalysis } from '@/lib/reply-analysis';
import { logger } from '@/lib/logger';
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
  gmailSenderName?: string; // Persona name for mystery shopper replies
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

    // No AI disclosure - always respond as Edd

    const prompt = `You are Edd from Jengu. Your ONLY goal is to get them on a 30-minute call. Every reply should move towards booking that call using advanced persuasion psychology.

=== THEIR MESSAGE ===
From: ${incomingEmail.from}
Hotel: ${prospect.name}
Subject: ${incomingEmail.subject}
Content: "${incomingEmail.bodyPreview}"

=== JENGU BUSINESS KNOWLEDGE ===
${JENGU_KNOWLEDGE}

=== MASTER PERSUASION PSYCHOLOGY ===

**Your Meta-Strategy:**
You're not "selling" - you're having a conversation that naturally leads to curiosity about what's possible. The call isn't a sales pitch, it's a diagnostic. You're the expert they need to talk to.

**Technique 1: CURIOSITY GAP (Zeigarnik Effect)**
Create an open loop their brain needs to close. Hint at something specific you've noticed or could help with, but don't fully explain.
- "There's usually one thing that jumps out when I look at a hotel's setup..."
- "I'd need to see your current flow, but there's almost always one quick win that..."
- "Hard to say without seeing your setup, but most hotels your size are leaving X on the table..."

**Technique 2: LOSS AVERSION**
Frame around what they're LOSING, not what they'd gain. Losses feel 2x more painful.
- Don't: "You could save 10 hours"
- Do: "Right now you're probably losing bookings to whoever replies first"
- Do: "The question isn't cost - it's what you're losing every day without it"

**Technique 3: AUTHORITY POSITIONING**
You're the expert qualifying THEM, not a salesperson hoping they buy.
- "I'd need to see if your setup would actually benefit..."
- "Not every hotel is right for what we do..."
- "Let me see if there's actually something worth doing here..."

**Technique 4: RECIPROCITY**
Offer value first (the free process map / consultation) so they feel obligated to reciprocate.
- "Happy to do a quick process map - takes 30 mins, no commitment"
- "Let me at least show you what's possible, then you decide"

**Technique 5: COMMITMENT LADDER**
Get small yeses that lead to big yeses. Don't ask for the sale, ask for the call.
- "Worth a quick chat?" (not "Want to buy?")
- "Can I show you what I mean?" (not "Can I pitch you?")

**Technique 6: SCARCITY**
Limited availability = more valuable.
- "I've got a couple of slots this week"
- "Pretty booked up but could squeeze in a quick call"

**Technique 7: SOCIAL PROOF**
Others are doing it = safe to do it.
- "What I'm seeing with hotels like yours..."
- "Most hotels in [city] are realising..."

**Technique 8: NEGATIVE CTA ("But You Are Free")**
Giving an out INCREASES compliance by 42% (proven in 42 studies).
- "Might not be right for you, but..."
- "No pressure at all..."
- "Totally fine if timing's off..."

=== RESPONSE TEMPLATES (adapt these, don't copy exactly) ===

**They asked for info/details:**
"${looksLikePersonName ? senderName + ',' : 'Hey,'}

Absolutely - though depends what you're after. We're not like a normal software company with brochures and feature lists. We find the low hanging fruit in your operations that'll give you the best ROI - and that's different for every hotel.

Easier to show you on a quick call what we've seen work for properties like yours. Got a couple of slots this week if that works?

Edd"

**They're interested / want to know more:**
"${looksLikePersonName ? senderName + ',' : 'Hey,'}

Good timing actually - I was just looking at how hotels in [their city] are handling [relevant thing].

The short version: we find the stuff that's costing you time/money that can be automated. Could be small quick wins, could be bigger. Every hotel's different so hard to say without a quick chat.

Got 30 mins this week? I'll show you what usually jumps out.

Edd"

**They want to schedule:**
"${looksLikePersonName ? senderName + ',' : 'Perfect.'}

How's [day] at [time]? Or grab whatever works: calendly.com/edd-jengu-6puv/30min

Speak then.

Edd"

**They asked about pricing:**
"${looksLikePersonName ? senderName + ',' : 'Hey,'}

Honest answer: depends entirely on what we find. Could be a few hundred quid for a quick automation, could be more for a bigger project. We don't do software licenses or recurring fees - you pay for what we build, you own it.

Only way to know is a quick process map. Takes 30 mins, no commitment, and at least you'll know what ROI you're leaving on the table. Let me know if that works?

Edd"

**They asked a technical question:**
"${looksLikePersonName ? senderName + ',' : 'Hey,'}

Short answer: yes, [brief technical answer].

Longer answer: depends on your current setup. Usually easier to show you on a quick call - I can pull up examples of how other hotels have done it.

Got time this week?

Edd"

**They're hesitant / bad timing:**
"${looksLikePersonName ? senderName + ',' : 'Hey,'}

No worries at all - timing is everything.

Tell you what: let me do a quick process map anyway. No commitment, but at least you'll know what's possible and roughly what ROI you're sitting on. Then whenever timing's right, you've got the info.

30 mins, this week or whenever suits. Let me know?

Edd"

**They confirmed a meeting:**
"Perfect - locked in.

Speak then.

Edd"

=== HARD RULES ===
1. ${looksLikePersonName ? `Start with "${senderName}," on its own line` : 'Start with "Hey," on its own line'}
2. Keep it 50-90 words MAX (excluding signature)
3. End with just "Edd" on its own line
4. Use \\n\\n between paragraphs
5. ALWAYS push towards a call - that's the ONLY goal
6. Create at least ONE curiosity gap or open loop
7. Include at least ONE psychology technique
8. NEVER be eager or salesy - you're the expert, they need you
9. NEVER use stats, percentages, or specific numbers
10. NEVER say "Thanks for getting back!" or similar templates
11. Reference their specific situation when possible
12. Frame the call as a "process map" or "diagnostic" not a "sales call"

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

    // 3. Check Gmail inboxes for mystery shopper replies (to track response times)
    const gmailInboxes = getGmailInboxes();
    const gmailEmails: string[] = gmailInboxes.map(i => i.email.toLowerCase());

    if (isGmailConfigured()) {
      for (const inbox of gmailInboxes) {
        results.inboxesChecked.push(inbox.email);
      }
      try {
        const gmailReplies = await checkGmailForReplies(sinceDate);
        for (const e of gmailReplies) {
          // Skip our own outbound emails
          if (gmailEmails.includes(e.from.toLowerCase())) {
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
            receivedByInbox: e.inboxEmail, // Which Gmail inbox received it
            gmailSenderName: e.gmailSenderName, // Persona name for replies
          });
        }
      } catch (gmailError) {
        results.errors.push(`Gmail IMAP check failed: ${String(gmailError)}`);
      }
    }

    // Legacy single Gmail support
    const legacyGmailUser = process.env.GMAIL_SMTP_USER;
    if (legacyGmailUser && !gmailEmails.includes(legacyGmailUser.toLowerCase())) {
      gmailEmails.push(legacyGmailUser.toLowerCase());
    }

    results.found = allEmails.length;

    // Build list of all our inbox addresses to skip (including test email)
    const testEmail = process.env.TEST_EMAIL_ADDRESS?.toLowerCase();
    const ourInboxes = new Set([
      AZURE_MAIL_FROM.toLowerCase(),
      ...smtpInboxes.map(i => i.email.toLowerCase()),
      ...gmailEmails,
      ...(testEmail ? [testEmail] : []),
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

          // Check if this is a reply to a mystery shopper email (from any Gmail inbox)
          const isMysteryShopperReply = gmailEmails.includes(email.receivedByInbox?.toLowerCase() || '');

          if (isMysteryShopperReply) {
            // Find the original mystery shopper email we sent to this address
            const { data: originalEmail } = await supabase
              .from('emails')
              .select('id, prospect_id, sent_at, subject, prospects(id, name)')
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

              // Get prospect data
              const prospectData = originalEmail.prospects as { id: string; name: string } | { id: string; name: string }[] | null;
              const prospectName = Array.isArray(prospectData) ? prospectData[0]?.name : prospectData?.name || 'Hotel';

              // Save the reply
              await supabase.from('emails').insert({
                prospect_id: originalEmail.prospect_id,
                subject: email.subject,
                body: email.bodyPreview,
                to_email: email.receivedByInbox,
                from_email: email.from,
                message_id: email.messageId,
                email_type: 'mystery_shopper_reply',
                direction: 'inbound',
                status: 'received',
                sent_at: email.receivedAt.toISOString(),
              });

              // Analyze the reply for GM contact info
              const analysis = analyzeHotelReply(email.body || email.bodyPreview, email.subject);

              // If we got GM info, update the prospect
              if (analysis.hasGmName || analysis.hasGmEmail || analysis.hasGmPhone) {
                const updates: Record<string, string> = {};
                if (analysis.gmName) updates.contact_name = analysis.gmName;
                if (analysis.gmEmail) updates.email = analysis.gmEmail;
                if (analysis.gmPhone) updates.phone = analysis.gmPhone;

                await supabase
                  .from('prospects')
                  .update(updates)
                  .eq('id', originalEmail.prospect_id);

                await supabase.from('activities').insert({
                  prospect_id: originalEmail.prospect_id,
                  type: 'contact_discovered',
                  title: `GM contact extracted from mystery shopper reply!`,
                  description: `Found: ${analysis.gmName ? 'Name: ' + analysis.gmName + ' ' : ''}${analysis.gmEmail ? 'Email: ' + analysis.gmEmail + ' ' : ''}${analysis.gmPhone ? 'Phone: ' + analysis.gmPhone : ''}`,
                });

                logger.info({
                  prospect: prospectName,
                  gmName: analysis.gmName,
                  gmEmail: analysis.gmEmail,
                  gmPhone: analysis.gmPhone,
                }, 'GM contact extracted from mystery shopper reply');
              } else {
                // No GM info yet - AUTO-RESPOND to push for it
                const gmailInbox = findGmailInboxByEmail(email.receivedByInbox || '');
                if (gmailInbox) {
                  try {
                    const autoResponse = await processHotelReply({
                      hotelEmail: email.from,
                      hotelName: prospectName,
                      replyBody: email.body || email.bodyPreview,
                      replySubject: email.subject,
                      originalSubject: originalEmail.subject || 'Inquiry',
                      senderName: gmailInbox.senderName,
                      gmailInbox,
                    });

                    if (autoResponse.responded) {
                      await supabase.from('activities').insert({
                        prospect_id: originalEmail.prospect_id,
                        type: 'mystery_shopper_auto_reply',
                        title: `Auto-responded to hotel using ${autoResponse.approach} strategy`,
                        description: `Sent follow-up email to push for GM contact. Strategy: ${autoResponse.approach}`,
                      });

                      logger.info({
                        prospect: prospectName,
                        approach: autoResponse.approach,
                        from: gmailInbox.email,
                      }, 'Mystery shopper auto-response sent');
                    }
                  } catch (autoReplyError) {
                    logger.error({ error: autoReplyError, prospect: prospectName }, 'Mystery shopper auto-reply failed');
                  }
                }
              }

              // Log activity with response time
              await supabase.from('activities').insert({
                prospect_id: originalEmail.prospect_id,
                type: 'mystery_shopper_reply',
                title: `Hotel responded in ${responseTimeMinutes < 60 ? responseTimeMinutes + ' minutes' : responseTimeHours + ' hours'}`,
                description: `Response time: ${responseTimeMinutes} minutes\nSubject: ${email.subject}\n\n${email.bodyPreview.substring(0, 300)}...`,
              });

              // Update prospect notes with response time
              try {
                await supabase.rpc('append_prospect_note', {
                  p_id: originalEmail.prospect_id,
                  p_note: `\n\nMystery shopper response time: ${responseTimeMinutes < 60 ? responseTimeMinutes + ' minutes' : responseTimeHours + ' hours'} (${new Date().toISOString().split('T')[0]})`
                });
              } catch {
                console.log(`Mystery shopper response time for ${prospectName}: ${responseTimeMinutes} minutes`);
              }

              results.mysteryShopperReplies++;
              results.saved++;
            }
            continue; // Don't process mystery shopper replies as regular sales replies
          }

          // Match to prospect
          const prospect = await matchEmailToProspect(supabase, email.from);

          if (prospect) {
            results.matched++;

            // Get count of previous emails for context
            const { count: prevEmailCount } = await supabase
              .from('emails')
              .select('*', { count: 'exact', head: true })
              .eq('prospect_id', prospect.id);

            // AI-powered reply analysis with context
            const aiAnalysis = await analyzeReplyWithAI(
              email.subject,
              email.bodyPreview,
              {
                prospectName: prospect.name,
                previousEmails: prevEmailCount || 0,
                industry: 'Hospitality',
              }
            );

            // Map AI analysis to legacy format for backwards compatibility
            const analysis: ReplyAnalysis = {
              isMeetingRequest: aiAnalysis.intent === 'meeting_request',
              isNotInterested: aiAnalysis.intent === 'not_interested',
              isPositive: aiAnalysis.intent === 'interested' || aiAnalysis.intent === 'needs_info',
              notInterestedReason: aiAnalysis.objection?.type || (aiAnalysis.intent === 'not_interested' ? 'not_interested' : undefined),
              confidence: aiAnalysis.confidence / 100,
            };

            // Log AI analysis for debugging
            logger.info({
              prospect: prospect.name,
              intent: aiAnalysis.intent,
              confidence: aiAnalysis.confidence,
              action: aiAnalysis.recommendedAction,
              priority: getActionPriority(aiAnalysis),
            }, 'AI reply analysis');

            // Determine email type based on AI analysis
            let emailType = 'reply';
            if (aiAnalysis.intent === 'meeting_request') {
              emailType = 'meeting_request';
              results.meetingRequests++;
            } else if (aiAnalysis.intent === 'not_interested') {
              emailType = 'not_interested';
              results.notInterested++;
            } else if (aiAnalysis.intent === 'interested' || aiAnalysis.intent === 'needs_info') {
              emailType = 'positive_reply';
            } else if (aiAnalysis.intent === 'delegation') {
              emailType = 'delegation';
            } else if (aiAnalysis.intent === 'out_of_office') {
              emailType = 'out_of_office';
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
  const gmailInboxes = getGmailInboxes();
  const allMailboxes = [
    AZURE_MAIL_FROM,
    ...smtpInboxes.map(i => i.email),
    ...gmailInboxes.map(i => i.email),
  ];

  return NextResponse.json({
    configured: !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) || smtpInboxes.length > 0 || isGmailConfigured(),
    mailboxes: allMailboxes,
    primary_mailbox: AZURE_MAIL_FROM,
    smtp_inboxes: smtpInboxes.map(i => i.email),
    gmail_inboxes: gmailInboxes.map(i => ({ email: i.email, persona: i.senderName })),
    gmail_purpose: 'Mystery shopper emails with AUTO-RESPONSE + GM contact extraction',
    notification_email: NOTIFICATION_EMAIL,
    features: [
      'Email threading by conversation ID',
      'Multi-inbox IMAP checking (Azure + Spacemail + Gmail)',
      'Meeting request detection',
      'Not interested detection + auto-archive',
      'Instant email notification for meetings',
      'Sticky inbox assignment (maintains thread continuity)',
      'Mystery shopper response time tracking',
      'AUTO-RESPOND to mystery shopper replies using persuasion psychology',
      'Auto-extract GM contact info from hotel replies',
    ],
    usage: 'POST with { hours_back: 24 } to check for replies',
  });
}
