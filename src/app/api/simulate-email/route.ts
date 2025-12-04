import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

interface JobPainPoints {
  responsibilities?: string[];
  pain_points?: string[];
  communication_tasks?: string[];
  admin_tasks?: string[];
  speed_requirements?: string[];
  summary?: string;
}

interface Prospect {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  country: string | null;
  property_type: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  source_job_title: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  job_pain_points: JobPainPoints | null;
  pain_signals?: { keyword_matched: string; review_snippet: string }[];
  score: number;
  tier: string;
}

// Generate personalized email using Grok (same as auto-email but returns without sending)
async function generateEmail(prospect: Prospect): Promise<{ subject: string; body: string } | null> {
  const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_API_KEY ? 'https://api.x.ai' : undefined,
    });

    const painSignalContext = prospect.pain_signals?.length
      ? `Pain signals detected in reviews:\n${prospect.pain_signals.map(ps => `- "${ps.review_snippet}" (keyword: ${ps.keyword_matched})`).join('\n')}`
      : '';

    const jobContext = prospect.source_job_title
      ? `They're hiring for: ${prospect.source_job_title}`
      : '';

    // Build job pain points context from AI extraction
    const jp = prospect.job_pain_points;
    let jobPainPointsContext = '';
    if (jp) {
      const parts = [];
      if (jp.summary) parts.push(`PAIN SUMMARY: "${jp.summary}"`);
      if (jp.communication_tasks?.length) parts.push(`COMMUNICATION TASKS: ${jp.communication_tasks.join(', ')}`);
      if (jp.admin_tasks?.length) parts.push(`ADMIN TASKS: ${jp.admin_tasks.join(', ')}`);
      if (jp.speed_requirements?.length) parts.push(`SPEED NEEDS: ${jp.speed_requirements.join(', ')}`);
      if (jp.pain_points?.length) parts.push(`AUTOMATABLE: ${jp.pain_points.slice(0, 3).join(', ')}`);
      if (parts.length) jobPainPointsContext = `\n\n=== JOB POSTING INSIGHTS (use these!) ===\n${parts.join('\n')}`;
    }

    const prompt = `You are Edward, crafting a psychology-optimized cold email using the most effective persuasion techniques from behavioral science research.

=== TARGET INTEL ===
Hotel: ${prospect.name}
Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}
Type: ${prospect.property_type || 'hotel'}
${prospect.contact_name ? `Contact: ${prospect.contact_name}` : ''}
${prospect.contact_title ? `Role: ${prospect.contact_title}` : ''}
${jobContext ? `BUYING SIGNAL: ${jobContext} (they're actively spending money on this problem!)` : ''}
${painSignalContext ? `PAIN DETECTED: ${painSignalContext}` : ''}${jobPainPointsContext}

=== MASTER PSYCHOLOGY FRAMEWORK ===

**SUBJECT LINE - Curiosity Gap + Pattern Interrupt:**
Use an open loop that creates mental tension (Zeigarnik Effect). The brain CRAVES closure.
Examples: "weird question about ${prospect.name}" or "probably wrong person but..." or "random thought about ${prospect.city} hotels"

**1. HUMBLE PATTERN-INTERRUPT OPENER (Reciprocity + Liking):**
Start vulnerable and human. NOT like a sales email.
"Hey! This might be a weird one - not even sure if you're the right person. If not, would you mind forwarding to whoever handles guest comms or operations? Would genuinely appreciate it."

WHY IT WORKS:
- Cialdini's Reciprocity: Asking for small favor = they feel obligated to help
- Liking Principle: Vulnerability = likeable, not threatening
- Foot-in-the-door: Small ask (forward) leads to larger engagement

**2. HYPER-PERSONALIZED HOOK (Make them feel SEEN):**
${jobContext ? `"I noticed you guys are hiring for a ${prospect.source_job_title} - which made me think you might be dealing with [the exact problem we solve]..."` : `"Running a ${prospect.property_type || 'hotel'} in ${prospect.city} - I'm guessing you know the pain of [relevant challenge]..."`}

WHY: Personalized emails = 2.5x reply rates. Shows you're not mass-blasting.

**3. HUMAN-FIRST DISARM (Pre-handle the objection):**
"Look, I'm not one of those 'AI will replace everyone' people - obviously nothing beats real humans for making guests feel genuinely welcome. That human touch is what hospitality IS."

WHY: Status Quo Bias makes people resist change. Acknowledging what they value = trust.

**4. THE REFRAME (Against-the-grain insight):**
"But here's what I've noticed a lot of hotels don't realize - it's not about replacing people. It's about the behind-the-scenes stuff that eats up time. The 2am 'what's the wifi password' messages. The same 10 FAQs over and over. The booking questions where speed literally = money."

WHY: Providing new perspective = Authority. Novel information = curiosity.

**5. LOSS AVERSION TRIGGER (2x more powerful than gains):**
"Here's the thing - when a guest messages 3 hotels and you reply in 2 hours but someone else replies in 30 seconds... that booking's already gone. The cost savings are nice, but the revenue you're probably losing from slow responses? That's the part that gets interesting."

WHY: Tversky & Kahneman proved losses feel 2x worse than equivalent gains.

**6. SOCIAL PROOF (subtle):**
"Most hotels I talk to are surprised how much of this stuff can actually be automated - without it feeling robotic."

WHY: "Most hotels" = others are doing it = reduces perceived risk.

**7. NEGATIVE CTA (Reverse Psychology):**
End with a simple, low-pressure question. ALWAYS end the email with "Worth a quick chat?" - this is the exact CTA to use.

WHY: "But You Are Free" technique - 42 studies show giving an out INCREASES compliance. Short CTAs under 6 words convert best.

=== STRICT RULES ===
- 100-120 words MAXIMUM
- Start with "Hey!" on its own line, then blank line before next paragraph
- Use 2-3 SHORT paragraphs with blank lines between them (NOT one big wall of text)
- Include forward request early
- Acknowledge humans matter BEFORE pitching tech
- Use: "you guys", "honestly", "look", "here's the thing"
- End with LOW PRESSURE ("probably terrible timing", "no pressure")
- NO bullet points - natural conversational flow
- NO signature - it's added automatically
- Create ONE open loop in subject line
- Use \\n\\n for paragraph breaks in the JSON body

=== WHAT MAKES THIS CONVERT ===
✓ Curiosity Gap subject line (brain craves closure)
✓ Vulnerability opener (likeable, not threatening)
✓ Forward request (reciprocity + foot-in-door)
✓ Human-first (disarms "AI replacing jobs" fear)
✓ Novel insight (authority + curiosity)
✓ Loss framing (2x more motivating than gains)
✓ Subtle social proof (reduces risk)
✓ Negative CTA (easy out = more replies)

Output ONLY valid JSON:
{"subject": "weird question about ${prospect.name}", "body": "your email"}`;

    const response = await anthropic.messages.create({
      model: process.env.XAI_API_KEY ? 'grok-4-1-fast-non-reasoning' : 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    // Grok returns thinking blocks first, so find the text block
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return null;

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Email generation error:', err);
    return null;
  }
}

/**
 * POST: Simulate email generation using Grok WITHOUT sending
 * Body: { prospect_ids?: string[] } - specific prospects to simulate
 *       If not provided, creates test prospects with different roles
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const { prospect_ids, create_test_prospects } = body;

    let prospects: Prospect[] = [];

    // If create_test_prospects is true, create realistic test prospects
    if (create_test_prospects) {
      const testProspects = [
        {
          name: 'The Grand Palace Hotel',
          city: 'London',
          country: 'UK',
          property_type: 'luxury hotel',
          contact_name: 'James Morrison',
          contact_title: 'General Manager',
          source_job_title: 'General Manager',
          email: 'edd@jengu.ai', // Will go to user for testing
          score: 85,
          tier: 'hot',
          stage: 'new',
          job_pain_points: {
            summary: 'High-volume guest communications, 24/7 concierge requests, booking inquiries',
            communication_tasks: ['Guest inquiries', 'Booking confirmations', 'Concierge requests'],
            pain_points: ['Response time pressure', 'Repetitive FAQs', 'After-hours coverage'],
          },
        },
        {
          name: 'Marina Bay Suites',
          city: 'Dubai',
          country: 'UAE',
          property_type: 'boutique resort',
          contact_name: 'Ahmed Al-Rashid',
          contact_title: 'IT Director',
          source_job_title: 'IT Director',
          email: 'edd@jengu.me', // Will go to user for testing
          score: 90,
          tier: 'hot',
          stage: 'new',
          job_pain_points: {
            summary: 'Managing multiple systems integration, guest app development, automation initiatives',
            communication_tasks: ['System notifications', 'Tech support requests', 'Vendor coordination'],
            pain_points: ['Integration complexity', 'Manual processes', 'Real-time sync needs'],
          },
        },
        {
          name: 'Château des Vignes',
          city: 'Paris',
          country: 'France',
          property_type: 'luxury hotel',
          contact_name: 'Marie Dubois',
          contact_title: 'Front Office Manager',
          source_job_title: 'Front Office Manager',
          email: 'edd@jengu.space', // Will go to user for testing
          score: 75,
          tier: 'warm',
          stage: 'new',
          job_pain_points: {
            summary: 'Front desk operations, check-in/out efficiency, guest satisfaction',
            communication_tasks: ['Check-in communications', 'Room service coordination', 'Guest requests'],
            pain_points: ['Peak time bottlenecks', 'Multilingual guests', 'Special requests handling'],
          },
        },
        {
          name: 'Pacific Shores Resort',
          city: 'Singapore',
          country: 'Singapore',
          property_type: 'resort',
          contact_name: 'David Chen',
          contact_title: 'Operations Manager',
          source_job_title: 'Director of Operations',
          email: 'edd@jengu.shop', // Will go to user for testing
          score: 80,
          tier: 'hot',
          stage: 'new',
          job_pain_points: {
            summary: 'Operational efficiency, staff coordination, guest experience optimization',
            communication_tasks: ['Staff scheduling', 'Departmental coordination', 'Guest feedback management'],
            pain_points: ['Cross-department communication', 'Real-time updates', 'Performance tracking'],
          },
        },
      ];

      // Insert test prospects into database
      for (const tp of testProspects) {
        const { data, error } = await supabase
          .from('prospects')
          .upsert({
            ...tp,
            lead_source: 'test_simulation',
            archived: false,
          }, { onConflict: 'name,city' })
          .select()
          .single();

        if (data) {
          prospects.push(data as unknown as Prospect);
        } else if (error) {
          console.error('Failed to create test prospect:', error);
        }
      }
    } else if (prospect_ids?.length) {
      // Get specific prospects
      const { data } = await supabase
        .from('prospects')
        .select('*, pain_signals(keyword_matched, review_snippet)')
        .in('id', prospect_ids);
      prospects = (data || []) as unknown as Prospect[];
    } else {
      // Get a sample of real prospects
      const { data } = await supabase
        .from('prospects')
        .select('*, pain_signals(keyword_matched, review_snippet)')
        .eq('archived', false)
        .not('email', 'is', null)
        .limit(4);
      prospects = (data || []) as unknown as Prospect[];
    }

    if (!prospects.length) {
      return NextResponse.json({
        success: false,
        error: 'No prospects found to simulate',
      });
    }

    // Generate emails for each prospect (without sending)
    const simulations = [];
    for (const prospect of prospects) {
      const email = await generateEmail(prospect);
      simulations.push({
        prospect: {
          id: prospect.id,
          name: prospect.name,
          city: prospect.city,
          country: prospect.country,
          contact_name: prospect.contact_name,
          contact_title: prospect.contact_title,
          source_job_title: prospect.source_job_title,
          email: prospect.email,
        },
        generated_email: email,
        would_send_to: prospect.email,
      });
    }

    return NextResponse.json({
      success: true,
      simulation_only: true,
      message: 'Emails generated but NOT sent - this is a simulation',
      count: simulations.length,
      simulations,
    });
  } catch (error) {
    console.error('Simulation error:', error);
    return NextResponse.json(
      { error: 'Simulation failed', details: String(error) },
      { status: 500 }
    );
  }
}
