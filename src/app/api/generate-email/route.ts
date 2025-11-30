import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementUsage } from '@/lib/rate-limiter';

const XAI_API_KEY = process.env.XAI_API_KEY;

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

export async function POST(request: NextRequest) {
  // Check rate limit for Grok API
  const rateLimit = checkRateLimit('xai_emails');
  if (!rateLimit.allowed) {
    return NextResponse.json({
      error: 'Daily email generation limit reached',
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
      message: 'Max 100 emails per day. Try again tomorrow.',
    }, { status: 429 });
  }

  if (!XAI_API_KEY) {
    return NextResponse.json(
      { error: 'XAI_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { prospect } = body;

    if (!prospect) {
      return NextResponse.json(
        { error: 'Prospect data required' },
        { status: 400 }
      );
    }

    // Increment usage before making API call
    incrementUsage('xai_emails');

    const prompt = buildPrompt(prospect);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-latest',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8, // Slightly higher for more natural variation
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API error: ${error}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse email response');
    }

    const emailData = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      subject: emailData.subject,
      body: emailData.body,
      personalization_notes: emailData.personalization_notes,
    });
  } catch (error) {
    console.error('Email generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate email' },
      { status: 500 }
    );
  }
}

interface ProspectData {
  name: string;
  city?: string;
  country?: string;
  website?: string;
  google_rating?: number;
  google_review_count?: number;
  star_rating?: number;
  room_count?: number;
  source_job_title?: string;
  tier?: string;
  contact_name?: string;
  contact_title?: string;
  notes?: string;
  tags?: string[];
  linkedin_url?: string;
  instagram_url?: string;
  chain_affiliation?: string;
  // Mystery shopper results
  mystery_shopper_sent?: boolean;
  mystery_shopper_response_time_hours?: number | null;
  mystery_shopper_responded?: boolean;
}

function buildPrompt(prospect: ProspectData) {
  const details: string[] = [];

  // Basic info
  details.push(`Property name: ${prospect.name}`);

  if (prospect.city || prospect.country) {
    const location = [prospect.city, prospect.country].filter(Boolean).join(', ');
    details.push(`Location: ${location}`);
  }

  // Property characteristics
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

  // Online presence
  if (prospect.google_rating) {
    details.push(`Google rating: ${prospect.google_rating}/5 stars`);
  }

  if (prospect.google_review_count) {
    details.push(`Reviews: ${prospect.google_review_count} Google reviews`);
  }

  if (prospect.website) {
    details.push(`Website: ${prospect.website}`);
  }

  // Contact info
  if (prospect.contact_name) {
    const title = prospect.contact_title ? ` (${prospect.contact_title})` : '';
    details.push(`Contact: ${prospect.contact_name}${title}`);
  }

  // Context clues
  if (prospect.source_job_title) {
    details.push(`Found via job posting for: ${prospect.source_job_title}`);
  }

  // AI-generated notes from enrichment
  if (prospect.notes && prospect.notes.length > 50) {
    details.push(`Research notes: ${prospect.notes}`);
  }

  // Build strategy hints
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

  // Mystery shopper results - ONLY mention if response was SLOW or NO response
  // If they responded quickly and well, don't mention it at all
  if (prospect.mystery_shopper_sent) {
    if (!prospect.mystery_shopper_responded) {
      hints.push('IMPORTANT: We sent a mystery shopper inquiry and they NEVER responded - this is a pain point you can subtly reference (e.g., "I know how hard it can be to stay on top of every inquiry")');
    } else if (prospect.mystery_shopper_response_time_hours && prospect.mystery_shopper_response_time_hours > 24) {
      hints.push(`We sent a mystery shopper inquiry and it took them ${Math.round(prospect.mystery_shopper_response_time_hours)} hours to respond - this is slow for hospitality. You can subtly reference response time challenges.`);
    }
    // If they responded quickly (< 24 hours), don't mention mystery shopper at all - they're doing well!
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
