# Step 08: Bounce & Complaint Handling

## Goal
Immediately handle every bounce and complaint. A bounced email should never be sent to again. A complaint should trigger immediate action. These signals directly impact sender reputation.

---

## Types of Bounces

| Type | Meaning | Action | Retry? |
|------|---------|--------|--------|
| Hard bounce | Mailbox doesn't exist | Permanent block | Never |
| Soft bounce | Mailbox full, temp issue | Retry later | 3 times |
| Block bounce | Rejected by policy | Investigate | Maybe |
| Complaint | Marked as spam | Permanent block | Never |

---

## What to Verify

### 1. Bounce Detection
- [ ] SMTP bounces captured
- [ ] Bounce notifications processed
- [ ] Bounce type classified correctly
- [ ] Prospect marked as bounced

### 2. Complaint Handling
- [ ] Feedback loops configured (if available)
- [ ] Complaints logged
- [ ] Immediate action taken

### 3. Data Updates
- [ ] Bounced emails never resent
- [ ] Bounce stats tracked per inbox
- [ ] Reports available

---

## Common Failure Modes

| Failure | Impact | How It Happens |
|---------|--------|----------------|
| Bounce not recorded | Same email sent again | SMTP error ignored |
| Wrong bounce type | Permanent block on temp issue | Bad classification |
| Slow processing | Multiple bounces to same address | Async delay |
| Complaint missed | Reputation damage | No feedback loop |

---

## How to Make It Robust

### 1. SMTP Bounce Detection

**Capture bounces during send:**
```typescript
async function sendViaSMTP(email: EmailData, inbox: Mailbox): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: inbox.smtp_host,
    port: inbox.smtp_port,
    secure: inbox.smtp_port === 465,
    auth: {
      user: inbox.smtp_user,
      pass: inbox.smtp_pass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `${inbox.display_name} <${inbox.email}>`,
      to: email.to,
      subject: email.subject,
      text: email.body,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    // Classify the error
    const bounceType = classifySMTPError(error);

    return {
      success: false,
      error: error.message,
      bounceType,
      shouldRetry: bounceType === 'soft',
    };
  }
}

function classifySMTPError(error: Error): 'hard' | 'soft' | 'block' | 'unknown' {
  const message = error.message.toLowerCase();
  const code = (error as any).responseCode;

  // Hard bounces (5xx permanent)
  if (code >= 550 && code < 560) {
    if (message.includes('user unknown') ||
        message.includes('mailbox not found') ||
        message.includes('no such user') ||
        message.includes('invalid recipient')) {
      return 'hard';
    }
  }

  // Soft bounces (4xx temporary)
  if (code >= 400 && code < 500) {
    if (message.includes('mailbox full') ||
        message.includes('over quota') ||
        message.includes('try again')) {
      return 'soft';
    }
  }

  // Block bounces (policy rejection)
  if (message.includes('blocked') ||
      message.includes('blacklist') ||
      message.includes('spam') ||
      message.includes('rejected')) {
    return 'block';
  }

  return 'unknown';
}
```

### 2. Bounce Notification Processing

**Process bounce emails received in inbox:**
```typescript
async function processBounceNotification(email: IncomingEmail, env: Env): Promise<void> {
  // Check if this is a bounce notification
  if (!isBounceNotification(email)) return;

  // Extract original recipient
  const bouncedEmail = extractBouncedEmail(email);
  if (!bouncedEmail) return;

  // Classify bounce type
  const bounceType = classifyBounceFromNotification(email.body);

  // Record bounce
  await recordBounce({
    email: bouncedEmail,
    type: bounceType,
    reason: extractBounceReason(email.body),
    originalMessageId: extractOriginalMessageId(email.body),
    notificationId: email.messageId,
  }, env);
}

function isBounceNotification(email: IncomingEmail): boolean {
  const bounceIndicators = [
    /delivery.*failed/i,
    /undeliverable/i,
    /returned mail/i,
    /mail delivery.*failed/i,
    /failure notice/i,
    /mailer-daemon/i,
  ];

  const fromBounce = email.from?.toLowerCase().includes('mailer-daemon') ||
                     email.from?.toLowerCase().includes('postmaster');

  const subjectBounce = bounceIndicators.some(p => p.test(email.subject));

  return fromBounce || subjectBounce;
}

function extractBouncedEmail(email: IncomingEmail): string | null {
  const patterns = [
    /Original-Recipient:.*?<([^>]+)>/i,
    /Final-Recipient:.*?<([^>]+)>/i,
    /X-Failed-Recipients:\s*([^\s,]+)/i,
    /was not delivered to:\s*([^\s<]+@[^\s>]+)/i,
    /could not be delivered to:\s*([^\s<]+@[^\s>]+)/i,
  ];

  for (const pattern of patterns) {
    const match = email.body.match(pattern);
    if (match) return match[1].toLowerCase();
  }

  return null;
}
```

### 3. Bounce Recording

```typescript
async function recordBounce(bounce: {
  email: string;
  type: 'hard' | 'soft' | 'block';
  reason: string;
  originalMessageId?: string;
}, env: Env): Promise<void> {
  // 1. Log the bounce
  await env.DB.prepare(`
    INSERT INTO bounces (id, email, type, reason, original_message_id, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    bounce.email,
    bounce.type,
    bounce.reason,
    bounce.originalMessageId
  ).run();

  // 2. Update prospect
  if (bounce.type === 'hard') {
    await env.DB.prepare(`
      UPDATE prospects SET
        email_bounced = 1,
        bounce_type = ?,
        bounce_reason = ?,
        bounced_at = datetime('now'),
        updated_at = datetime('now')
      WHERE LOWER(contact_email) = ?
    `).bind(bounce.type, bounce.reason, bounce.email.toLowerCase()).run();
  }

  // 3. Update email record
  if (bounce.originalMessageId) {
    await env.DB.prepare(`
      UPDATE emails SET
        status = 'bounced',
        bounced_at = datetime('now')
      WHERE message_id = ?
    `).bind(bounce.originalMessageId).run();
  }

  // 4. Update inbox stats
  const { results } = await env.DB.prepare(`
    SELECT from_email FROM emails WHERE message_id = ?
  `).bind(bounce.originalMessageId).all();

  if (results?.[0]?.from_email) {
    await incrementInboxBounceCount(results[0].from_email, env);
  }

  // 5. Check if we need to pause inbox
  await checkInboxHealth(results?.[0]?.from_email, env);
}
```

### 4. Complaint Handling

```typescript
async function recordComplaint(complaint: {
  email: string;
  source: string; // 'feedback_loop', 'manual', 'reply'
  originalMessageId?: string;
}, env: Env): Promise<void> {
  // 1. Log complaint
  await env.DB.prepare(`
    INSERT INTO complaints (id, email, source, original_message_id, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(generateId(), complaint.email, complaint.source, complaint.originalMessageId).run();

  // 2. Immediately block email - more severe than bounce
  await env.DB.prepare(`
    UPDATE prospects SET
      email_bounced = 1,
      bounce_type = 'complaint',
      bounce_reason = 'Spam complaint received',
      bounced_at = datetime('now'),
      stage = 'lost',
      updated_at = datetime('now')
    WHERE LOWER(contact_email) = ?
  `).bind(complaint.email.toLowerCase()).run();

  // 3. Add to permanent exclusion list
  await env.DB.prepare(`
    INSERT OR IGNORE INTO email_exclusions (email, reason, created_at)
    VALUES (?, 'spam_complaint', datetime('now'))
  `).bind(complaint.email.toLowerCase()).run();

  // 4. Alert - complaints are serious
  await sendAlert(
    'Spam Complaint Received',
    `Email: ${complaint.email}\nSource: ${complaint.source}`,
    env
  );
}
```

### 5. Soft Bounce Retry Logic

```typescript
async function handleSoftBounce(
  prospectId: string,
  email: string,
  env: Env
): Promise<void> {
  // Check retry count
  const { results } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM bounces
    WHERE email = ? AND type = 'soft'
    AND created_at > datetime('now', '-7 days')
  `).bind(email).all();

  const retryCount = results?.[0]?.count || 0;

  if (retryCount >= 3) {
    // Promote to hard bounce after 3 soft bounces
    await env.DB.prepare(`
      UPDATE prospects SET
        email_bounced = 1,
        bounce_type = 'hard',
        bounce_reason = 'Promoted from soft bounce after 3 retries',
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(prospectId).run();
  } else {
    // Schedule retry with exponential backoff
    const retryDelay = Math.pow(2, retryCount) * 24; // 24h, 48h, 96h
    const retryAt = new Date(Date.now() + retryDelay * 60 * 60 * 1000);

    await enqueue('send_email', {
      prospectId,
      retry: true,
      retryCount: retryCount + 1,
    }, {
      scheduledFor: retryAt,
      priority: 8, // Low priority
    }, env);
  }
}
```

### 6. Bounce Stats API

```typescript
// GET /api/bounces/stats
async function getBounceStats(env: Env) {
  const { results } = await env.DB.prepare(`
    SELECT
      type,
      COUNT(*) as count,
      COUNT(DISTINCT email) as unique_emails
    FROM bounces
    WHERE created_at > datetime('now', '-30 days')
    GROUP BY type
  `).all();

  const byInbox = await env.DB.prepare(`
    SELECT
      e.from_email,
      COUNT(CASE WHEN b.type = 'hard' THEN 1 END) as hard_bounces,
      COUNT(CASE WHEN b.type = 'soft' THEN 1 END) as soft_bounces,
      COUNT(CASE WHEN b.type = 'complaint' THEN 1 END) as complaints
    FROM bounces b
    JOIN emails e ON b.original_message_id = e.message_id
    WHERE b.created_at > datetime('now', '-30 days')
    GROUP BY e.from_email
  `).all();

  return {
    summary: results,
    byInbox: byInbox.results,
    totalProspectsBlocked: await getBlockedProspectCount(env),
  };
}
```

### 7. Pre-Send Bounce Check

```typescript
async function isEmailBlocked(email: string, env: Env): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  // Check prospects table
  const { results: prospect } = await env.DB.prepare(`
    SELECT email_bounced, bounce_type FROM prospects
    WHERE LOWER(contact_email) = ?
  `).bind(email.toLowerCase()).all();

  if (prospect?.[0]?.email_bounced) {
    return {
      blocked: true,
      reason: `Previous ${prospect[0].bounce_type} bounce`,
    };
  }

  // Check exclusion list
  const { results: excluded } = await env.DB.prepare(`
    SELECT reason FROM email_exclusions WHERE email = ?
  `).bind(email.toLowerCase()).all();

  if (excluded?.length) {
    return {
      blocked: true,
      reason: excluded[0].reason,
    };
  }

  // Check recent bounces
  const { results: recentBounce } = await env.DB.prepare(`
    SELECT type, created_at FROM bounces
    WHERE email = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(email.toLowerCase()).all();

  if (recentBounce?.[0]?.type === 'hard') {
    return {
      blocked: true,
      reason: 'Recent hard bounce',
    };
  }

  return { blocked: false };
}
```

---

## Bounce Database Schema

```sql
CREATE TABLE bounces (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  type TEXT NOT NULL, -- 'hard', 'soft', 'block', 'complaint'
  reason TEXT,
  original_message_id TEXT,
  notification_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_bounces_email ON bounces(LOWER(email));
CREATE INDEX idx_bounces_type ON bounces(type, created_at);

CREATE TABLE email_exclusions (
  email TEXT PRIMARY KEY,
  domain TEXT,
  reason TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Verification Checklist

- [ ] SMTP bounces captured on send
- [ ] Bounce notifications processed
- [ ] Hard bounces block permanently
- [ ] Soft bounces retry 3 times
- [ ] Complaints handled immediately
- [ ] Inbox stats updated
- [ ] Pre-send bounce check works
- [ ] Alerts on complaints

---

## Monitoring

Daily report should include:
- Total bounces (by type)
- Bounce rate per inbox
- Any complaints
- Blocked prospects count
