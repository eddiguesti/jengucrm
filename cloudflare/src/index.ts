/**
 * Jengu CRM - Cloudflare Workers Entry Point
 * Free Tier Architecture - Synchronous Processing
 *
 * Main worker that handles:
 * - HTTP API endpoints
 * - CRON triggers (all processing happens here)
 * - Durable Object exports
 */

import { Env } from './types';
import { handleAPI } from './workers/api';
import { handleCron } from './workers/cron';

// Export Durable Objects
export { WarmupCounter } from './durable-objects/warmup-counter';
export { InboxState } from './durable-objects/inbox-state';
export { RateLimiter } from './durable-objects/rate-limiter';
export { ProspectDedup } from './durable-objects/prospect-dedup';

export default {
  /**
   * HTTP Request Handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS headers for API
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      // Route to API handler
      const response = await handleAPI(request, env, ctx);

      // Add CORS headers
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error('Unhandled error:', error);

      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },

  /**
   * Scheduled CRON Handler
   * All processing happens synchronously within cron triggers
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleCron(event, env, ctx);
  },
};
