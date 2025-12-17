/**
 * Campaign Strategies - Psychology-based email templates
 *
 * Four strategies for A/B testing:
 * 1. authority_scarcity - Direct, confident, loss aversion
 * 2. curiosity_value - Pattern interrupt, vulnerability
 * 3. cold_direct - Human, awkward, direct ask
 * 4. cold_pattern_interrupt - Self-aware, honest opener
 */

import { Prospect, CampaignStrategy } from '../types';

type PromptGenerator = (prospect: Prospect) => string;

/**
 * Build prospect context string for prompts
 */
function buildContext(prospect: Prospect): string {
  const parts: string[] = [];

  parts.push(`Hotel: ${prospect.name}`);
  parts.push(`Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}`);

  if (prospect.contactName) {
    parts.push(`Contact: ${prospect.contactName}${prospect.contactTitle ? ` (${prospect.contactTitle})` : ''}`);
  }

  if (prospect.propertyType) {
    parts.push(`Type: ${prospect.propertyType}`);
  }

  if (prospect.jobPainPoints) {
    if (prospect.jobPainPoints.summary) {
      parts.push(`Pain signals: ${prospect.jobPainPoints.summary}`);
    }
    if (prospect.jobPainPoints.communicationTasks?.length) {
      parts.push(`Communication needs: ${prospect.jobPainPoints.communicationTasks.join(', ')}`);
    }
  }

  if (prospect.sourceJobTitle) {
    parts.push(`Hiring for: ${prospect.sourceJobTitle}`);
  }

  return parts.join('\n');
}

/**
 * Strategy A: Direct & Confident
 * Psychology: Authority, scarcity, loss aversion
 */
const authorityScarcityPrompt: PromptGenerator = (prospect) => `
You are writing a cold outreach email for Jengu, an AI-powered guest messaging platform for hotels.

PROSPECT CONTEXT:
${buildContext(prospect)}

WRITING STYLE:
- 70-90 words MAXIMUM (short and punchy)
- No fluff, no "hope this finds you well"
- Lead with authority/credibility
- Create subtle scarcity ("working with a few hotels in ${prospect.city}")
- Use loss aversion ("missing X bookings per month")
- End with low-friction CTA ("Worth 15 mins to explore?")
- Sound human, not salesy
- Use "But You Are Free" technique - give them an easy out

SUBJECT LINE:
- Lowercase, cryptic, curiosity-inducing
- 3-5 words max
- Examples: "quick question about ${prospect.name}", "guest messaging at ${prospect.name}?"

OUTPUT FORMAT (JSON only):
{
  "subject": "your subject line",
  "body": "your email body"
}

Write the email now. JSON only, no other text.
`;

/**
 * Strategy B: Pattern Interrupt + Vulnerability
 * Psychology: Pattern interrupt, labeling, negative reverse
 */
const curiosityValuePrompt: PromptGenerator = (prospect) => `
You are writing a cold outreach email for Jengu, an AI-powered guest messaging platform for hotels.

PROSPECT CONTEXT:
${buildContext(prospect)}

WRITING STYLE:
- 70-90 words MAXIMUM
- Start with pattern interrupt (unexpected opener)
- Show slight vulnerability ("I might be totally off base here...")
- Use labeling technique ("You seem like someone who...")
- Negative reverse selling ("This probably isn't for you if...")
- Create curiosity gap (hint at value without revealing)
- End with permission-based CTA ("curious if this lands?")

SUBJECT LINE:
- Pattern interrupt style
- Creates curiosity
- Examples: "probably not for ${prospect.name}", "random thought"

OUTPUT FORMAT (JSON only):
{
  "subject": "your subject line",
  "body": "your email body"
}

Write the email now. JSON only, no other text.
`;

/**
 * Strategy C: Cold Direct & Human
 * Psychology: Vulnerability, directness, qualifying CTA
 */
const coldDirectPrompt: PromptGenerator = (prospect) => `
You are writing a cold outreach email for Jengu, an AI-powered guest messaging platform for hotels.

PROSPECT CONTEXT:
${buildContext(prospect)}

WRITING STYLE:
- 80-100 words MAXIMUM
- Sound genuinely human (slightly awkward is good)
- Be direct about why you're reaching out
- Show you've done homework on their hotel
- Qualify them ("if you're handling guest comms manually...")
- End with forward momentum question
- No corporate speak

SUBJECT LINE:
- Question format works well
- Include their name or hotel
- Examples: "question for ${prospect.contactName || 'you'}", "${prospect.name} + Jengu?"

OUTPUT FORMAT (JSON only):
{
  "subject": "your subject line",
  "body": "your email body"
}

Write the email now. JSON only, no other text.
`;

/**
 * Strategy D: Cold Pattern Interrupt
 * Psychology: Self-awareness, honesty, curiosity hook
 */
const coldPatternInterruptPrompt: PromptGenerator = (prospect) => `
You are writing a cold outreach email for Jengu, an AI-powered guest messaging platform for hotels.

PROSPECT CONTEXT:
${buildContext(prospect)}

WRITING STYLE:
- 80-100 words MAXIMUM
- Self-aware opener ("I know cold emails are annoying...")
- Be refreshingly honest
- Quick value prop in one sentence
- Create specific curiosity ("One hotel in ${prospect.city} saw X")
- End with easy yes/no ask ("let me know either way?")
- Feel like a real person, not a sequence

SUBJECT LINE:
- Honest and direct
- Examples: "cold email warning", "3 min read - worth it?"

OUTPUT FORMAT (JSON only):
{
  "subject": "your subject line",
  "body": "your email body"
}

Write the email now. JSON only, no other text.
`;

/**
 * Strategy E: Simple & Fixed Template
 * Uses EXACT fixed template - only firstname changes. No AI variation.
 */
const simplePersonalizedPrompt: PromptGenerator = (prospect) => {
  const firstName = prospect.contactName?.split(' ')[0] || null;

  // Fixed template - NO variation, just swap firstname
  return `Output this EXACT email with NO changes except the subject line.

SUBJECT LINE: Pick ONE of these exactly:
${firstName ? `- "quick question, ${firstName.toLowerCase()}?"` : '- "quick question?"'}
- "weird ask"
- "right person?"

EMAIL BODY (use EXACTLY as written, word for word):

Hey ${firstName || 'there'},

This might be a weird one - not even sure if you're the right person. If not, would you mind forwarding to whoever handles operations? Would genuinely appreciate it.

We implement different types of AI systems for hotels - stuff that genuinely saves time and money without feeling robotic. Most hotels are surprised what's actually possible now.

Would love a quick chat to see if you'd be a good fit for us. Totally fine if it's not for you - just let me know either way?

Edd

OUTPUT FORMAT (JSON only, no other text):
{
  "subject": "your chosen subject line",
  "body": "the exact email body above"
}
`;
};

/**
 * Export campaign prompts
 */
export const CAMPAIGN_PROMPTS: Record<CampaignStrategy, PromptGenerator> = {
  authority_scarcity: authorityScarcityPrompt,
  curiosity_value: curiosityValuePrompt,
  cold_direct: coldDirectPrompt,
  cold_pattern_interrupt: coldPatternInterruptPrompt,
  simple_personalized: simplePersonalizedPrompt,
};

/**
 * Get strategy for a prospect based on lead source
 */
export function getStrategyForProspect(_prospect: Prospect): CampaignStrategy {
  // Default: use simple_personalized for all new prospects
  // This is the recommended strategy for first emails
  return 'simple_personalized';
}

/**
 * Strategy metadata for dashboard
 */
export const STRATEGY_METADATA: Record<CampaignStrategy, {
  name: string;
  description: string;
  psychology: string[];
}> = {
  authority_scarcity: {
    name: 'Direct & Confident',
    description: 'Short, punchy, authority-first approach',
    psychology: ['Authority', 'Scarcity', 'Loss Aversion', 'BYAF'],
  },
  curiosity_value: {
    name: 'Pattern Interrupt + Vulnerable',
    description: 'Unexpected opener with vulnerability',
    psychology: ['Pattern Interrupt', 'Labeling', 'Negative Reverse', 'Curiosity Gap'],
  },
  cold_direct: {
    name: 'Cold: Direct & Human',
    description: 'Human, slightly awkward, direct ask',
    psychology: ['Vulnerability', 'Directness', 'Qualification'],
  },
  cold_pattern_interrupt: {
    name: 'Cold: Pattern Interrupt',
    description: 'Self-aware, honest opener',
    psychology: ['Self-Awareness', 'Honesty', 'Easy Out'],
  },
  simple_personalized: {
    name: 'Simple & Personalized',
    description: 'Fixed template with website personalization',
    psychology: ['Vulnerability', 'Forward Request', 'Qualifying CTA'],
  },
};
