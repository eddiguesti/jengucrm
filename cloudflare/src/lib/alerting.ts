/**
 * Alerting System
 *
 * Sends alerts to external webhooks (Slack, Discord, PagerDuty, etc.)
 * Features:
 * - Multiple severity levels
 * - Rate limiting to prevent spam
 * - Deduplication of similar alerts
 * - Support for different alert types
 */

import { Env } from '../types';
import { loggers } from './logger';

const logger = loggers.api;

// ==================
// TYPES
// ==================

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export type AlertType =
  | 'email_sending_failure'
  | 'enrichment_failure'
  | 'ai_provider_failure'
  | 'database_error'
  | 'integrity_issue'
  | 'rate_limit_exceeded'
  | 'health_check_failure'
  | 'performance_degradation'
  | 'security_warning'
  | 'system_error';

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  deduplicationKey?: string;
}

export interface AlertConfig {
  /** Webhook URL for alerts (Slack, Discord, etc.) */
  webhookUrl?: string;
  /** Minimum severity level to send alerts */
  minSeverity: AlertSeverity;
  /** Rate limit: max alerts per minute per type */
  rateLimitPerMinute: number;
  /** Alert deduplication window in seconds */
  deduplicationWindowSeconds: number;
  /** Whether to include stack traces in alerts */
  includeStackTraces: boolean;
}

// ==================
// RATE LIMITING
// ==================

// In-memory rate limiting (resets per worker invocation)
// For persistent rate limiting, use Durable Objects
const alertCounts: Map<string, { count: number; resetAt: number }> = new Map();
const recentAlerts: Map<string, number> = new Map();

function checkRateLimit(alertType: AlertType, config: AlertConfig): boolean {
  const now = Date.now();
  const key = alertType;
  const state = alertCounts.get(key);

  if (!state || now > state.resetAt) {
    alertCounts.set(key, { count: 1, resetAt: now + 60000 }); // 1 minute window
    return true;
  }

  if (state.count >= config.rateLimitPerMinute) {
    return false;
  }

  state.count++;
  return true;
}

function checkDeduplication(alert: Alert, config: AlertConfig): boolean {
  if (!alert.deduplicationKey) {
    return true; // No dedup key, allow alert
  }

  const now = Date.now();
  const lastAlertTime = recentAlerts.get(alert.deduplicationKey);

  if (lastAlertTime && now - lastAlertTime < config.deduplicationWindowSeconds * 1000) {
    return false; // Duplicate within window
  }

  recentAlerts.set(alert.deduplicationKey, now);
  return true;
}

// ==================
// SEVERITY HELPERS
// ==================

const SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

function shouldAlert(alertSeverity: AlertSeverity, minSeverity: AlertSeverity): boolean {
  return SEVERITY_PRIORITY[alertSeverity] >= SEVERITY_PRIORITY[minSeverity];
}

function getSeverityEmoji(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
  }
}

function getSeverityColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return '#dc3545'; // Red
    case 'error':
      return '#fd7e14'; // Orange
    case 'warning':
      return '#ffc107'; // Yellow
    case 'info':
      return '#17a2b8'; // Blue
  }
}

// ==================
// WEBHOOK FORMATTERS
// ==================

interface SlackMessage {
  text: string;
  attachments: Array<{
    color: string;
    title: string;
    text: string;
    fields?: Array<{ title: string; value: string; short?: boolean }>;
    ts?: number;
  }>;
}

function formatSlackMessage(alert: Alert): SlackMessage {
  const emoji = getSeverityEmoji(alert.severity);
  const color = getSeverityColor(alert.severity);

  const fields: Array<{ title: string; value: string; short: boolean }> = [
    { title: 'Type', value: alert.type, short: true },
    { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
  ];

  // Add context fields
  if (alert.context) {
    for (const [key, value] of Object.entries(alert.context)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        fields.push({
          title: key,
          value: String(value),
          short: String(value).length < 30,
        });
      }
    }
  }

  return {
    text: `${emoji} *${alert.title}*`,
    attachments: [
      {
        color,
        title: alert.title,
        text: alert.message,
        fields,
        ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
      },
    ],
  };
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp: string;
}

function formatDiscordMessage(alert: Alert): { content: string; embeds: DiscordEmbed[] } {
  const emoji = getSeverityEmoji(alert.severity);
  const color = parseInt(getSeverityColor(alert.severity).replace('#', ''), 16);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: 'Type', value: alert.type, inline: true },
    { name: 'Severity', value: alert.severity.toUpperCase(), inline: true },
  ];

  // Add context fields
  if (alert.context) {
    for (const [key, value] of Object.entries(alert.context)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        fields.push({
          name: key,
          value: String(value),
          inline: String(value).length < 30,
        });
      }
    }
  }

  return {
    content: `${emoji} **${alert.title}**`,
    embeds: [
      {
        title: alert.title,
        description: alert.message,
        color,
        fields,
        timestamp: alert.timestamp,
      },
    ],
  };
}

function formatGenericWebhook(alert: Alert): Record<string, unknown> {
  return {
    ...alert,
    emoji: getSeverityEmoji(alert.severity),
  };
}

// ==================
// ALERTING SERVICE
// ==================

const DEFAULT_CONFIG: AlertConfig = {
  minSeverity: 'warning',
  rateLimitPerMinute: 10,
  deduplicationWindowSeconds: 300, // 5 minutes
  includeStackTraces: false,
};

/**
 * Send an alert to the configured webhook
 */
export async function sendAlert(
  alert: Alert,
  env: Env,
  configOverrides?: Partial<AlertConfig>
): Promise<boolean> {
  const config: AlertConfig = {
    ...DEFAULT_CONFIG,
    webhookUrl: env.ALERT_WEBHOOK_URL,
    ...configOverrides,
  };

  // Check if we should send this alert
  if (!config.webhookUrl) {
    logger.debug('Alert webhook not configured, skipping alert', { type: alert.type });
    return false;
  }

  if (!shouldAlert(alert.severity, config.minSeverity)) {
    logger.debug('Alert below minimum severity, skipping', {
      type: alert.type,
      severity: alert.severity,
      minSeverity: config.minSeverity,
    });
    return false;
  }

  if (!checkRateLimit(alert.type, config)) {
    logger.debug('Alert rate limited, skipping', { type: alert.type });
    return false;
  }

  if (!checkDeduplication(alert, config)) {
    logger.debug('Alert deduplicated, skipping', {
      type: alert.type,
      deduplicationKey: alert.deduplicationKey,
    });
    return false;
  }

  // Format message based on webhook URL pattern
  let body: string;
  if (config.webhookUrl.includes('slack.com')) {
    body = JSON.stringify(formatSlackMessage(alert));
  } else if (config.webhookUrl.includes('discord.com')) {
    body = JSON.stringify(formatDiscordMessage(alert));
  } else {
    body = JSON.stringify(formatGenericWebhook(alert));
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      logger.error('Failed to send alert', new Error(`HTTP ${response.status}`), {
        type: alert.type,
        status: response.status,
      });
      return false;
    }

    logger.info('Alert sent successfully', { type: alert.type, severity: alert.severity });
    return true;
  } catch (error) {
    logger.error('Failed to send alert', error, { type: alert.type });
    return false;
  }
}

// ==================
// CONVENIENCE FUNCTIONS
// ==================

/**
 * Send a critical alert (highest priority)
 */
export async function alertCritical(
  type: AlertType,
  title: string,
  message: string,
  env: Env,
  context?: Record<string, unknown>
): Promise<boolean> {
  return sendAlert(
    {
      type,
      severity: 'critical',
      title,
      message,
      context,
      timestamp: new Date().toISOString(),
      deduplicationKey: `${type}:${title}`,
    },
    env
  );
}

/**
 * Send an error alert
 */
export async function alertError(
  type: AlertType,
  title: string,
  message: string,
  env: Env,
  context?: Record<string, unknown>
): Promise<boolean> {
  return sendAlert(
    {
      type,
      severity: 'error',
      title,
      message,
      context,
      timestamp: new Date().toISOString(),
      deduplicationKey: `${type}:${title}`,
    },
    env
  );
}

/**
 * Send a warning alert
 */
export async function alertWarning(
  type: AlertType,
  title: string,
  message: string,
  env: Env,
  context?: Record<string, unknown>
): Promise<boolean> {
  return sendAlert(
    {
      type,
      severity: 'warning',
      title,
      message,
      context,
      timestamp: new Date().toISOString(),
      deduplicationKey: `${type}:${title}`,
    },
    env
  );
}

/**
 * Send an info alert
 */
export async function alertInfo(
  type: AlertType,
  title: string,
  message: string,
  env: Env,
  context?: Record<string, unknown>
): Promise<boolean> {
  return sendAlert(
    {
      type,
      severity: 'info',
      title,
      message,
      context,
      timestamp: new Date().toISOString(),
    },
    env,
    { minSeverity: 'info' } // Override to allow info-level alerts
  );
}

// ==================
// ERROR ALERTING
// ==================

/**
 * Alert on a caught error
 */
export async function alertOnError(
  error: Error | unknown,
  type: AlertType,
  title: string,
  env: Env,
  context?: Record<string, unknown>
): Promise<boolean> {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  return alertError(type, title, errorObj.message, env, {
    ...context,
    errorName: errorObj.name,
    stack: errorObj.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
  });
}

// ==================
// HEALTH CHECK ALERTS
// ==================

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
  details?: Record<string, unknown>;
}

/**
 * Alert on health check failure
 */
export async function alertHealthCheckFailure(
  health: HealthStatus,
  env: Env
): Promise<boolean> {
  const severity: AlertSeverity = health.status === 'unhealthy' ? 'critical' : 'warning';

  return sendAlert(
    {
      type: 'health_check_failure',
      severity,
      title: `Health Check Failed: ${health.service}`,
      message: `Service ${health.service} is ${health.status}`,
      context: {
        service: health.service,
        status: health.status,
        lastCheck: health.lastCheck,
        ...health.details,
      },
      timestamp: new Date().toISOString(),
      deduplicationKey: `health:${health.service}:${health.status}`,
    },
    env
  );
}

// ==================
// INTEGRITY ALERTS
// ==================

/**
 * Alert on data integrity issues
 */
export async function alertIntegrityIssue(
  issueCount: number,
  criticalCount: number,
  summary: string,
  env: Env
): Promise<boolean> {
  const severity: AlertSeverity = criticalCount > 0 ? 'critical' : issueCount > 10 ? 'error' : 'warning';

  return sendAlert(
    {
      type: 'integrity_issue',
      severity,
      title: `Data Integrity Issues Detected`,
      message: summary,
      context: {
        totalIssues: issueCount,
        criticalIssues: criticalCount,
      },
      timestamp: new Date().toISOString(),
      deduplicationKey: `integrity:${issueCount}:${criticalCount}`,
    },
    env
  );
}

// ==================
// PERFORMANCE ALERTS
// ==================

/**
 * Alert on performance degradation
 */
export async function alertPerformanceDegradation(
  metric: string,
  currentValue: number,
  threshold: number,
  unit: string,
  env: Env
): Promise<boolean> {
  const ratio = currentValue / threshold;
  const severity: AlertSeverity = ratio > 2 ? 'critical' : ratio > 1.5 ? 'error' : 'warning';

  return sendAlert(
    {
      type: 'performance_degradation',
      severity,
      title: `Performance Degradation: ${metric}`,
      message: `${metric} is ${currentValue}${unit} (threshold: ${threshold}${unit})`,
      context: {
        metric,
        currentValue,
        threshold,
        unit,
        ratio: ratio.toFixed(2),
      },
      timestamp: new Date().toISOString(),
      deduplicationKey: `perf:${metric}`,
    },
    env
  );
}

// ==================
// EMAIL SENDING ALERTS
// ==================

/**
 * Alert on email sending failures
 */
export async function alertEmailSendingFailure(
  recipientEmail: string,
  error: string,
  inboxId: string,
  env: Env
): Promise<boolean> {
  // Mask email for privacy
  const maskedEmail = recipientEmail.replace(/(.{2}).*@/, '$1***@');

  return alertError(
    'email_sending_failure',
    'Email Sending Failed',
    `Failed to send email to ${maskedEmail}: ${error}`,
    env,
    {
      recipientEmail: maskedEmail,
      inboxId,
      error,
    }
  );
}

/**
 * Alert when all email inboxes are unhealthy
 */
export async function alertAllInboxesUnhealthy(env: Env): Promise<boolean> {
  return alertCritical(
    'email_sending_failure',
    'All Email Inboxes Unhealthy',
    'No healthy SMTP inboxes available. Email sending is blocked.',
    env
  );
}

// ==================
// AI PROVIDER ALERTS
// ==================

/**
 * Alert on AI provider failure
 */
export async function alertAIProviderFailure(
  provider: string,
  error: string,
  env: Env
): Promise<boolean> {
  return alertError(
    'ai_provider_failure',
    `AI Provider Failed: ${provider}`,
    `${provider} API returned an error: ${error}`,
    env,
    { provider, error }
  );
}

/**
 * Alert when circuit breaker opens for AI provider
 */
export async function alertCircuitBreakerOpen(
  provider: string,
  failureCount: number,
  env: Env
): Promise<boolean> {
  return alertWarning(
    'ai_provider_failure',
    `Circuit Breaker Open: ${provider}`,
    `${provider} circuit breaker opened after ${failureCount} failures. Using fallback.`,
    env,
    { provider, failureCount }
  );
}
