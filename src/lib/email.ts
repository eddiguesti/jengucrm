import nodemailer from 'nodemailer';

// Email configuration from environment
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'Jengu';

// Check if SMTP is configured
export function isSmtpConfigured(): boolean {
  return !!(SMTP_USER && SMTP_PASS && SMTP_FROM);
}

// Create transporter
function createTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP not configured. Set SMTP_USER, SMTP_PASS, and SMTP_FROM in .env.local');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveryTime: number;
}

/**
 * Send an email via SMTP
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const startTime = Date.now();

  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: formatEmailHtml(options.body, options.subject),
      replyTo: options.replyTo || SMTP_FROM,
    };

    const info = await transporter.sendMail(mailOptions);
    const deliveryTime = Date.now() - startTime;

    return {
      success: true,
      messageId: info.messageId,
      deliveryTime,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    return {
      success: false,
      error: String(error),
      deliveryTime,
    };
  }
}

/**
 * Format plain text email body as simple HTML
 */
function formatEmailHtml(body: string, subject: string): string {
  // Convert newlines to <br> and wrap in basic HTML
  const htmlBody = body
    .split('\n')
    .map(line => line.trim())
    .join('<br>\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
  </style>
</head>
<body>
  ${htmlBody}
  <br><br>
  <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px;">
    Sent by Jengu - Hospitality Technology
  </p>
</body>
</html>
  `.trim();
}

/**
 * Verify SMTP connection
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isSmtpConfigured()) {
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
