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
    // Build subtle personalization from job pain points
    const painPoints = prospect.jobPainPoints;
    const commTasks = painPoints?.communicationTasks?.slice(0, 2).join(', ') || '';
    const adminTasks = painPoints?.adminTasks?.slice(0, 2).join(', ') || '';
    const speedReqs = painPoints?.speedRequirements?.slice(0, 1).join('') || '';

    // Subtle context - reference the pain, not the job posting
    let subtleContext = '';
    if (painPoints?.summary) {
      subtleContext = `PAIN INSIGHT (use subtly, don't mention job posting): "${painPoints.summary}"`;
    }
    if (commTasks) {
      subtleContext += `\nCOMMUNICATION TASKS they deal with: ${commTasks}`;
    }
    if (speedReqs) {
      subtleContext += `\nSPEED PRESSURE they face: ${speedReqs}`;
    }

    return `You are Edd, an automation expert. Write a SHORT, CONFIDENT cold email.

=== TARGET ===
Property: ${prospect.name}
Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}
Type: ${prospect.propertyType || 'hotel'}
${subtleContext}

=== PERSONALIZATION APPROACH ===
${subtleContext ? `
**IMPORTANT**: We have intel about their specific pain points. Use this SUBTLY:
- DON'T say "I saw you're hiring" or "I noticed your job posting"
- DO reference specific tasks like "handling late-night inquiries" or "managing booking confirmations"
- Make it feel like you understand hotels, not like you scraped their data
- The goal: they think "how did he know we struggle with that?"
` : `
No specific intel available. Use generic hotel pain points:
- Response times to guest inquiries
- After-hours coverage
- Repetitive booking confirmations
`}

=== STRATEGY: DIRECT & CONFIDENT ===

**SUBJECT LINE (lowercase, cryptic, 3-4 words max):**
Creates curiosity gap. Examples:
- "${prospect.city} + 1 minute"
- "re: response times"
- "whoever replies first"
- "${prospect.name} quick one"

**GREETING:**
- If you have a contact name, use "Hey [FirstName]," or "Hi [FirstName],"
- If no contact name, use "Hey ${prospect.name} Team," or "Hi Team,"
- NEVER use generic "Hello," or "Hi there,"

**STRUCTURE - Use the 3Ps:**

1. PRAISE (specific, genuine - 1 sentence):
"${prospect.name} looks like a solid operation" OR reference something specific about their location/type.

2. PICTURE + LOSS (make them feel the cost - 2 sentences):
"But here's the thing - when a guest messages 3 hotels and you reply in 2 hours but someone else replies in 1 minute... that booking's gone. Most properties don't realise how many they're losing to faster competitors."
${subtleContext ? '\n**If you have pain point intel, weave it in here subtly**' : ''}

3. PUSH + FREEDOM (specific CTA + escape hatch):
"Worth 15 mins to see if there's low-hanging fruit? Totally fine if timing's off."

**"BUT YOU ARE FREE" TECHNIQUE (CRITICAL):**
End with an escape hatch. Paradoxically increases responses:
- "Totally fine if timing's off"
- "No stress if it's not a priority right now"

=== RULES ===
- 70-90 words MAX (SHORT!)
- NO "Hey!" opener - start with their name or straight into praise
- 2 SHORT paragraphs only
- NO uncertainty ("not sure if", "might be wrong person")
- Sound like an expert qualifying THEM
- NO bullet points, NO signature
- NEVER mention "job posting", "hiring", or "saw you're looking for"
- Use "here's the thing", "honestly", "the reality is"

Output ONLY valid JSON:
{"subject": "subject here", "body": "email body here"}`;
  },
};

/**
 * STRATEGY B: Pattern Interrupt + Vulnerability
 * Uses pattern interrupt, confession, labeling, and negative reverse selling.
 *
 * 2025 RESEARCH-BACKED (Belkins, Martal, Instantly.ai):
 * - 50-125 words = 50% reply rate sweet spot
 * - 2-4 word subject lines = 46% open rate
 * - Personalized first line = +50% opens
 * - Soft CTA = +10-20% replies
 * - Pain point focus = +15-25% replies
 *
 * Psychology: Pattern Interrupt, Vulnerability Loop, Labeling, Future Pacing, Micro-Commitment
 *
 * KEY DIFFERENTIATORS FROM STRATEGY A:
 * - 70-90 words (OPTIMAL for 50% reply rate zone)
 * - Pattern interrupt subject (unexpected, lowercase)
 * - Opens with vulnerability/confession (builds trust instantly)
 * - Uses LABELING ("You seem like the kind of property that...")
 * - Negative reverse: "This probably isn't for everyone"
 * - Future pacing: paint the outcome, not the process
 * - Micro-commitment: soft ask (just a reply, not a call)
 */
const curiosityValueStrategy: CampaignStrategy = {
  key: 'curiosity_value',
  name: 'Pattern Interrupt + Vulnerable',
  description: 'Pattern interrupt, vulnerability opener, negative reverse. 70-90 words.',
  generatePrompt: (prospect) => {
    // Build subtle personalization from job pain points
    const painPoints = prospect.jobPainPoints;
    const commTasks = painPoints?.communicationTasks?.slice(0, 2).join(', ') || '';
    const adminTasks = painPoints?.adminTasks?.slice(0, 2).join(', ') || '';
    const speedReqs = painPoints?.speedRequirements?.slice(0, 1).join('') || '';

    // Subtle context - reference the pain, not the job posting
    let subtleContext = '';
    if (painPoints?.summary) {
      subtleContext = `PAIN INSIGHT (weave subtly): "${painPoints.summary}"`;
    }
    if (commTasks) {
      subtleContext += `\nTASKS they juggle: ${commTasks}`;
    }
    if (speedReqs) {
      subtleContext += `\nSPEED PRESSURE: ${speedReqs}`;
    }

    return `You are Edd. Write a PATTERN-INTERRUPT cold email with vulnerability and labeling.

=== TARGET ===
Property: ${prospect.name}
Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}
Type: ${prospect.propertyType || 'hotel'}
${subtleContext}

=== PERSONALIZATION APPROACH ===
${subtleContext ? `
**CRITICAL**: We have specific intel about their pain points. Use SUBTLY:
- NEVER say "I saw you're hiring" or "noticed your job posting" - that's creepy
- DO reference specific tasks naturally: "handling after-hours inquiries", "managing confirmation emails"
- Frame it like you deeply understand the hotel industry, not like you scraped their data
- Goal: they think "this guy really gets what we deal with"

Example of GOOD subtle personalization:
"Properties like yours that handle a lot of direct bookings usually spend hours on confirmation emails alone..."

Example of BAD obvious personalization:
"I saw you're hiring a reservations manager, so I assume you need help with bookings..."
` : `
Use generic hotel industry knowledge:
- Response times to guest inquiries
- After-hours/overnight coverage gaps
- Repetitive confirmation emails and booking updates
`}

=== STRATEGY: PATTERN INTERRUPT + VULNERABILITY ===

**SUBJECT LINE (2-4 words, lowercase, pattern interrupt):**
Break their mental script. NOT a typical sales subject. Examples:
- "probably ignore this"
- "weird ask"
- "this might be dumb"
- "random thought"
- "honest question"

**GREETING:**
- If you have a contact name, use "Hey [FirstName]," (casual, no exclamation)
- If no contact name, use "Hey ${prospect.name} Team," or "Hey Team,"
- NEVER use exclamation marks - stay calm, not salesy

**STRUCTURE (70-90 words total):**

1. VULNERABILITY OPENER (1 sentence - disarms instantly):
- "I'll be honest - I have no idea if this is even relevant to you."
- "This might be completely off-base, but..."
- "Full transparency - you probably get a lot of these."

2. LABELING + LOSS (2 sentences - make them feel it):
Label them with a positive trait, then hit the pain:
- "But you seem like the kind of property that actually cares about response times."
- "But here's the thing - when a guest messages 3 hotels and you reply in 2 hours but someone else replies in 1 minute... that booking's gone."
${subtleContext ? '\n**Weave in their specific pain point here if relevant**' : ''}

3. FUTURE PACE + NEGATIVE REVERSE (2 sentences):
- "Imagine every inquiry getting a perfect reply in under 1 minute, 24/7."
- "This isn't for everyone - most properties are fine being reactive. But if you've wondered how much slips away overnight... might be worth a quick reply?"

=== RULES ===
- 70-90 words MAX (optimal reply zone)
- 2-4 word subject line
- NO excitement, NO hype - calm and honest tone
- NEVER mention "job posting", "hiring", or "saw you're looking for"
- Sound slightly uncertain (builds trust)
- Use "I'll be honest", "This might be...", "Full transparency"
- End with soft CTA: "worth a reply?" or "curious if this lands?"
- NO bullet points, NO signature (added automatically)
- 2-3 short paragraphs with \\n\\n between

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
