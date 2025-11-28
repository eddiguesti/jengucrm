import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, incrementUsage } from '@/lib/rate-limiter';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an expert hospitality technology sales copywriter.
You write personalized cold emails for Jengu, a hospitality tech company.

Jengu helps hotels and restaurants:
- Streamline operations with smart automation
- Reduce costs while improving guest experience
- Make data-driven decisions with real-time analytics

Your emails should be:
- Personalized to the specific property
- Concise (under 150 words for the body)
- Friendly but professional
- Focused on a single value proposition
- Have a clear, low-friction CTA (quick call, not a demo)

Never be pushy or salesy. Be genuinely helpful.

Respond in JSON format:
{
  "subject": "email subject line",
  "body": "email body",
  "personalization_notes": "why you personalized it this way"
}`;

export async function POST(request: NextRequest) {
  // Check rate limit for Anthropic API
  const rateLimit = checkRateLimit('anthropic_emails');
  if (!rateLimit.allowed) {
    return NextResponse.json({
      error: 'Daily email generation limit reached',
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
      message: 'Max 50 emails per day to manage costs. Try again tomorrow.',
    }, { status: 429 });
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
    incrementUsage('anthropic_emails');

    const prompt = buildPrompt(prospect);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

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

function buildPrompt(prospect: {
  name: string;
  city?: string;
  country?: string;
  google_rating?: number;
  google_review_count?: number;
  source_job_title?: string;
  tier?: string;
  contact_name?: string;
  contact_title?: string;
}) {
  const contextParts = [`Property: ${prospect.name}`];

  if (prospect.city || prospect.country) {
    const location = [prospect.city, prospect.country].filter(Boolean).join(', ');
    contextParts.push(`Location: ${location}`);
  }

  if (prospect.google_rating) {
    contextParts.push(`Google Rating: ${prospect.google_rating}/5`);
  }

  if (prospect.google_review_count) {
    contextParts.push(`Review Count: ${prospect.google_review_count}`);
  }

  if (prospect.source_job_title) {
    contextParts.push(`They're hiring for: ${prospect.source_job_title}`);
  }

  if (prospect.contact_name) {
    contextParts.push(`Contact: ${prospect.contact_name} (${prospect.contact_title || 'Unknown title'})`);
  }

  const context = contextParts.join('\n');

  let angle = '';
  if (prospect.tier === 'hot') {
    angle = `This is a high-priority lead. They have strong online presence and are actively hiring.
Focus on how Jengu can help them scale efficiently during growth.`;
  } else {
    angle = `Focus on how Jengu can help improve their operations and guest experience.`;
  }

  if (prospect.google_review_count && prospect.google_review_count > 200) {
    angle += '\nThey clearly care about guest experience given their review volume.';
  }

  const jobTitle = (prospect.source_job_title || '').toLowerCase();
  if (jobTitle.includes('revenue')) {
    angle += '\nThey\'re hiring for revenue - emphasize our analytics and revenue optimization.';
  }
  if (jobTitle.includes('marketing') || jobTitle.includes('digital')) {
    angle += '\nThey\'re hiring for marketing - emphasize our guest engagement tools.';
  }

  return `Write a cold outreach email for this property:

${context}

Strategy notes:
${angle}

Generate the email in JSON format with subject, body, and personalization_notes fields.`;
}
