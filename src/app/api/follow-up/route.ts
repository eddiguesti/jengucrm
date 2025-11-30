import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, isSmtpConfigured } from '@/lib/email';
import Anthropic from '@anthropic-ai/sdk';

const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';

// Best practice: max 3 emails total (1 initial + 2 follow-ups)
const MAX_EMAILS = 3;
// Days to wait between emails
const FOLLOW_UP_DAYS = [3, 5]; // Follow-up 1 after 3 days, Follow-up 2 after 5 more days

interface ProspectWithEmails {
  id: string;
  name: string;
  email: string;
  city: string | null;
  website: string | null;
  property_type: string | null;
  emails: {
    id: string;
    subject: string;
    body: string;
    sent_at: string;
    status: string;
    sequence_number: number;
  }[];
}

// Generate follow-up email using AI
async function generateFollowUp(
  prospect: ProspectWithEmails,
  followUpNumber: number,
  previousEmail: { subject: string; body: string }
): Promise<{ subject: string; body: string } | null> {
  const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: process.env.XAI_API_KEY ? 'https://api.x.ai' : undefined,
    });

    const prompt = `You are writing follow-up email #${followUpNumber} for Jengu (AI guest communication platform for hotels).

Target: ${prospect.name}
Location: ${prospect.city || 'Unknown'}
Property Type: ${prospect.property_type || 'hotel'}

Previous email subject: "${previousEmail.subject}"
Previous email (sent ${followUpNumber === 1 ? '3' : '8'} days ago):
"${previousEmail.body}"

Write a SHORT follow-up (max 80 words) that:
${followUpNumber === 1 ? `
1. Acknowledges you sent a previous email (don't apologize)
2. Adds ONE new piece of value (a stat, insight, or relevant news)
3. Asks a simple question to prompt a response
4. Keeps the same friendly tone` : `
1. This is the FINAL follow-up - be respectful of their time
2. Offer something concrete (a case study, quick demo link, or resource)
3. Give them an easy out ("If timing isn't right, no worries")
4. Make it easy to respond with just "yes" or "not now"`}

Tone: Helpful, not pushy. Like a peer, not a salesperson.

DO NOT include any signature, sign-off, or "Best regards" - the signature will be added automatically.

IMPORTANT: Output ONLY valid JSON:
{"subject": "Re: ${previousEmail.subject}", "body": "your follow-up text"}`;

    const response = await anthropic.messages.create({
      model: process.env.XAI_API_KEY ? 'grok-4-1-fast-non-reasoning' : 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    // Grok returns thinking blocks first, so find the text block
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return null;

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Follow-up generation error:', err);
    return null;
  }
}

// Try to find alternative email using Hunter.io
async function findAlternativeEmail(
  domain: string,
  prospectName: string
): Promise<string | null> {
  const hunterKey = process.env.HUNTER_API_KEY;
  if (!hunterKey || !domain) return null;

  try {
    // First try domain search to find emails
    const searchResponse = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${hunterKey}&limit=5`
    );
    const searchData = await searchResponse.json();

    if (searchData.data?.emails?.length > 0) {
      // Look for decision makers (GM, Director, Manager)
      const priorityRoles = ['general manager', 'director', 'manager', 'owner', 'ceo', 'revenue'];

      for (const role of priorityRoles) {
        const match = searchData.data.emails.find((e: { position?: string }) =>
          e.position?.toLowerCase().includes(role)
        );
        if (match?.value) return match.value;
      }

      // Return first verified email if no role match
      const verified = searchData.data.emails.find((e: { verification?: { status: string } }) =>
        e.verification?.status === 'valid'
      );
      if (verified?.value) return verified.value;

      // Return first email as fallback
      return searchData.data.emails[0]?.value || null;
    }

    // Try email finder with name if we have it
    if (prospectName) {
      const names = prospectName.split(' ');
      if (names.length >= 2) {
        const finderResponse = await fetch(
          `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${names[0]}&last_name=${names[names.length - 1]}&api_key=${hunterKey}`
        );
        const finderData = await finderResponse.json();
        if (finderData.data?.email) return finderData.data.email;
      }
    }

    return null;
  } catch (err) {
    console.error('Hunter.io error:', err);
    return null;
  }
}


export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const maxFollowUps = body.max_follow_ups || 10;

    if (!isSmtpConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Email not configured',
        sent: 0,
      });
    }

    // Find prospects needing follow-up:
    // - Stage is 'contacted'
    // - Not archived
    // - Has outbound emails but no inbound replies
    // - Last email sent >= 3 days ago
    // - Less than MAX_EMAILS sent
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: prospects } = await supabase
      .from('prospects')
      .select(`
        id, name, email, city, website, property_type,
        emails(id, subject, body, sent_at, status, sequence_number, direction, message_id)
      `)
      .eq('stage', 'contacted')
      .eq('archived', false)
      .not('email', 'is', null);

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No prospects to follow up',
        sent: 0,
        checked: 0,
      });
    }

    const results = {
      sent: 0,
      skipped: 0,
      maxedOut: 0,
      newEmailFound: 0,
      errors: [] as string[],
    };

    for (const prospect of prospects) {
      if (results.sent >= maxFollowUps) break;

      const emails = prospect.emails || [];
      const outboundEmails = emails.filter((e: { direction: string }) => e.direction === 'outbound');
      const inboundEmails = emails.filter((e: { direction: string }) => e.direction === 'inbound');

      // Skip if they've replied
      if (inboundEmails.length > 0) {
        results.skipped++;
        continue;
      }

      // Skip if we've already sent MAX_EMAILS
      if (outboundEmails.length >= MAX_EMAILS) {
        results.maxedOut++;

        // After 3 emails with no response, try to find alternative email
        if (prospect.website && process.env.HUNTER_API_KEY) {
          const domain = new URL(prospect.website).hostname.replace('www.', '');
          const altEmail = await findAlternativeEmail(domain, prospect.name);

          if (altEmail && altEmail !== prospect.email) {
            // Update prospect with new email and reset to try again
            await supabase
              .from('prospects')
              .update({
                email: altEmail,
                stage: 'new', // Reset to new so auto-email picks it up
                notes: `${prospect.name ? prospect.name + '\n' : ''}Previous email (${prospect.email}) - no response after ${MAX_EMAILS} attempts. Found alternative: ${altEmail}`,
              })
              .eq('id', prospect.id);

            results.newEmailFound++;

            await supabase.from('activities').insert({
              prospect_id: prospect.id,
              type: 'note',
              title: `Found alternative email: ${altEmail}`,
              description: `Previous email ${prospect.email} had no response. Will retry with new contact.`,
            });
          }
        }
        continue;
      }

      // Check if enough time has passed since last email
      const lastEmail = outboundEmails.sort((a: { sent_at: string }, b: { sent_at: string }) =>
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
      )[0];

      if (!lastEmail) continue;

      const daysSinceLastEmail = Math.floor(
        (Date.now() - new Date(lastEmail.sent_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      const followUpNumber = outboundEmails.length; // 1 = first follow-up, 2 = second
      const daysToWait = FOLLOW_UP_DAYS[followUpNumber - 1] || 5;

      if (daysSinceLastEmail < daysToWait) {
        results.skipped++;
        continue;
      }

      // Generate follow-up
      const followUp = await generateFollowUp(
        prospect as ProspectWithEmails,
        followUpNumber,
        { subject: lastEmail.subject, body: lastEmail.body }
      );

      if (!followUp) {
        results.errors.push(`Failed to generate follow-up for ${prospect.name}`);
        continue;
      }

      // Send follow-up with HTML formatting and signature
      const sendResult = await sendEmail({
        to: prospect.email!,
        subject: followUp.subject,
        body: followUp.body,
        inReplyTo: lastEmail.message_id,
      });

      if (!sendResult.success) {
        results.errors.push(`Failed to send to ${prospect.email}: ${sendResult.error}`);
        continue;
      }

      // Save to database
      const { data: savedEmail } = await supabase.from('emails').insert({
        prospect_id: prospect.id,
        subject: followUp.subject,
        body: followUp.body,
        to_email: prospect.email,
        from_email: AZURE_MAIL_FROM,
        message_id: sendResult.messageId,
        email_type: 'follow_up',
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
        sequence_number: outboundEmails.length + 1,
      }).select().single();

      // Update prospect
      await supabase
        .from('prospects')
        .update({ last_contacted_at: new Date().toISOString() })
        .eq('id', prospect.id);

      // Log activity
      await supabase.from('activities').insert({
        prospect_id: prospect.id,
        type: 'email_sent',
        title: `Follow-up #${followUpNumber} sent`,
        description: `Subject: ${followUp.subject}`,
        email_id: savedEmail?.id,
      });

      results.sent++;

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    return NextResponse.json({
      success: true,
      message: `Follow-up completed: ${results.sent} sent`,
      ...results,
      checked: prospects.length,
    });
  } catch (error) {
    console.error('Follow-up error:', error);
    return NextResponse.json(
      { error: 'Follow-up failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET: Check follow-up status
export async function GET() {
  const supabase = createServerClient();

  // Count prospects needing follow-up
  const { data: needFollowUp } = await supabase
    .from('prospects')
    .select('id, name, email, last_contacted_at')
    .eq('stage', 'contacted')
    .eq('archived', false)
    .not('email', 'is', null);

  // Filter to those actually due
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const due = (needFollowUp || []).filter(p =>
    p.last_contacted_at && new Date(p.last_contacted_at) < threeDaysAgo
  );

  return NextResponse.json({
    configured: isSmtpConfigured(),
    hunter_configured: !!process.env.HUNTER_API_KEY,
    prospects_contacted: needFollowUp?.length || 0,
    due_for_followup: due.length,
    follow_up_schedule: {
      first_follow_up: '3 days after initial email',
      second_follow_up: '5 days after first follow-up',
      max_emails: MAX_EMAILS,
    },
  });
}
