# Step 13: Testing Strategy

## ✅ DOCUMENTED - December 2024

## Goal
Have confidence that changes won't break production. A good testing strategy catches bugs before users do and makes refactoring safe.

---

## Current Status

### What's Available

1. **TypeScript compilation** - Type checking via `npx tsc --noEmit`
2. **Manual testing** - API endpoints testable via curl
3. **Health endpoints** - `/health` for smoke testing
4. **Vitest configuration** - Framework documented but tests not yet written

### What's Documented Below

- Unit test examples for spam checker, reply analysis
- Integration test patterns for email safety
- API endpoint test examples
- Test helpers and mocks
- CI/CD integration workflow
- Coverage targets

---

## Testing Pyramid

```
        ┌─────────┐
        │   E2E   │  Few, slow, high confidence
        └────┬────┘
             │
      ┌──────┴──────┐
      │ Integration │  Some, medium speed
      └──────┬──────┘
             │
    ┌────────┴────────┐
    │   Unit Tests    │  Many, fast, low cost
    └─────────────────┘
```

---

## What to Test

### 1. Unit Tests
- [ ] Email generation logic
- [ ] Spam score calculator
- [ ] Reply analysis/classification
- [ ] Rate limiter logic
- [ ] Data validation

### 2. Integration Tests
- [ ] Database queries
- [ ] API endpoint responses
- [ ] Queue processing
- [ ] Sync operations

### 3. End-to-End Tests
- [ ] Full email send flow
- [ ] Reply processing pipeline
- [ ] Cron job execution

---

## Common Testing Failures

| Failure | Impact | Prevention |
|---------|--------|------------|
| No tests | Bugs in production | Write tests first |
| Flaky tests | Ignored, no confidence | Fix or delete |
| Slow tests | Not run often | Mock external deps |
| Missing coverage | False confidence | Track coverage |

---

## How to Make It Robust

### 1. Unit Test Examples

**File: `cloudflare/src/lib/__tests__/spam-checker.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { calculateSpamScore, isSpammy } from '../spam-checker';

describe('SpamChecker', () => {
  describe('calculateSpamScore', () => {
    it('returns 0 for clean email', () => {
      const email = {
        subject: 'Quick question about your hotel',
        body: 'Hi John, I noticed your property and wanted to reach out...',
      };
      expect(calculateSpamScore(email)).toBeLessThan(3);
    });

    it('flags spam triggers', () => {
      const email = {
        subject: 'ACT NOW! FREE MONEY!!!',
        body: 'Click here for 100% guaranteed results!',
      };
      expect(calculateSpamScore(email)).toBeGreaterThan(5);
    });

    it('penalizes too many exclamation marks', () => {
      const email = {
        subject: 'Hello!!!',
        body: 'This is exciting!!!',
      };
      const score = calculateSpamScore(email);
      expect(score).toBeGreaterThan(2);
    });

    it('penalizes all caps', () => {
      const email = {
        subject: 'THIS IS IMPORTANT',
        body: 'PLEASE READ THIS MESSAGE',
      };
      expect(calculateSpamScore(email)).toBeGreaterThan(3);
    });
  });

  describe('isSpammy', () => {
    it('returns false for normal email', () => {
      const email = {
        subject: 'Following up on our conversation',
        body: 'Hi, just wanted to check if you had a chance to review...',
      };
      expect(isSpammy(email)).toBe(false);
    });

    it('returns true for spam-like email', () => {
      const email = {
        subject: 'URGENT: Act now for free money!',
        body: 'Click here immediately! Limited time offer! No obligation!',
      };
      expect(isSpammy(email)).toBe(true);
    });
  });
});
```

**File: `cloudflare/src/lib/__tests__/reply-analysis.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { quickClassify, isAutoReply } from '../reply-analysis';

describe('ReplyAnalysis', () => {
  describe('quickClassify', () => {
    it('detects meeting requests', () => {
      const result = quickClassify("Let's schedule a call next week");
      expect(result.result.intent).toBe('meeting_request');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('detects interest', () => {
      const result = quickClassify("This sounds interesting, tell me more");
      expect(result.result.intent).toBe('interested');
      expect(result.result.sentiment).toBe('positive');
    });

    it('detects rejection', () => {
      const result = quickClassify("Not interested, please remove me from your list");
      expect(result.result.intent).toBe('not_interested');
      expect(result.result.sentiment).toBe('negative');
    });
  });

  describe('isAutoReply', () => {
    it('detects out of office', () => {
      const email = {
        subject: 'Re: Out of Office',
        body: 'I am currently out of the office until Monday.',
        headers: {},
      };
      expect(isAutoReply(email)).toBe(true);
    });

    it('detects auto-reply header', () => {
      const email = {
        subject: 'Re: Your message',
        body: 'Thank you for your email.',
        headers: { 'auto-submitted': 'auto-replied' },
      };
      expect(isAutoReply(email)).toBe(true);
    });

    it('does not flag normal replies', () => {
      const email = {
        subject: 'Re: Quick question',
        body: 'Sure, I would be happy to discuss this.',
        headers: {},
      };
      expect(isAutoReply(email)).toBe(false);
    });
  });
});
```

### 2. Integration Test Examples

**File: `cloudflare/src/__tests__/email-safety.integration.test.ts`**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { runSafetyChecks } from '../lib/email-safety';
import { createTestEnv, createTestProspect } from './helpers';

describe('EmailSafety Integration', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  it('blocks email to bounced prospect', async () => {
    const prospect = await createTestProspect(env, {
      email_bounced: true,
    });

    const email = {
      subject: 'Test',
      body: 'Test email body',
    };

    const result = await runSafetyChecks(prospect, email, env);

    expect(result.safe).toBe(false);
    expect(result.checks.find(c => c.name === 'not_bounced')?.passed).toBe(false);
  });

  it('blocks email to recently emailed prospect', async () => {
    const prospect = await createTestProspect(env);

    // Simulate recent email
    await env.DB.prepare(`
      INSERT INTO emails (id, prospect_id, direction, sent_at)
      VALUES (?, ?, 'outbound', datetime('now', '-1 hour'))
    `).bind('test-email', prospect.id).run();

    const email = { subject: 'Test', body: 'Test' };
    const result = await runSafetyChecks(prospect, email, env);

    expect(result.safe).toBe(false);
    expect(result.checks.find(c => c.name === 'not_recently_emailed')?.passed).toBe(false);
  });

  it('allows email to eligible prospect', async () => {
    const prospect = await createTestProspect(env, {
      stage: 'ready',
      email_bounced: false,
    });

    const email = {
      subject: 'Quick question about your hotel',
      body: 'Hi, I wanted to reach out about...',
    };

    const result = await runSafetyChecks(prospect, email, env);

    expect(result.safe).toBe(true);
    expect(result.checks.every(c => c.passed)).toBe(true);
  });
});
```

### 3. API Endpoint Tests

**File: `cloudflare/src/__tests__/api.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { createTestEnv, createTestProspect } from './helpers';
import worker from '../index';

describe('API Endpoints', () => {
  describe('GET /api/prospects', () => {
    it('returns prospects list', async () => {
      const env = await createTestEnv();
      await createTestProspect(env, { name: 'Test Hotel' });

      const request = new Request('https://test/api/prospects');
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.prospects.length).toBeGreaterThan(0);
    });
  });

  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const env = await createTestEnv();
      const request = new Request('https://test/health');
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('POST /api/send-email (auth required)', () => {
    it('rejects without auth', async () => {
      const env = await createTestEnv();
      const request = new Request('https://test/api/send-email', {
        method: 'POST',
        body: JSON.stringify({ prospectId: '123' }),
      });

      const response = await worker.fetch(request, env);
      expect(response.status).toBe(401);
    });
  });
});
```

### 4. Test Helpers

**File: `cloudflare/src/__tests__/helpers.ts`**
```typescript
import { D1Database } from '@cloudflare/workers-types';

export interface TestEnv {
  DB: D1Database;
  KV_CONFIG: KVNamespace;
  KV_CACHE: KVNamespace;
  GROK_API_KEY: string;
}

export async function createTestEnv(): Promise<TestEnv> {
  // Use miniflare for local testing
  const { Miniflare } = await import('miniflare');

  const mf = new Miniflare({
    script: '',
    d1Databases: ['DB'],
    kvNamespaces: ['KV_CONFIG', 'KV_CACHE'],
  });

  return {
    DB: await mf.getD1Database('DB'),
    KV_CONFIG: await mf.getKVNamespace('KV_CONFIG'),
    KV_CACHE: await mf.getKVNamespace('KV_CACHE'),
    GROK_API_KEY: 'test-key',
  };
}

export async function createTestProspect(
  env: TestEnv,
  overrides: Partial<Prospect> = {}
): Promise<Prospect> {
  const prospect = {
    id: `test-${Date.now()}`,
    name: 'Test Hotel',
    contact_email: 'test@example.com',
    stage: 'ready',
    tier: 'warm',
    score: 50,
    email_bounced: false,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };

  await env.DB.prepare(`
    INSERT INTO prospects (id, name, contact_email, stage, tier, score, email_bounced, archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    prospect.id,
    prospect.name,
    prospect.contact_email,
    prospect.stage,
    prospect.tier,
    prospect.score,
    prospect.email_bounced ? 1 : 0,
    prospect.archived ? 1 : 0,
    prospect.created_at,
    prospect.updated_at
  ).run();

  return prospect;
}
```

### 5. Test Configuration

**File: `cloudflare/vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'miniflare',
    environmentOptions: {
      modules: true,
      d1Databases: ['DB'],
      kvNamespaces: ['KV_CONFIG', 'KV_CACHE'],
    },
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.ts'],
    },
  },
});
```

### 6. Mock External Services

**File: `cloudflare/src/__tests__/mocks.ts`**
```typescript
// Mock Grok API
export function mockGrokAPI(response: string) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('api.x.ai')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: response } }],
        }),
      });
    }
    return Promise.reject(new Error('Unmocked URL'));
  });
}

// Mock SMTP
export function mockSMTP(success: boolean = true) {
  return {
    sendMail: vi.fn().mockImplementation(() => {
      if (success) {
        return Promise.resolve({ messageId: 'test-message-id' });
      }
      return Promise.reject(new Error('SMTP error'));
    }),
  };
}
```

### 7. CI/CD Integration

**File: `.github/workflows/test.yml`**
```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd cloudflare
          npm ci

      - name: Run tests
        run: |
          cd cloudflare
          npm test

      - name: Check coverage
        run: |
          cd cloudflare
          npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### 8. Pre-Commit Hooks

**File: `.husky/pre-commit`**
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run tests before commit
cd cloudflare && npm test

# Type check
cd cloudflare && npx tsc --noEmit
```

---

## Test Coverage Targets

| Area | Target Coverage |
|------|----------------|
| Email safety | 90% |
| Reply analysis | 80% |
| API endpoints | 70% |
| Utils/helpers | 60% |
| Overall | 70% |

---

## Running Tests

```bash
# Run all tests
cd cloudflare && npm test

# Run with coverage
cd cloudflare && npm run test:coverage

# Run specific file
cd cloudflare && npm test -- spam-checker

# Watch mode
cd cloudflare && npm test -- --watch
```

---

## Verification Checklist

- [ ] Unit tests for core logic
- [ ] Integration tests for critical paths
- [ ] API endpoint tests
- [ ] Test helpers set up
- [ ] Mocks for external services
- [ ] CI/CD runs tests on PR
- [ ] Coverage > 70%
- [ ] No flaky tests
