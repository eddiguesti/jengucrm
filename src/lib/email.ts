import nodemailer from 'nodemailer';

// Email configuration from environment
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'Edward Guest';

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
      text: options.body + '\n\n--\nEdward Guest\nDirector | Jengu\n+33 759637307\n+44 1273 090340\nwww.jengu.ai',
      html: formatEmailHtml(options.body),
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

// Edward Guest's professional email signature
const EMAIL_SIGNATURE = `
<table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' emb-background-style width='100%'>
  <tbody>
    <tr>
      <td style="width:100%;">
        <table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' emb-background-style width='500'>
          <tbody>
            <tr>
              <td style='padding:0px;vertical-align:middle;width:150px;font-family:Verdana, Verdana Ref, sans-serif;' width='150'>
                <table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' width='100%' emb-background-style>
                  <tbody>
                    <tr>
                      <td style="color:#666666;font-size:13px;height:173px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;">
                          <img src="https://mediaforce.img.email/images/6914c0d3c92d3.png" width="166" height="173" style="display:block;border:0px;" border="0" alt="Jengu.ai Director of International Business Development" />
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td style='padding-left:30px;padding-top:0px;padding-right:0px;padding-bottom:0px;vertical-align:middle;width:320px;font-family:Verdana, Verdana Ref, sans-serif;' width='320'>
                <table cellspacing='0' cellpadding='0' border='0' style='border-collapse:separate;table-layout:fixed;overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;' width='100%' emb-background-style>
                  <tbody>
                    <tr>
                      <td style="color:#666666;font-size:16px;mso-line-height-rule:exactly;line-height:24px;font-family:Helvetica,Arial,sans-serif;">
                        <p style="margin:.1px;"><span style='font-weight:bold;color:#054E88;letter-spacing:2px;'>Edward Guest</span></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-weight:bold;color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:20px;padding-bottom:7px;border-bottom:solid 2px #054E88;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><span style='font-weight:bold;'>Director</span> | Jengu</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:20px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><a href="tel:+33759637307" style="color:#0085d1;text-decoration:none;" target="_blank">+33 759637307</a></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:20px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><a href="tel:+441273090340" style="color:#0085d1;text-decoration:none;" target="_blank">+44 1273 090340</a></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;mso-line-height-rule:exactly;line-height:23px;font-family:Helvetica,Arial,sans-serif;">
                        <p style="margin:.1px;"><span style='color:#054E88;font-size:15px;letter-spacing:2px;'><a href="https://www.jengu.ai" style="color:#054E88;text-decoration:none;" target="_blank">www.jengu.ai</a></span></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:9px;height:22px;padding-top:7px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;">
                          <a href="https://www.linkedin.com/in/edwardguest1/" target="_blank" style="display:inline-block;padding-right:4px;vertical-align:middle;">
                            <img src="https://mediaforce.icns.email/social/linkedin-circle-small-0085d1-FFFFFF.png" width="22" height="22" style="border:0px;display:inline-block;" border="0" alt="LinkedIn" />
                          </a>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:13px;height:30px;padding-top:13px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;">
                          <a href="https://calendly.com/edd-jengu-6puv/30min" target="_blank" style="display:inline-block;padding-right:4px;vertical-align:middle;">
                            <img src="https://mediaforce.icns.email/button/schedule4-small-054E88-dark-round.png" width="162" height="30" style="border:0px;display:inline-block;" border="0" alt="Get on My Calendar" />
                          </a>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#A9A9A9;font-size:8px;mso-line-height-rule:exactly;line-height:12px;font-family:Verdana, Verdana Ref, sans-serif;">
                        <p style="margin:.1px;"><span style='font-weight:bold;font-size:8px;'>The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.</span></p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
`;

/**
 * Format plain text email body as professional HTML with signature
 */
function formatEmailHtml(body: string): string {
  // Convert newlines to <br> and preserve formatting
  const htmlBody = body
    .split('\n')
    .map(line => {
      // Don't trim lines to preserve intentional spacing
      if (line.trim() === '') return '<br>';
      return line;
    })
    .join('<br>\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333333;
      margin: 0;
      padding: 20px;
    }
    .email-body {
      max-width: 600px;
    }
    .signature {
      margin-top: 30px;
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="email-body">
    ${htmlBody}
  </div>
  <div class="signature">
    ${EMAIL_SIGNATURE}
  </div>
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
