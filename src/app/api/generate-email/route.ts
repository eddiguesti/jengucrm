import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementUsage } from '@/lib/rate-limiter';

const XAI_API_KEY = process.env.XAI_API_KEY;

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
        temperature: 0.7,
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
