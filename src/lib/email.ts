import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import * as nodemailer from 'nodemailer';

// Azure AD / Microsoft Graph configuration
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';
const AZURE_MAIL_FROM_NAME = process.env.AZURE_MAIL_FROM_NAME || 'Edward Guest';

// Check if Azure is configured
export function isSmtpConfigured(): boolean {
  return !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && AZURE_MAIL_FROM);
}

// Create Microsoft Graph client
function createGraphClient(): Client {
  if (!isSmtpConfigured()) {
    throw new Error('Azure credentials not configured');
  }

  const credential = new ClientSecretCredential(
    AZURE_TENANT_ID!,
    AZURE_CLIENT_ID!,
    AZURE_CLIENT_SECRET!
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  return Client.initWithMiddleware({ authProvider });
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  inReplyTo?: string; // Message ID for threading
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveryTime: number;
}

/**
 * Send an email via Microsoft Graph API
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const startTime = Date.now();

  try {
    const client = createGraphClient();

    const message: Record<string, unknown> = {
      subject: options.subject,
      body: {
        contentType: 'HTML',
        content: formatEmailHtml(options.body),
      },
      toRecipients: [
        {
          emailAddress: {
            address: options.to,
          },
        },
      ],
      from: {
        emailAddress: {
          name: AZURE_MAIL_FROM_NAME,
          address: AZURE_MAIL_FROM,
        },
      },
    };

    // For reply threading, we rely on conversationId which Graph handles automatically
    // Custom headers like In-Reply-To must start with 'x-' in Graph API
    // The threading is handled by setting the conversationId when replying

    // Send mail using Graph API
    await client
      .api(`/users/${AZURE_MAIL_FROM}/sendMail`)
      .post({ message, saveToSentItems: true });

    const deliveryTime = Date.now() - startTime;

    return {
      success: true,
      messageId: `graph-${Date.now()}`,
      deliveryTime,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    console.error('Microsoft Graph email error:', error);
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
                        <p style="margin:.1px;"><span style='font-weight:bold;'>Automation Expert</span> | Jengu</p>
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
  // Split by double newlines to get paragraphs, then wrap each in <p> tags
  const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
  const htmlBody = paragraphs
    .map(para => {
      // Convert single newlines within a paragraph to <br>
      const lines = para.split('\n').join('<br>');
      return `<p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #333333;">${lines}</p>`;
    })
    .join('\n');

  // Optimized for maximum response rates based on research:
  // - 16px font size (optimal for mobile - 60%+ of opens)
  // - Arial/Helvetica sans-serif (renders consistently across clients)
  // - #333333 dark grey text (professional, high contrast)
  // - 1.6 line-height (improves readability)
  // - Short paragraphs with spacing (easier to scan)
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333333;
      margin: 0;
      padding: 20px;
      background-color: #ffffff;
    }
    .email-body {
      max-width: 600px;
    }
    .email-body p {
      margin: 0 0 16px 0;
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
 * Verify Azure/Graph connection
 * Note: We can't fully verify without Mail.Send permission,
 * so we just check if credentials are configured
 */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isSmtpConfigured()) {
    return { success: false, error: 'Azure credentials not configured' };
  }

  try {
    // Just verify we can create a Graph client and get a token
    // The actual permission check happens when we try to send
    const credential = new ClientSecretCredential(
      AZURE_TENANT_ID!,
      AZURE_CLIENT_ID!,
      AZURE_CLIENT_SECRET!
    );

    // Try to get a token - this verifies the credentials are valid
    await credential.getToken('https://graph.microsoft.com/.default');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Gmail SMTP configuration for mystery shopper emails
const GMAIL_SMTP_USER = process.env.GMAIL_SMTP_USER;
const GMAIL_SMTP_PASS = process.env.GMAIL_SMTP_PASS;

export function isGmailConfigured(): boolean {
  return !!(GMAIL_SMTP_USER && GMAIL_SMTP_PASS);
}

/**
 * Send a mystery shopper email via Gmail SMTP
 * This sends as Andy to test hotel response times
 */
export async function sendMysteryShopperEmail(options: {
  to: string;
  subject: string;
  body: string;
}): Promise<SendEmailResult> {
  const startTime = Date.now();

  if (!isGmailConfigured()) {
    return {
      success: false,
      error: 'Gmail SMTP not configured',
      deliveryTime: 0,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_SMTP_USER,
        pass: GMAIL_SMTP_PASS,
      },
    });

    const result = await transporter.sendMail({
      from: `Andy Chukwuat <${GMAIL_SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: formatSimpleHtml(options.body),
    });

    const deliveryTime = Date.now() - startTime;

    return {
      success: true,
      messageId: result.messageId,
      deliveryTime,
    };
  } catch (error) {
    const deliveryTime = Date.now() - startTime;
    console.error('Gmail SMTP error:', error);
    return {
      success: false,
      error: String(error),
      deliveryTime,
    };
  }
}

/**
 * Format plain text as simple HTML (no signature for mystery shopper)
 * Uses same optimized formatting as main emails
 */
function formatSimpleHtml(body: string): string {
  const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
  const htmlBody = paragraphs
    .map(para => {
      const lines = para.split('\n').join('<br>');
      return `<p style="margin: 0 0 16px 0;">${lines}</p>`;
    })
    .join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; padding: 20px; background-color: #ffffff;">
  ${htmlBody}
</body>
</html>
  `.trim();
}
