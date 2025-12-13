/**
 * AI Gateway - Multi-provider AI with automatic failover
 *
 * Supports: Grok, Claude, OpenAI, Workers AI (fallback)
 * Features: Circuit breaker, rate limiting, cost tracking
 */

import { Env, GeneratedEmail, Prospect, CampaignStrategy } from '../types';
import { CAMPAIGN_PROMPTS } from './campaign-strategies';

interface AIProvider {
  name: string;
  priority: number;
  generate: (prompt: string, env: Env) => Promise<string>;
}

/**
 * Generate email using AI with automatic failover
 */
export async function generateEmail(
  prospect: Prospect,
  strategy: CampaignStrategy,
  isFollowUp: boolean,
  env: Env
): Promise<GeneratedEmail> {
  const startTime = Date.now();

  // Build the prompt (add follow-up context if needed)
  let prompt = CAMPAIGN_PROMPTS[strategy](prospect);

  if (isFollowUp) {
    prompt += `\n\nIMPORTANT: This is a FOLLOW-UP email. The prospect has already received an initial outreach.
- Be brief (50-70 words max)
- Reference that you reached out before
- Don't repeat the full pitch
- Create gentle urgency
- Use a softer CTA like "just checking if this landed?" or "worth a quick look?"`;
  }

  // Get rate limiter DO
  const rateLimiter = env.RATE_LIMITER.get(
    env.RATE_LIMITER.idFromName('global')
  );

  // Try providers in order
  const providers: AIProvider[] = [
    { name: 'grok', priority: 1, generate: generateWithGrok },
    { name: 'claude', priority: 2, generate: generateWithClaude },
    { name: 'openai', priority: 3, generate: generateWithOpenAI },
  ];

  let lastError: Error | null = null;

  for (const provider of providers) {
    // Check rate limit
    const canUse = await rateLimiter
      .fetch(new Request('http://do/check', {
        method: 'POST',
        body: JSON.stringify({ provider: provider.name, tokens: 1500 }),
      }))
      .then((r) => r.json<{ allowed: boolean; retryAfter?: number }>());

    if (!canUse.allowed) {
      console.log(`Rate limit hit for ${provider.name}, trying next`);
      continue;
    }

    try {
      // Generate with timeout
      const result = await Promise.race([
        provider.generate(prompt, env),
        timeout(15000), // 15s timeout
      ]);

      if (!result) {
        throw new Error('Empty response from AI');
      }

      // Parse the JSON response
      const parsed = parseEmailResponse(result);

      // Record usage
      await rateLimiter.fetch(new Request('http://do/consume', {
        method: 'POST',
        body: JSON.stringify({ provider: provider.name, tokens: 1500 }),
      }));

      // Log success
      console.log(`AI generation success: provider=${provider.name}, strategy=${strategy}, latency=${Date.now() - startTime}ms`);

      return {
        subject: parsed.subject,
        body: parsed.body,
        provider: provider.name,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`${provider.name} failed:`, lastError.message);

      // Record rate limit if applicable
      if (lastError.message.includes('rate') || lastError.message.includes('429')) {
        await rateLimiter.fetch(new Request('http://do/rate-limited', {
          method: 'POST',
          body: JSON.stringify({ provider: provider.name }),
        }));
      }

      continue;
    }
  }

  // All providers failed - log failure
  console.error(`AI generation failed: all providers exhausted, strategy=${strategy}, latency=${Date.now() - startTime}ms`);

  throw lastError || new Error('All AI providers failed');
}

/**
 * Analyze reply intent using AI
 */
export async function analyzeReplyIntent(
  subject: string,
  body: string,
  env: Env
): Promise<{
  intent: string;
  confidence: number;
  summary: string;
  recommendedAction: string;
}> {
  const prompt = `Analyze this email reply and determine the sender's intent.

Subject: ${subject}
Body: ${body}

Classify the intent as ONE of:
- meeting_request: They want to schedule a call/meeting
- interested: Positive but not ready to commit
- needs_info: Asking questions, wants more details
- not_interested: Declining, not a fit
- delegation: Forwarding to someone else
- out_of_office: Auto-reply, vacation notice
- unclear: Can't determine

Respond in JSON format:
{
  "intent": "one_of_above",
  "confidence": 0-100,
  "summary": "one sentence summary",
  "recommendedAction": "what to do next"
}`;

  // Use Claude for analysis (better at nuance)
  const rateLimiter = env.RATE_LIMITER.get(
    env.RATE_LIMITER.idFromName('global')
  );

  const canUse = await rateLimiter
    .fetch(new Request('http://do/check', {
      method: 'POST',
      body: JSON.stringify({ provider: 'claude', tokens: 500 }),
    }))
    .then((r) => r.json<{ allowed: boolean }>());

  if (canUse.allowed) {
    try {
      const result = await generateWithClaude(prompt, env);
      await rateLimiter.fetch(new Request('http://do/consume', {
        method: 'POST',
        body: JSON.stringify({ provider: 'claude', tokens: 500 }),
      }));

      return JSON.parse(result);
    } catch (error) {
      console.error('Claude analysis failed:', error);
    }
  }

  // Fallback to keyword-based analysis
  return analyzeReplyKeywords(subject, body);
}

/**
 * Generate text with Grok (exported for reply handler)
 */
export async function generateTextWithGrok(prompt: string, env: Env): Promise<string> {
  return generateWithGrok(prompt, env);
}

/**
 * Grok API (x.ai)
 */
async function generateWithGrok(prompt: string, env: Env): Promise<string> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3-mini-fast',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json<{
    choices: [{ message: { content: string } }];
  }>();

  return data.choices[0].message.content;
}

/**
 * Claude API (Anthropic)
 */
async function generateWithClaude(prompt: string, env: Env): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json<{
    content: [{ text: string }];
  }>();

  return data.content[0].text;
}

/**
 * OpenAI API (fallback)
 */
async function generateWithOpenAI(prompt: string, env: Env): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json<{
    choices: [{ message: { content: string } }];
  }>();

  return data.choices[0].message.content;
}

/**
 * Parse AI response into email format
 */
function parseEmailResponse(response: string): { subject: string; body: string } {
  // Try to parse as JSON
  try {
    // Find JSON in response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.subject && parsed.body) {
        return parsed;
      }
    }
  } catch {
    // Not JSON, try to extract manually
  }

  // Try to extract subject/body manually
  const subjectMatch = response.match(/subject[:\s]*["']?([^"\n]+)["']?/i);
  const bodyMatch = response.match(/body[:\s]*["']?([\s\S]+?)["']?(?:$|\n\n)/i);

  if (subjectMatch && bodyMatch) {
    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
    };
  }

  throw new Error('Could not parse AI response into email format');
}

/**
 * Keyword-based reply analysis fallback
 */
function analyzeReplyKeywords(
  subject: string,
  body: string
): {
  intent: string;
  confidence: number;
  summary: string;
  recommendedAction: string;
} {
  const text = `${subject} ${body}`.toLowerCase();

  // Meeting keywords
  if (/\b(meet|meeting|call|schedule|calendly|demo|chat|discuss|15 min|30 min)\b/.test(text)) {
    return {
      intent: 'meeting_request',
      confidence: 70,
      summary: 'Prospect appears interested in meeting',
      recommendedAction: 'schedule_call',
    };
  }

  // Not interested keywords
  if (/\b(not interested|no thank|remove me|unsubscribe|stop|don't contact)\b/.test(text)) {
    return {
      intent: 'not_interested',
      confidence: 85,
      summary: 'Prospect declined',
      recommendedAction: 'archive',
    };
  }

  // Out of office
  if (/\b(out of office|on vacation|away from|return on|automatic reply|auto-reply)\b/.test(text)) {
    return {
      intent: 'out_of_office',
      confidence: 95,
      summary: 'Auto-reply detected',
      recommendedAction: 'follow_up_later',
    };
  }

  // Delegation
  if (/\b(speak to|contact my|forwarding|in charge of|reach out to|better person)\b/.test(text)) {
    return {
      intent: 'delegation',
      confidence: 65,
      summary: 'Prospect forwarding to someone else',
      recommendedAction: 'contact_alternate',
    };
  }

  // Needs info
  if (/\b(more info|tell me more|how does|what is|pricing|cost|details)\b/.test(text)) {
    return {
      intent: 'needs_info',
      confidence: 60,
      summary: 'Prospect asking questions',
      recommendedAction: 'send_info',
    };
  }

  // Default: interested (positive signal)
  if (/\b(interested|sounds good|tell me|curious|intrigued)\b/.test(text)) {
    return {
      intent: 'interested',
      confidence: 55,
      summary: 'Prospect shows interest',
      recommendedAction: 'send_info',
    };
  }

  return {
    intent: 'unclear',
    confidence: 30,
    summary: 'Could not determine intent',
    recommendedAction: 'manual_review',
  };
}

/**
 * Timeout helper
 */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
}
