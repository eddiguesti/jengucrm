import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, getSmtpInboxes } from '@/lib/email';
import Anthropic from '@anthropic-ai/sdk';

const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';

interface JobPainPoints {
  responsibilities?: string[];
  pain_points?: string[];
  communication_tasks?: string[];
  admin_tasks?: string[];
  speed_requirements?: string[];
  summary?: string;
}

interface TestProspect {
  name: string;
  city: string;
  country: string;
  property_type: string;
  contact_name: string;
  contact_title: string;
  source_job_title: string;
  email: string;
  from_inbox: string; // Which inbox to send from
  job_pain_points: JobPainPoints;
}

// Generate personalized email using Grok (same logic as auto-email)
async function generateEmail(prospect: TestProspect): Promise<{ subject: string; body: string } | null> {
  const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_API_KEY ? 'https://api.x.ai' : undefined,
    });

    const jobContext = prospect.source_job_title
      ? `They're hiring for: ${prospect.source_job_title}`
      : '';

    // Build job pain points context
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
Contact: ${prospect.contact_name}
Role: ${prospect.contact_title}
${jobContext ? `BUYING SIGNAL: ${jobContext} (they're actively spending money on this problem!)` : ''}${jobPainPointsContext}

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
 * POST: Full cycle test - creates test prospects, generates emails with Grok, and SENDS them
 * Each email sent from a different inbox to test the full flow
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const testEmail = body.test_email || 'edd.guest@gmail.com';

    // Get available inboxes
    const smtpInboxes = getSmtpInboxes();
    const allInboxes = [AZURE_MAIL_FROM, ...smtpInboxes.map(i => i.email)];

    // 4 test prospects with different hotel roles, each using a different inbox
    const testProspects: TestProspect[] = [
      {
        name: 'The Grand Palace Hotel',
        city: 'London',
        country: 'UK',
        property_type: 'luxury hotel',
        contact_name: 'James Morrison',
        contact_title: 'General Manager',
        source_job_title: 'General Manager',
        email: testEmail,
        from_inbox: allInboxes[0] || AZURE_MAIL_FROM, // Azure: edd@jengu.ai
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
        email: testEmail,
        from_inbox: allInboxes[1] || AZURE_MAIL_FROM, // Spacemail: edd@jengu.me
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
        email: testEmail,
        from_inbox: allInboxes[2] || AZURE_MAIL_FROM, // Spacemail: edd@jengu.space
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
        email: testEmail,
        from_inbox: allInboxes[3] || AZURE_MAIL_FROM, // Spacemail: edd@jengu.shop
        job_pain_points: {
          summary: 'Operational efficiency, staff coordination, guest experience optimization',
          communication_tasks: ['Staff scheduling', 'Departmental coordination', 'Guest feedback management'],
          pain_points: ['Cross-department communication', 'Real-time updates', 'Performance tracking'],
        },
      },
    ];

    const results = [];

    for (const prospect of testProspects) {
      // 1. Create prospect in database with only valid columns
      const { data: dbProspect, error: insertError } = await supabase
        .from('prospects')
        .insert({
          name: prospect.name,
          city: prospect.city,
          country: prospect.country,
          property_type: prospect.property_type,
          source_job_title: prospect.source_job_title,
          email: prospect.email,
          source: 'full_cycle_test',
          score: 80,
          tier: 'hot',
          stage: 'new',
          archived: false,
        })
        .select()
        .single();

      if (insertError) {
        results.push({
          prospect: prospect.name,
          role: prospect.contact_title,
          error: `Failed to create prospect: ${insertError.message}`,
        });
        continue;
      }

      // 2. Generate email with Grok
      const generatedEmail = await generateEmail(prospect);
      if (!generatedEmail) {
        results.push({
          prospect: prospect.name,
          role: prospect.contact_title,
          prospect_id: dbProspect.id,
          error: 'Failed to generate email with Grok',
        });
        continue;
      }

      // 3. Send email from specific inbox
      const sendResult = await sendEmail({
        to: prospect.email,
        subject: generatedEmail.subject,
        body: generatedEmail.body,
        forceInbox: prospect.from_inbox,
      });

      if (!sendResult.success) {
        results.push({
          prospect: prospect.name,
          role: prospect.contact_title,
          prospect_id: dbProspect.id,
          from_inbox: prospect.from_inbox,
          generated_subject: generatedEmail.subject,
          error: `Failed to send: ${sendResult.error}`,
        });
        continue;
      }

      // 4. Record email in database
      const { data: savedEmail } = await supabase.from('emails').insert({
        prospect_id: dbProspect.id,
        subject: generatedEmail.subject,
        body: generatedEmail.body,
        to_email: prospect.email,
        from_email: sendResult.sentFrom || prospect.from_inbox,
        message_id: sendResult.messageId,
        email_type: 'outreach',
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).select().single();

      // 5. Update prospect stage
      await supabase
        .from('prospects')
        .update({
          stage: 'contacted',
          last_contacted_at: new Date().toISOString(),
        })
        .eq('id', dbProspect.id);

      // 6. Log activity
      await supabase.from('activities').insert({
        prospect_id: dbProspect.id,
        type: 'email_sent',
        title: `Full cycle test email sent to ${prospect.email}`,
        description: `Subject: ${generatedEmail.subject}`,
        email_id: savedEmail?.id,
      });

      results.push({
        prospect: prospect.name,
        role: prospect.contact_title,
        prospect_id: dbProspect.id,
        from_inbox: sendResult.sentFrom || prospect.from_inbox,
        to_email: prospect.email,
        subject: generatedEmail.subject,
        body_preview: generatedEmail.body.substring(0, 200) + '...',
        message_id: sendResult.messageId,
        success: true,
      });

      // Small delay between emails
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      success: true,
      message: `Full cycle test completed: ${results.filter(r => r.success).length} emails sent`,
      test_email: testEmail,
      inboxes_used: [...new Set(results.filter(r => r.from_inbox).map(r => r.from_inbox))],
      results,
      instructions: 'Reply to each email to test the reply detection. Run /api/check-replies after replying.',
    });
  } catch (error) {
    console.error('Full cycle test error:', error);
    return NextResponse.json(
      { error: 'Full cycle test failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET: Show available inboxes for testing
 */
export async function GET() {
  const smtpInboxes = getSmtpInboxes();
  const allInboxes = [
    { email: AZURE_MAIL_FROM, type: 'azure' },
    ...smtpInboxes.map(i => ({ email: i.email, type: 'smtp' })),
  ];

  return NextResponse.json({
    available_inboxes: allInboxes,
    total: allInboxes.length,
    usage: 'POST with { "test_email": "your@email.com" } to run full cycle test',
  });
}
