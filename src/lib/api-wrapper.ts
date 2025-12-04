import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from './logger';
import { errors, ApiErrorResponse } from './api-response';
import { ValidationError } from './validation';

/**
 * Comprehensive API wrapper with:
 * - Error handling
 * - Input validation
 * - Request timeouts
 * - Request ID tracking
 * - Structured logging
 */

export interface ApiContext<TBody = unknown, TParams = unknown> {
  req: NextRequest;
  body: TBody;
  params: TParams;
  requestId: string;
  startTime: number;
}

export interface ApiHandlerOptions<TBody, TParams> {
  bodySchema?: z.ZodType<TBody>;
  paramsSchema?: z.ZodType<TParams>;
  timeout?: number; // ms, default 55000 (55s for Vercel)
  requireAuth?: boolean;
}

type ApiHandler<TBody, TParams, TResponse> = (
  ctx: ApiContext<TBody, TParams>
) => Promise<NextResponse<TResponse>>;

/**
 * Wrap API route handler with standardized error handling, validation, and timeouts
 */
export function withApi<TBody = unknown, TParams = unknown, TResponse = unknown>(
  handler: ApiHandler<TBody, TParams, TResponse>,
  options: ApiHandlerOptions<TBody, TParams> = {}
) {
  const { bodySchema, paramsSchema, timeout = 55000 } = options;

  return async (
    req: NextRequest,
    routeParams?: { params: Record<string, string> }
  ): Promise<NextResponse<TResponse | ApiErrorResponse>> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const startTime = Date.now();

    // Add request ID to logs
    logger.info({
      requestId,
      method: req.method,
      url: req.url,
    }, 'API request started');

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(`Request timeout after ${timeout}ms`));
        }, timeout);
      });

      // Parse and validate body
      let body: TBody = undefined as TBody;
      if (bodySchema && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        try {
          const rawBody = await req.json();
          body = bodySchema.parse(rawBody);
        } catch (err) {
          if (err instanceof z.ZodError) {
            const messages = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
            return errors.badRequest(`Validation error: ${messages.join(', ')}`);
          }
          return errors.badRequest('Invalid JSON in request body');
        }
      }

      // Parse URL params
      let params: TParams = undefined as TParams;
      if (paramsSchema) {
        try {
          const searchParams: Record<string, string> = {};
          req.nextUrl.searchParams.forEach((value, key) => {
            searchParams[key] = value;
          });
          // Merge route params if provided
          if (routeParams?.params) {
            Object.assign(searchParams, routeParams.params);
          }
          params = paramsSchema.parse(searchParams);
        } catch (err) {
          if (err instanceof z.ZodError) {
            const messages = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
            return errors.badRequest(`Invalid parameters: ${messages.join(', ')}`);
          }
          throw err;
        }
      }

      // Execute handler with timeout
      const ctx: ApiContext<TBody, TParams> = {
        req,
        body,
        params,
        requestId,
        startTime,
      };

      const result = await Promise.race([
        handler(ctx),
        timeoutPromise,
      ]);

      // Log success
      const duration = Date.now() - startTime;
      logger.info({
        requestId,
        duration,
        status: 'success',
      }, 'API request completed');

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;

      // Handle specific error types
      if (err instanceof TimeoutError) {
        logger.error({ requestId, duration, error: err.message }, 'Request timeout');
        return errors.serviceUnavailable('Request timeout - please try again');
      }

      if (err instanceof ValidationError) {
        logger.warn({ requestId, duration, error: err.message }, 'Validation error');
        return errors.badRequest(err.message);
      }

      // Log unexpected errors
      logger.error({
        requestId,
        duration,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }, 'API request failed');

      return errors.internal('An unexpected error occurred');
    }
  };
}

/**
 * Custom timeout error
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Helper to wrap Promise.all with settled results handling
 * Returns successful results and logs failures
 */
export async function safePromiseAll<T>(
  promises: Promise<T>[],
  context: { requestId?: string; operation: string }
): Promise<{ results: T[]; errors: Error[] }> {
  const settled = await Promise.allSettled(promises);

  const results: T[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      errors.push(error);
      logger.warn({
        requestId: context.requestId,
        operation: context.operation,
        index: i,
        error: error.message,
      }, 'Promise in batch failed');
    }
  }

  return { results, errors };
}

/**
 * Idempotency key helper - generates a unique key for an operation
 */
export function generateIdempotencyKey(
  operation: string,
  ...identifiers: (string | number)[]
): string {
  const date = new Date().toISOString().split('T')[0];
  return `${operation}:${identifiers.join(':')}:${date}`;
}

/**
 * Check if operation was already performed using idempotency key
 */
export async function checkIdempotency(
  supabase: ReturnType<typeof import('./supabase').createServerClient>,
  key: string
): Promise<{ alreadyProcessed: boolean; result?: unknown }> {
  try {
    const { data } = await supabase
      .from('idempotency_keys')
      .select('result')
      .eq('key', key)
      .single();

    if (data) {
      return { alreadyProcessed: true, result: data.result };
    }
    return { alreadyProcessed: false };
  } catch {
    return { alreadyProcessed: false };
  }
}

/**
 * Record idempotency key after successful operation
 */
export async function recordIdempotency(
  supabase: ReturnType<typeof import('./supabase').createServerClient>,
  key: string,
  result: unknown
): Promise<void> {
  try {
    await supabase.from('idempotency_keys').upsert({
      key,
      result,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h TTL
    });
  } catch (err) {
    logger.warn({ key, error: err }, 'Failed to record idempotency key');
  }
}
