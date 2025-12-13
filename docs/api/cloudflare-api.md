# Cloudflare Worker API Reference

Base URL: `https://marketing-agent.jengu.workers.dev`

## Standard Response Format

All API endpoints return responses in a consistent format:

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123_xyz",
    "duration": 145,
    "timestamp": "2025-01-01T12:00:00.000Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "retryable": true
  },
  "meta": {
    "requestId": "req_abc123_xyz",
    "timestamp": "2025-01-01T12:00:00.000Z"
  }
}
```

### Request ID Tracing

Every request is assigned a unique request ID (format: `req_{timestamp}_{random}`).

- The request ID is included in all responses via the `meta.requestId` field
- The request ID is also returned in the `X-Request-Id` response header
- You can pass your own request ID via the `X-Request-Id` request header

---

## Health & Status Endpoints

### GET /health

Health check with dependency status.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.1.0",
    "uptime": 42,
    "dependencies": {
      "database": {
        "status": "healthy",
        "latencyMs": 5
      },
      "smtp": {
        "status": "healthy"
      },
      "externalApis": {
        "status": "healthy"
      }
    }
  },
  "meta": { ... }
}
```

**Dependency Status Values:**

| Status | Description |
|--------|-------------|
| `healthy` | All systems operational |
| `degraded` | Some issues, but functional |
| `unhealthy` | Critical issues, may not function |

---

### GET /api/stats

Get overall system statistics.

**Response:**

```json
{
  "prospects": {
    "total": 1500,
    "new": 100,
    "enriched": 200,
    "contacted": 800,
    "engaged": 50,
    "meeting": 10
  },
  "emails_today": {
    "total_sent": 45,
    "opened": 12,
    "replied": 3,
    "bounced": 1
  }
}
```

---

### GET /api/status/warmup

Get warmup counter status for all inboxes.

**Response:**

```json
{
  "date": "2025-01-01",
  "totalSent": 25,
  "globalLimit": 80,
  "inboxes": {
    "inbox1@example.com": { "sent": 10, "limit": 20 },
    "inbox2@example.com": { "sent": 15, "limit": 20 }
  }
}
```

---

### GET /api/status/inboxes

Get inbox health status.

**Response:**

```json
{
  "inboxes": [
    {
      "id": "inbox1",
      "email": "inbox1@example.com",
      "healthy": true,
      "dailySent": 10,
      "dailyLimit": 20,
      "warmupDay": 15,
      "lastError": null
    }
  ]
}
```

---

### GET /api/status/rate-limits

Get rate limiter status.

---

### GET /api/status/circuit-breakers

Get circuit breaker status for external APIs.

**Response:**

```json
{
  "success": true,
  "data": {
    "circuitBreakers": {
      "grok": {
        "state": "closed",
        "failures": 0,
        "successes": 5,
        "lastFailure": null,
        "lastSuccess": 1704067200000,
        "lastError": null
      },
      "supabase": {
        "state": "half-open",
        "failures": 3,
        "successes": 1,
        "lastFailure": 1704066000000,
        "lastSuccess": 1704067200000,
        "lastError": "Connection timeout"
      }
    }
  }
}
```

**Circuit Breaker States:**

| State | Description |
|-------|-------------|
| `closed` | Normal operation, requests pass through |
| `open` | Failing, requests immediately rejected |
| `half-open` | Testing recovery, limited requests allowed |

---

## Prospect Endpoints

### GET /api/prospects

List prospects with optional filtering.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `stage` | string | Filter by stage (new, enriched, contacted, etc.) |
| `tier` | string | Filter by tier (hot, warm, cold) |
| `limit` | number | Max results (default: 50, max: 100) |
| `offset` | number | Pagination offset |

**Response:**

```json
{
  "prospects": [ ... ],
  "count": 50
}
```

---

### POST /api/prospects

Create a new prospect.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Hotel/company name |
| `city` | string | Yes | City location |
| `country` | string | No | Country |
| `website` | string | No | Website URL |
| `contact_email` | string | No | Contact email |
| `contact_name` | string | No | Contact name |
| `source` | string | No | Lead source |

**Response:**

```json
{
  "success": true,
  "id": "uuid"
}
```

---

## Email Endpoints

### GET /api/emails

List emails with optional filtering.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `prospect_id` | string | Filter by prospect |
| `direction` | string | Filter by direction (inbound, outbound) |
| `limit` | number | Max results (default: 50, max: 100) |

---

### POST /api/send-email

Send an email to a prospect.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prospectId` | string | Yes | UUID of prospect |
| `strategy` | string | No | Email strategy (default: authority_scarcity) |

**Response:**

```json
{
  "success": true,
  "emailId": "uuid",
  "messageId": "smtp-message-id"
}
```

**Error Codes:**

| Code | Status | Retryable | Description |
|------|--------|-----------|-------------|
| `PROSPECT_NOT_FOUND` | 404 | No | Invalid prospectId |
| `INVALID_EMAIL` | 400 | No | Prospect has no email |
| `MAILBOX_UNAVAILABLE` | 503 | Yes | No healthy SMTP inbox |
| `WARMUP_LIMIT_REACHED` | 429 | Yes | Daily limit reached |

---

## Enrichment Endpoints

### POST /enrich/auto

Run automatic enrichment (website + email finding).

### POST /enrich/websites

Find websites for prospects without websites.

### POST /enrich/emails

Find emails for prospects with websites but no emails.

### GET /enrich/status

Get enrichment pipeline status.

---

## Campaign Endpoints

### GET /api/campaigns

List all campaigns.

### POST /api/campaigns

Create a new campaign.

### GET /api/campaigns/:id

Get campaign details.

### PUT /api/campaigns/:id

Update a campaign.

---

## Webhook Endpoints

### POST /webhook/email/inbound

Receive inbound emails (from IMAP or Cloudflare Email Routing).

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messageId` | string | No | Email message ID |
| `from` | string | Yes | Sender email |
| `to` | string | No | Recipient email |
| `subject` | string | Yes | Email subject |
| `body` | string | No | Email body text |

---

### POST /webhook/bounce

Handle bounce notifications.

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | Bounced email address |
| `type` | string | Bounce type |
| `reason` | string | Bounce reason |

---

### GET /webhook/tracking/open

Tracking pixel endpoint. Returns 1x1 transparent GIF.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Email ID to track |

---

## Admin Endpoints

### POST /api/admin/initialize-inboxes

Initialize or refresh inbox configuration.

### POST /api/admin/trigger-send

Manually trigger email sending.

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `count` | number | Number of emails to send (max: 5) |

---

## Retry Queue Endpoints

### GET /api/retry-queue/stats

Get retry queue statistics.

### GET /api/retry-queue/pending

Get pending retry tasks.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 20, max: 100) |

### POST /api/retry-queue/retry

Retry a specific task.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to retry |

### POST /api/retry-queue/resolve

Resolve (complete) a task.

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | string | Task ID to resolve |
| `prospectId` | string | Resolve all tasks for prospect |

### POST /api/retry-queue/cleanup

Clean up old resolved tasks.

---

## Error Codes Reference

| Code | HTTP Status | Retryable | Description |
|------|-------------|-----------|-------------|
| `BAD_REQUEST` | 400 | No | Invalid request |
| `UNAUTHORIZED` | 401 | No | Missing/invalid auth |
| `FORBIDDEN` | 403 | No | Access denied |
| `NOT_FOUND` | 404 | No | Resource not found |
| `VALIDATION_ERROR` | 422 | No | Invalid input data |
| `RATE_LIMITED` | 429 | Yes | Too many requests |
| `INTERNAL_ERROR` | 500 | No | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Yes | Service temporarily down |
| `EXTERNAL_SERVICE_ERROR` | 502 | Yes | External API failed |
| `TIMEOUT` | 504 | Yes | Request timeout |
| `PROSPECT_NOT_FOUND` | 404 | No | Invalid prospect ID |
| `MAILBOX_UNAVAILABLE` | 503 | Yes | No healthy inbox |
| `WARMUP_LIMIT_REACHED` | 429 | Yes | Daily send limit |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| All API endpoints | 100 | per minute |
| Email sending | Per inbox warmup schedule | per day |
| Enrichment | 20 websites + 10 emails | per 5 min |

---

## Authentication

Currently, API endpoints are protected via CORS. For production use:

1. Add `Authorization: Bearer <token>` header
2. Token should match the `CRON_SECRET` environment variable
