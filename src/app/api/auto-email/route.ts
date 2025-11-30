import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, isSmtpConfigured, getInboxStats, getTotalRemainingCapacity, getSmtpInboxes, syncInboxCountsFromDb } from '@/lib/email';
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
  job_pain_points: JobPainPoints | null;
  pain_signals?: { keyword_matched: string; review_snippet: string }[];
  score: number;
  tier: string;
}

// Generate personalized email using Claude
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


export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const maxEmails = body.max_emails || 10;
    const minScore = body.min_score || 50; // Only email prospects with score >= 50

    // Check if email sending is configured
    if (!isSmtpConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Email sending not configured (missing Azure credentials)',
        sent: 0,
      });
    }

    // Sync inbox counts from database (handles server restarts/deploys)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todaysEmails } = await supabase
      .from('emails')
      .select('from_email')
      .eq('direction', 'outbound')
      .eq('email_type', 'outreach')
      .gte('sent_at', today.toISOString());

    const sentTodayByInbox: Record<string, number> = {};
    for (const e of todaysEmails || []) {
      if (e.from_email) {
        sentTodayByInbox[e.from_email] = (sentTodayByInbox[e.from_email] || 0) + 1;
      }
    }
    syncInboxCountsFromDb(sentTodayByInbox);

    // Find prospects to email:
    // - Stage is 'new' or 'researching'
    // - Has email address
    // - Score >= minScore
    // - Not archived
    // - Never been emailed before
    // PRIORITY ORDER: hot leads first, then warm, then cold (by score within each tier)
    let prospects;
    const baseSelect = `id, name, email, city, country, property_type,
        google_rating, google_review_count, source_job_title,
        score, tier, lead_quality, pain_signals(keyword_matched, review_snippet)`;

    // First: Get HOT leads (job boards, review pain points)
    const { data: hotLeads } = await supabase
      .from('prospects')
      .select(`${baseSelect}, job_pain_points`)
      .in('stage', ['new', 'researching'])
      .eq('archived', false)
      .eq('lead_quality', 'hot')
      .not('email', 'is', null)
      .gte('score', minScore)
      .order('score', { ascending: false })
      .limit(maxEmails);

    // Second: Get WARM leads if not enough hot
    let warmLeads: typeof hotLeads = [];
    if ((hotLeads?.length || 0) < maxEmails) {
      const { data } = await supabase
        .from('prospects')
        .select(`${baseSelect}, job_pain_points`)
        .in('stage', ['new', 'researching'])
        .eq('archived', false)
        .eq('lead_quality', 'warm')
        .not('email', 'is', null)
        .gte('score', minScore)
        .order('score', { ascending: false })
        .limit(maxEmails - (hotLeads?.length || 0));
      warmLeads = data || [];
    }

    // Third: Get COLD leads only if hot + warm not enough
    let coldLeads: typeof hotLeads = [];
    const hotWarmCount = (hotLeads?.length || 0) + (warmLeads?.length || 0);
    if (hotWarmCount < maxEmails) {
      const { data } = await supabase
        .from('prospects')
        .select(`${baseSelect}, job_pain_points`)
        .in('stage', ['new', 'researching'])
        .eq('archived', false)
        .eq('lead_quality', 'cold')
        .not('email', 'is', null)
        .gte('score', Math.max(minScore - 20, 30)) // Lower threshold for cold
        .order('score', { ascending: false })
        .limit(maxEmails - hotWarmCount);
      coldLeads = data || [];
    }

    // Combine all leads (hot first, then warm, then cold)
    prospects = [...(hotLeads || []), ...(warmLeads || []), ...(coldLeads || [])];

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No eligible prospects to email',
        sent: 0,
        checked: 0,
      });
    }

    // Filter out prospects who have already been emailed
    const prospectIds = prospects.map(p => p.id);
    const { data: existingEmails } = await supabase
      .from('emails')
      .select('prospect_id')
      .in('prospect_id', prospectIds)
      .eq('direction', 'outbound');

    const emailedIds = new Set((existingEmails || []).map(e => e.prospect_id));
    const eligibleProspects = prospects.filter(p => !emailedIds.has(p.id));

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Process up to maxEmails
    for (const prospect of eligibleProspects.slice(0, maxEmails)) {
      if (!prospect.email) {
        results.skipped++;
        continue;
      }

      // Generate personalized email
      const email = await generateEmail(prospect as Prospect);
      if (!email) {
        results.failed++;
        results.errors.push(`Failed to generate email for ${prospect.name}`);
        continue;
      }

      // Send the email with HTML formatting and signature
      const sendResult = await sendEmail({
        to: prospect.email,
        subject: email.subject,
        body: email.body,
      });

      if (!sendResult.success) {
        results.failed++;
        results.errors.push(`Failed to send to ${prospect.email}: ${sendResult.error}`);
        continue;
      }

      // Save to database - use the actual inbox that sent the email
      const { data: savedEmail } = await supabase.from('emails').insert({
        prospect_id: prospect.id,
        subject: email.subject,
        body: email.body,
        to_email: prospect.email,
        from_email: sendResult.sentFrom || AZURE_MAIL_FROM,
        message_id: sendResult.messageId,
        email_type: 'outreach',
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).select().single();

      // Update prospect stage
      await supabase
        .from('prospects')
        .update({
          stage: 'contacted',
          last_contacted_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);

      // Log activity
      await supabase.from('activities').insert({
        prospect_id: prospect.id,
        type: 'email_sent',
        title: `Auto-email sent to ${prospect.email}`,
        description: `Subject: ${email.subject}`,
        email_id: savedEmail?.id,
      });

      results.sent++;

      // Small delay between emails to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      success: true,
      message: `Auto-email completed: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`,
      ...results,
      checked: eligibleProspects.length,
    });
  } catch (error) {
    console.error('Auto-email error:', error);
    return NextResponse.json(
      { error: 'Auto-email failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET: Check auto-email status with lead quality breakdown
export async function GET() {
  const supabase = createServerClient();

  // Count eligible prospects by lead quality
  const { count: hotCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .eq('lead_quality', 'hot')
    .not('email', 'is', null)
    .gte('score', 50);

  const { count: warmCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .eq('lead_quality', 'warm')
    .not('email', 'is', null)
    .gte('score', 50);

  const { count: coldCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .in('stage', ['new', 'researching'])
    .eq('archived', false)
    .eq('lead_quality', 'cold')
    .not('email', 'is', null)
    .gte('score', 30);

  // Count emails sent today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: sentToday } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .eq('email_type', 'outreach')
    .gte('sent_at', today.toISOString());

  const totalEligible = (hotCount || 0) + (warmCount || 0) + (coldCount || 0);

  // Get inbox stats for warmup monitoring
  const inboxStats = getInboxStats();
  const remainingCapacity = getTotalRemainingCapacity();
  const smtpInboxCount = getSmtpInboxes().length;

  return NextResponse.json({
    configured: isSmtpConfigured(),
    eligible_prospects: {
      hot: hotCount || 0,
      warm: warmCount || 0,
      cold: coldCount || 0,
      total: totalEligible,
    },
    sent_today: sentToday || 0,
    sender: AZURE_MAIL_FROM,
    // Inbox rotation stats (for warmup monitoring)
    inboxes: {
      count: smtpInboxCount,
      remaining_capacity: remainingCapacity,
      daily_limit: parseInt(process.env.SMTP_DAILY_LIMIT || '20'),
      details: inboxStats,
    },
    recommendation: remainingCapacity === 0
      ? 'All inboxes at daily limit! Wait for tomorrow or add more inboxes.'
      : (hotCount || 0) < 20
        ? 'Hot leads running low! Run job board scrapers or scrape cold leads from Google Maps.'
        : 'Hot lead pool healthy - prioritizing high-intent prospects.',
  });
}
