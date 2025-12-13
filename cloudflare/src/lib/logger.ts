/**
 * Structured Logging System
 *
 * Provides consistent, JSON-structured logging with:
 * - Log levels (debug, info, warn, error)
 * - Request/trace context propagation
 * - Error serialization
 * - Performance timing
 * - Child loggers with inherited context
 */

// ==================
// TYPES
// ==================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

export interface LogContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  service?: string;
  operation?: string;
  prospectId?: string;
  campaignId?: string;
  emailId?: string;
  inboxId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  duration?: number;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
  child(context: LogContext): Logger;
  time<T>(operation: string, fn: () => T, context?: LogContext): T;
  timeAsync<T>(operation: string, fn: () => Promise<T>, context?: LogContext): Promise<T>;
}

// ==================
// IMPLEMENTATION
// ==================

export class StructuredLogger implements Logger {
  private readonly level: LogLevel;
  private readonly baseContext: LogContext;

  constructor(level: LogLevel = LogLevel.INFO, baseContext: LogContext = {}) {
    this.level = level;
    this.baseContext = baseContext;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatError(error: Error | unknown): LogEntry['error'] {
    if (error instanceof Error) {
      // Check for custom error properties (from our BaseError class)
      const code = (error as { code?: string }).code;

      return {
        name: error.name,
        message: error.message,
        code,
        stack: error.stack,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error | unknown,
    duration?: number
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.baseContext, ...context },
    };

    if (error) {
      entry.error = this.formatError(error);
    }
    if (duration !== undefined) {
      entry.duration = duration;
    }

    // Remove undefined values from context
    if (entry.context) {
      entry.context = Object.fromEntries(
        Object.entries(entry.context).filter(([, v]) => v !== undefined)
      );
      if (Object.keys(entry.context).length === 0) {
        delete entry.context;
      }
    }

    // Output as JSON
    console.log(JSON.stringify(entry));
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new StructuredLogger(this.level, {
      ...this.baseContext,
      ...context,
    });
  }

  /**
   * Time a synchronous operation
   */
  time<T>(operation: string, fn: () => T, context?: LogContext): T {
    const start = Date.now();
    try {
      const result = fn();
      this.log(LogLevel.DEBUG, `${operation} completed`, context, undefined, Date.now() - start);
      return result;
    } catch (error) {
      this.log(LogLevel.ERROR, `${operation} failed`, context, error, Date.now() - start);
      throw error;
    }
  }

  /**
   * Time an async operation
   */
  async timeAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.log(LogLevel.DEBUG, `${operation} completed`, context, undefined, Date.now() - start);
      return result;
    } catch (error) {
      this.log(LogLevel.ERROR, `${operation} failed`, context, error, Date.now() - start);
      throw error;
    }
  }
}

// ==================
// FACTORY FUNCTIONS
// ==================

/**
 * Create a logger for a specific service
 */
export function createLogger(
  service: string,
  level: LogLevel = LogLevel.INFO
): Logger {
  return new StructuredLogger(level, { service });
}

/**
 * Create a logger from request context
 */
export function createRequestLogger(
  service: string,
  requestId?: string,
  level: LogLevel = LogLevel.INFO
): Logger {
  return new StructuredLogger(level, { service, requestId });
}

// ==================
// DEFAULT LOGGERS
// ==================

// Pre-configured loggers for common services
export const loggers = {
  api: createLogger('api'),
  cron: createLogger('cron'),
  enrichment: createLogger('enrichment'),
  emailSender: createLogger('email-sender'),
  emailComposer: createLogger('email-composer'),
  sync: createLogger('sync'),
  integrity: createLogger('integrity'),
};

// ==================
// HELPER FUNCTIONS
// ==================

/**
 * Parse log level from string (e.g., from environment variable)
 */
export function parseLogLevel(level: string | undefined): LogLevel {
  const normalized = level?.toLowerCase();
  switch (normalized) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'info':
    default:
      return LogLevel.INFO;
  }
}

/**
 * Redact sensitive fields from log context
 */
export function redactSensitive(
  context: Record<string, unknown>
): Record<string, unknown> {
  const sensitiveFields = [
    'password',
    'apiKey',
    'api_key',
    'secret',
    'token',
    'authorization',
    'cookie',
  ];

  const redacted = { ...context };

  for (const field of sensitiveFields) {
    if (field in redacted) {
      redacted[field] = '[REDACTED]';
    }
  }

  return redacted;
}

/**
 * Create a span ID for tracing
 */
export function createSpanId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Create a trace ID (longer than span ID)
 */
export function createTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

// ==================
// SPAN TRACKING
// ==================

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  attributes: Record<string, unknown>;
}

/**
 * Simple span tracker for timing operations
 */
export class SpanTracker {
  private readonly logger: Logger;
  private readonly traceId: string;
  private readonly spans: Map<string, Span> = new Map();

  constructor(logger: Logger, traceId?: string) {
    this.logger = logger;
    this.traceId = traceId || createTraceId();
  }

  /**
   * Start a new span
   */
  startSpan(
    operation: string,
    parentSpanId?: string,
    attributes: Record<string, unknown> = {}
  ): Span {
    const span: Span = {
      spanId: createSpanId(),
      traceId: this.traceId,
      parentSpanId,
      operation,
      startTime: Date.now(),
      attributes,
    };

    this.spans.set(span.spanId, span);

    this.logger.debug(`Span started: ${operation}`, {
      traceId: this.traceId,
      spanId: span.spanId,
      parentSpanId,
      ...attributes,
    });

    return span;
  }

  /**
   * End a span and log its duration
   */
  endSpan(
    spanId: string,
    success: boolean = true,
    attributes: Record<string, unknown> = {}
  ): void {
    const span = this.spans.get(spanId);
    if (!span) {
      this.logger.warn(`Span not found: ${spanId}`);
      return;
    }

    const duration = Date.now() - span.startTime;

    const logMethod = success ? 'info' : 'error';
    (this.logger[logMethod] as Logger['info'])(`Span ended: ${span.operation}`, {
      traceId: this.traceId,
      spanId,
      parentSpanId: span.parentSpanId,
      duration,
      success,
      ...span.attributes,
      ...attributes,
    });

    this.spans.delete(spanId);
  }

  /**
   * Get the trace ID
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Run a function within a span
   */
  async withSpan<T>(
    operation: string,
    fn: (span: Span) => Promise<T>,
    parentSpanId?: string,
    attributes: Record<string, unknown> = {}
  ): Promise<T> {
    const span = this.startSpan(operation, parentSpanId, attributes);
    try {
      const result = await fn(span);
      this.endSpan(span.spanId, true);
      return result;
    } catch (error) {
      this.endSpan(span.spanId, false, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
