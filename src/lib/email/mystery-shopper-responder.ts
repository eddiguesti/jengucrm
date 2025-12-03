/**
 * Mystery Shopper Auto-Responder
 *
 * Intelligent response system that uses proven persuasion techniques
 * to extract GM contact information from hotel staff replies.
 *
 * Psychology techniques used:
 * - Reciprocity: Offer value first (dates, budget, guest count)
 * - Scarcity: Create urgency (limited dates, decision deadline)
 * - Social proof: Reference similar events/recommendations
 * - Commitment: Get small agreements before big ask
 * - Liking: Be warm, personal, grateful
 * - Authority: Sound professional and serious
 */

import nodemailer from 'nodemailer';
import Anthropic from '@anthropic-ai/sdk';
import { getGmailInboxes, type GmailInbox } from './config';
import { logger } from '../logger';

interface MysteryShopperReply {
  hotelEmail: string;
  hotelName: string;
  replyBody: string;
  replySubject: string;
  originalSubject: string;
  senderName: string; // Our mystery shopper persona
  gmailInbox: GmailInbox;
}

interface ResponseAnalysis {
  hasGmName: boolean;
  gmName?: string;
  hasGmEmail: boolean;
  gmEmail?: string;
  hasGmPhone: boolean;
  gmPhone?: string;
  isGenericBrushOff: boolean;
  isAskingForMoreInfo: boolean;
  isOfferingHelp: boolean;
  suggestedApproach: 'thank_and_close' | 'push_for_gm' | 'provide_details' | 'escalate_urgency';
  confidence: number;
}

/**
 * Analyze hotel's reply to determine best response strategy
 */
export function analyzeHotelReply(replyBody: string, replySubject: string): ResponseAnalysis {
  const text = `${replySubject} ${replyBody}`.toLowerCase();

  // Extract potential GM info
  const emailMatch = replyBody.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  const phoneMatch = replyBody.match(/(\+?[\d\s\-().]{10,})/);

  // Look for GM/Director name patterns
  const gmPatterns = [
    /general\s*manager[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /gm[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /director[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /manager[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /contact\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:at|on|directly)/i,
    /speak\s+(?:with|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];

  let gmName: string | undefined;
  for (const pattern of gmPatterns) {
    const match = replyBody.match(pattern);
    if (match) {
      gmName = match[1].trim();
      break;
    }
  }

  // Check for brush-off phrases
  const brushOffPhrases = [
    'not available', 'fully booked', 'no availability', 'cannot accommodate',
    'not possible', 'unfortunately', 'regret to inform', 'not able to',
    'do not host', 'don\'t host', 'not suitable', 'too small', 'too large'
  ];
  const isGenericBrushOff = brushOffPhrases.some(phrase => text.includes(phrase));

  // Check if asking for more details
  const infoRequestPhrases = [
    'more details', 'more information', 'could you tell', 'can you provide',
    'what dates', 'how many guests', 'budget', 'when are you', 'which dates',
    'specific dates', 'contact number', 'phone number', 'call you'
  ];
  const isAskingForMoreInfo = infoRequestPhrases.some(phrase => text.includes(phrase));

  // Check if offering to help
  const helpPhrases = [
    'happy to help', 'glad to assist', 'can help', 'will help',
    'let me', 'i can', 'we can', 'i\'ll', 'we\'ll', 'forward',
    'pass on', 'put you in touch', 'connect you'
  ];
  const isOfferingHelp = helpPhrases.some(phrase => text.includes(phrase));

  // Determine best approach
  let suggestedApproach: ResponseAnalysis['suggestedApproach'] = 'push_for_gm';

  if (gmName || (emailMatch && !emailMatch[0].includes('info@'))) {
    suggestedApproach = 'thank_and_close';
  } else if (isGenericBrushOff) {
    suggestedApproach = 'escalate_urgency';
  } else if (isAskingForMoreInfo) {
    suggestedApproach = 'provide_details';
  } else if (isOfferingHelp) {
    suggestedApproach = 'push_for_gm';
  }

  return {
    hasGmName: !!gmName,
    gmName,
    hasGmEmail: !!emailMatch && !emailMatch[0].toLowerCase().includes('info@'),
    gmEmail: emailMatch?.[0],
    hasGmPhone: !!phoneMatch,
    gmPhone: phoneMatch?.[0],
    isGenericBrushOff,
    isAskingForMoreInfo,
    isOfferingHelp,
    suggestedApproach,
    confidence: gmName ? 0.9 : (emailMatch ? 0.7 : 0.5),
  };
}

/**
 * Generate persuasive response using AI with psychology techniques
 */
export async function generatePersuasiveResponse(
  analysis: ResponseAnalysis,
  context: MysteryShopperReply
): Promise<{ subject: string; body: string } | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    logger.warn('XAI_API_KEY not set, using template response');
    return generateTemplateResponse(analysis, context);
  }

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
    });

    const prompt = `You are ${context.senderName}, a real person genuinely planning an event/stay. A hotel just replied to your inquiry. Write a warm, natural response to get the General Manager's direct email.

HOTEL'S REPLY:
Subject: ${context.replySubject}
${context.replyBody}

ANALYSIS:
- They ${analysis.isAskingForMoreInfo ? 'ARE asking for more details' : 'did NOT ask for details'}
- They ${analysis.isOfferingHelp ? 'ARE offering to help' : 'did NOT offer specific help'}
- They ${analysis.isGenericBrushOff ? 'seem to be politely declining' : 'seem open'}
- Best approach: ${analysis.suggestedApproach}

PSYCHOLOGY PRINCIPLES (use subtly, don't be salesy):
1. RECIPROCITY: Give before asking — share specific useful details (dates, numbers)
2. SCARCITY: Natural urgency — "deciding this week", "comparing options", "meeting Thursday"
3. SOCIAL PROOF: Someone recommended them — "a friend", "colleague", "they loved it"
4. LIKING: Be genuinely warm — thank them, acknowledge their help, be human
5. COMMITMENT: Small yes before big yes — "would you mind", "could you possibly"
6. UNITY: Shared goal — "I want to make sure we get this right together"

TONE GUIDELINES:
- Write like you're texting a helpful stranger, not writing a business letter
- Use em dashes (—) and contractions naturally
- Be grateful but not groveling
- Be specific but not overwhelming
- NEVER use phrases like "I hope this email finds you well" or "Best regards"
- Sign off simply with just your name or "Thanks!" then name

${analysis.suggestedApproach === 'provide_details' ? `
APPROACH: They want details first. Give them what they asked for, THEN ask for GM:
- Specific dates: "We're looking at the last weekend of June 2025"
- Guest count: "Around 65-70 people, most needing rooms"
- Budget hint: "Budget isn't the main concern — probably €18-25k depending on inclusions"
- Then pivot: "The reason I'm asking about your GM is..." or "For something this size, we'd love to..."
` : ''}

${analysis.suggestedApproach === 'escalate_urgency' ? `
APPROACH: They're declining. Be understanding but persistent:
- Express genuine disappointment: "Oh, that's a shame..."
- Mention the recommendation: "The reason we reached out is because friends specifically recommended you"
- Offer flexibility: "We're actually quite flexible on dates"
- Make the ask soft: "Could I at least speak with your GM about possibilities?"
- Add deadline: "We're making our decision this week"
` : ''}

${analysis.suggestedApproach === 'push_for_gm' ? `
APPROACH: Push gently for GM contact:
- Acknowledge their help: "Thanks so much for the quick reply!"
- Give one specific detail to show you're serious
- Explain why GM: "not to go over anyone's head, just to discuss with someone who can shape the whole experience"
- Make it easy: "Would you mind sharing their email?"
` : ''}

Write 3-5 natural sentences. Return JSON: {"subject": "Re: ${context.originalSubject}", "body": "..."}`;

    const response = await anthropic.messages.create({
      model: 'grok-3-mini-beta',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return null;

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.error({ error }, 'AI response generation failed, using template');
    return generateTemplateResponse(analysis, context);
  }
}

/**
 * Template-based responses when AI is unavailable
 * Psychology-optimized: warm, personal, uses reciprocity and social proof
 */
function generateTemplateResponse(
  analysis: ResponseAnalysis,
  context: MysteryShopperReply
): { subject: string; body: string } {
  const subject = `Re: ${context.originalSubject}`;
  let body = '';

  if (analysis.suggestedApproach === 'provide_details') {
    // Reciprocity: Give them exactly what they asked for, then make the ask
    body = `Thank you so much for getting back to me — I really appreciate the quick response!

Happy to share more details. We're looking at the last weekend of June 2025. Guest numbers around 65-70, with most needing accommodation. Budget isn't the main concern — we want it done properly, probably €18-25k all in depending on what's included.

The reason I asked about your General Manager is that we've found these conversations go much better when we're talking to someone who can see the full picture and has flexibility. Would you be able to share their email? Even just a quick intro conversation would help us understand if ${context.hotelName} is the right fit.

Thanks again for your help with this!

${context.senderName}`;
  } else if (analysis.suggestedApproach === 'escalate_urgency') {
    // Scarcity + Social Proof + Liking (understanding, not pushy)
    body = `Oh, that's disappointing to hear — ${context.hotelName} was actually specifically recommended to us by friends who had their celebration there and absolutely loved it.

Is there really no flexibility at all? We're actually quite open on exact dates — the late June timing was just our first choice, but we could look at other weekends if that helps.

I'd really love the chance to at least speak with your General Manager about it. Sometimes there are possibilities that aren't obvious at first. Would you mind sharing their email? I promise I won't take much of their time.

We're making our final decision this week, so any help would be wonderful.

Thanks for understanding,

${context.senderName}`;
  } else if (analysis.suggestedApproach === 'push_for_gm') {
    // Commitment + Liking: Build rapport, make small ask feel natural
    body = `Thanks so much for getting back to me — that's really helpful!

Just to give you the full picture: we're planning for around 70 guests, late June 2025. We've organised similar events before and know that the best ones happen when everyone's on the same page from the start.

That's why I'd love to speak directly with your General Manager — not to go over your head, just to make sure we're discussing with someone who can help shape the whole experience. Would you mind sharing their email?

I'd be very grateful. And thank you again for your time!

${context.senderName}`;
  } else {
    // thank_and_close - mission accomplished, be gracious
    body = `This is perfect — thank you so much!

I'll reach out to them directly. You've been incredibly helpful, really appreciate you taking the time.

All the best,

${context.senderName}`;
  }

  return { subject, body };
}

/**
 * Send response via Gmail
 */
export async function sendMysteryShopperResponse(
  to: string,
  subject: string,
  body: string,
  inbox: GmailInbox,
  inReplyTo?: string
): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: inbox.email,
        pass: inbox.password,
      },
    });

    await transporter.sendMail({
      from: `"${inbox.senderName}" <${inbox.email}>`,
      to,
      subject,
      text: body,
      inReplyTo,
      references: inReplyTo,
    });

    logger.info({ to, from: inbox.email, subject }, 'Mystery shopper response sent');
    return true;
  } catch (error) {
    logger.error({ error, to }, 'Failed to send mystery shopper response');
    return false;
  }
}

/**
 * Process a hotel reply and send appropriate response
 */
export async function processHotelReply(reply: MysteryShopperReply): Promise<{
  responded: boolean;
  extractedGm?: { name?: string; email?: string; phone?: string };
  approach: string;
}> {
  const analysis = analyzeHotelReply(reply.replyBody, reply.replySubject);

  // If we got GM info, extract and return
  if (analysis.hasGmName || analysis.hasGmEmail || analysis.hasGmPhone) {
    return {
      responded: false, // No need to respond, we got what we need
      extractedGm: {
        name: analysis.gmName,
        email: analysis.gmEmail,
        phone: analysis.gmPhone,
      },
      approach: 'extracted_contact',
    };
  }

  // Generate and send response
  const response = await generatePersuasiveResponse(analysis, reply);
  if (!response) {
    return { responded: false, approach: 'generation_failed' };
  }

  const sent = await sendMysteryShopperResponse(
    reply.hotelEmail,
    response.subject,
    response.body,
    reply.gmailInbox,
    reply.replySubject
  );

  return {
    responded: sent,
    approach: analysis.suggestedApproach,
  };
}

/**
 * Find the Gmail inbox that matches an email address
 */
export function findGmailInboxByEmail(email: string): GmailInbox | undefined {
  const inboxes = getGmailInboxes();
  return inboxes.find(inbox => inbox.email.toLowerCase() === email.toLowerCase());
}
