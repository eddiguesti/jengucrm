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
 * Check Gmail SMTP status
 */
export async function GET() {
  return NextResponse.json({
    configured: isGmailConfigured(),
    sender: process.env.GMAIL_SMTP_USER || null,
  });
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
