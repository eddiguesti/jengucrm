/**
 * Raw Email Send Endpoint
 * Called by Cloudflare Workers to send emails via our SMTP credentials
 * This bridges the gap since CF Workers can't do direct SMTP connections
 */

import { NextRequest } from 'next/server';
import * as nodemailer from 'nodemailer';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { getSmtpInboxes } from '@/lib/email/config';

// Verify the request is from our Cloudflare Worker
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    console.log('[send-raw] No Authorization header');
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  const cronSecret = process.env.CRON_SECRET;

  // Debug: log first 8 chars of each for troubleshooting (safe - not full secret)
  console.log('[send-raw] Auth check:', {
    tokenPrefix: token.substring(0, 8) + '...',
    secretPrefix: cronSecret ? cronSecret.substring(0, 8) + '...' : 'NOT_SET',
    tokenLength: token.length,
    secretLength: cronSecret?.length || 0,
    match: token === cronSecret
  });

  if (!cronSecret) {
    console.error('[send-raw] CRON_SECRET not configured in environment');
    return false;
  }

  return token === cronSecret;
}

export async function POST(request: NextRequest) {
  // Auth check
  if (!verifyAuth(request)) {
    return errors.unauthorized('Invalid or missing authorization');
  }

  try {
    const body = await request.json();
    const { to, subject, body: emailBody, fromEmail, fromName } = body;

    // Validate required fields
    if (!to || !subject || !emailBody || !fromEmail) {
      return errors.badRequest('Missing required fields: to, subject, body, fromEmail');
    }

    // Find the matching SMTP inbox
    const smtpInboxes = getSmtpInboxes();
    const inbox = smtpInboxes.find((i) => i.email === fromEmail);

    if (!inbox) {
      logger.error({ fromEmail, availableInboxes: smtpInboxes.map(i => i.email) }, 'SMTP inbox not found');
      return errors.badRequest(`No SMTP configuration for ${fromEmail}`);
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: inbox.host,
      port: inbox.port,
      secure: inbox.port === 465,
      auth: {
        user: inbox.user || inbox.email,
        pass: inbox.password,
      },
    });

    // Send the email
    const startTime = Date.now();
    const result = await transporter.sendMail({
      from: `"${fromName || inbox.displayName}" <${fromEmail}>`,
      to,
      subject,
      text: emailBody,
    });

    const latencyMs = Date.now() - startTime;

    logger.info({
      to,
      from: fromEmail,
      subject: subject.substring(0, 50),
      messageId: result.messageId,
      latencyMs,
    }, 'Raw email sent successfully');

    return success({
      success: true,
      messageId: result.messageId,
      latencyMs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Raw email send failed');

    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
