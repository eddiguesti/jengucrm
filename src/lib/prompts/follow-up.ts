/**
 * Follow-up Email Prompts
 * Prompts for generating follow-up emails
 */

export interface FollowUpContext {
  prospectName: string;
  city: string | null;
  propertyType: string | null;
  followUpNumber: number;
  previousSubject: string;
  previousBody: string;
  daysSinceLast: number;
}

export function buildFollowUpPrompt(context: FollowUpContext): string {
  const { prospectName, city, propertyType, followUpNumber, previousSubject, previousBody, daysSinceLast } = context;

  const followUpInstructions = followUpNumber === 1
    ? `1. Acknowledges you sent a previous email (don't apologize)
2. Adds ONE new piece of value (a stat, insight, or relevant news)
3. Asks a simple question to prompt a response
4. Keeps the same friendly tone`
    : `1. This is the FINAL follow-up - be respectful of their time
2. Offer something concrete (a case study, quick demo link, or resource)
3. Give them an easy out ("If timing isn't right, no worries")
4. Make it easy to respond with just "yes" or "not now"`;

  return `You are writing follow-up email #${followUpNumber} for Jengu (AI guest communication platform for hotels).

Target: ${prospectName}
Location: ${city || 'Unknown'}
Property Type: ${propertyType || 'hotel'}

Previous email subject: "${previousSubject}"
Previous email (sent ${daysSinceLast} days ago):
"${previousBody}"

Write a SHORT follow-up (max 80 words) that:
${followUpInstructions}

Tone: Helpful, not pushy. Like a peer, not a salesperson.

DO NOT include any signature, sign-off, or "Best regards" - the signature will be added automatically.

IMPORTANT: Output ONLY valid JSON:
{"subject": "Re: ${previousSubject}", "body": "your follow-up text"}`;
}

/**
 * Follow-up timing configuration
 */
export const FOLLOW_UP_CONFIG = {
  maxEmails: 3, // 1 initial + 2 follow-ups
  daysToWait: [3, 5], // Follow-up 1 after 3 days, Follow-up 2 after 5 more days
} as const;
