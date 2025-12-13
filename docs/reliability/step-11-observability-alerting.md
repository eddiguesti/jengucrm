# Step 11: Observability & Alerting

## ✅ IMPLEMENTED - December 2024

## Goal
Know when something breaks before it causes damage. Good observability means you can diagnose issues quickly, and good alerting means you find out about problems before users do.

---

## Implementation Summary

### Files Created/Modified

| File | Purpose |
|------|---------|
| `cloudflare/src/lib/logger.ts` | Structured logging with context |
| `cloudflare/src/lib/alerting.ts` | Alert system for critical events |
| `cloudflare/src/lib/request-context.ts` | Request ID propagation |
| `cloudflare/src/workers/api.ts` | Health check endpoint |

### Key Features

1. **Structured logging** - JSON logs with context (requestId, prospectId, etc.)
2. **Request IDs** - Propagated in all responses via `meta.requestId`
3. **Health checks** - `/health` endpoint with dependency status
4. **Alert system** - Email and webhook alerts for critical events
5. **Sensitive data redaction** - Passwords, tokens redacted in logs

### API Endpoints

- `GET /health` - Full health check with dependencies
- `GET /api/metrics/deliverability` - Email deliverability metrics
- `GET /api/bounces/stats` - Bounce statistics

### Alerts Implemented

- `alertOnError()` - Any unhandled error
- `alertIntegrityIssue()` - Data integrity problems
- `alertEmailSendingFailure()` - Email send failures
- `alertAllInboxesUnhealthy()` - All inboxes down

---

## Observability Pillars

| Pillar | Purpose | Tools |
|--------|---------|-------|
| Logs | What happened | Console, structured logging |
| Metrics | How much/many | Counters, gauges |
| Traces | Request flow | Request IDs |
| Alerts | Something's wrong | Email, Slack |

---

## What to Verify

### 1. Logging
- [ ] All operations logged with context
- [ ] Error stack traces captured
- [ ] Request IDs in logs
- [ ] Sensitive data redacted

### 2. Metrics
- [ ] Key business metrics tracked
- [ ] System health metrics tracked
- [ ] Trends visible over time

### 3. Alerting
- [ ] Critical alerts go to email/Slack
- [ ] No alert fatigue (not too noisy)
- [ ] Alerts are actionable

---

## Common Failure Modes

| Failure | Impact | How to Detect |
|---------|--------|---------------|
| Silent failure | Problems go unnoticed | Metrics anomaly |
| Log overflow | Can't find real issues | Log volume spike |
| Alert fatigue | Ignore real problems | Too many alerts |
| Missing context | Can't debug | Incomplete logs |

---

## How to Make It Robust

### 1. Structured Logging

**File: `cloudflare/src/lib/logger.ts`**
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  prospectId?: string;
  emailId?: string;
  campaignId?: string;
  mailboxId?: string;
  operation?: string;
  [key: string]: any;
}

class Logger {
  private context: LogContext = {};

  withContext(ctx: LogContext): Logger {
    const logger = new Logger();
    logger.context = { ...this.context, ...ctx };
    return logger;
  }

  private log(level: LogLevel, message: string, data?: any) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...(data && { data: this.sanitize(data) }),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  private sanitize(data: any): any {
    if (typeof data !== 'object') return data;

    const sensitive = ['password', 'secret', 'token', 'key', 'auth'];
    const result = { ...data };

    for (const key of Object.keys(result)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        result[key] = '[REDACTED]';
      }
    }

    return result;
  }

  debug(message: string, data?: any) { this.log('debug', message, data); }
  info(message: string, data?: any) { this.log('info', message, data); }
  warn(message: string, data?: any) { this.log('warn', message, data); }
  error(message: string, data?: any) { this.log('error', message, data); }
}

export const logger = new Logger();
```

### 2. Request ID Propagation

```typescript
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const requestId = request.headers.get('x-request-id') || generateRequestId();
  const startTime = Date.now();

  const log = logger.withContext({ requestId });

  log.info('Request started', {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
  });

  try {
    const response = await processRequest(request, env, log);

    log.info('Request completed', {
      status: response.status,
      duration: Date.now() - startTime,
    });

    // Add request ID to response
    const headers = new Headers(response.headers);
    headers.set('x-request-id', requestId);

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    log.error('Request failed', {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });

    return Response.json({
      error: 'Internal server error',
      requestId,
    }, { status: 500 });
  }
}
```

### 3. Metrics Collection

**File: `cloudflare/src/lib/metrics.ts`**
```typescript
interface MetricEntry {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private metrics: MetricEntry[] = [];

  increment(name: string, tags: Record<string, string> = {}, value: number = 1) {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  gauge(name: string, value: number, tags: Record<string, string> = {}) {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  timing(name: string, durationMs: number, tags: Record<string, string> = {}) {
    this.metrics.push({
      name: `${name}_ms`,
      value: durationMs,
      tags,
      timestamp: Date.now(),
    });
  }

  async flush(env: Env): Promise<void> {
    if (this.metrics.length === 0) return;

    // Store in D1 for later analysis
    const batch = this.metrics.splice(0, 100);

    for (const metric of batch) {
      await env.DB.prepare(`
        INSERT INTO metrics (name, value, tags, timestamp)
        VALUES (?, ?, ?, ?)
      `).bind(
        metric.name,
        metric.value,
        JSON.stringify(metric.tags),
        new Date(metric.timestamp).toISOString()
      ).run();
    }
  }
}

export const metrics = new MetricsCollector();

// Usage examples:
// metrics.increment('emails_sent', { campaign: 'cold_direct' });
// metrics.gauge('queue_depth', 42);
// metrics.timing('email_generation', 1500, { model: 'grok' });
```

### 4. Key Metrics to Track

```typescript
// Business Metrics
const BUSINESS_METRICS = {
  // Email sending
  'emails_sent': 'counter',
  'emails_sent_by_campaign': 'counter',
  'emails_sent_by_inbox': 'counter',

  // Engagement
  'replies_received': 'counter',
  'replies_positive': 'counter',
  'replies_negative': 'counter',
  'meetings_booked': 'counter',

  // Failures
  'bounces_hard': 'counter',
  'bounces_soft': 'counter',
  'send_failures': 'counter',

  // Enrichment
  'enrichments_website': 'counter',
  'enrichments_email': 'counter',
  'enrichments_failed': 'counter',
};

// System Metrics
const SYSTEM_METRICS = {
  // Queue
  'queue_depth': 'gauge',
  'queue_processing_time_ms': 'timing',

  // Database
  'd1_query_time_ms': 'timing',
  'supabase_query_time_ms': 'timing',

  // External APIs
  'grok_api_time_ms': 'timing',
  'grok_api_errors': 'counter',

  // Sync
  'sync_pending_count': 'gauge',
  'sync_errors': 'counter',
};
```

### 5. Alerting System

**File: `cloudflare/src/lib/alerting.ts`**
```typescript
interface Alert {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data?: Record<string, any>;
}

const ALERT_THRESHOLDS = {
  bounce_rate: { warning: 2, critical: 5 },
  queue_depth: { warning: 100, critical: 500 },
  sync_backlog: { warning: 50, critical: 200 },
  api_error_rate: { warning: 5, critical: 20 },
};

export async function sendAlert(alert: Alert, env: Env): Promise<void> {
  // 1. Log the alert
  logger.warn(`ALERT: ${alert.title}`, alert);

  // 2. Send email for critical alerts
  if (alert.severity === 'critical') {
    await sendAlertEmail(alert, env);
  }

  // 3. Send to webhook (Slack, Discord, etc.)
  if (env.ALERT_WEBHOOK_URL) {
    await sendWebhookAlert(alert, env);
  }

  // 4. Store in database for dashboard
  await storeAlert(alert, env);
}

async function sendAlertEmail(alert: Alert, env: Env): Promise<void> {
  await sendEmail({
    to: 'edd@jengu.ai',
    subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    body: `
Alert: ${alert.title}
Severity: ${alert.severity}
Time: ${new Date().toISOString()}

${alert.message}

${alert.data ? JSON.stringify(alert.data, null, 2) : ''}

---
Jengu CRM Alert System
    `.trim(),
  }, env);
}

async function sendWebhookAlert(alert: Alert, env: Env): Promise<void> {
  await fetch(env.ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `*[${alert.severity.toUpperCase()}]* ${alert.title}`,
      attachments: [{
        color: alert.severity === 'critical' ? '#ff0000' : '#ffcc00',
        text: alert.message,
        fields: Object.entries(alert.data || {}).map(([k, v]) => ({
          title: k,
          value: String(v),
          short: true,
        })),
      }],
    }),
  });
}
```

### 6. Health Check Endpoint

```typescript
// GET /health
export async function healthCheck(env: Env): Promise<Response> {
  const checks: Record<string, { healthy: boolean; message?: string }> = {};

  // Check D1
  try {
    await env.DB.prepare('SELECT 1').first();
    checks.database = { healthy: true };
  } catch (error) {
    checks.database = { healthy: false, message: error.message };
  }

  // Check KV
  try {
    await env.KV_CONFIG.get('health_check_test');
    checks.kv = { healthy: true };
  } catch (error) {
    checks.kv = { healthy: false, message: error.message };
  }

  // Check queue depth
  const queueDepth = await getQueueDepth(env);
  checks.queue = {
    healthy: queueDepth < 500,
    message: `Depth: ${queueDepth}`,
  };

  // Check sync status
  const syncStatus = await getSyncStatus(env);
  checks.sync = {
    healthy: syncStatus.pendingCount < 100,
    message: `Pending: ${syncStatus.pendingCount}`,
  };

  const allHealthy = Object.values(checks).every(c => c.healthy);

  return Response.json({
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  }, {
    status: allHealthy ? 200 : 503,
  });
}
```

### 7. Automated Health Checks

```typescript
// Run every 5 minutes
async function runHealthChecks(env: Env): Promise<void> {
  // 1. Check bounce rate
  const bounceRate = await getCurrentBounceRate(env);
  if (bounceRate > ALERT_THRESHOLDS.bounce_rate.critical) {
    await sendAlert({
      severity: 'critical',
      title: 'High Bounce Rate',
      message: `Bounce rate is ${bounceRate.toFixed(1)}%, threshold is ${ALERT_THRESHOLDS.bounce_rate.critical}%`,
      data: { bounceRate },
    }, env);
  }

  // 2. Check queue depth
  const queueDepth = await getQueueDepth(env);
  if (queueDepth > ALERT_THRESHOLDS.queue_depth.critical) {
    await sendAlert({
      severity: 'critical',
      title: 'Queue Backup',
      message: `Queue depth is ${queueDepth}, threshold is ${ALERT_THRESHOLDS.queue_depth.critical}`,
      data: { queueDepth },
    }, env);
  }

  // 3. Check sync backlog
  const syncBacklog = await getSyncBacklog(env);
  if (syncBacklog > ALERT_THRESHOLDS.sync_backlog.critical) {
    await sendAlert({
      severity: 'critical',
      title: 'Sync Backlog',
      message: `${syncBacklog} records pending sync`,
      data: { syncBacklog },
    }, env);
  }

  // 4. Check for recent errors
  const errorCount = await getRecentErrorCount(env, 5); // Last 5 minutes
  if (errorCount > 10) {
    await sendAlert({
      severity: 'warning',
      title: 'High Error Rate',
      message: `${errorCount} errors in last 5 minutes`,
      data: { errorCount },
    }, env);
  }
}
```

### 8. Dashboard Metrics API

```typescript
// GET /api/metrics
export async function getMetricsDashboard(env: Env): Promise<Response> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const dashboard = {
    // Real-time
    queue: {
      depth: await getQueueDepth(env),
      processing: await getProcessingCount(env),
      failed: await getFailedCount(env),
    },

    // Today's stats
    today: {
      emailsSent: await countMetric('emails_sent', today, env),
      repliesReceived: await countMetric('replies_received', today, env),
      bounces: await countMetric('bounces_hard', today, env),
      enrichments: await countMetric('enrichments_website', today, env),
    },

    // Health
    health: {
      bounceRate: await getCurrentBounceRate(env),
      syncBacklog: await getSyncBacklog(env),
      errorRate: await getErrorRate(hourAgo, env),
    },

    // Recent alerts
    alerts: await getRecentAlerts(10, env),

    timestamp: now.toISOString(),
  };

  return Response.json(dashboard);
}
```

---

## Alert Conditions

| Condition | Threshold | Severity | Action |
|-----------|-----------|----------|--------|
| Bounce rate > 5% | 5% | Critical | Pause sending |
| Queue depth > 500 | 500 | Critical | Investigate |
| Sync backlog > 200 | 200 | Critical | Check sync job |
| Error rate > 10/5min | 10 | Warning | Review logs |
| No emails sent in 2h | 2 hours | Warning | Check cron |
| Health check fails | Any | Critical | Immediate |

---

## Verification Checklist

- [x] Structured logging implemented (`logger.ts`)
- [x] Request IDs in all logs and responses
- [x] Key metrics tracked (deliverability, bounces)
- [x] Health check endpoint working (`/health`)
- [x] Alerts sent for critical issues (`alerting.ts`)
- [x] Dashboard shows current status (via `/health` and `/api/sync/status`)
- [x] Sensitive data redacted (passwords, tokens in logs)

---

## Runbook: Alert Response

### High Bounce Rate
1. Check recent bounces for patterns
2. Pause affected inbox
3. Review list quality
4. Resume after investigation

### Queue Backup
1. Check for stuck jobs
2. Look for processing errors
3. Scale up processing if needed
4. Clear dead jobs
