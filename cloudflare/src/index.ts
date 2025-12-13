/**
 * Jengu CRM - Cloudflare Workers Entry Point
 * Production Architecture
 *
 * Handles:
 * - HTTP API endpoints
 * - CRON triggers for email sending
 * - Email Routing for inbound emails (no IMAP needed)
 * - Durable Objects for state management
 */

import { Env } from './types';
import { handleAPI } from './workers/api';
import { handleCron } from './workers/cron';
import { handleEmail } from './workers/email-handler';
import { createRequestContext, error } from './lib/request-context';
import { ErrorCodes } from './lib/contracts';
import { isAppError, wrapError } from './lib/errors';
import { createRequestLogger, LogLevel } from './lib/logger';

// Export Durable Objects
export { WarmupCounter } from './durable-objects/warmup-counter';
export { InboxState } from './durable-objects/inbox-state';
export { RateLimiter } from './durable-objects/rate-limiter';
export { ProspectDedup } from './durable-objects/prospect-dedup';

// Email message type for Cloudflare Email Routing
interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  reply(message: EmailMessage): Promise<void>;
}

export default {
  /**
   * HTTP Request Handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const reqCtx = createRequestContext(request);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
          'X-Request-Id': reqCtx.requestId,
        },
      });
    }

    const logger = createRequestLogger('api', reqCtx.requestId, LogLevel.INFO);

    try {
      const response = await handleAPI(request, env, ctx, reqCtx);

      // Add CORS and request ID headers
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('X-Request-Id', reqCtx.requestId);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      // Use structured error handling
      const appError = wrapError(err);

      logger.error('Request failed', err, {
        path: reqCtx.path,
        method: reqCtx.method,
        errorCode: isAppError(err) ? err.code : 'UNKNOWN',
      });

      // Return error response with consistent format
      if (isAppError(err)) {
        return err.toResponse(reqCtx.requestId);
      }

      return error(reqCtx, ErrorCodes.INTERNAL_ERROR, appError.message);
    }
  },

  /**
   * Scheduled CRON Handler
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleCron(event, env, ctx);
  },

  /**
   * Email Handler - Cloudflare Email Routing
   * Receives inbound emails directly at the edge
   */
  async email(message: EmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleEmail(message, env);
  },
};
