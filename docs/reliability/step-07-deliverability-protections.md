# Step 07: Deliverability Protections

## Goal
Protect your sender reputation so emails land in inbox, not spam. Reputation takes months to build and minutes to destroy. Every decision should ask: "Will this hurt deliverability?"

---

## Deliverability Factors

| Factor | Weight | Your Control |
|--------|--------|--------------|
| Sender reputation | 40% | Warmup, bounce rate, complaints |
| Content | 25% | AI-generated, personalization |
| Engagement | 20% | Replies, opens (if tracked) |
| Authentication | 15% | SPF, DKIM, DMARC |

---

## What to Verify

### 1. Warmup Status
- [ ] Each inbox following warmup schedule
- [ ] Not exceeding daily limits
- [ ] Gradual volume increase

### 2. Authentication
- [ ] SPF records configured
- [ ] DKIM signing enabled
- [ ] DMARC policy set

### 3. Content Quality
- [ ] Plain text (no HTML during warmup)
- [ ] No spam trigger words
- [ ] Personalized content
- [ ] Reasonable length

### 4. List Quality
- [ ] No invalid emails
- [ ] No spam traps
- [ ] Regular bounce cleaning

---

## Common Failure Modes

| Failure | Impact | Detection |
|---------|--------|-----------|
| Sending too fast | Rate limited, reputation hit | SMTP errors |
| High bounce rate | Domain blacklisted | >5% bounces |
| Spam complaints | Inbox placement drops | Feedback loops |
| Missing authentication | Emails spoofed/rejected | DMARC reports |
| Spam trigger content | Filtered to spam | Low engagement |

---

## How to Make It Robust

### 1. Warmup Schedule Enforcement

**Current warmup schedule from constants.ts:**
```typescript
const WARMUP_SCHEDULE = {
  // Week 1-4: Gradual increase
  STAGES: [
    { week: 1, perInbox: 5, total: 20 },
    { week: 2, perInbox: 10, total: 40 },
    { week: 3, perInbox: 15, total: 60 },
    { week: 4, perInbox: 20, total: 80 },
  ],
  START_DATE: '2025-12-06',
  ABSOLUTE_MAX: 80,
};

function getCurrentWarmupLimit(): number {
  const startDate = new Date(WARMUP_SCHEDULE.START_DATE);
  const now = new Date();
  const weeksSinceStart = Math.floor(
    (now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  const stage = WARMUP_SCHEDULE.STAGES.find(s => s.week > weeksSinceStart) ||
    WARMUP_SCHEDULE.STAGES[WARMUP_SCHEDULE.STAGES.length - 1];

  return stage.total;
}
```

**Enforce in WarmupCounter Durable Object:**
```typescript
export class WarmupCounter implements DurableObject {
  async canSend(): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const today = new Date().toISOString().split('T')[0];
    const sentToday = await this.state.storage.get(`sent:${today}`) || 0;
    const limit = getCurrentWarmupLimit();

    return {
      allowed: sentToday < limit,
      remaining: Math.max(0, limit - sentToday),
      limit,
    };
  }

  async recordSend(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const current = await this.state.storage.get(`sent:${today}`) || 0;
    await this.state.storage.put(`sent:${today}`, current + 1);
  }
}
```

### 2. Spam Score Checker

**File: `cloudflare/src/lib/spam-checker.ts`**
```typescript
const SPAM_TRIGGERS = {
  high: [ // +3 points each
    /\bfree\b.*\bmoney\b/i,
    /\bact now\b/i,
    /\bno obligation\b/i,
    /\bclick here\b/i,
    /\$\d{4,}/,  // Large dollar amounts
    /!!+/,       // Multiple exclamation marks
    /100% (free|guaranteed)/i,
  ],
  medium: [ // +2 points each
    /\burgent\b/i,
    /\blimited time\b/i,
    /\bdon't miss\b/i,
    /\bspecial offer\b/i,
    /\bexclusive\b/i,
    /[A-Z]{5,}/,  // All caps words
  ],
  low: [ // +1 point each
    /\bdeal\b/i,
    /\bdiscount\b/i,
    /\bsale\b/i,
    /\bsave\b/i,
    /!/,  // Any exclamation mark
  ],
};

export function calculateSpamScore(email: { subject: string; body: string }): number {
  const text = `${email.subject} ${email.body}`;
  let score = 0;

  for (const pattern of SPAM_TRIGGERS.high) {
    if (pattern.test(text)) score += 3;
  }
  for (const pattern of SPAM_TRIGGERS.medium) {
    if (pattern.test(text)) score += 2;
  }
  for (const pattern of SPAM_TRIGGERS.low) {
    if (pattern.test(text)) score += 1;
  }

  // Additional checks
  if (text.length < 100) score += 2;  // Too short
  if (text.length > 2000) score += 1; // Too long
  if ((text.match(/http/g) || []).length > 2) score += 2; // Too many links

  return score;
}

// Threshold: >5 = don't send, 3-5 = warning, <3 = ok
export function isSpammy(email: { subject: string; body: string }): boolean {
  return calculateSpamScore(email) > 5;
}
```

### 3. Plain Text Only (During Warmup)

```typescript
function formatEmailBody(body: string, includeHtml: boolean = false): {
  text: string;
  html?: string;
} {
  // During warmup, always plain text
  const isWarmingUp = getCurrentWarmupWeek() <= 4;

  if (isWarmingUp || !includeHtml) {
    return { text: body };
  }

  // After warmup, can include HTML
  return {
    text: body,
    html: convertToHtml(body),
  };
}
```

### 4. Bounce Rate Monitoring

```typescript
async function checkBounceRate(inboxId: string, env: Env): Promise<{
  rate: number;
  status: 'healthy' | 'warning' | 'critical';
  action: string;
}> {
  const { results } = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
    FROM emails
    WHERE from_email = (SELECT email FROM mailboxes WHERE id = ?)
    AND sent_at > datetime('now', '-7 days')
  `).bind(inboxId).all();

  const total = results?.[0]?.total || 0;
  const bounced = results?.[0]?.bounced || 0;
  const rate = total > 0 ? (bounced / total) * 100 : 0;

  if (rate > 5) {
    return {
      rate,
      status: 'critical',
      action: 'Pause inbox immediately, investigate bounces',
    };
  } else if (rate > 2) {
    return {
      rate,
      status: 'warning',
      action: 'Reduce volume, clean list',
    };
  }

  return {
    rate,
    status: 'healthy',
    action: 'Continue normal sending',
  };
}
```

### 5. Auto-Pause on High Bounces

```typescript
async function checkAndPauseUnhealthyInboxes(env: Env): Promise<void> {
  const { results: inboxes } = await env.DB.prepare(`
    SELECT id, email FROM mailboxes WHERE status = 'active'
  `).all();

  for (const inbox of inboxes || []) {
    const { rate, status } = await checkBounceRate(inbox.id, env);

    if (status === 'critical') {
      // Auto-pause
      await env.DB.prepare(`
        UPDATE mailboxes SET status = 'paused', last_error = ? WHERE id = ?
      `).bind(`Auto-paused: ${rate.toFixed(1)}% bounce rate`, inbox.id).run();

      await sendAlert(
        `Inbox ${inbox.email} auto-paused`,
        `Bounce rate: ${rate.toFixed(1)}% (threshold: 5%)`,
        env
      );
    }
  }
}
```

### 6. Send Timing Distribution

Don't send emails in bursts - distribute throughout the day:

```typescript
function shouldSendNow(): boolean {
  // Random skip to create natural gaps
  if (Math.random() < 0.3) return false; // 30% skip rate

  // Check current hour
  const hour = new Date().getUTCHours();
  if (hour < 8 || hour > 18) return false; // Business hours only

  return true;
}

function getRandomDelay(): number {
  // Random delay between 30-90 seconds
  return 30000 + Math.random() * 60000;
}

async function sendEmailBatch(prospects: Prospect[], env: Env): Promise<void> {
  for (const prospect of prospects) {
    if (!shouldSendNow()) {
      console.log('Skipping send for natural gap');
      continue;
    }

    await sendEmail(prospect, env);

    // Wait before next send
    await sleep(getRandomDelay());
  }
}
```

### 7. List Hygiene

```typescript
async function cleanList(env: Env): Promise<{
  removed: number;
  reasons: Record<string, number>;
}> {
  const reasons: Record<string, number> = {};

  // Remove hard bounces
  const bounced = await env.DB.prepare(`
    UPDATE prospects SET archived = 1, archive_reason = 'hard_bounce'
    WHERE email_bounced = 1 AND archived = 0
  `).run();
  reasons.hard_bounce = bounced.changes;

  // Remove invalid emails
  const invalid = await env.DB.prepare(`
    UPDATE prospects SET archived = 1, archive_reason = 'invalid_email'
    WHERE contact_email NOT LIKE '%@%.%' AND archived = 0
  `).run();
  reasons.invalid_email = invalid.changes;

  // Remove duplicates (keep most recent)
  const duplicates = await env.DB.prepare(`
    UPDATE prospects SET archived = 1, archive_reason = 'duplicate'
    WHERE id NOT IN (
      SELECT MAX(id) FROM prospects
      GROUP BY LOWER(contact_email)
    )
    AND contact_email IS NOT NULL
    AND archived = 0
  `).run();
  reasons.duplicate = duplicates.changes;

  const total = Object.values(reasons).reduce((a, b) => a + b, 0);

  return { removed: total, reasons };
}
```

### 8. Authentication Verification

```typescript
async function verifyDomainAuthentication(domain: string): Promise<{
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check SPF
  const spfRecord = await lookupTXT(`${domain}`);
  const hasSpf = spfRecord.some(r => r.includes('v=spf1'));
  if (!hasSpf) issues.push('Missing SPF record');

  // Check DKIM (common selector)
  const dkimRecord = await lookupTXT(`selector1._domainkey.${domain}`);
  const hasDkim = dkimRecord.some(r => r.includes('v=DKIM1'));
  if (!hasDkim) issues.push('Missing DKIM record');

  // Check DMARC
  const dmarcRecord = await lookupTXT(`_dmarc.${domain}`);
  const hasDmarc = dmarcRecord.some(r => r.includes('v=DMARC1'));
  if (!hasDmarc) issues.push('Missing DMARC record');

  return {
    spf: hasSpf,
    dkim: hasDkim,
    dmarc: hasDmarc,
    issues,
  };
}
```

---

## Deliverability Dashboard

Show:
- Current warmup week and limits
- Per-inbox bounce rates
- Spam score of recent emails
- Authentication status per domain
- Sending volume chart (should be smooth, not spiky)

---

## Verification Checklist

- [ ] Warmup limits enforced
- [ ] Bounce rate monitored per inbox
- [ ] Auto-pause on high bounces
- [ ] Spam score check before send
- [ ] Plain text during warmup
- [ ] Send timing distributed
- [ ] List cleaned regularly
- [ ] Authentication configured

---

## Emergency Response

### Sudden Deliverability Drop
1. Check bounce rate - if high, pause sending
2. Check spam complaints - investigate content
3. Check authentication - verify DNS records
4. Reduce volume by 50%
5. Monitor for 48 hours

### Blacklist Detection
1. Stop all sending immediately
2. Identify which list
3. Request removal
4. Investigate root cause
5. Don't resume until resolved
