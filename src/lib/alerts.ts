import { logger } from './logger';

/**
 * Alert system for critical events
 * Sends notifications via webhook (Slack, Discord, etc.)
 */

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export type AlertType =
  | 'cron_failure'
  | 'high_bounce_rate'
  | 'rate_limit_exceeded'
  | 'email_send_failure'
  | 'enrichment_failure'
  | 'reply_received'
  | 'meeting_booked'
  | 'prospect_won';

interface AlertPayload {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send alert via webhook
 */
export async function sendAlert(payload: AlertPayload): Promise<boolean> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.debug({ payload }, 'Alert webhook not configured, skipping');
    return false;
  }

  try {
    // Format for Slack (also works with Discord)
    const slackPayload = {
      text: `${getSeverityEmoji(payload.severity)} *${payload.title}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${getSeverityEmoji(payload.severity)} ${payload.title}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: payload.message,
          },
        },
        ...(payload.metadata
          ? [
              {
                type: 'section',
                fields: Object.entries(payload.metadata).map(([key, value]) => ({
                  type: 'mrkdwn',
                  text: `*${key}:* ${String(value)}`,
                })),
              },
            ]
          : []),
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Type: ${payload.type} | Severity: ${payload.severity} | ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Alert webhook failed');
      return false;
    }

    logger.info({ type: payload.type, severity: payload.severity }, 'Alert sent');
    return true;
  } catch (err) {
    logger.error({ error: err }, 'Failed to send alert');
    return false;
  }
}

function getSeverityEmoji(severity: AlertSeverity): string {
  switch (severity) {
    case 'info':
      return 'ℹ️';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    case 'critical':
      return '🚨';
  }
}

// Pre-built alert helpers

/**
 * Alert for cron job failures
 */
export async function alertCronFailure(
  cronName: string,
  error: string,
  stats?: Record<string, unknown>
): Promise<void> {
  await sendAlert({
    type: 'cron_failure',
    severity: 'error',
    title: `Cron Job Failed: ${cronName}`,
    message: error,
    metadata: stats,
  });
}

/**
 * Alert for high bounce rate
 */
export async function alertHighBounceRate(
  bounceCount: number,
  totalSent: number,
  percentage: number
): Promise<void> {
  await sendAlert({
    type: 'high_bounce_rate',
    severity: 'warning',
    title: 'High Email Bounce Rate Detected',
    message: `${bounceCount} of ${totalSent} emails bounced (${percentage.toFixed(1)}%)`,
    metadata: {
      bounceCount,
      totalSent,
      percentage: `${percentage.toFixed(1)}%`,
    },
  });
}

/**
 * Alert for rate limit exceeded
 */
export async function alertRateLimitExceeded(
  service: string,
  limit: number
): Promise<void> {
  await sendAlert({
    type: 'rate_limit_exceeded',
    severity: 'warning',
    title: `Rate Limit Exceeded: ${service}`,
    message: `Daily limit of ${limit} reached for ${service}`,
    metadata: { service, limit },
  });
}

/**
 * Alert for reply received (positive notification)
 */
export async function alertReplyReceived(
  prospectName: string,
  sentiment: string,
  replyType: string
): Promise<void> {
  const severity: AlertSeverity = sentiment === 'positive' ? 'info' : 'warning';

  await sendAlert({
    type: 'reply_received',
    severity,
    title: `Reply Received: ${prospectName}`,
    message: `${replyType} reply from ${prospectName}`,
    metadata: { prospect: prospectName, sentiment, type: replyType },
  });
}

/**
 * Alert for meeting booked (positive notification)
 */
export async function alertMeetingBooked(
  prospectName: string,
  meetingDetails?: string
): Promise<void> {
  await sendAlert({
    type: 'meeting_booked',
    severity: 'info',
    title: `Meeting Booked: ${prospectName}`,
    message: meetingDetails || `Meeting scheduled with ${prospectName}`,
    metadata: { prospect: prospectName },
  });
}

/**
 * Alert for prospect won (positive notification)
 */
export async function alertProspectWon(
  prospectName: string,
  value?: number
): Promise<void> {
  await sendAlert({
    type: 'prospect_won',
    severity: 'info',
    title: `Deal Won: ${prospectName}`,
    message: `${prospectName} marked as won!`,
    metadata: value ? { prospect: prospectName, value: `$${value}` } : { prospect: prospectName },
  });
}

/**
 * Check bounce rate and alert if high
 */
export async function checkAndAlertBounceRate(
  bounceCount: number,
  totalSent: number,
  threshold = 5 // Alert if > 5% bounce rate
): Promise<void> {
  if (totalSent < 10) return; // Not enough data

  const percentage = (bounceCount / totalSent) * 100;
  if (percentage > threshold) {
    await alertHighBounceRate(bounceCount, totalSent, percentage);
  }
}
