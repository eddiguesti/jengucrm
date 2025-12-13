# Step 12: Security & Privacy

## ✅ IMPLEMENTED - December 2024

## Goal
Protect sensitive data and prevent unauthorized access. Email credentials, prospect data, and API keys must be secured. A breach would be catastrophic for trust and legally costly.

---

## Implementation Summary

### Files Created/Modified

| File | Purpose |
|------|---------|
| `cloudflare/src/lib/webhook-security.ts` | Signature verification, replay protection |
| `cloudflare/src/lib/validation.ts` | Zod-based input validation |
| `cloudflare/src/durable-objects/rate-limiter.ts` | Rate limiting |
| `cloudflare/src/lib/logger.ts` | Sensitive data redaction |

### Key Features

1. **Webhook security** - HMAC signature verification, timestamp validation
2. **Input validation** - Zod schemas for all inputs
3. **Rate limiting** - Per-provider AI limits, per-IP API limits
4. **Log sanitization** - Passwords, tokens, API keys redacted
5. **Secret management** - Via `wrangler secret put`
6. **Parameterized queries** - All SQL uses prepared statements

---

## Sensitive Data Inventory

| Data Type | Location | Risk Level |
|-----------|----------|------------|
| SMTP passwords | Env vars, Supabase | Critical |
| API keys (Grok, etc.) | Env vars | Critical |
| Prospect emails | Supabase, D1 | High |
| Contact names | Supabase, D1 | Medium |
| Email content | D1, logs | Medium |

---

## What to Verify

### 1. Authentication
- [ ] Admin endpoints require auth
- [ ] API keys stored securely
- [ ] No hardcoded credentials

### 2. Authorization
- [ ] Role-based access (if multi-user)
- [ ] API endpoints validate permissions
- [ ] Webhook endpoints verify signature

### 3. Data Protection
- [ ] Sensitive fields encrypted at rest
- [ ] Data redacted in logs
- [ ] Secure deletion possible

### 4. Network Security
- [ ] HTTPS everywhere
- [ ] CORS configured correctly
- [ ] Rate limiting in place

---

## Common Failure Modes

| Failure | Impact | How It Happens |
|---------|--------|----------------|
| Credential leak | Full account compromise | In logs, git, response |
| SQL injection | Data breach | Unsanitized input |
| Missing auth | Unauthorized access | Endpoint not protected |
| Over-permissive CORS | CSRF attacks | Wrong config |

---

## How to Make It Robust

### 1. Secure Credential Storage

**Cloudflare Secrets (wrangler.toml):**
```toml
# Never put secrets in wrangler.toml!
# Use wrangler secret put

# Set secrets via CLI:
# wrangler secret put GROK_API_KEY
# wrangler secret put SMTP_INBOX_1
# wrangler secret put SUPABASE_SERVICE_KEY
```

**Accessing secrets:**
```typescript
// Secrets are available in env object
export default {
  async fetch(request: Request, env: Env) {
    // env.GROK_API_KEY - available but never log it!
  }
};
```

### 2. Environment Variable Validation

```typescript
interface RequiredEnvVars {
  GROK_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SMTP_INBOX_1: string;
}

function validateEnv(env: Env): void {
  const required = [
    'GROK_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SMTP_INBOX_1',
  ];

  const missing = required.filter(key => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

### 3. API Authentication

**File: `cloudflare/src/lib/auth.ts`**
```typescript
export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<{ authenticated: boolean; reason?: string }> {
  // Check for admin token
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return { authenticated: false, reason: 'Missing Authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { authenticated: false, reason: 'Invalid Authorization format' };
  }

  const token = authHeader.slice(7);

  // Verify token
  if (token !== env.ADMIN_TOKEN) {
    return { authenticated: false, reason: 'Invalid token' };
  }

  return { authenticated: true };
}

// Middleware wrapper
export function requireAuth(handler: Handler): Handler {
  return async (request: Request, env: Env) => {
    const auth = await authenticateRequest(request, env);

    if (!auth.authenticated) {
      return Response.json({
        error: 'Unauthorized',
        reason: auth.reason,
      }, { status: 401 });
    }

    return handler(request, env);
  };
}
```

### 4. Input Validation

**File: `cloudflare/src/lib/validation.ts`**
```typescript
import { z } from 'zod';

// Define schemas for all inputs
export const ProspectSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
});

export const EmailRequestSchema = z.object({
  prospectId: z.string().uuid(),
  campaignId: z.string().uuid(),
  scheduledFor: z.string().datetime().optional(),
});

// Validation function
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.errors);
    }
    throw error;
  }
}

// Usage in handler
async function handleCreateProspect(request: Request, env: Env) {
  const body = await request.json();
  const validated = validateInput(ProspectSchema, body);
  // Now safe to use validated data
}
```

### 5. SQL Injection Prevention

**Always use parameterized queries:**
```typescript
// DANGEROUS - Never do this!
const query = `SELECT * FROM prospects WHERE email = '${userInput}'`;

// SAFE - Use parameterized queries
const { results } = await env.DB.prepare(`
  SELECT * FROM prospects WHERE email = ?
`).bind(userInput).all();
```

### 6. Data Redaction in Logs

```typescript
function sanitizeForLog(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const sensitive = [
    'password', 'secret', 'token', 'key', 'auth',
    'smtp_pass', 'imap_pass', 'api_key'
  ];

  const result = Array.isArray(data) ? [...data] : { ...data };

  for (const key of Object.keys(result)) {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof result[key] === 'object') {
      result[key] = sanitizeForLog(result[key]);
    }
  }

  return result;
}

// Usage
console.log('Request:', sanitizeForLog(requestBody));
```

### 7. CORS Configuration

```typescript
const ALLOWED_ORIGINS = [
  'https://crm.jengu.ai',
  'http://localhost:3000', // Development only
];

function handleCORS(request: Request): Response | null {
  const origin = request.headers.get('Origin');

  // Preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  return null;
}

function addCORSHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);

  if (ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
```

### 8. Webhook Signature Verification

```typescript
async function verifyWebhookSignature(
  request: Request,
  secret: string
): Promise<boolean> {
  const signature = request.headers.get('X-Signature-256');
  if (!signature) return false;

  const body = await request.text();
  const expectedSignature = await computeHmac(body, secret);

  return signature === expectedSignature;
}

async function computeHmac(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 9. Rate Limiting for Security

```typescript
// Prevent brute force attacks
const AUTH_RATE_LIMIT = {
  maxAttempts: 5,
  windowSeconds: 300, // 5 minutes
};

async function checkAuthRateLimit(ip: string, env: Env): Promise<boolean> {
  const key = `auth_attempts:${ip}`;
  const attempts = parseInt(await env.KV_CACHE.get(key) || '0');

  if (attempts >= AUTH_RATE_LIMIT.maxAttempts) {
    return false; // Rate limited
  }

  await env.KV_CACHE.put(key, String(attempts + 1), {
    expirationTtl: AUTH_RATE_LIMIT.windowSeconds,
  });

  return true;
}
```

### 10. Secure Data Deletion

```typescript
async function deleteProspectData(prospectId: string, env: Env): Promise<void> {
  // Delete in order to respect foreign keys

  // 1. Delete emails
  await env.DB.prepare(`
    DELETE FROM emails WHERE prospect_id = ?
  `).bind(prospectId).run();

  // 2. Delete activities
  await env.DB.prepare(`
    DELETE FROM activities WHERE prospect_id = ?
  `).bind(prospectId).run();

  // 3. Delete campaign leads
  await env.DB.prepare(`
    DELETE FROM campaign_leads WHERE prospect_id = ?
  `).bind(prospectId).run();

  // 4. Delete prospect
  await env.DB.prepare(`
    DELETE FROM prospects WHERE id = ?
  `).bind(prospectId).run();

  // 5. Log for audit
  await logActivity('prospect_deleted', {
    prospectId,
    deletedAt: new Date().toISOString(),
  }, env);
}
```

---

## Security Headers

```typescript
function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self'");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
```

---

## Verification Checklist

- [x] All secrets in environment variables (via `wrangler secret put`)
- [x] Admin endpoints require authentication (Bearer token)
- [x] Input validation on all endpoints (`validation.ts`)
- [x] Parameterized queries everywhere (prepared statements)
- [x] Sensitive data redacted in logs (`logger.ts` sanitize)
- [x] CORS properly configured (api.ts)
- [x] Security headers added (Cloudflare defaults)
- [x] Rate limiting on auth endpoints (`rate-limiter.ts`)
- [x] Data deletion capability (via API endpoints)

---

## Security Audit Checklist

Weekly:
- [ ] Review access logs for anomalies
- [ ] Check for failed auth attempts
- [ ] Verify no secrets in logs

Monthly:
- [ ] Rotate API keys
- [ ] Review user access
- [ ] Test auth endpoints
- [ ] Check for exposed endpoints
