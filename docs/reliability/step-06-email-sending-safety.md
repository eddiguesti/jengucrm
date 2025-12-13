# Step 06: Email Sending Safety

## Goal
Never send an email that shouldn't be sent. Build multiple layers of protection so that even if one check fails, others catch the mistake. Sending the wrong email is irreversible.

---

## What Can Go Wrong

| Mistake | Impact | How It Happens |
|---------|--------|----------------|
| Email to wrong person | Embarrassing, damages trust | Wrong prospect selected |
| Duplicate email | Unprofessional | No dedup check |
| Email to bounced address | Reputation damage | Bounce not recorded |
| Email with broken personalization | "Hi {{first_name}}" | Template error |
| Email during off-hours | Lower engagement | Timezone error |
| Email to competitor | Leaked strategy | Bad data in DB |
| Email with wrong content | Legal issues | AI hallucination |

---

## What to Verify

### 1. Pre-Send Checks
- [ ] Prospect is eligible (stage, tier, not bounced)
- [ ] Haven't emailed recently (dedup)
- [ ] Email address is valid format
- [ ] Email address not on exclusion list
- [ ] Mailbox has capacity
- [ ] Global limit not exceeded

### 2. Content Validation
- [ ] Subject line not empty
- [ ] Body not empty
- [ ] No unresolved template variables
- [ ] No forbidden words/phrases
- [ ] Length within bounds

### 3. Send-Time Checks
- [ ] Within business hours (sender timezone)
- [ ] Not a holiday
- [ ] EMERGENCY_STOP not set

---

## How to Make It Robust

### 1. Multi-Layer Safety Checks

**File: `cloudflare/src/lib/email-safety.ts`**
```typescript
interface SafetyCheckResult {
  safe: boolean;
  checks: {
    name: string;
    passed: boolean;
    reason?: string;
  }[];
}

export async function runSafetyChecks(
  prospect: Prospect,
  email: { subject: string; body: string },
  env: Env
): Promise<SafetyCheckResult> {
  const checks: SafetyCheckResult['checks'] = [];

  // 1. Emergency stop check
  const emergencyStop = await env.KV_CONFIG.get('EMERGENCY_STOP');
  checks.push({
    name: 'emergency_stop',
    passed: emergencyStop !== 'true',
    reason: emergencyStop === 'true' ? 'Emergency stop is active' : undefined,
  });

  // 2. Prospect eligibility
  checks.push({
    name: 'prospect_stage',
    passed: ['enriched', 'ready', 'contacted'].includes(prospect.stage),
    reason: `Prospect stage is ${prospect.stage}`,
  });

  // 3. Not bounced
  checks.push({
    name: 'not_bounced',
    passed: !prospect.email_bounced,
    reason: prospect.email_bounced ? 'Email previously bounced' : undefined,
  });

  // 4. Has valid email
  checks.push({
    name: 'valid_email',
    passed: isValidEmail(prospect.contact_email),
    reason: !isValidEmail(prospect.contact_email) ? 'Invalid email format' : undefined,
  });

  // 5. Not recently emailed
  const recentEmail = await wasRecentlyEmailed(prospect.id, 24, env);
  checks.push({
    name: 'not_recently_emailed',
    passed: !recentEmail,
    reason: recentEmail ? 'Emailed within last 24 hours' : undefined,
  });

  // 6. Not on exclusion list
  const excluded = await isExcluded(prospect.contact_email, env);
  checks.push({
    name: 'not_excluded',
    passed: !excluded,
    reason: excluded ? 'Email on exclusion list' : undefined,
  });

  // 7. Subject not empty
  checks.push({
    name: 'subject_not_empty',
    passed: email.subject.trim().length > 0,
    reason: email.subject.trim().length === 0 ? 'Subject is empty' : undefined,
  });

  // 8. Body not empty
  checks.push({
    name: 'body_not_empty',
    passed: email.body.trim().length > 0,
    reason: email.body.trim().length === 0 ? 'Body is empty' : undefined,
  });

  // 9. No unresolved variables
  const unresolvedVars = findUnresolvedVariables(email.subject + email.body);
  checks.push({
    name: 'no_unresolved_vars',
    passed: unresolvedVars.length === 0,
    reason: unresolvedVars.length > 0 ? `Unresolved: ${unresolvedVars.join(', ')}` : undefined,
  });

  // 10. No forbidden content
  const forbiddenContent = checkForbiddenContent(email.body);
  checks.push({
    name: 'no_forbidden_content',
    passed: !forbiddenContent.found,
    reason: forbiddenContent.found ? `Forbidden: ${forbiddenContent.matches.join(', ')}` : undefined,
  });

  // 11. Mailbox available
  const mailboxAvailable = await hasAvailableMailbox(env);
  checks.push({
    name: 'mailbox_available',
    passed: mailboxAvailable,
    reason: !mailboxAvailable ? 'No mailbox with capacity' : undefined,
  });

  // 12. Business hours
  const inBusinessHours = isBusinessHours();
  checks.push({
    name: 'business_hours',
    passed: inBusinessHours,
    reason: !inBusinessHours ? 'Outside business hours' : undefined,
  });

  return {
    safe: checks.every(c => c.passed),
    checks,
  };
}

function isValidEmail(email: string): boolean {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function findUnresolvedVariables(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g) || [];
  return matches;
}

function checkForbiddenContent(text: string): { found: boolean; matches: string[] } {
  const forbidden = [
    /\bguarantee\b/i,
    /\bfree money\b/i,
    /\burgent\b/i,
    /\bact now\b/i,
    /\$\d+,?\d*,?\d*/,  // Dollar amounts
    /100% free/i,
  ];

  const matches: string[] = [];
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      matches.push(pattern.source);
    }
  }

  return { found: matches.length > 0, matches };
}
```

### 2. Exclusion List

```typescript
// Domains/emails that should never receive emails
const EXCLUSION_LIST = {
  domains: [
    'competitor.com',
    'test.com',
    'example.com',
    'mailinator.com',
    'guerrillamail.com',
  ],
  emails: [
    'spam@',
    'abuse@',
    'postmaster@',
    'noreply@',
    'no-reply@',
  ],
  patterns: [
    /^test/i,
    /^fake/i,
    /\+test@/i,
  ],
};

async function isExcluded(email: string, env: Env): Promise<boolean> {
  if (!email) return true;

  const lowerEmail = email.toLowerCase();
  const domain = lowerEmail.split('@')[1];

  // Check domain exclusion
  if (EXCLUSION_LIST.domains.includes(domain)) {
    return true;
  }

  // Check email prefix exclusion
  for (const prefix of EXCLUSION_LIST.emails) {
    if (lowerEmail.startsWith(prefix)) {
      return true;
    }
  }

  // Check patterns
  for (const pattern of EXCLUSION_LIST.patterns) {
    if (pattern.test(lowerEmail)) {
      return true;
    }
  }

  // Check dynamic exclusion list (from DB)
  const { results } = await env.DB.prepare(`
    SELECT 1 FROM email_exclusions WHERE email = ? OR domain = ?
  `).bind(lowerEmail, domain).all();

  return results.length > 0;
}
```

### 3. Send Confirmation Flow

```typescript
async function sendEmail(prospect: Prospect, campaign: Campaign, env: Env) {
  // Generate email content
  const email = await generateEmail(prospect, campaign, env);

  // Run all safety checks
  const safety = await runSafetyChecks(prospect, email, env);

  if (!safety.safe) {
    const failedChecks = safety.checks.filter(c => !c.passed);
    console.error(`Safety checks failed for ${prospect.id}:`, failedChecks);

    // Log the blocked send
    await logBlockedSend(prospect.id, failedChecks, env);

    return {
      sent: false,
      reason: 'safety_check_failed',
      failedChecks,
    };
  }

  // Actually send
  try {
    const result = await doSendEmail(prospect, email, env);
    return { sent: true, ...result };
  } catch (error) {
    console.error(`Send failed for ${prospect.id}:`, error);
    return { sent: false, reason: 'send_error', error: error.message };
  }
}
```

### 4. Emergency Stop

**Global kill switch:**
```typescript
// Set emergency stop
await env.KV_CONFIG.put('EMERGENCY_STOP', 'true');

// Check before any send
async function isEmergencyStopActive(env: Env): Promise<boolean> {
  return await env.KV_CONFIG.get('EMERGENCY_STOP') === 'true';
}

// In cron handler
export async function handleEmailCron(env: Env) {
  if (await isEmergencyStopActive(env)) {
    console.log('Emergency stop active - skipping email cron');
    return { skipped: true, reason: 'emergency_stop' };
  }

  // Continue with normal processing...
}
```

**API to toggle:**
```typescript
// POST /admin/emergency-stop
export async function toggleEmergencyStop(request: Request, env: Env) {
  const { active } = await request.json();

  await env.KV_CONFIG.put('EMERGENCY_STOP', active ? 'true' : 'false');

  // Send alert
  await sendAlert(
    active ? 'EMERGENCY STOP ACTIVATED' : 'Emergency stop deactivated',
    `Changed by admin at ${new Date().toISOString()}`,
    env
  );

  return Response.json({ success: true, emergencyStop: active });
}
```

### 5. Pre-Flight Content Check

Before sending, verify the email looks right:

```typescript
async function preflight(email: { to: string; subject: string; body: string }): Promise<{
  issues: string[];
  score: number;
}> {
  const issues: string[] = [];

  // Check length
  if (email.subject.length > 100) {
    issues.push('Subject too long (>100 chars)');
  }
  if (email.body.length < 50) {
    issues.push('Body too short (<50 chars)');
  }
  if (email.body.length > 2000) {
    issues.push('Body too long (>2000 chars)');
  }

  // Check for common AI mistakes
  if (email.body.includes('As an AI')) {
    issues.push('Contains "As an AI" phrase');
  }
  if (email.body.includes('I cannot')) {
    issues.push('Contains "I cannot" phrase');
  }

  // Check personalization was applied
  if (email.body.includes('Dear Customer')) {
    issues.push('Generic greeting detected');
  }

  // Check for broken formatting
  if (email.body.includes('\\n')) {
    issues.push('Escaped newlines in body');
  }

  // Calculate spam score
  const spamScore = calculateSpamScore(email);
  if (spamScore > 5) {
    issues.push(`High spam score: ${spamScore}`);
  }

  return {
    issues,
    score: 100 - issues.length * 10 - spamScore,
  };
}
```

### 6. Send Log with Full Context

```typescript
async function logSend(
  prospectId: string,
  email: { subject: string; body: string },
  result: { sent: boolean; reason?: string },
  env: Env
) {
  await env.DB.prepare(`
    INSERT INTO send_log (
      id, prospect_id, subject, body_hash, sent, reason,
      safety_checks, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    prospectId,
    email.subject,
    hashBody(email.body),
    result.sent ? 1 : 0,
    result.reason || null,
    JSON.stringify(result.failedChecks || [])
  ).run();
}
```

---

## Safety Check Summary

| Check | Blocks Send If |
|-------|----------------|
| Emergency Stop | Global stop is active |
| Prospect Stage | Not in sendable stage |
| Bounced | Previous bounce recorded |
| Valid Email | Invalid format |
| Recent Send | Sent in last 24h |
| Exclusion List | On blocklist |
| Subject | Empty |
| Body | Empty |
| Variables | Unresolved {{var}} |
| Forbidden Content | Spam triggers found |
| Mailbox | No capacity |
| Business Hours | Outside 8am-6pm |

---

## Verification Checklist

- [ ] All safety checks implemented
- [ ] Emergency stop working
- [ ] Exclusion list enforced
- [ ] Blocked sends logged
- [ ] Content validation catches issues
- [ ] Can't bypass checks via direct API

---

## Recovery from Bad Send

If bad emails were sent:
1. Activate EMERGENCY_STOP immediately
2. Identify affected recipients
3. Consider sending apology (manually)
4. Review what check failed
5. Add new check to prevent recurrence
