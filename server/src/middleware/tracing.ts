import { Context, Next } from 'hono';
import { nanoid } from 'nanoid';
import { logger } from '../config/logger.js';

// Tracing context type
export type TracingContext = {
  Variables: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    requestStart: number;
  };
};

// HTTP headers for tracing propagation
const TRACE_HEADERS = {
  traceId: 'X-Trace-ID',
  spanId: 'X-Span-ID',
  parentSpanId: 'X-Parent-Span-ID',
  requestId: 'X-Request-ID',
};

// Generate trace ID (use incoming or create new)
function generateTraceId(c: Context): string {
  return (
    c.req.header(TRACE_HEADERS.traceId) ||
    c.req.header(TRACE_HEADERS.requestId) ||
    nanoid(21)
  );
}

// Generate span ID
function generateSpanId(): string {
  return nanoid(16);
}

// Tracing middleware
export async function tracingMiddleware(c: Context<TracingContext>, next: Next) {
  const traceId = generateTraceId(c);
  const spanId = generateSpanId();
  const parentSpanId = c.req.header(TRACE_HEADERS.parentSpanId);
  const requestStart = Date.now();

  // Set tracing context
  c.set('traceId', traceId);
  c.set('spanId', spanId);
  if (parentSpanId) {
    c.set('parentSpanId', parentSpanId);
  }
  c.set('requestStart', requestStart);

  // Add tracing headers to response
  c.header(TRACE_HEADERS.traceId, traceId);
  c.header(TRACE_HEADERS.spanId, spanId);

  // Log request start
  logger.info({
    traceId,
    spanId,
    parentSpanId,
    method: c.req.method,
    path: c.req.path,
    query: c.req.query(),
    userAgent: c.req.header('User-Agent'),
    ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
  }, 'Request started');

  try {
    await next();

    // Log request completion
    const duration = Date.now() - requestStart;
    logger.info({
      traceId,
      spanId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    }, 'Request completed');
  } catch (error) {
    // Log error with tracing context
    const duration = Date.now() - requestStart;
    logger.error({
      traceId,
      spanId,
      method: c.req.method,
      path: c.req.path,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    }, 'Request failed');

    throw error;
  }
}

// Helper to get trace context from current request
export function getTraceContext(c: Context<TracingContext>) {
  return {
    traceId: c.get('traceId'),
    spanId: c.get('spanId'),
    parentSpanId: c.get('parentSpanId'),
  };
}

// Create child span for tracing sub-operations
export function createChildSpan(c: Context<TracingContext>) {
  return {
    traceId: c.get('traceId'),
    spanId: generateSpanId(),
    parentSpanId: c.get('spanId'),
  };
}

// Trace decorator for async functions
export function trace(operationName: string) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const spanId = generateSpanId();
      const startTime = Date.now();

      logger.debug({ operationName, spanId }, 'Operation started');

      try {
        const result = await originalMethod.apply(this, args);

        logger.debug({
          operationName,
          spanId,
          duration: Date.now() - startTime,
        }, 'Operation completed');

        return result;
      } catch (error) {
        logger.error({
          operationName,
          spanId,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Operation failed');

        throw error;
      }
    } as T;

    return descriptor;
  };
}

// Simple span tracking for manual tracing
export class Span {
  private traceId: string;
  private spanId: string;
  private parentSpanId?: string;
  private operationName: string;
  private startTime: number;
  private tags: Record<string, unknown> = {};

  constructor(operationName: string, parentSpan?: Span) {
    this.operationName = operationName;
    this.traceId = parentSpan?.traceId || nanoid(21);
    this.spanId = generateSpanId();
    this.parentSpanId = parentSpan?.spanId;
    this.startTime = Date.now();

    logger.debug({
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      operationName,
    }, 'Span started');
  }

  setTag(key: string, value: unknown): this {
    this.tags[key] = value;
    return this;
  }

  log(event: string, data?: Record<string, unknown>): this {
    logger.debug({
      traceId: this.traceId,
      spanId: this.spanId,
      operationName: this.operationName,
      event,
      ...data,
    }, 'Span log');
    return this;
  }

  finish(error?: Error): void {
    const duration = Date.now() - this.startTime;

    if (error) {
      logger.error({
        traceId: this.traceId,
        spanId: this.spanId,
        operationName: this.operationName,
        duration,
        tags: this.tags,
        error: error.message,
      }, 'Span failed');
    } else {
      logger.debug({
        traceId: this.traceId,
        spanId: this.spanId,
        operationName: this.operationName,
        duration,
        tags: this.tags,
      }, 'Span finished');
    }
  }

  createChild(operationName: string): Span {
    return new Span(operationName, this);
  }
}

// Context propagation for external HTTP calls
export function getTracingHeaders(c: Context<TracingContext>): Record<string, string> {
  return {
    [TRACE_HEADERS.traceId]: c.get('traceId'),
    [TRACE_HEADERS.spanId]: generateSpanId(),
    [TRACE_HEADERS.parentSpanId]: c.get('spanId'),
  };
}
