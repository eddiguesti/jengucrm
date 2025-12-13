# Step 05: Rate Limiting & Throttling

## Goal
Protect your system from overwhelming external services, and protect external services from being overwhelmed by your system. Rate limits prevent cascading failures and keep you in good standing with APIs.

---

## Rate Limits to Respect

| Service | Limit | Consequence of Exceeding |
|---------|-------|-------------------------|
| SMTP (per inbox) | 20/day during warmup | Reputation damage |
| Grok API | 60 req/min | 429 errors, temporary ban |
| MillionVerifier | 100 req/min | 429 errors |
| DuckDuckGo | ~30 req/min | IP block |
| Supabase | 1000 req/sec | Throttling |

---

## What to Verify

### 1. Outbound Rate Limits
- [ ] SMTP sending respects per-inbox daily limits
- [ ] API calls to Grok are throttled
- [ ] Enrichment calls are spread out
- [ ] No burst traffic to external services

### 2. Inbound Rate Limits
- [ ] API endpoints are protected from abuse
- [ ] Webhook endpoints can't be flooded
- [ ] Admin endpoints require auth

### 3. Internal Rate Limits
- [ ] Database queries are efficient (no N+1)
- [ ] Cron jobs don't overlap

---

## Common Failure Modes

| Failure | Impact | How It Happens |
|---------|--------|----------------|
| SMTP limit exceeded | Emails rejected, reputation hit | No per-inbox tracking |
| Grok 429 errors | Enrichment fails for batch | Burst requests |
| DuckDuckGo blocks IP | Website finding stops | Too many searches |
| Database overwhelmed | All operations slow | Unoptimized queries |

---

## How to Make It Robust

### 1. Token Bucket Rate Limiter

**File: `cloudflare/src/lib/rate-limiter.ts`**
```typescript
interface RateLimiterConfig {
  maxTokens: number;      // Bucket size
  refillRate: number;     // Tokens per second
  refillInterval: number; // How often to refill (ms)
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(cost: number = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }

    return false;
  }

  async waitForToken(cost: number = 1, maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.acquire(cost)) {
        return true;
      }
      // Wait for refill
      await sleep(this.config.refillInterval);
    }

    return false; // Timed out
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 1000) * this.config.refillRate;

    this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// Pre-configured limiters
export const RATE_LIMITERS = {
  grok: new RateLimiter({ maxTokens: 60, refillRate: 1, refillInterval: 1000 }),
  ddg: new RateLimiter({ maxTokens: 30, refillRate: 0.5, refillInterval: 2000 }),
  millionverifier: new RateLimiter({ maxTokens: 100, refillRate: 1.67, refillInterval: 600 }),
};
```

### 2. Distributed Rate Limiting with Durable Objects

**File: `cloudflare/src/durable-objects/rate-limiter.ts`**
```typescript
export class RateLimiter implements DurableObject {
  private state: DurableObjectState;
  private tokens: number = 0;
  private lastRefill: number = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/acquire') {
      const { cost = 1, maxTokens, refillRate } = await request.json();

      // Load state
      this.tokens = await this.state.storage.get('tokens') || maxTokens;
      this.lastRefill = await this.state.storage.get('lastRefill') || Date.now();

      // Refill tokens
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      this.tokens = Math.min(maxTokens, this.tokens + elapsed * refillRate);
      this.lastRefill = now;

      // Try to acquire
      if (this.tokens >= cost) {
        this.tokens -= cost;
        await this.state.storage.put('tokens', this.tokens);
        await this.state.storage.put('lastRefill', this.lastRefill);
        return Response.json({ allowed: true, remaining: this.tokens });
      }

      return Response.json({ allowed: false, remaining: this.tokens, retryAfter: cost / refillRate });
    }

    return new Response('Not found', { status: 404 });
  }
}
```

### 3. Per-Inbox Send Tracking

**Using existing WarmupCounter Durable Object:**
```typescript
async function canSendFromInbox(inboxId: string, env: Env): Promise<boolean> {
  const counter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName(inboxId)
  );

  const response = await counter.fetch('https://internal/can-send');
  const { allowed, remaining, dailyLimit } = await response.json();

  if (!allowed) {
    console.log(`Inbox ${inboxId} at limit: ${remaining}/${dailyLimit}`);
  }

  return allowed;
}

async function recordSend(inboxId: string, env: Env): Promise<void> {
  const counter = env.WARMUP_COUNTER.get(
    env.WARMUP_COUNTER.idFromName(inboxId)
  );

  await counter.fetch('https://internal/record-send', { method: 'POST' });
}
```

### 4. API Call Wrapper with Rate Limiting

**File: `cloudflare/src/lib/api-client.ts`**
```typescript
export async function callGrokAPI(
  prompt: string,
  env: Env,
  options: { timeout?: number } = {}
): Promise<string> {
  // Acquire rate limit token
  const limiter = env.RATE_LIMITER.get(
    env.RATE_LIMITER.idFromName('grok')
  );

  const limitResponse = await limiter.fetch('https://internal/acquire', {
    method: 'POST',
    body: JSON.stringify({ cost: 1, maxTokens: 60, refillRate: 1 }),
  });

  const { allowed, retryAfter } = await limitResponse.json();

  if (!allowed) {
    // Wait and retry, or throw
    if (retryAfter < 30) {
      await sleep(retryAfter * 1000);
      return callGrokAPI(prompt, env, options); // Retry
    }
    throw new Error(`Grok rate limit exceeded, retry after ${retryAfter}s`);
  }

  // Make the actual API call
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(options.timeout || 30000),
  });

  if (response.status === 429) {
    // Rate limited by API - back off
    const retryAfterHeader = response.headers.get('Retry-After');
    throw new Error(`Grok rate limited, retry after ${retryAfterHeader}s`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
```

### 5. Batch Operations with Throttling

```typescript
async function enrichProspectsBatch(
  prospects: Prospect[],
  env: Env
): Promise<void> {
  // Process in small batches with delays
  const BATCH_SIZE = 5;
  const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds

  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    await Promise.all(batch.map(p => enrichProspect(p, env)));

    // Wait before next batch
    if (i + BATCH_SIZE < prospects.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }
}
```

### 6. Global Send Limit Enforcement

```typescript
const GLOBAL_LIMITS = {
  emailsPerHour: 20,
  emailsPerDay: 80,
  enrichmentsPerHour: 100,
};

async function getGlobalSendCount(period: 'hour' | 'day', env: Env): Promise<number> {
  const since = period === 'hour'
    ? "datetime('now', '-1 hour')"
    : "datetime('now', '-1 day')";

  const { results } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM emails
    WHERE direction = 'outbound'
    AND sent_at > ${since}
  `).all();

  return results?.[0]?.count || 0;
}

async function canSendGlobally(env: Env): Promise<{ allowed: boolean; reason?: string }> {
  const hourlyCount = await getGlobalSendCount('hour', env);
  if (hourlyCount >= GLOBAL_LIMITS.emailsPerHour) {
    return { allowed: false, reason: `Hourly limit reached: ${hourlyCount}/${GLOBAL_LIMITS.emailsPerHour}` };
  }

  const dailyCount = await getGlobalSendCount('day', env);
  if (dailyCount >= GLOBAL_LIMITS.emailsPerDay) {
    return { allowed: false, reason: `Daily limit reached: ${dailyCount}/${GLOBAL_LIMITS.emailsPerDay}` };
  }

  return { allowed: true };
}
```

### 7. API Endpoint Rate Limiting

```typescript
// In API handler
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Rate limit by IP
  const limiter = env.RATE_LIMITER.get(
    env.RATE_LIMITER.idFromName(`api:${ip}`)
  );

  const { allowed } = await limiter.fetch('https://internal/acquire', {
    method: 'POST',
    body: JSON.stringify({ cost: 1, maxTokens: 100, refillRate: 10 }), // 100 req/10s
  }).then(r => r.json());

  if (!allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '10' },
    });
  }

  // Process request...
}
```

---

## Rate Limit Dashboard

Show in UI:
- Current send count vs limits (hourly/daily)
- Per-inbox usage
- API call counts
- Rate limit hits (429s received)

---

## Verification Checklist

- [ ] Per-inbox daily limits enforced
- [ ] Global send limits enforced
- [ ] Grok API calls rate limited
- [ ] DDG searches throttled
- [ ] API endpoints protected
- [ ] Rate limit metrics logged
- [ ] Backoff on 429 responses

---

## Recovery from Rate Limit Issues

### Exceeded SMTP Limits
```
1. Pause all sending
2. Check which inboxes are affected
3. Wait until next day for reset
4. Review warmup schedule
```

### API Banned
```
1. Stop all calls to that API
2. Check for ban duration
3. Implement circuit breaker
4. Consider backup API
```
