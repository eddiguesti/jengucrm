import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import nodemailer from 'nodemailer';

/**
 * Mystery Shopper Inquiry
 *
 * Sends a professional inquiry to generic hotel emails asking for the GM's contact.
 * The premise: organizing a corporate event/group and needs to discuss partnership directly.
 */

// Parse SMTP inbox configuration
function getSmtpConfig(inboxString: string) {
  const [email, password, host, port, senderName] = inboxString.split('|');
  return { email, password, host, port: parseInt(port), senderName };
}

// Mystery shopper templates - credible reasons to need GM email (no proof required)
const INQUIRY_TEMPLATES = [
  {
    subject: 'Wedding Venue Inquiry - Need to Speak with Management',
    template: (hotelName: string, senderName: string) => `Dear ${hotelName} Team,

I'm planning my wedding for summer 2025 and ${hotelName} is at the top of our list. We're looking at hosting approximately 80 guests over a weekend, including welcome drinks, the ceremony, reception, and accommodation block.

Given the scale of what we're planning (full venue buyout for the Saturday, exclusive dining, accommodation for 35+ rooms), I understand this would need to be discussed with your General Manager or Events Director.

Could you please share the direct email for whoever handles large private events? I'd like to discuss availability and get a sense of what's possible before we visit in person.

We have flexibility on exact dates and budget isn't the primary concern - we want to find the right venue.

Thank you so much for your help!

Best,
${senderName}`,
  },
  {
    subject: 'Corporate Relocation - Extended Stay Inquiry',
    template: (hotelName: string, senderName: string) => `Hi ${hotelName} Team,

Our company is relocating several executives to your area, and we need accommodation for 3-6 month periods while they find permanent housing. We're looking at ${hotelName} for 4-5 people starting Q1 2025.

For extended corporate stays like this, we typically negotiate rates directly with hotel management rather than booking through standard channels.

Could you provide the email address for your General Manager or whoever handles long-term corporate accounts? We'd need to discuss:
- Extended stay rates
- Billing arrangements
- Room configurations
- Any corporate amenities

Happy to provide company details once we're in touch with the right person.

Thanks,
${senderName}`,
  },
  {
    subject: 'Family Reunion - Large Group Block Request',
    template: (hotelName: string, senderName: string) => `Hi ${hotelName} Team,

I'm organizing a family reunion for approximately 50 people in summer 2025. We'd need around 20-25 rooms for 3 nights, plus a private dining space for our main dinner.

${hotelName} was recommended by a family member who stayed recently. Before I send out save-the-dates to the family, I need to confirm we can secure a room block and get pricing.

For a booking this size, could you connect me with your General Manager or Group Sales Director? I'd like to discuss:
- Room block rates and hold deadlines
- Private dining options
- Any group activities/packages
- Payment arrangements (some family, some individual)

Really hoping we can make this work at your property!

Thanks so much,
${senderName}`,
  },
  {
    subject: 'Sports Team Travel - Season Accommodation',
    template: (hotelName: string, senderName: string) => `Hi ${hotelName} Team,

I manage travel for a regional football/sports club, and we're looking for a regular accommodation partner for away matches in your area. This would be approximately 6-8 stays per season, each with 25-30 rooms.

We need a hotel that can handle:
- Late arrivals (sometimes after 10pm)
- Early breakfast options
- Secure parking for our coach
- Consistent pricing throughout the season

Could you put me in touch with your General Manager to discuss a partnership arrangement? For ongoing contracts like this, we prefer to work directly with hotel management.

Looking forward to your response.

Best regards,
${senderName}
Team Travel Coordinator`,
  },
];

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { prospect_id, template_index = 0 } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id required' }, { status: 400 });
    }

    // Get prospect
    const { data: prospect, error: fetchError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (fetchError || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Check if prospect has only generic email
    const hasOnlyGenericEmail = prospect.email && (
      prospect.email.startsWith('info@') ||
      prospect.email.startsWith('reservations@') ||
      prospect.email.startsWith('reception@') ||
      prospect.email.startsWith('frontdesk@') ||
      prospect.email.startsWith('hello@')
    );

    // Must have an email to send to
    if (!prospect.email) {
      return NextResponse.json({
        error: 'No email address for this prospect',
        suggestion: 'Enrich the prospect first to find an email',
      }, { status: 400 });
    }

    // If already has non-generic email, skip
    if (!hasOnlyGenericEmail && prospect.contact_name) {
      return NextResponse.json({
        skipped: true,
        reason: 'Already has decision-maker contact',
        contact_name: prospect.contact_name,
        email: prospect.email,
      });
    }

    // Get SMTP configuration (use the 4th inbox for mystery shopper)
    const smtpConfig = process.env.SMTP_INBOX_4
      ? getSmtpConfig(process.env.SMTP_INBOX_4)
      : process.env.SMTP_INBOX_1
        ? getSmtpConfig(process.env.SMTP_INBOX_1)
        : null;

    if (!smtpConfig) {
      return NextResponse.json({ error: 'No SMTP configuration' }, { status: 500 });
    }

    // Select template
    const template = INQUIRY_TEMPLATES[template_index % INQUIRY_TEMPLATES.length];
    const emailBody = template.template(prospect.name, smtpConfig.senderName);

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.port === 465,
      auth: {
        user: smtpConfig.email,
        pass: smtpConfig.password,
      },
    });

    // Send email
    await transporter.sendMail({
      from: `"${smtpConfig.senderName}" <${smtpConfig.email}>`,
      to: prospect.email,
      subject: template.subject,
      text: emailBody,
    });

    // Log activity
    await supabase.from('activities').insert({
      prospect_id,
      type: 'email',
      title: 'Mystery Shopper Inquiry Sent',
      description: `Sent inquiry to ${prospect.email} requesting GM contact. Template: ${template.subject}`,
    });

    // Tag prospect for follow-up
    const tags = prospect.tags || [];
    if (!tags.includes('mystery-inquiry-sent')) {
      tags.push('mystery-inquiry-sent');
      await supabase
        .from('prospects')
        .update({ tags })
        .eq('id', prospect_id);
    }

    return NextResponse.json({
      success: true,
      sent_to: prospect.email,
      template: template.subject,
      message: 'Mystery inquiry sent - check for replies in 24-48 hours',
    });
  } catch (error) {
    console.error('Mystery inquiry error:', error);
    return NextResponse.json(
      { error: 'Failed to send inquiry', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Batch send mystery inquiries to prospects with only generic emails
 */
export async function PUT(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const limit = body.limit || 5;

    // Find prospects with generic emails that haven't received inquiry
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, name, email, tags')
      .eq('stage', 'researching')
      .not('email', 'is', null)
      .limit(50);

    if (error) throw error;

    // Filter to only those with generic emails and no mystery inquiry sent
    const eligibleProspects = (prospects || []).filter(p => {
      const isGenericEmail = p.email && (
        p.email.startsWith('info@') ||
        p.email.startsWith('reservations@') ||
        p.email.startsWith('reception@') ||
        p.email.startsWith('frontdesk@') ||
        p.email.startsWith('hello@')
      );
      const alreadySent = (p.tags || []).includes('mystery-inquiry-sent');
      return isGenericEmail && !alreadySent;
    }).slice(0, limit);

    const results = [];
    const cookieHeader = request.headers.get('cookie') || '';

    for (let i = 0; i < eligibleProspects.length; i++) {
      const prospect = eligibleProspects[i];

      try {
        const response = await fetch(`${request.nextUrl.origin}/api/mystery-inquiry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader,
          },
          body: JSON.stringify({
            prospect_id: prospect.id,
            template_index: i % INQUIRY_TEMPLATES.length, // Rotate templates
          }),
        });

        const result = await response.json();
        results.push({ id: prospect.id, name: prospect.name, success: result.success, error: result.error });

        // Delay between sends (30-60 seconds)
        if (i < eligibleProspects.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 30000 + Math.random() * 30000));
        }
      } catch (e) {
        results.push({ id: prospect.id, name: prospect.name, success: false, error: String(e) });
      }
    }

    return NextResponse.json({
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Batch mystery inquiry failed', details: String(error) },
      { status: 500 }
    );
  }
}
