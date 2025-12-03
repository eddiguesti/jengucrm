import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendMysteryShopperEmail, isGmailConfigured } from '@/lib/email';

interface MysteryShopperRequest {
  prospect_id: string;
  to_email: string;
  subject?: string;
  body?: string;
}

/**
 * Send a mystery shopper email to a hotel
 * This pretends to be a guest inquiring about availability
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const data: MysteryShopperRequest = await request.json();
    const { prospect_id, to_email } = data;

    if (!prospect_id || !to_email) {
      return NextResponse.json(
        { error: 'Missing required fields: prospect_id, to_email' },
        { status: 400 }
      );
    }

    // Get prospect details for personalization
    const { data: prospect } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    // Generate a realistic guest inquiry
    const subject = data.subject || generateSubject(prospect);
    const body = data.body || generateInquiry(prospect);

    // Check if Gmail is configured
    if (!isGmailConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Gmail SMTP not configured. Add GMAIL_SMTP_USER and GMAIL_SMTP_PASS to .env.local',
        simulated: true,
      }, { status: 500 });
    }

    // Send the mystery shopper email
    const result = await sendMysteryShopperEmail({
      to: to_email,
      subject,
      body,
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 });
    }

    // Save full email to emails table
    const { data: emailRecord } = await supabase.from('emails').insert({
      prospect_id,
      subject,
      body,
      to_email,
      from_email: process.env.GMAIL_SMTP_USER || 'andy.chukwuat@gmail.com',
      message_id: result.messageId,
      email_type: 'mystery_shopper',
      direction: 'outbound',
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).select().single();

    // Record the mystery shopper test in activities
    await supabase.from('activities').insert({
      prospect_id,
      type: 'mystery_shopper',
      title: `Mystery shopper email sent to ${to_email}`,
      description: `Subject: ${subject}\nSent from: andy.chukwuat@gmail.com\nDelivery time: ${result.deliveryTime}ms`,
      email_id: emailRecord?.id,
    });

    // Update prospect with mystery shopper sent timestamp
    await supabase
      .from('prospects')
      .update({
        notes: prospect?.notes
          ? `${prospect.notes}\n\nMystery shopper email sent: ${new Date().toISOString()}`
          : `Mystery shopper email sent: ${new Date().toISOString()}`,
      })
      .eq('id', prospect_id);

    return NextResponse.json({
      success: true,
      message_id: result.messageId,
      delivery_time_ms: result.deliveryTime,
      sent_at: new Date().toISOString(),
      from: 'andy.chukwuat@gmail.com',
      to: to_email,
      subject,
    });
  } catch (error) {
    console.error('Mystery shopper error:', error);
    return NextResponse.json(
      { error: 'Failed to send mystery shopper email', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mystery-shopper
 * Fetches all mystery shopper inquiries with their status and replies
 */
export async function GET() {
  const supabase = createServerClient();

  try {
    // Fetch all mystery shopper activities
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select(`
        id,
        prospect_id,
        title,
        description,
        created_at,
        prospects (
          id,
          name,
          email,
          contact_name,
          tags
        )
      `)
      .or('title.ilike.%Mystery Shopper%,title.ilike.%mystery inquiry%,type.eq.mystery_shopper')
      .order('created_at', { ascending: false });

    if (activitiesError) throw activitiesError;

    // Process activities into inquiry objects
    const inquiryMap = new Map<string, {
      id: string;
      prospect_id: string;
      prospect_name: string;
      prospect_email: string;
      sent_at: string;
      template: string;
      from_email: string;
      from_name: string;
      status: 'sent' | 'replied' | 'gm_extracted';
      reply_received_at?: string;
      reply_body?: string;
      extracted_gm_name?: string;
      extracted_gm_email?: string;
    }>();

    for (const activity of activities || []) {
      const prospectData = activity.prospects as unknown;
      const prospect = (Array.isArray(prospectData) ? prospectData[0] : prospectData) as { id: string; name: string; email: string; contact_name?: string; tags?: string[] } | null;
      if (!prospect) continue;

      const prospectId = activity.prospect_id;
      const description = activity.description || '';
      const title = activity.title || '';

      // Check if this is an inquiry sent activity
      if (title.includes('Inquiry Sent') || title.includes('sent to') || title.includes('Mystery shopper email sent')) {
        // Extract template name from description
        const templateMatch = description.match(/Template:\s*([^.\n]+)/) || description.match(/Subject:\s*([^.\n]+)/);
        const template = templateMatch ? templateMatch[1].trim() : 'Unknown Template';

        // Extract from email - try multiple patterns
        let fromName = 'Unknown';
        let fromEmail = 'Unknown';

        const fromMatch1 = description.match(/from\s+([^\s(]+)\s*\(([^)]+)\)/);
        const fromMatch2 = description.match(/Sent from:\s*([^\s\n]+)/);

        if (fromMatch1) {
          fromName = fromMatch1[1];
          fromEmail = fromMatch1[2];
        } else if (fromMatch2) {
          fromEmail = fromMatch2[1];
          fromName = fromEmail.split('@')[0];
        }

        // Determine status based on tags and prospect data
        let status: 'sent' | 'replied' | 'gm_extracted' = 'sent';
        const tags = prospect.tags || [];

        // Check if we have GM contact (non-generic email and contact name)
        const hasGmContact = prospect.contact_name &&
          prospect.email &&
          !prospect.email.startsWith('info@') &&
          !prospect.email.startsWith('reservations@') &&
          !prospect.email.startsWith('reception@') &&
          !prospect.email.startsWith('frontdesk@') &&
          !prospect.email.startsWith('hello@');

        if (hasGmContact) {
          status = 'gm_extracted';
        } else if (tags.includes('mystery-reply-received')) {
          status = 'replied';
        }

        // Only keep the most recent inquiry per prospect
        if (!inquiryMap.has(prospectId)) {
          inquiryMap.set(prospectId, {
            id: activity.id,
            prospect_id: prospectId,
            prospect_name: prospect.name,
            prospect_email: prospect.email,
            sent_at: activity.created_at,
            template,
            from_email: fromEmail,
            from_name: fromName,
            status,
            extracted_gm_name: status === 'gm_extracted' ? prospect.contact_name : undefined,
            extracted_gm_email: status === 'gm_extracted' ? prospect.email : undefined,
          });
        }
      }

      // Check if this is a reply activity
      if (title.toLowerCase().includes('reply') || title.toLowerCase().includes('response received')) {
        const existing = inquiryMap.get(prospectId);
        if (existing) {
          existing.status = existing.status === 'gm_extracted' ? 'gm_extracted' : 'replied';
          existing.reply_received_at = activity.created_at;
          existing.reply_body = description;
        }
      }

      // Check if GM was extracted
      if (title.includes('GM') || title.includes('Contact Found') || title.includes('contact extracted')) {
        const existing = inquiryMap.get(prospectId);
        if (existing) {
          existing.status = 'gm_extracted';
          const nameMatch = description.match(/GM:\s*([^,\n]+)/i) || description.match(/Name:\s*([^,\n]+)/i);
          const emailMatch = description.match(/Email:\s*([^\s,\n]+)/i);
          if (nameMatch) existing.extracted_gm_name = nameMatch[1].trim();
          if (emailMatch) existing.extracted_gm_email = emailMatch[1].trim();
        }
      }
    }

    const inquiries = Array.from(inquiryMap.values());

    // Calculate stats
    const stats = {
      total_sent: inquiries.length,
      awaiting_reply: inquiries.filter(i => i.status === 'sent').length,
      replied: inquiries.filter(i => i.status === 'replied').length,
      gm_extracted: inquiries.filter(i => i.status === 'gm_extracted').length,
      configured: isGmailConfigured(),
    };

    return NextResponse.json({
      inquiries,
      stats,
    });
  } catch (error) {
    console.error('Mystery shopper API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mystery shopper data', details: String(error) },
      { status: 500 }
    );
  }
}

// Generate a realistic subject line
function generateSubject(prospect: { name?: string; city?: string } | null): string {
  const subjects = [
    'Availability inquiry for upcoming stay',
    'Question about booking',
    'Room availability request',
    `Inquiry about staying at ${prospect?.name || 'your hotel'}`,
    'Looking for accommodation',
  ];
  return subjects[Math.floor(Math.random() * subjects.length)];
}

// Generate a realistic guest inquiry
function generateInquiry(prospect: { name?: string; city?: string } | null): string {
  const hotelName = prospect?.name || 'your hotel';
  const city = prospect?.city || 'the area';

  const templates = [
    `Hello,

I'm planning a trip to ${city} next month and came across ${hotelName}. I was wondering if you have any availability for 2 nights around mid-month?

Also, could you let me know about your check-in times and if you have any special offers available?

Looking forward to hearing from you.

Best regards,
Andy`,

    `Hi there,

I'm interested in booking a room at ${hotelName} for an upcoming business trip. Could you please let me know:

1. Room availability for next week
2. Your current rates
3. Whether you have a gym or fitness facilities

Thanks in advance for your help.

Andy Chukwuat`,

    `Good day,

I've heard great things about ${hotelName} and would love to stay with you during my upcoming visit to ${city}.

Do you have any rooms available for this weekend? I'd also appreciate any information about breakfast options.

Many thanks,
Andy`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}
