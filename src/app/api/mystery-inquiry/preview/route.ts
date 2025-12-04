import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Generate a mystery shopper email preview without sending
 * POST: Generate preview for a specific prospect
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { prospect_id } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id required' }, { status: 400 });
    }

    // Get prospect details
    const { data: prospect, error: prospectError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    if (!prospect.email) {
      return NextResponse.json({ error: 'Prospect has no email' }, { status: 400 });
    }

    // Check if already sent
    const alreadySent = (prospect.tags || []).includes('mystery-inquiry-sent');
    if (alreadySent) {
      return NextResponse.json({ error: 'Mystery shopper already sent to this prospect' }, { status: 400 });
    }

    // Determine language
    const frenchCountries = ['France', 'Belgium', 'Switzerland', 'Luxembourg', 'Monaco', 'Canada'];
    const spanishCountries = ['Spain', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru'];
    const germanCountries = ['Germany', 'Austria', 'Switzerland'];
    const italianCountries = ['Italy', 'Switzerland'];

    let language = 'English';
    const country = prospect.country || '';
    if (frenchCountries.some(c => country.includes(c))) language = 'French';
    else if (spanishCountries.some(c => country.includes(c))) language = 'Spanish';
    else if (germanCountries.some(c => country.includes(c))) language = 'German';
    else if (italianCountries.some(c => country.includes(c))) language = 'Italian';

    // Generate email with AI
    const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API not configured' }, { status: 500 });
    }

    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_API_KEY ? 'https://api.x.ai' : undefined,
    });

    const scenarios = [
      'business trip to the area',
      'planning a romantic weekend getaway',
      'organizing a small group event (4-6 people)',
      'visiting family in the area',
      'attending a conference nearby',
    ];
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

    const prompt = `You are a potential guest writing to ${prospect.name} in ${prospect.city || 'their city'}.

Write a natural, friendly inquiry email as if you're a real person planning a ${scenario}.

IMPORTANT INSTRUCTIONS:
- Write in ${language}
- Sound like a real person, not a template
- Ask 2-3 specific questions about: rates, availability, amenities, or local recommendations
- Keep it under 150 words
- Don't mention you're testing their response time
- Include a realistic name and sign-off
- Make it feel genuine and personal

Generate a subject line and email body. Output as JSON:
{"subject": "your subject", "body": "your email body", "scenario": "${scenario}", "sender_name": "realistic name"}`;

    const response = await anthropic.messages.create({
      model: process.env.XAI_API_KEY ? 'grok-4-1-fast-non-reasoning' : 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const emailData = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      preview: {
        to: prospect.email,
        subject: emailData.subject,
        body: emailData.body,
        scenario: emailData.scenario,
        sender_name: emailData.sender_name,
        language,
      },
      prospect: {
        id: prospect.id,
        name: prospect.name,
        city: prospect.city,
        country: prospect.country,
      },
    });
  } catch (error) {
    console.error('Preview generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview', details: String(error) },
      { status: 500 }
    );
  }
}
