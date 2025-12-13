/**
 * Test Mailbox Connection
 * POST /api/outreach/mailboxes/[id]/test - Test SMTP/IMAP connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { mailboxRepository } from '@/repositories/mailbox.repository';
import * as nodemailer from 'nodemailer';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const testType = body.type || 'smtp'; // 'smtp' or 'imap'
    const testEmail = body.test_email; // Optional: send test email to this address

    const mailbox = await mailboxRepository.findById(id);
    if (!mailbox) {
      return NextResponse.json(
        { error: 'Mailbox not found' },
        { status: 404 }
      );
    }

    if (testType === 'smtp') {
      // Test SMTP connection
      const transporter = nodemailer.createTransport({
        host: mailbox.smtp_host,
        port: mailbox.smtp_port,
        secure: mailbox.smtp_secure,
        auth: {
          user: mailbox.smtp_user,
          pass: mailbox.smtp_pass,
        },
        connectionTimeout: 10000,
      });

      try {
        // Verify connection
        await transporter.verify();

        // Mark as verified
        await mailboxRepository.markSmtpVerified(id, true);

        // Optionally send test email
        if (testEmail) {
          await transporter.sendMail({
            from: `"${mailbox.display_name || 'Test'}" <${mailbox.email}>`,
            to: testEmail,
            subject: 'Mailbox Connection Test',
            text: `This is a test email from ${mailbox.email} to verify the SMTP connection is working correctly.`,
            html: `<p>This is a test email from <strong>${mailbox.email}</strong> to verify the SMTP connection is working correctly.</p>`,
          });

          return NextResponse.json({
            success: true,
            message: `SMTP connection verified and test email sent to ${testEmail}`,
            type: 'smtp',
          });
        }

        return NextResponse.json({
          success: true,
          message: 'SMTP connection verified successfully',
          type: 'smtp',
        });
      } catch (smtpError) {
        await mailboxRepository.markSmtpVerified(id, false);
        await mailboxRepository.updateStatus(id, 'error', String(smtpError));

        return NextResponse.json({
          success: false,
          message: 'SMTP connection failed',
          error: String(smtpError),
          type: 'smtp',
        }, { status: 400 });
      }
    } else if (testType === 'imap') {
      // IMAP testing would require imap library
      // For now, just validate that IMAP settings are present
      if (!mailbox.imap_host || !mailbox.imap_user || !mailbox.imap_pass) {
        return NextResponse.json({
          success: false,
          message: 'IMAP settings are not configured',
          type: 'imap',
        }, { status: 400 });
      }

      // TODO: Implement actual IMAP testing with imap library
      // For now, mark as verified if settings are present
      await mailboxRepository.markImapVerified(id, true);

      return NextResponse.json({
        success: true,
        message: 'IMAP settings verified (connection test not yet implemented)',
        type: 'imap',
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid test type. Use "smtp" or "imap"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('POST /api/outreach/mailboxes/[id]/test error:', error);
    return NextResponse.json(
      { error: 'Failed to test mailbox connection' },
      { status: 500 }
    );
  }
}
