/**
 * AI-Powered Reply Analysis Engine
 *
 * Advanced intent detection using LLM with:
 * - Semantic understanding (not just keywords)
 * - Entity extraction (meeting times, contacts, objections)
 * - Sentiment analysis with nuance
 * - Thread context understanding
 * - Delegation/referral detection
 * - Objection categorization
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';

export interface ReplyAnalysis {
  // Core intent classification
  intent: 'meeting_request' | 'interested' | 'needs_info' | 'not_interested' | 'delegation' | 'out_of_office' | 'unclear';
  confidence: number; // 0-100

  // Detailed signals
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'high' | 'medium' | 'low';

  // Extracted entities
  entities: {
    proposedTimes?: string[]; // "Tuesday at 2pm", "next week"
    alternateContact?: { name?: string; email?: string; role?: string };
    decisionMaker?: string;
    timeline?: string; // "Q1", "after budget approval"
    competitor?: string; // If they mention existing solution
  };

  // Objection handling
  objection?: {
    type: 'budget' | 'timing' | 'authority' | 'need' | 'competitor' | 'other';
    detail: string;
    canOvercome: boolean;
  };

  // Action recommendations
  recommendedAction: 'schedule_call' | 'send_info' | 'follow_up_later' | 'contact_alternate' | 'archive' | 'manual_review';
  actionReason: string;

  // Raw analysis
  summary: string;
  keyPoints: string[];
}

// Fallback keyword-based analysis (used when AI is unavailable)
const MEETING_KEYWORDS = [
  'meet', 'meeting', 'call', 'schedule', 'calendly', 'demo', 'chat',
  'discuss', 'talk', 'connect', 'available', 'free time', 'book',
  'appointment', 'zoom', 'teams', 'google meet', 'let\'s talk',
];

const NOT_INTERESTED_KEYWORDS = [
  'not interested', 'no thank', 'unsubscribe', 'remove me', 'stop emailing',
  'don\'t contact', 'not looking', 'already have', 'not for us', 'pass',
];

const DELEGATION_KEYWORDS = [
  'speak to', 'contact my', 'talk to', 'cc\'d', 'copying', 'forwarding to',
  'better person', 'handles this', 'in charge of', 'reach out to',
];

const OUT_OF_OFFICE_KEYWORDS = [
  'out of office', 'on vacation', 'away from', 'limited access', 'return on',
  'back on', 'annual leave', 'holiday', 'parental leave',
];

/**
 * Fallback keyword-based analysis
 */
function keywordAnalysis(subject: string, body: string): ReplyAnalysis {
  const text = `${subject} ${body}`.toLowerCase();

  // Detect intent
  let intent: ReplyAnalysis['intent'] = 'unclear';
  let sentiment: ReplyAnalysis['sentiment'] = 'neutral';
  let recommendedAction: ReplyAnalysis['recommendedAction'] = 'manual_review';

  if (OUT_OF_OFFICE_KEYWORDS.some(kw => text.includes(kw))) {
    intent = 'out_of_office';
    recommendedAction = 'follow_up_later';
  } else if (DELEGATION_KEYWORDS.some(kw => text.includes(kw))) {
    intent = 'delegation';
    recommendedAction = 'contact_alternate';
  } else if (NOT_INTERESTED_KEYWORDS.some(kw => text.includes(kw))) {
    intent = 'not_interested';
    sentiment = 'negative';
    recommendedAction = 'archive';
  } else if (MEETING_KEYWORDS.some(kw => text.includes(kw))) {
    intent = 'meeting_request';
    sentiment = 'positive';
    recommendedAction = 'schedule_call';
  } else if (text.includes('?') || text.includes('more info') || text.includes('tell me')) {
    intent = 'needs_info';
    sentiment = 'neutral';
    recommendedAction = 'send_info';
  }

  // Calculate confidence based on keyword matches
  const allKeywords = [...MEETING_KEYWORDS, ...NOT_INTERESTED_KEYWORDS, ...DELEGATION_KEYWORDS, ...OUT_OF_OFFICE_KEYWORDS];
  const matches = allKeywords.filter(kw => text.includes(kw)).length;
  const confidence = Math.min(matches * 20 + 30, 70); // Cap at 70 for keyword-only

  return {
    intent,
    confidence,
    sentiment,
    urgency: 'medium',
    entities: {},
    recommendedAction,
    actionReason: 'Keyword-based analysis (AI unavailable)',
    summary: `Detected ${intent} intent based on keyword matching`,
    keyPoints: [],
  };
}

/**
 * AI-powered reply analysis
 */
export async function analyzeReplyWithAI(
  subject: string,
  body: string,
  context?: {
    prospectName?: string;
    previousEmails?: number;
    industry?: string;
  }
): Promise<ReplyAnalysis> {
  const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;

  // Fallback to keyword analysis if no API key
  if (!apiKey) {
    logger.debug('No AI API key, using keyword analysis');
    return keywordAnalysis(subject, body);
  }

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_API_KEY ? 'https://api.x.ai' : undefined,
    });

    const prompt = `Analyze this email reply and extract structured intent data.

=== EMAIL ===
Subject: ${subject}
Body: ${body}

=== CONTEXT ===
Prospect: ${context?.prospectName || 'Unknown'}
Previous emails in thread: ${context?.previousEmails || 'Unknown'}
Industry: ${context?.industry || 'Hospitality'}

=== TASK ===
Analyze the reply and return a JSON object with:

1. **intent**: One of:
   - "meeting_request" - They want to schedule a call/meeting
   - "interested" - Positive but not ready to meet yet
   - "needs_info" - Asking questions, wants more information
   - "not_interested" - Declining, asking to stop contact
   - "delegation" - Forwarding to someone else
   - "out_of_office" - Auto-reply, vacation notice
   - "unclear" - Can't determine intent

2. **confidence**: 0-100 how sure you are about the intent

3. **sentiment**: "positive", "neutral", or "negative"

4. **urgency**: "high" (respond ASAP), "medium" (respond today), "low" (can wait)

5. **entities**: Extract any of these if present:
   - proposedTimes: Array of suggested meeting times
   - alternateContact: {name, email, role} if they mention someone else
   - decisionMaker: Name of the decision maker if mentioned
   - timeline: When they might be ready ("Q1", "after budget")
   - competitor: Name of existing solution if mentioned

6. **objection**: If declining, categorize:
   - type: "budget", "timing", "authority", "need", "competitor", "other"
   - detail: Brief explanation
   - canOvercome: true/false if this seems like a soft objection

7. **recommendedAction**: One of:
   - "schedule_call" - Send calendar link
   - "send_info" - Answer their questions
   - "follow_up_later" - Set reminder for later
   - "contact_alternate" - Reach out to the person they mentioned
   - "archive" - Mark as lost
   - "manual_review" - Needs human judgment

8. **actionReason**: Why you recommend this action

9. **summary**: One sentence summary of the reply

10. **keyPoints**: Array of 1-3 key takeaways

=== OUTPUT ===
Return ONLY valid JSON, no markdown or explanation:`;

    const response = await anthropic.messages.create({
      model: process.env.XAI_API_KEY ? 'grok-4-1-fast-non-reasoning' : 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      logger.warn('No text in AI response, falling back to keywords');
      return keywordAnalysis(subject, body);
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('No JSON in AI response, falling back to keywords');
      return keywordAnalysis(subject, body);
    }

    const parsed = JSON.parse(jsonMatch[0]) as ReplyAnalysis;

    // Validate required fields
    if (!parsed.intent || !parsed.recommendedAction) {
      logger.warn('Invalid AI response structure, falling back to keywords');
      return keywordAnalysis(subject, body);
    }

    logger.info({
      intent: parsed.intent,
      confidence: parsed.confidence,
      action: parsed.recommendedAction,
    }, 'AI reply analysis completed');

    return parsed;
  } catch (error) {
    logger.error({ error }, 'AI reply analysis failed, using keyword fallback');
    return keywordAnalysis(subject, body);
  }
}

/**
 * Batch analyze multiple replies (for efficiency)
 */
export async function analyzeRepliesBatch(
  replies: Array<{
    subject: string;
    body: string;
    context?: {
      prospectName?: string;
      previousEmails?: number;
      industry?: string;
    };
  }>
): Promise<ReplyAnalysis[]> {
  // Process in parallel but with concurrency limit
  const results: ReplyAnalysis[] = [];
  const batchSize = 3;

  for (let i = 0; i < replies.length; i += batchSize) {
    const batch = replies.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(r => analyzeReplyWithAI(r.subject, r.body, r.context))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get action priority score for sorting/queuing
 */
export function getActionPriority(analysis: ReplyAnalysis): number {
  const intentScores: Record<ReplyAnalysis['intent'], number> = {
    meeting_request: 100,
    interested: 80,
    needs_info: 60,
    delegation: 50,
    unclear: 30,
    out_of_office: 20,
    not_interested: 10,
  };

  const urgencyMultiplier: Record<ReplyAnalysis['urgency'], number> = {
    high: 1.5,
    medium: 1.0,
    low: 0.7,
  };

  const base = intentScores[analysis.intent] || 30;
  const multiplier = urgencyMultiplier[analysis.urgency] || 1.0;
  const confidenceBonus = (analysis.confidence / 100) * 20;

  return Math.round(base * multiplier + confidenceBonus);
}

/**
 * Generate suggested response based on analysis
 */
export function getSuggestedResponseType(analysis: ReplyAnalysis): string {
  switch (analysis.recommendedAction) {
    case 'schedule_call':
      return analysis.entities.proposedTimes?.length
        ? `Confirm meeting at ${analysis.entities.proposedTimes[0]}`
        : 'Send calendar link';
    case 'send_info':
      return `Address their questions about: ${analysis.keyPoints.join(', ') || 'general info'}`;
    case 'follow_up_later':
      return analysis.entities.timeline
        ? `Follow up ${analysis.entities.timeline}`
        : 'Set 2-week follow-up reminder';
    case 'contact_alternate':
      return analysis.entities.alternateContact?.name
        ? `Reach out to ${analysis.entities.alternateContact.name}`
        : 'Contact the referred person';
    case 'archive':
      return `Archive - ${analysis.objection?.detail || 'Not interested'}`;
    default:
      return 'Manual review required';
  }
}
