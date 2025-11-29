import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// For now, we simulate email sending. In production, you'd integrate with:
// - SendGrid, Mailgun, AWS SES, or similar
// This allows testing the full flow without actually sending emails

interface TestEmailRequest {
  prospect_id: string;
  to_email: string;
  subject: string;
  body: string;
  test_type: 'delivery' | 'response' | 'bounce' | 'open_tracking';
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const data: TestEmailRequest = await request.json();
    const { prospect_id, to_email, subject, body, test_type } = data;

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

    const sendStartTime = Date.now();

    // Simulate email sending (replace with real email service in production)
    // For testing, we'll track timing and simulate different outcomes
    const simulatedDelay = Math.random() * 500 + 100; // 100-600ms
    await new Promise(resolve => setTimeout(resolve, simulatedDelay));

    const sendEndTime = Date.now();
    const deliveryTime = sendEndTime - sendStartTime;

    // Create email record in database
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .insert({
        prospect_id,
        subject,
        body,
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

    // Create test result record
    const { data: testResult, error: testError } = await supabase
      .from('email_tests')
      .insert({
        email_id: email.id,
        prospect_id,
        to_email,
        test_type,
        status: 'sent',
        delivery_time_ms: deliveryTime,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (testError) {
      // Table might not exist yet, that's ok - just log it
      console.log('Note: email_tests table may need to be created');
    }

    // Log activity
    await supabase.from('activities').insert({
      prospect_id,
      type: 'email',
      title: `Test email sent to ${to_email}`,
      description: `Subject: ${subject}\nDelivery time: ${deliveryTime}ms\nTest type: ${test_type}`,
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
      test_id: testResult?.id,
      delivery_time_ms: deliveryTime,
      sent_at: email.sent_at,
      message: `Test email sent to ${to_email}`,
    });
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { error: 'Failed to send test email', details: String(error) },
      { status: 500 }
    );
  }
}

// Get test email history
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');

  // Get recent test emails (look for test prospects)
  const { data: emails, error } = await supabase
    .from('emails')
    .select(`
      *,
      prospects!inner(
        id,
        name,
        email,
        tags
      )
    `)
    .contains('prospects.tags', ['test'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // If filter fails, just get recent emails
    const { data: allEmails, error: allError } = await supabase
      .from('emails')
      .select('*, prospects(id, name, email, tags)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (allError) {
      return NextResponse.json({ error: allError.message }, { status: 500 });
    }

    return NextResponse.json({ emails: allEmails || [] });
  }

  return NextResponse.json({ emails: emails || [] });
}
