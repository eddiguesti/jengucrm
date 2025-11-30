import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, isSmtpConfigured, verifySmtpConnection } from '@/lib/email';

interface TestEmailRequest {
  prospect_id: string;
  to_email: string;
  subject: string;
  body: string;
  test_type: 'delivery' | 'response' | 'bounce' | 'open_tracking';
  simulate?: boolean; // If true, don't actually send
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const data: TestEmailRequest = await request.json();
    const { prospect_id, to_email, subject, body, test_type, simulate } = data;

    if (!prospect_id || !to_email || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to_email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    let deliveryTime: number;
    let messageId: string | undefined;
    let sendSuccess = true;
    let sendError: string | undefined;

    // Check if we should send real email or simulate
    const shouldSimulate = simulate || !isSmtpConfigured();

    if (shouldSimulate) {
      // Simulate email sending
      const simulatedDelay = Math.random() * 500 + 100;
      await new Promise(resolve => setTimeout(resolve, simulatedDelay));
      deliveryTime = Math.round(simulatedDelay);
      messageId = `simulated-${Date.now()}`;
    } else {
      // Send real email via SMTP
      const result = await sendEmail({
        to: to_email,
        subject,
        body,
      });

      deliveryTime = result.deliveryTime;
      messageId = result.messageId;
      sendSuccess = result.success;
      sendError = result.error;

      if (!sendSuccess) {
        return NextResponse.json(
          { error: `Email send failed: ${sendError}` },
          { status: 500 }
        );
      }
    }

    // Create email record in database with full tracking
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .insert({
        prospect_id,
        subject,
        body,
        to_email,
        from_email: process.env.AZURE_MAIL_FROM || 'edd@jengu.ai',
        message_id: messageId,
        email_type: 'outreach',
        direction: 'outbound',
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (emailError) {
      return NextResponse.json(
        { error: emailError.message },
        { status: 500 }
      );
    }

    // Log activity
    await supabase.from('activities').insert({
      prospect_id,
      type: 'email',
      title: shouldSimulate ? `Test email simulated to ${to_email}` : `Email sent to ${to_email}`,
      description: `Subject: ${subject}\nDelivery time: ${deliveryTime}ms\nTest type: ${test_type}\nMessage ID: ${messageId || 'N/A'}`,
    });

    // Update prospect stage
    await supabase
      .from('prospects')
      .update({
        stage: 'contacted',
        last_contacted: new Date().toISOString(),
      })
      .eq('id', prospect_id);

    return NextResponse.json({
      success: true,
      email_id: email.id,
      message_id: messageId,
      delivery_time_ms: deliveryTime,
      sent_at: email.sent_at,
      simulated: shouldSimulate,
      message: shouldSimulate
        ? `Test email simulated to ${to_email} (SMTP not configured)`
        : `Email sent to ${to_email}`,
    });
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { error: 'Failed to send test email', details: String(error) },
      { status: 500 }
    );
  }
}

// Get test email history and SMTP status
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const checkSmtp = searchParams.get('check_smtp') === 'true';

  // Optionally verify SMTP connection
  let smtpStatus: { configured: boolean; connected?: boolean; error?: string } = {
    configured: isSmtpConfigured(),
  };

  if (checkSmtp && smtpStatus.configured) {
    const verification = await verifySmtpConnection();
    smtpStatus.connected = verification.success;
    smtpStatus.error = verification.error;
  }

  // Get recent emails
  const { data: emails, error } = await supabase
    .from('emails')
    .select('*, prospects(id, name, email, tags)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    emails: emails || [],
    smtp: smtpStatus,
  });
}
