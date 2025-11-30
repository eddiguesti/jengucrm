import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_MAIL_FROM = process.env.AZURE_MAIL_FROM || 'edd@jengu.ai';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'edd@jengu.ai';

// Keywords for detecting intent
const MEETING_KEYWORDS = [
  'meet', 'meeting', 'call', 'schedule', 'calendly', 'demo', 'chat',
  'discuss', 'talk', 'connect', 'catch up', 'available', 'free time',
  'book', 'appointment', 'zoom', 'teams', 'google meet', "let's talk",
  'interested in learning more', 'would love to hear', 'tell me more'
];

const NOT_INTERESTED_KEYWORDS = [
  'not interested', 'no thank', 'no thanks', 'unsubscribe', 'remove me',
  'stop emailing', "don't contact", 'not looking', 'not in the market',
  'already have', 'not for us', 'not a good fit', 'pass on this',
  'decline', 'not at this time', 'maybe later', 'not right now'
];

function analyzeReply(subject: string, body: string) {
  const text = `${subject} ${body}`.toLowerCase();

  const meetingMatches = MEETING_KEYWORDS.filter(kw => text.includes(kw));
  const isMeetingRequest = meetingMatches.length >= 1;

  const notInterestedMatches = NOT_INTERESTED_KEYWORDS.filter(kw => text.includes(kw));
  const isNotInterested = notInterestedMatches.length >= 1;

  const isPositive = !isNotInterested && (
    text.includes('sounds interesting') ||
    text.includes('tell me more') ||
    text.includes('pricing') ||
    text.includes('how much')
  );

  let notInterestedReason: string | undefined;
  if (isNotInterested) {
    if (text.includes('already have') || text.includes('existing solution')) {
      notInterestedReason = 'competitor';
    } else if (text.includes('budget') || text.includes('cost')) {
      notInterestedReason = 'budget';
    } else if (text.includes('later') || text.includes('not right now')) {
      notInterestedReason = 'timing';
    } else if (text.includes('wrong person')) {
      notInterestedReason = 'wrong_contact';
    } else {
      notInterestedReason = 'not_interested';
    }
  }

  return { isMeetingRequest, isNotInterested, isPositive, notInterestedReason };
}

// Microsoft Graph webhook validation
export async function POST(request: NextRequest) {
  const url = new URL(request.url);

  // Handle webhook validation (Microsoft sends a validation token)
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Process the webhook notification
  try {
    const body = await request.json();
    const supabase = createServerClient();

    // Microsoft sends notifications in this format
    const notifications = body.value || [];

    for (const notification of notifications) {
      // Get the email details from Microsoft Graph
      if (notification.resourceData?.id) {
        await processEmailNotification(supabase, notification.resourceData.id);
      }
    }

    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function processEmailNotification(
  supabase: ReturnType<typeof createServerClient>,
  messageId: string
) {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) return;

  const credential = new ClientSecretCredential(
    AZURE_TENANT_ID,
    AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  const client = Client.initWithMiddleware({ authProvider });

  try {
    // Fetch the email
    const message = await client
      .api(`/users/${AZURE_MAIL_FROM}/messages/${messageId}`)
      .select('id,subject,from,bodyPreview,body,receivedDateTime,conversationId')
      .get();

    const fromEmail = message.from?.emailAddress?.address;
    if (!fromEmail || fromEmail.toLowerCase() === AZURE_MAIL_FROM.toLowerCase()) {
      return; // Skip our own emails
    }

    // Check if already processed
    const { data: existing } = await supabase
      .from('emails')
      .select('id')
      .eq('message_id', messageId)
      .single();

    if (existing) return;

    // Match to prospect
    const { data: sentEmail } = await supabase
      .from('emails')
      .select('prospect_id, prospects(id, name, email)')
      .eq('to_email', fromEmail)
      .eq('direction', 'outbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    let prospect = null;
    if (sentEmail?.prospect_id && sentEmail.prospects) {
      const prospectData = sentEmail.prospects;
      const p = Array.isArray(prospectData) ? prospectData[0] : prospectData;
      if (p) {
        prospect = { id: sentEmail.prospect_id, name: p.name, email: p.email || fromEmail };
      }
    }

    if (!prospect) {
      const { data: p } = await supabase
        .from('prospects')
        .select('id, name, email')
        .eq('email', fromEmail)
        .limit(1)
        .single();
      prospect = p;
    }

    if (!prospect) return; // Unknown sender

    // Analyze the reply
    const analysis = analyzeReply(message.subject || '', message.bodyPreview || '');

    let emailType = 'reply';
    if (analysis.isMeetingRequest) emailType = 'meeting_request';
    else if (analysis.isNotInterested) emailType = 'not_interested';
    else if (analysis.isPositive) emailType = 'positive_reply';

    // Save the email
    const { data: savedEmail } = await supabase.from('emails').insert({
      prospect_id: prospect.id,
      subject: message.subject,
      body: message.bodyPreview,
      to_email: AZURE_MAIL_FROM,
      from_email: fromEmail,
      message_id: messageId,
      email_type: emailType,
      direction: 'inbound',
      status: 'replied',
      sent_at: message.receivedDateTime,
      thread_id: message.conversationId,
    }).select().single();

    // Handle based on intent
    if (analysis.isNotInterested) {
      await supabase
        .from('prospects')
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          archive_reason: analysis.notInterestedReason,
          stage: 'lost',
        })
        .eq('id', prospect.id);

      await supabase.from('activities').insert({
        prospect_id: prospect.id,
        type: 'archived',
        title: `Prospect archived: ${analysis.notInterestedReason}`,
        description: `Auto-archived based on reply: "${message.bodyPreview?.substring(0, 100)}..."`,
        email_id: savedEmail?.id,
      });
    } else if (analysis.isMeetingRequest || analysis.isPositive) {
      const newStage = analysis.isMeetingRequest ? 'meeting' : 'engaged';
      await supabase
        .from('prospects')
        .update({ stage: newStage })
        .eq('id', prospect.id);

      // Create notification
      await supabase.from('notifications').insert({
        prospect_id: prospect.id,
        email_id: savedEmail?.id,
        type: analysis.isMeetingRequest ? 'meeting_request' : 'positive_reply',
        title: analysis.isMeetingRequest
          ? `Meeting request from ${prospect.name}!`
          : `Positive reply from ${prospect.name}`,
        message: message.bodyPreview?.substring(0, 300),
      });

      // Send instant email notification for meeting requests
      if (analysis.isMeetingRequest) {
        await sendNotificationEmail(client, prospect, message);
      }

      await supabase.from('activities').insert({
        prospect_id: prospect.id,
        type: analysis.isMeetingRequest ? 'meeting_request' : 'positive_reply',
        title: analysis.isMeetingRequest ? 'Meeting request received!' : 'Positive reply received',
        description: `Subject: ${message.subject}\n${message.bodyPreview?.substring(0, 200)}...`,
        email_id: savedEmail?.id,
      });
    } else {
      await supabase
        .from('prospects')
        .update({ stage: 'engaged' })
        .eq('id', prospect.id);

      await supabase.from('activities').insert({
        prospect_id: prospect.id,
        type: 'email_reply',
        title: `Reply received from ${fromEmail}`,
        description: `Subject: ${message.subject}\n${message.bodyPreview?.substring(0, 200)}...`,
        email_id: savedEmail?.id,
      });
    }
  } catch (error) {
    console.error('Error processing email notification:', error);
  }
}

async function sendNotificationEmail(
  client: Client,
  prospect: { name: string; email: string },
  email: { subject: string; bodyPreview: string; receivedDateTime: string }
) {
  const message = {
    subject: `MEETING REQUEST: ${prospect.name} replied!`,
    body: {
      contentType: 'HTML',
      content: `
        <h2>Meeting Request from ${prospect.name}</h2>
        <p><strong>From:</strong> ${prospect.email}</p>
        <p><strong>Subject:</strong> ${email.subject}</p>
        <p><strong>Received:</strong> ${email.receivedDateTime}</p>
        <hr>
        <h3>Their Message:</h3>
        <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #007bff;">
          ${email.bodyPreview}
        </blockquote>
        <hr>
        <p><a href="https://marketing-agent.vercel.app/prospects" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in CRM</a></p>
      `,
    },
    toRecipients: [{ emailAddress: { address: NOTIFICATION_EMAIL } }],
  };

  try {
    await client.api(`/users/${AZURE_MAIL_FROM}/sendMail`).post({ message });
  } catch (error) {
    console.error('Failed to send notification email:', error);
  }
}

// GET endpoint to check webhook status and setup instructions
export async function GET() {
  const webhookUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/webhooks/email`
    : 'https://marketing-agent.vercel.app/api/webhooks/email';

  return NextResponse.json({
    status: 'ready',
    webhook_url: webhookUrl,
    setup_instructions: {
      step1: 'Go to Azure Portal > App Registrations > Your App',
      step2: 'Add Mail.Read permission (Application type)',
      step3: 'Grant admin consent',
      step4: 'Use Microsoft Graph to create a subscription',
      manual_check: 'POST /api/check-replies with {"hours_back": 24} to manually check',
    },
  });
}
