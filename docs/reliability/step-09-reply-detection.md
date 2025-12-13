# Step 09: Reply Detection & Processing

## ✅ IMPLEMENTED - December 2024

## Goal
Never miss a reply. When someone responds to your email, process it immediately, update the prospect status, and alert the appropriate person. Replies are the most valuable signal.

**Key Requirement**: Always send a notification to edd@jengu.ai for any good replies. For important positive replies (meeting requests, interested), include a pre-made reply with a CTA button for Edd to approve before sending.

---

## Implementation Summary

### Files Created/Modified

| File | Purpose |
|------|---------|
| `cloudflare/src/lib/reply-handler.ts` | Main reply processing logic |
| `cloudflare/migrations/013_reply_approvals.sql` | Database schema for approvals |
| `cloudflare/src/workers/api.ts` | Added `/api/reply/approve` and `/api/reply/pending` endpoints |
| `cloudflare/src/workers/cron.ts` | Added notification sending |

### Key Features

1. **Auto-reply detection** - Filters OOO, vacation, auto-responses
2. **Reply matching** - Via In-Reply-To, References headers, or sender email
3. **Sentiment analysis** - Keyword-based + AI fallback
4. **Suggested reply generation** - Templates for common intents + AI fallback
5. **One-click approval** - 24-hour expiring tokens for instant reply sending
6. **Notification emails** - All positive replies notify edd@jengu.ai

### API Endpoints

- `GET /api/reply/approve?token=xxx` - One-click approval page
- `GET /api/reply/pending` - List pending approvals

---

## Reply Sources

| Source | Method | Latency |
|--------|--------|---------|
| Cloudflare Email Routing | Webhook | Real-time |
| IMAP polling | Scheduled check | 1-5 min |

---

## What to Verify

### 1. Detection
- [ ] All reply channels monitored
- [ ] Replies matched to original email
- [ ] Auto-replies filtered out
- [ ] Bounce notifications excluded

### 2. Processing
- [ ] Reply saved to database
- [ ] Prospect stage updated
- [ ] Sequence stopped (if active)
- [ ] Sentiment analyzed

### 3. Notification (Critical)
- [ ] All positive replies → email to edd@jengu.ai
- [ ] Meeting requests → include pre-made reply with approval link
- [ ] Interested prospects → include pre-made reply with approval link
- [ ] Dashboard shows new replies
- [ ] No reply goes unnoticed

---

## Common Failure Modes

| Failure | Impact | How It Happens |
|---------|--------|----------------|
| Reply missed | Lost opportunity | IMAP error, webhook down |
| Reply not matched | Orphaned email | Thread ID mismatch |
| Auto-reply counted | False positive | Bad filtering |
| Delayed processing | Slow response | Queue backup |
| Duplicate processing | Wrong stats | Webhook retry |
| Notification not sent | Missed opportunity | Alert system failure |

---

## How to Make It Robust

### 1. Cloudflare Email Routing Handler

**File: `cloudflare/src/workers/email-handler.ts`**
```typescript
export async function emailHandler(
  message: EmailMessage,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  try {
    const email = await parseEmail(message);

    // 1. Skip if bounce notification
    if (isBounceNotification(email)) {
      await processBounceNotification(email, env);
      return;
    }

    // 2. Skip if auto-reply
    if (isAutoReply(email)) {
      await recordAutoReply(email, env);
      return;
    }

    // 3. Process as genuine reply
    await processReply(email, env);

  } catch (error) {
    console.error('Email handler error:', error);
    // Don't throw - email will be lost
    await logEmailError(message, error, env);
  }
}

function isAutoReply(email: ParsedEmail): boolean {
  // Check headers
  if (email.headers['auto-submitted'] === 'auto-replied') return true;
  if (email.headers['x-auto-response-suppress']) return true;
  if (email.headers['precedence'] === 'auto_reply') return true;

  // Check subject
  const autoSubjects = [
    /^(re:\s*)?out of office/i,
    /^(re:\s*)?automatic reply/i,
    /^(re:\s*)?auto:/i,
    /^(re:\s*)?away from/i,
    /^(re:\s*)?on vacation/i,
  ];

  if (autoSubjects.some(p => p.test(email.subject))) return true;

  // Check body for OOO patterns
  const oooPatterns = [
    /i am (currently )?(out of (the )?office|away|on vacation)/i,
    /i will (be )?(out of (the )?office|away|on vacation)/i,
    /thank you for your (email|message).*i am (currently )?away/i,
    /automatic.*reply/i,
  ];

  if (oooPatterns.some(p => p.test(email.body.slice(0, 500)))) return true;

  return false;
}
```

### 2. Reply Processing Pipeline

```typescript
async function processReply(email: ParsedEmail, env: Env): Promise<void> {
  // 1. Match to original email/prospect
  const match = await matchReplyToProspect(email, env);

  if (!match) {
    console.warn('Could not match reply:', email.from, email.subject);
    await saveUnmatchedReply(email, env);
    // Still notify Edd about unmatched replies
    await sendUnmatchedReplyAlert(email, env);
    return;
  }

  // 2. Check for duplicate (idempotency)
  if (email.messageId) {
    const existing = await env.DB.prepare(`
      SELECT id FROM emails WHERE message_id = ?
    `).bind(email.messageId).first();

    if (existing) {
      console.log('Duplicate reply ignored:', email.messageId);
      return;
    }
  }

  // 3. Analyze reply content
  const analysis = await analyzeReply(email.body, env);

  // 4. Save reply to database
  const replyId = await saveReply({
    ...email,
    prospectId: match.prospectId,
    originalEmailId: match.emailId,
    campaignId: match.campaignId,
    sentiment: analysis.sentiment,
    intent: analysis.intent,
    urgency: analysis.urgency,
  }, env);

  // 5. Update prospect
  await updateProspectOnReply(match.prospectId, analysis, env);

  // 6. Stop any active sequences
  await stopSequenceForProspect(match.prospectId, env);

  // 7. Generate pre-made reply for positive responses
  let suggestedReply: string | null = null;
  if (analysis.sentiment === 'positive' || analysis.intent === 'meeting_request' || analysis.intent === 'interested') {
    suggestedReply = await generateSuggestedReply(email, analysis, match, env);
  }

  // 8. Send notification for ALL positive replies
  if (analysis.sentiment !== 'negative') {
    await sendReplyNotification(email, analysis, match, replyId, suggestedReply, env);
  }

  console.log(`Processed reply from ${email.from} - ${analysis.intent}`);
}
```

### 3. Matching Reply to Prospect

```typescript
async function matchReplyToProspect(email: ParsedEmail, env: Env): Promise<{
  prospectId: string;
  emailId: string;
  campaignId?: string;
  prospectName: string;
  prospectCity: string;
} | null> {
  // Method 1: Match by In-Reply-To header
  if (email.inReplyTo) {
    const { results } = await env.DB.prepare(`
      SELECT e.prospect_id, e.id as email_id, e.campaign_id,
             p.name as prospect_name, p.city as prospect_city
      FROM emails e
      JOIN prospects p ON p.id = e.prospect_id
      WHERE e.message_id = ?
    `).bind(email.inReplyTo).all();

    if (results?.length) {
      return {
        prospectId: results[0].prospect_id,
        emailId: results[0].email_id,
        campaignId: results[0].campaign_id,
        prospectName: results[0].prospect_name,
        prospectCity: results[0].prospect_city,
      };
    }
  }

  // Method 2: Match by References header
  if (email.references?.length) {
    for (const ref of email.references) {
      const { results } = await env.DB.prepare(`
        SELECT e.prospect_id, e.id as email_id, e.campaign_id,
               p.name as prospect_name, p.city as prospect_city
        FROM emails e
        JOIN prospects p ON p.id = e.prospect_id
        WHERE e.message_id = ?
      `).bind(ref).all();

      if (results?.length) {
        return {
          prospectId: results[0].prospect_id,
          emailId: results[0].email_id,
          campaignId: results[0].campaign_id,
          prospectName: results[0].prospect_name,
          prospectCity: results[0].prospect_city,
        };
      }
    }
  }

  // Method 3: Match by sender email + recent outbound
  const { results } = await env.DB.prepare(`
    SELECT p.id as prospect_id, e.id as email_id, e.campaign_id,
           p.name as prospect_name, p.city as prospect_city
    FROM prospects p
    JOIN emails e ON e.prospect_id = p.id
    WHERE LOWER(p.contact_email) = ?
    AND e.direction = 'outbound'
    ORDER BY e.sent_at DESC
    LIMIT 1
  `).bind(email.from.toLowerCase()).all();

  if (results?.length) {
    return {
      prospectId: results[0].prospect_id,
      emailId: results[0].email_id,
      campaignId: results[0].campaign_id,
      prospectName: results[0].prospect_name,
      prospectCity: results[0].prospect_city,
    };
  }

  return null;
}
```

### 4. Reply Analysis

```typescript
interface ReplyAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  intent: 'meeting_request' | 'interested' | 'needs_info' | 'not_interested' | 'delegation' | 'out_of_office' | 'unclear';
  urgency: 'high' | 'medium' | 'low';
  suggestedAction: string;
  extractedData?: {
    meetingTimes?: string[];
    alternateContact?: { name: string; email: string };
    objection?: string;
  };
}

async function analyzeReply(body: string, env: Env): Promise<ReplyAnalysis> {
  // Quick keyword-based classification first
  const quickAnalysis = quickClassify(body);

  // If confident in quick analysis, use it
  if (quickAnalysis.confidence > 0.8) {
    return quickAnalysis.result;
  }

  // Use AI for nuanced analysis
  try {
    const prompt = `Analyze this email reply and classify it:

Email:
${body.slice(0, 1000)}

Respond in JSON format:
{
  "sentiment": "positive" | "neutral" | "negative",
  "intent": "meeting_request" | "interested" | "needs_info" | "not_interested" | "delegation" | "out_of_office" | "unclear",
  "urgency": "high" | "medium" | "low",
  "suggestedAction": "brief action to take",
  "meetingTimes": ["any proposed times"],
  "alternateContact": {"name": "...", "email": "..."} or null,
  "objection": "main objection if any" or null
}`;

    const response = await callGrokAPI(prompt, env);
    return JSON.parse(response);
  } catch (error) {
    console.error('AI analysis failed, using keyword analysis');
    return quickAnalysis.result;
  }
}

function quickClassify(body: string): { result: ReplyAnalysis; confidence: number } {
  const lower = body.toLowerCase();

  // Meeting request patterns
  if (/let'?s (schedule|set up|book|have) a (call|meeting|chat)/i.test(body) ||
      /free (on|this|next|at)/i.test(body) ||
      /how about|works for me/i.test(body)) {
    return {
      result: {
        sentiment: 'positive',
        intent: 'meeting_request',
        urgency: 'high',
        suggestedAction: 'Schedule meeting immediately',
      },
      confidence: 0.9,
    };
  }

  // Interested patterns
  if (/interested|tell me more|sounds good|like to learn/i.test(body)) {
    return {
      result: {
        sentiment: 'positive',
        intent: 'interested',
        urgency: 'medium',
        suggestedAction: 'Send more information',
      },
      confidence: 0.85,
    };
  }

  // Not interested patterns
  if (/not interested|no thank|remove me|stop (emailing|contacting)/i.test(body)) {
    return {
      result: {
        sentiment: 'negative',
        intent: 'not_interested',
        urgency: 'low',
        suggestedAction: 'Mark as not interested, stop sequence',
      },
      confidence: 0.9,
    };
  }

  // Default
  return {
    result: {
      sentiment: 'neutral',
      intent: 'unclear',
      urgency: 'medium',
      suggestedAction: 'Review manually',
    },
    confidence: 0.3,
  };
}
```

### 5. Generate Suggested Reply

```typescript
/**
 * Generate a pre-made reply for Edd to approve
 * This is CRITICAL for positive responses - we want to reply fast
 */
async function generateSuggestedReply(
  originalReply: ParsedEmail,
  analysis: ReplyAnalysis,
  match: { prospectId: string; prospectName: string },
  env: Env
): Promise<string> {
  const firstName = match.prospectName.split(' ')[0];

  // Template-based responses for speed
  if (analysis.intent === 'meeting_request') {
    return `Hey ${firstName},

Great to hear from you! I'd love to set up a call.

How does one of these work for you?
- Tomorrow at 10am or 2pm
- Wednesday at 11am or 3pm
- Or let me know what works better for you

It'll be a quick 15-20 min chat - just to see if we can genuinely help with guest messaging at ${match.prospectName}.

Edd`;
  }

  if (analysis.intent === 'interested') {
    return `Hey ${firstName},

Thanks for getting back to me!

Happy to share more. The quick version: we help hotels automate guest messaging (WhatsApp, SMS, email) so your team spends less time on routine questions and more time on what matters.

Would a 15-min call be useful? I can show you a few examples from hotels similar to yours.

No pressure either way - just let me know.

Edd`;
  }

  if (analysis.intent === 'needs_info') {
    return `Hey ${firstName},

Great question! Happy to explain more.

In short, Jengu handles the repetitive guest messages - check-in info, directions, WiFi passwords, restaurant recs, etc. Your team gets pinged only when it's something that actually needs a human.

Most hotels see their front desk save 1-2 hours daily. Happy to show you how it works if useful.

Let me know what questions you have.

Edd`;
  }

  // Fallback - use AI to generate
  const prompt = `Generate a brief, friendly reply to this email. Keep it conversational and human.
The prospect's name is ${firstName} from ${match.prospectName}.

Their message:
${originalReply.body.slice(0, 500)}

Reply should:
- Be 3-5 sentences max
- Sound like a real person (not salesy)
- End with Edd signature
- Move toward a call/meeting if appropriate

Just output the reply text, nothing else.`;

  try {
    return await callGrokAPI(prompt, env);
  } catch {
    return `Hey ${firstName},

Thanks for getting back to me! Would love to chat more about this.

What's your availability like this week for a quick 15-min call?

Edd`;
  }
}
```

### 6. Reply Notification with Approval CTA

```typescript
/**
 * Send notification email to edd@jengu.ai with pre-made reply
 * For positive replies, include one-click approval button
 */
async function sendReplyNotification(
  email: ParsedEmail,
  analysis: ReplyAnalysis,
  match: { prospectId: string; prospectName: string; prospectCity: string },
  replyId: string,
  suggestedReply: string | null,
  env: Env
): Promise<void> {
  const isPositive = analysis.sentiment === 'positive' ||
                     analysis.intent === 'meeting_request' ||
                     analysis.intent === 'interested';

  // Create approval token for one-click send
  const approvalToken = isPositive && suggestedReply
    ? await createApprovalToken(replyId, suggestedReply, email.from, env)
    : null;

  const approvalUrl = approvalToken
    ? `https://jengu-crm.edd-181.workers.dev/api/reply/approve?token=${approvalToken}`
    : null;

  const urgencyEmoji = {
    'high': '🔥',
    'medium': '📬',
    'low': '📩',
  }[analysis.urgency];

  const intentLabel = {
    'meeting_request': '📅 MEETING REQUEST',
    'interested': '✅ INTERESTED',
    'needs_info': '❓ NEEDS INFO',
    'delegation': '➡️ DELEGATED',
    'not_interested': '❌ NOT INTERESTED',
    'out_of_office': '🏖️ OUT OF OFFICE',
    'unclear': '🤔 UNCLEAR',
  }[analysis.intent];

  let emailBody = `
${urgencyEmoji} New Reply from ${match.prospectName}!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${intentLabel}
Sentiment: ${analysis.sentiment.toUpperCase()}
From: ${email.from}
Hotel: ${match.prospectName} (${match.prospectCity})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THEIR MESSAGE:
───────────────
${email.body.slice(0, 800)}
${email.body.length > 800 ? '...[truncated]' : ''}

`;

  // Include suggested reply with approval link for positive responses
  if (suggestedReply && approvalUrl) {
    emailBody += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 SUGGESTED REPLY (Click to Send)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${suggestedReply}

───────────────
👆 APPROVE & SEND THIS REPLY:
${approvalUrl}

(Click the link above to send this reply immediately)
───────────────
`;
  }

  emailBody += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUICK ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
View Prospect: https://crm.jengu.ai/prospects/${match.prospectId}
Reply Directly: mailto:${email.from}?subject=Re: ${email.subject}
`;

  // Send to edd@jengu.ai
  await sendEmail({
    to: 'edd@jengu.ai',
    subject: `${urgencyEmoji} ${intentLabel} - ${match.prospectName}`,
    body: emailBody,
    from: env.ALERT_EMAIL_FROM || 'alerts@jengu.ai',
    displayName: 'Jengu CRM',
  }, env);

  console.log(`Sent reply notification for ${match.prospectName} to edd@jengu.ai`);
}
```

### 7. One-Click Reply Approval Handler

```typescript
/**
 * API endpoint to approve and send pre-made replies
 * GET /api/reply/approve?token=xxx
 */
async function handleReplyApproval(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  // Validate token and get reply details
  const approval = await validateApprovalToken(token, env);

  if (!approval) {
    return new Response(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Invalid or Expired Link</h1>
          <p>This approval link has expired or was already used.</p>
          <p><a href="https://crm.jengu.ai">Go to CRM</a></p>
        </body>
      </html>
    `, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Check if already sent
  if (approval.sent) {
    return new Response(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>✅ Already Sent</h1>
          <p>This reply was already sent at ${approval.sentAt}.</p>
          <p><a href="https://crm.jengu.ai/prospects/${approval.prospectId}">View Prospect</a></p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Send the reply
  try {
    const result = await sendApprovedReply(approval, env);

    if (result.success) {
      // Mark token as used
      await markApprovalUsed(token, env);

      return new Response(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>✅ Reply Sent!</h1>
            <p>Your reply to <strong>${approval.prospectName}</strong> has been sent.</p>
            <p style="background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: left; max-width: 500px; margin: 20px auto;">
              ${approval.replyBody.replace(/\n/g, '<br>')}
            </p>
            <p><a href="https://crm.jengu.ai/prospects/${approval.prospectId}">View Prospect</a></p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    return new Response(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Send Failed</h1>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p>Please reply manually: <a href="mailto:${approval.recipientEmail}">Email ${approval.prospectName}</a></p>
        </body>
      </html>
    `, {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

/**
 * Create approval token for one-click send
 */
async function createApprovalToken(
  replyId: string,
  suggestedReply: string,
  recipientEmail: string,
  env: Env
): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await env.DB.prepare(`
    INSERT INTO reply_approvals (id, reply_id, suggested_reply, recipient_email, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(token, replyId, suggestedReply, recipientEmail, expiresAt.toISOString()).run();

  return token;
}
```

### 8. Database Migration for Reply Approvals

```sql
-- Reply approvals table for one-click send
CREATE TABLE IF NOT EXISTS reply_approvals (
  id TEXT PRIMARY KEY,
  reply_id TEXT NOT NULL,
  prospect_id TEXT,
  suggested_reply TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent INTEGER DEFAULT 0,
  sent_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (reply_id) REFERENCES emails(id)
);

CREATE INDEX IF NOT EXISTS idx_reply_approvals_expires ON reply_approvals(expires_at);
```

---

## Reply Status Flow

```
Incoming Email
      │
      ▼
┌─────────────┐
│ Is Bounce?  │──Yes──▶ Process as bounce
└─────────────┘
      │ No
      ▼
┌─────────────┐
│ Is Auto-    │──Yes──▶ Record, ignore
│ Reply?      │
└─────────────┘
      │ No
      ▼
┌─────────────┐
│ Match to    │──No───▶ Save as unmatched
│ Prospect?   │         ↓
└─────────────┘         Notify Edd anyway
      │ Yes
      ▼
┌─────────────┐
│ Analyze     │
│ Content     │
└─────────────┘
      │
      ▼
┌─────────────┐
│ Update      │
│ Prospect    │
└─────────────┘
      │
      ▼
┌─────────────┐
│ Stop        │
│ Sequence    │
└─────────────┘
      │
      ▼
┌───────────────────┐
│ Is Positive?      │──No───▶ End
└───────────────────┘
      │ Yes
      ▼
┌───────────────────┐
│ Generate          │
│ Suggested Reply   │
└───────────────────┘
      │
      ▼
┌───────────────────┐
│ Email edd@jengu.ai│
│ with Approval CTA │
└───────────────────┘
```

---

## Notification Flow

```
Reply Received
      │
      ▼
┌─────────────────────┐
│ Positive/Interested │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│ Generate AI Reply   │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│ Create Approval     │
│ Token (24h expiry)  │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│ Email Edd with:     │
│ - Original message  │
│ - Suggested reply   │
│ - One-click approve │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│ Edd clicks link     │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│ Reply sent to       │
│ prospect instantly  │
└─────────────────────┘
```

---

## Verification Checklist

- [x] Cloudflare Email Routing configured (via webhook)
- [x] Auto-replies filtered
- [x] Replies matched to prospects
- [x] Sentiment analysis working
- [x] Sequences stop on reply
- [x] ALL positive replies → notification to edd@jengu.ai
- [x] Meeting requests include pre-made reply
- [x] Interested replies include pre-made reply
- [x] One-click approval links work
- [x] Approval tokens expire after 24h
- [x] No duplicate processing (via message_id check)

---

## Monitoring

- Reply count per day
- Unmatched reply rate (<5%)
- Average processing latency (<1min)
- Positive/negative ratio
- Approval link click rate
- Time from reply received → response sent
