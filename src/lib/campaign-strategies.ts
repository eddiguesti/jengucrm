/**
 * Campaign Email Strategies
 * Two fundamentally different approaches for A/B testing cold outreach
 * Based on 2025 sales psychology research (Cialdini, Kahneman, Langer)
 */

interface ProspectContext {
  name: string;
  city: string | null;
  country: string | null;
  propertyType: string | null;
  jobTitle?: string | null;
  painSignals?: { keyword: string; snippet: string }[];
  jobPainPoints?: {
    summary?: string;
    communicationTasks?: string[];
    adminTasks?: string[];
    speedRequirements?: string[];
  };
}

export interface CampaignStrategy {
  key: string;
  name: string;
  description: string;
  generatePrompt: (prospect: ProspectContext) => string;
}

/**
 * STRATEGY A: Direct & Confident
 * Short, punchy, authority-first. No uncertainty. Loss-focused.
 * Psychology: Authority, Loss Aversion, Scarcity, "But You Are Free"
 *
 * KEY DIFFERENTIATORS:
 * - 70-90 words (SHORT)
 * - Lowercase cryptic subject (3-4 words)
 * - NO uncertainty language ("not sure", "might be wrong")
 * - Starts with specific observation about THEM
 * - Ends with specific CTA: "Worth 15 mins?"
 */
const authorityScarcityStrategy: CampaignStrategy = {
  key: 'authority_scarcity',
  name: 'Direct & Confident',
  description: 'Short, punchy, authority-first. 70-90 words. Ends with "Worth 15 mins?"',
  generatePrompt: (prospect) => {
    const jobContext = prospect.jobTitle
      ? `BUYING SIGNAL: They're hiring for ${prospect.jobTitle} - USE THIS. Praise: "Saw you're hiring for ${prospect.jobTitle} - that's usually a sign things are scaling up."`
      : '';

    const painContext = prospect.jobPainPoints?.summary
      ? `PAIN INSIGHT: "${prospect.jobPainPoints.summary}" - weave this naturally`
      : '';

    return `You are Edd, an automation expert. Write a SHORT, CONFIDENT cold email.

=== TARGET ===
Property: ${prospect.name}
Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}
Type: ${prospect.propertyType || 'hotel'}
${jobContext}
${painContext}

=== STRATEGY: DIRECT & CONFIDENT ===

**SUBJECT LINE (lowercase, cryptic, 3-4 words max):**
Creates curiosity gap. Examples:
- "${prospect.city} + 30 seconds"
- "re: response times"
- "whoever replies first"
- "${prospect.name} quick one"

**STRUCTURE - Use the 3Ps:**

1. PRAISE (specific, genuine - 1 sentence):
${prospect.jobTitle
  ? `"Saw you're hiring for ${prospect.jobTitle} - smart move, that role's always a sign things are moving."`
  : `"${prospect.name} looks like a solid operation from what I can see online."`}

2. PICTURE + LOSS (make them feel the cost - 2 sentences):
"Here's the thing - whoever replies to a booking inquiry first usually wins it. Most properties don't realise how many they're losing to faster competitors."

3. PUSH + FREEDOM (specific CTA + escape hatch):
"Worth 15 mins to see if there's low-hanging fruit? Totally fine if timing's off."

**"BUT YOU ARE FREE" TECHNIQUE (CRITICAL):**
End with an escape hatch. Paradoxically increases responses:
- "Totally fine if timing's off"
- "No stress if it's not a priority right now"
- "You're free to ignore this completely"

=== RULES ===
- 70-90 words MAX (SHORT!)
- NO "Hey!" opener - start with their name or straight into praise
- 2 SHORT paragraphs only
- NO uncertainty ("not sure if", "might be wrong person")
- Sound like an expert qualifying THEM
- NO bullet points, NO signature
- Use "here's the thing", "honestly", "the reality is"

Output ONLY valid JSON:
{"subject": "subject here", "body": "email body here"}`;
  },
};

/**
 * STRATEGY B: Curious & Generous
 * Longer, story-driven, value-heavy. Ask for thoughts, not meetings.
 * Psychology: Curiosity Gap, Reciprocity, Foot-in-Door, "Because" Principle, Tension
 *
 * KEY DIFFERENTIATORS:
 * - 100-120 words (LONGER)
 * - Question format subject line
 * - Lead with genuine praise about THEM specifically
 * - Frame as research/curiosity, not selling
 * - Heavy value-first (free process map)
 * - NO meeting ask - only ask for THOUGHTS (foot-in-door)
 * - Uses "because" principle throughout
 */
const curiosityValueStrategy: CampaignStrategy = {
  key: 'curiosity_value',
  name: 'Curious & Generous',
  description: 'Longer, story-driven. Offers free value. Ends with "What do you think?"',
  generatePrompt: (prospect) => {
    const jobContext = prospect.jobTitle
      ? `BUYING SIGNAL: They're hiring for ${prospect.jobTitle} - work this into your curiosity: "I noticed you're hiring for ${prospect.jobTitle}, which got me wondering..."`
      : '';

    const painContext = prospect.jobPainPoints?.summary
      ? `PAIN INSIGHT: "${prospect.jobPainPoints.summary}" - this is GOLD. Reference it naturally.`
      : '';

    return `You are Edd. Write a CURIOUS, VALUE-FIRST cold email. Longer, more conversational.

=== TARGET ===
Property: ${prospect.name}
Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}
Type: ${prospect.propertyType || 'hotel'}
${jobContext}
${painContext}

=== STRATEGY: CURIOUS & GENEROUS ===

**SUBJECT LINE (question format, creates open loop):**
The brain NEEDS to close open loops. Examples:
- "question about ${prospect.name}'s response times?"
- "do you automate guest messages?"
- "curious about something at ${prospect.name}"
- "quick poll for ${prospect.city} hotels"

**STRUCTURE:**

1. OPENER - "Hey!" + Genuine Compliment (warm, friendly):
"Hey! I came across ${prospect.name} while researching ${prospect.city} properties and honestly, [specific genuine observation - their reviews, their vibe, their location]."

2. CURIOSITY + "BECAUSE" (create intrigue, explain why):
"I'm reaching out because I've been looking at how hospitality businesses handle the booking inquiry race - you know, the 'whoever replies first wins the guest' thing."

3. TENSION WITHOUT CRITICISM (challenge an assumption):
"Here's the counterintuitive thing I've noticed - it's usually not the biggest properties that reply fastest. It's the ones who've automated the predictable stuff."

4. VALUE OFFER (free, no strings, reciprocity):
"I do free process maps for properties like yours - basically a quick look at what could be automated for the best ROI. No strings attached, genuinely useful even if we never work together."

5. FOOT-IN-THE-DOOR (ask for THOUGHTS, not a meeting):
"Does this resonate at all? Curious what you think."

**THE "BECAUSE" PRINCIPLE (use throughout):**
"I'm reaching out because...", "I mention this because...", "Worth asking because..."

=== RULES ===
- 100-120 words (LONGER than Strategy A)
- Start with "Hey!" - be warm and approachable
- 3-4 SHORT paragraphs with \\n\\n between
- Sound genuinely curious, like you're researching
- DO NOT ask for a meeting - only ask for their THOUGHTS
- Use "I'm curious", "wondering", "I noticed"
- NO bullet points, NO signature
- End with a QUESTION about their situation

Output ONLY valid JSON:
{"subject": "subject here", "body": "email body here"}`;
  },
};

/**
 * All available campaign strategies
 */
export const CAMPAIGN_STRATEGIES: Record<string, CampaignStrategy> = {
  authority_scarcity: authorityScarcityStrategy,
  curiosity_value: curiosityValueStrategy,
};

/**
 * Get strategy by key
 */
export function getStrategy(strategyKey: string): CampaignStrategy | null {
  return CAMPAIGN_STRATEGIES[strategyKey] || null;
}

/**
 * Get all active strategies
 */
export function getAllStrategies(): CampaignStrategy[] {
  return Object.values(CAMPAIGN_STRATEGIES);
}
