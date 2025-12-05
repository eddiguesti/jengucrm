import { NextRequest } from 'next/server';
import { z } from 'zod';
import { checkAndIncrement } from '@/lib/rate-limiter-db';
import { success, errors } from '@/lib/api-response';
import { parseBody, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';

const SYSTEM_PROMPT = `You are Edd Guest, Director at Jengu - a hospitality technology company.
You write natural, human first-touch emails to hotels you've discovered through your research.

About Jengu:
- We help luxury and boutique hotels with AI-powered guest communication
- Our platform handles guest inquiries, booking questions, and pre-arrival coordination - 24/7, in any language
- We work with independent properties and small groups who want to provide instant, personalized responses without growing their team
- We're based in the UK and work internationally

Your writing style:
- Sound like a real person who's genuinely interested in their property, not a salesperson
- Write like you're reaching out to someone you'd like to meet for coffee
- Keep it conversational and warm - you're a hospitality person talking to hospitality people
- Be brief - these are busy GMs who get 100 emails a day
- Show you've actually looked at their property - mention something SPECIFIC
- One simple ask: a quick chat to see if there's a fit
- NO buzzwords (synergy, leverage, solutions, optimize, innovative)
- NO corporate speak or marketing fluff
- NO "I hope this email finds you well"
- NO bullet points
- NO "pain points" or "challenges" - be helpful, not salesy
- If given mystery shopper context about slow response, weave it in VERY subtly - never accusatory

Structure (keep the whole email under 100 words):
1. Opening: Something specific about THEM (their property, a detail from their website, their reviews, their location)
2. Bridge: Brief, natural transition to why you thought of reaching out (1 sentence max)
3. Jengu: One sentence about what we do - focus on the benefit, not features
4. Ask: Simple, low-pressure invitation - "worth a quick chat?" or similar

Sign off with just:
Best,
Edd

(The full signature with contact details is added automatically)

Respond ONLY in valid JSON format:
{
  "subject": "short, casual subject line - like you'd write to a colleague",
  "body": "the email body WITHOUT any signature - end with 'Best,\\nEdd'",
  "personalization_notes": "what specific details you used to personalize this email"
}`;

const prospectSchema = z.object({
  name: z.string(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  website: z.string().nullish(),
  google_rating: z.number().nullish(),
  google_review_count: z.number().nullish(),
  star_rating: z.number().nullish(),
  room_count: z.number().nullish(),
  source_job_title: z.string().nullish(),
  source: z.string().nullish(),
  tier: z.string().nullish(),
  contact_name: z.string().nullish(),
  contact_title: z.string().nullish(),
  notes: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  linkedin_url: z.string().nullish(),
  instagram_url: z.string().nullish(),
  chain_affiliation: z.string().nullish(),
  mystery_shopper_sent: z.boolean().nullish(),
  mystery_shopper_response_time_hours: z.number().nullish(),
  mystery_shopper_responded: z.boolean().nullish(),
});

const generateEmailSchema = z.object({
  prospect: prospectSchema,
});

type ProspectData = z.infer<typeof prospectSchema>;

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimit = await checkAndIncrement('xai_emails');
    if (!rateLimit.allowed) {
      return errors.tooManyRequests('Daily email generation limit reached. Try again tomorrow.');
    }

    if (!config.ai.apiKey) {
      return errors.internal('AI API key not configured');
    }

    const { prospect } = await parseBody(request, generateEmailSchema);
    const prompt = buildPrompt(prospect);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-latest',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, status: response.status }, 'Grok API error');
      return errors.internal(`Grok API error: ${error}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ responseText }, 'Failed to parse email response');
      return errors.internal('Failed to parse email response');
    }

    const emailData = JSON.parse(jsonMatch[0]);

    logger.info({ prospect: prospect.name }, 'Email generated');
    return success({
      subject: emailData.subject,
      body: emailData.body,
      personalization_notes: emailData.personalization_notes,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Email generation failed');
    return errors.internal('Failed to generate email', error);
  }
}

function buildPrompt(prospect: ProspectData) {
  const details: string[] = [];

  details.push(`Property name: ${prospect.name}`);

  if (prospect.city || prospect.country) {
    const location = [prospect.city, prospect.country].filter(Boolean).join(', ');
    details.push(`Location: ${location}`);
  }

  if (prospect.star_rating) {
    details.push(`Star rating: ${prospect.star_rating}-star property`);
  }

  if (prospect.room_count) {
    details.push(`Size: ${prospect.room_count} rooms`);
  }

  if (prospect.chain_affiliation) {
    details.push(`Affiliation: ${prospect.chain_affiliation}`);
  } else if (prospect.tags?.includes('independent')) {
    details.push(`Type: Independent/boutique property`);
  }

  if (prospect.google_rating) {
    details.push(`Google rating: ${prospect.google_rating}/5 stars`);
  }

  if (prospect.google_review_count) {
    details.push(`Reviews: ${prospect.google_review_count} Google reviews`);
  }

  if (prospect.website) {
    details.push(`Website: ${prospect.website}`);
  }

  if (prospect.contact_name) {
    const title = prospect.contact_title ? ` (${prospect.contact_title})` : '';
    details.push(`Contact: ${prospect.contact_name}${title}`);
  }

  // Only mention job posting for non-Sales Navigator prospects (they already have names)
  if (prospect.source_job_title && prospect.source !== 'sales_navigator') {
    details.push(`Found via job posting for: ${prospect.source_job_title}`);
  }

  if (prospect.notes && prospect.notes.length > 50) {
    details.push(`Research notes: ${prospect.notes}`);
  }

  const hints: string[] = [];

  if (prospect.tier === 'hot') {
    hints.push('This is a high-value lead - they have strong online presence and/or are actively hiring');
  }

  if (prospect.google_review_count && prospect.google_review_count > 500) {
    hints.push('Very popular property with lots of guest feedback - they clearly care about reputation');
  }

  if (prospect.tags?.includes('spa') || prospect.tags?.includes('luxury')) {
    hints.push('Luxury/spa property - focus on premium guest experience');
  }

  // Only add job-related hints for non-Sales Navigator prospects
  if (prospect.source !== 'sales_navigator') {
    const jobTitle = (prospect.source_job_title || '').toLowerCase();
    if (jobTitle.includes('revenue') || jobTitle.includes('commercial')) {
      hints.push('They\'re hiring for revenue/commercial roles - they\'re focused on growth');
    }
    if (jobTitle.includes('marketing') || jobTitle.includes('digital')) {
      hints.push('They\'re hiring for marketing - they\'re investing in their brand');
    }
    if (jobTitle.includes('manager') || jobTitle.includes('director')) {
      hints.push('Senior hire - they\'re building their leadership team');
    }
  }

  if (prospect.mystery_shopper_sent) {
    if (!prospect.mystery_shopper_responded) {
      hints.push('IMPORTANT: We sent a mystery shopper inquiry and they NEVER responded - this is a pain point you can subtly reference');
    } else if (prospect.mystery_shopper_response_time_hours && prospect.mystery_shopper_response_time_hours > 24) {
      hints.push(`We sent a mystery shopper inquiry and it took them ${Math.round(prospect.mystery_shopper_response_time_hours)} hours to respond - this is slow for hospitality.`);
    }
  }

  return `Write a first outreach email to this hotel:

PROPERTY DETAILS:
${details.join('\n')}

${hints.length > 0 ? `CONTEXT (use subtly, don't be obvious about it):\n${hints.join('\n')}` : ''}

Remember:
- Keep it under 100 words
- Sound human, not like a sales template
- Find ONE specific thing about them to mention
- End with "Best, Edd" (signature is added automatically)
- Generate JSON with subject, body, and personalization_notes`;
}
