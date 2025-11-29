import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementUsage } from '@/lib/rate-limiter';

const XAI_API_KEY = process.env.XAI_API_KEY;

const SYSTEM_PROMPT = `You are Edward Guest, Director at Jengu - a hospitality technology company.
You write natural, human first-touch emails to hotels and restaurants you've discovered.

About Jengu:
- We help luxury and boutique hotels with smart hospitality technology
- Our platform streamlines operations, from guest communications to staff coordination
- We work with independent properties and small groups who want enterprise-level tech without the complexity
- We're based in the UK/France and work internationally

Your writing style:
- Sound like a real person, not a marketing email
- Write like you're reaching out to someone you'd genuinely like to meet
- Keep it conversational and warm, like you're writing to a colleague
- Be brief - busy hospitality professionals don't have time for long emails
- Show you've actually looked at their property (mention something specific)
- One simple ask: a quick chat to see if there's a fit
- NO buzzwords, NO corporate speak, NO "I hope this email finds you well"
- NO bullet points in the email body
- Never mention "pain points" or "challenges" - just be helpful

Structure (keep the whole email under 100 words):
- Opening: Something specific about THEM (their property, location, what caught your eye)
- Bridge: Brief mention of why you thought of reaching out
- Jengu: One sentence about what we do
- Ask: Simple, low-pressure invitation to chat

Sign off with just:
Best,
Edd

(The signature with full details will be added automatically)

Respond in JSON format:
{
  "subject": "short, casual subject - no clickbait, just natural",
  "body": "the email body WITHOUT any signature",
  "personalization_notes": "what specific details you used to personalize"
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
