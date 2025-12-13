# Step 01: Architecture & Service Contracts

## Goal
Define clear boundaries between services so each component knows exactly what to expect from others. When services have explicit contracts, failures are isolated and debugging is straightforward.

---

## Current Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│ Cloudflare      │────▶│   Supabase      │
│   (Vercel)      │     │ Worker          │     │   (PostgreSQL)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │   D1 Database   │
        │               │   (SQLite)      │
        │               └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  External APIs  │     │  SMTP/IMAP      │
│  (Grok, DDG)    │     │  Servers        │
└─────────────────┘     └─────────────────┘
```

---

## What to Verify

### 1. Service Boundaries
- [ ] Each service has a single responsibility
- [ ] No service directly accesses another's database
- [ ] All inter-service communication is via HTTP APIs
- [ ] API contracts are documented

### 2. API Contracts
- [ ] Every endpoint has defined request/response schemas
- [ ] Error responses are consistent (same format across all APIs)
- [ ] Versioning strategy exists (even if just v1)
- [ ] Rate limits are documented

### 3. Data Flow
- [ ] Clear ownership of each data entity
- [ ] No circular dependencies between services
- [ ] Async vs sync communication is intentional

---

## Common Failure Modes

| Failure | Impact | Current State |
|---------|--------|---------------|
| Next.js calls CF worker, worker is down | UI shows errors, emails don't send | No retry, no fallback |
| CF worker calls Supabase, Supabase is slow | Worker times out, cron fails | Basic timeout, no circuit breaker |
| D1 and Supabase have different data | Inconsistent state, duplicate actions | No sync verification |
| External API (Grok) rate limited | Enrichment fails silently | Basic retry, no backoff |
| SMTP server rejects connection | Emails queued but never sent | Logged but no alert |

---

## How to Make It Robust

### 1. Define Service Contracts

**Create: `contracts/cloudflare-api.ts`**
```typescript
// Shared types between Next.js and Cloudflare Worker

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  meta?: {
    requestId: string;
    duration: number;
  };
}

export interface SendEmailRequest {
  prospectId: string;
  campaignId: string;
  scheduledFor?: string;
}

export interface SendEmailResponse {
  emailId: string;
  status: 'sent' | 'queued' | 'failed';
  sentAt?: string;
}

export interface EnrichmentRequest {
  prospectId: string;
  type: 'website' | 'email' | 'both';
}

export interface EnrichmentResponse {
  prospectId: string;
  website?: string;
  email?: string;
  status: 'complete' | 'partial' | 'failed';
}
```

### 2. Implement Standard Error Handling

**Every API should return:**
```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "duration": 145
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests, retry after 60 seconds",
    "retryable": true
  },
  "meta": {
    "requestId": "req_abc123"
  }
}
```

### 3. Add Request IDs for Tracing

**Cloudflare Worker:**
```typescript
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const requestId = request.headers.get('x-request-id') || generateRequestId();
  const startTime = Date.now();

  try {
    const result = await processRequest(request, env);

    return Response.json({
      success: true,
      data: result,
      meta: {
        requestId,
        duration: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);

    return Response.json({
      success: false,
      error: {
        code: getErrorCode(error),
        message: error.message,
        retryable: isRetryable(error),
      },
      meta: { requestId },
    }, { status: getStatusCode(error) });
  }
}
```

### 4. Document All Endpoints

**Create: `docs/api-reference.md`**
```markdown
# Cloudflare Worker API

Base URL: https://jengu-crm.edd-181.workers.dev

## Endpoints

### POST /api/send-email
Send an email to a prospect.

**Request:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| prospectId | string | Yes | UUID of prospect |
| campaignId | string | Yes | UUID of campaign |

**Response:**
| Field | Type | Description |
|-------|------|-------------|
| emailId | string | UUID of sent email |
| status | string | 'sent', 'queued', or 'failed' |

**Error Codes:**
| Code | Description | Retryable |
|------|-------------|-----------|
| PROSPECT_NOT_FOUND | Invalid prospectId | No |
| MAILBOX_UNAVAILABLE | No healthy mailbox | Yes |
| RATE_LIMITED | Too many requests | Yes |
```

### 5. Add Health Check Endpoints

**Each service should expose:**
```typescript
// GET /health
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "dependencies": {
    "database": "healthy",
    "smtp": "healthy",
    "external_apis": "degraded"
  }
}
```

### 6. Implement Circuit Breaker

**For external service calls:**
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > 30000) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= 5) {
      this.state = 'open';
    }
  }
}
```

---

## Service Ownership Matrix

| Data Entity | Owner | Read Access | Write Access |
|-------------|-------|-------------|--------------|
| Prospects | Supabase | CF Worker, Next.js | Next.js API |
| Emails | D1 | CF Worker | CF Worker |
| Campaigns | Supabase | CF Worker, Next.js | Next.js API |
| Mailboxes | Supabase | CF Worker | Next.js API |
| Analytics | D1 | Next.js (via CF) | CF Worker |

---

## Verification Checklist

- [ ] All API endpoints return consistent error format
- [ ] Request IDs propagated through all services
- [ ] Health checks return dependency status
- [ ] Circuit breakers on external API calls
- [ ] API documentation up to date
- [ ] No direct database access across service boundaries

---

## Failure Recovery

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| CF Worker down | Health check fails | Alert, Vercel shows error page |
| Supabase down | Connection timeout | CF Worker uses D1 cache |
| D1 down | Query fails | Log error, retry with backoff |
| External API down | Circuit breaker opens | Skip enrichment, queue for later |
