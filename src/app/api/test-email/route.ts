import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { sendEmail, isSmtpConfigured, verifySmtpConnection } from '@/lib/email';
import { success, errors } from '@/lib/api-response';
import { parseBody, parseSearchParams, uuidSchema, emailSchema, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';

const testEmailSchema = z.object({
  prospect_id: uuidSchema,
  to_email: emailSchema,
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  test_type: z.enum(['delivery', 'response', 'bounce', 'open_tracking']),
  simulate: z.boolean().optional(),
});

const testEmailQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  check_smtp: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
});

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const data = await parseBody(request, testEmailSchema);
    const { prospect_id, to_email, subject, body, test_type, simulate } = data;

    let deliveryTime: number;
    let messageId: string | undefined;
    let sendSuccess = true;
    let sendError: string | undefined;

    const shouldSimulate = simulate || !isSmtpConfigured();

    if (shouldSimulate) {
      const simulatedDelay = Math.random() * 500 + 100;
      await new Promise(resolve => setTimeout(resolve, simulatedDelay));
      deliveryTime = Math.round(simulatedDelay);
      messageId = `simulated-${Date.now()}`;
    } else {
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
        logger.error({ error: sendError, to: to_email }, 'Test email send failed');
        return errors.internal(`Email send failed: ${sendError}`);
      }
    }

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
      logger.error({ error: emailError }, 'Failed to save email record');
      return errors.internal('Failed to save email record', emailError);
    }

    // Log activity (non-blocking)
    supabase.from('activities').insert({
      prospect_id,
      type: 'email',
      title: shouldSimulate ? `Test email simulated to ${to_email}` : `Email sent to ${to_email}`,
      description: `Subject: ${subject}\nDelivery time: ${deliveryTime}ms\nTest type: ${test_type}`,
    }).then(({ error }) => {
      if (error) logger.warn({ error }, 'Failed to log activity');
    });

    // Update prospect stage (non-blocking)
    supabase
      .from('prospects')
      .update({
        stage: 'contacted',
        last_contacted: new Date().toISOString(),
      })
      .eq('id', prospect_id)
      .then(({ error }) => {
        if (error) logger.warn({ error }, 'Failed to update prospect stage');
      });

    logger.info({ emailId: email.id, to: to_email, simulated: shouldSimulate }, 'Test email sent');

    return success({
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
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error in test email');
    return errors.internal('Failed to send test email', error);
  }
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const params = parseSearchParams(new URL(request.url).searchParams, testEmailQuerySchema);

    const smtpStatus: { configured: boolean; connected?: boolean; error?: string } = {
      configured: isSmtpConfigured(),
    };

    if (params.check_smtp && smtpStatus.configured) {
      const verification = await verifySmtpConnection();
      smtpStatus.connected = verification.success;
      smtpStatus.error = verification.error;
    }

    const { data: emails, error } = await supabase
      .from('emails')
      .select('*, prospects(id, name, email, tags)')
      .order('created_at', { ascending: false })
      .limit(params.limit);

    if (error) {
      logger.error({ error }, 'Failed to fetch emails');
      return errors.internal('Failed to fetch emails', error);
    }

    return success({
      emails: emails || [],
      smtp: smtpStatus,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error fetching test emails');
    return errors.internal('Failed to fetch emails', error);
  }
}
