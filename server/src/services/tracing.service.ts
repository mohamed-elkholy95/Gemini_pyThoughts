// Request Tracing Service
// Provides distributed tracing and request correlation across services

import { Context, MiddlewareHandler } from 'hono';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  baggage: Record<string, string>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error';
  tags: Record<string, string | number | boolean>;
  logs: SpanLog[];
}

interface SpanLog {
  timestamp: number;
  fields: Record<string, unknown>;
}

// Storage for active spans
const activeSpans = new Map<string, Span>();
const completedSpans: Span[] = [];
const MAX_COMPLETED_SPANS = 1000;

// Headers for trace propagation
const TRACE_ID_HEADER = 'x-trace-id';
const SPAN_ID_HEADER = 'x-span-id';
const PARENT_SPAN_ID_HEADER = 'x-parent-span-id';
const SAMPLED_HEADER = 'x-sampled';
const BAGGAGE_HEADER_PREFIX = 'x-baggage-';

// Sampling rate (1.0 = 100%, 0.1 = 10%)
const DEFAULT_SAMPLE_RATE = parseFloat(process.env.TRACE_SAMPLE_RATE || '1.0');

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function shouldSample(): boolean {
  return Math.random() < DEFAULT_SAMPLE_RATE;
}

export const tracingService = {
  // Extract trace context from incoming request
  extractContext(c: Context): TraceContext {
    const traceId = c.req.header(TRACE_ID_HEADER) || generateId();
    const parentSpanId = c.req.header(SPAN_ID_HEADER);
    const sampled = c.req.header(SAMPLED_HEADER) === 'true' || shouldSample();

    // Extract baggage
    const baggage: Record<string, string> = {};
    for (const [key, value] of Object.entries(c.req.header())) {
      if (key.toLowerCase().startsWith(BAGGAGE_HEADER_PREFIX)) {
        const baggageKey = key.slice(BAGGAGE_HEADER_PREFIX.length);
        baggage[baggageKey] = value as string;
      }
    }

    return {
      traceId,
      spanId: generateId(),
      parentSpanId,
      sampled,
      baggage,
    };
  },

  // Inject trace context into outgoing request headers
  injectContext(ctx: TraceContext): Record<string, string> {
    const headers: Record<string, string> = {
      [TRACE_ID_HEADER]: ctx.traceId,
      [SPAN_ID_HEADER]: ctx.spanId,
      [SAMPLED_HEADER]: ctx.sampled.toString(),
    };

    if (ctx.parentSpanId) {
      headers[PARENT_SPAN_ID_HEADER] = ctx.parentSpanId;
    }

    for (const [key, value] of Object.entries(ctx.baggage)) {
      headers[`${BAGGAGE_HEADER_PREFIX}${key}`] = value;
    }

    return headers;
  },

  // Start a new span
  startSpan(
    operationName: string,
    ctx: TraceContext,
    tags: Record<string, string | number | boolean> = {}
  ): Span {
    const span: Span = {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: ctx.parentSpanId,
      operationName,
      serviceName: process.env.SERVICE_NAME || 'pythoughts-api',
      startTime: Date.now(),
      status: 'ok',
      tags,
      logs: [],
    };

    if (ctx.sampled) {
      activeSpans.set(span.spanId, span);
    }

    return span;
  },

  // Add a log entry to a span
  logToSpan(spanId: string, fields: Record<string, unknown>): void {
    const span = activeSpans.get(spanId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        fields,
      });
    }
  },

  // Add tags to a span
  tagSpan(spanId: string, tags: Record<string, string | number | boolean>): void {
    const span = activeSpans.get(spanId);
    if (span) {
      Object.assign(span.tags, tags);
    }
  },

  // Set span error status
  setSpanError(spanId: string, error: Error): void {
    const span = activeSpans.get(spanId);
    if (span) {
      span.status = 'error';
      span.tags['error'] = true;
      span.tags['error.message'] = error.message;
      span.tags['error.type'] = error.name;
      span.logs.push({
        timestamp: Date.now(),
        fields: {
          event: 'error',
          message: error.message,
          stack: error.stack,
        },
      });
    }
  },

  // End a span
  endSpan(spanId: string): Span | null {
    const span = activeSpans.get(spanId);
    if (!span) return null;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    activeSpans.delete(spanId);

    // Store completed span
    completedSpans.push(span);
    if (completedSpans.length > MAX_COMPLETED_SPANS) {
      completedSpans.shift();
    }

    // Log span completion
    logger.debug(
      {
        traceId: span.traceId,
        spanId: span.spanId,
        operation: span.operationName,
        duration: span.duration,
        status: span.status,
      },
      'Span completed'
    );

    return span;
  },

  // Get span by ID
  getSpan(spanId: string): Span | undefined {
    return activeSpans.get(spanId);
  },

  // Get all spans for a trace
  getTraceSpans(traceId: string): Span[] {
    const spans: Span[] = [];

    // Active spans
    for (const span of activeSpans.values()) {
      if (span.traceId === traceId) {
        spans.push(span);
      }
    }

    // Completed spans
    for (const span of completedSpans) {
      if (span.traceId === traceId) {
        spans.push(span);
      }
    }

    return spans.sort((a, b) => a.startTime - b.startTime);
  },

  // Get recent completed spans
  getRecentSpans(limit = 100): Span[] {
    return completedSpans.slice(-limit);
  },

  // Get tracing statistics
  getStats(): {
    activeSpans: number;
    completedSpans: number;
    sampleRate: number;
  } {
    return {
      activeSpans: activeSpans.size,
      completedSpans: completedSpans.length,
      sampleRate: DEFAULT_SAMPLE_RATE,
    };
  },

  // Clear all spans (for testing)
  clear(): void {
    activeSpans.clear();
    completedSpans.length = 0;
  },
};

export function getTraceContext(): TraceContext | undefined {
  // In a real implementation, use AsyncLocalStorage
  // This is a simplified version
  return undefined;
}

// Middleware for automatic request tracing
export function tracingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const ctx = tracingService.extractContext(c);

    // Start request span
    const span = tracingService.startSpan(`HTTP ${c.req.method} ${c.req.path}`, ctx, {
      'http.method': c.req.method,
      'http.url': c.req.url,
      'http.path': c.req.path,
      'http.host': c.req.header('host') || '',
      'http.user_agent': c.req.header('user-agent') || '',
    });

    // Add trace ID to response headers
    c.header(TRACE_ID_HEADER, ctx.traceId);
    c.header(SPAN_ID_HEADER, ctx.spanId);

    // Store context for access during request
    c.set('traceContext', ctx);
    c.set('span', span);

    try {
      await next();

      // Add response info to span
      tracingService.tagSpan(span.spanId, {
        'http.status_code': c.res.status,
      });

      if (c.res.status >= 400) {
        tracingService.tagSpan(span.spanId, {
          error: true,
          'error.type': c.res.status >= 500 ? 'server_error' : 'client_error',
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        tracingService.setSpanError(span.spanId, error);
      }
      throw error;
    } finally {
      tracingService.endSpan(span.spanId);
    }
  };
}

// Helper to create child span
export function createChildSpan(
  c: Context,
  operationName: string,
  tags?: Record<string, string | number | boolean>
): Span | null {
  const parentCtx = c.get('traceContext') as TraceContext | undefined;
  if (!parentCtx || !parentCtx.sampled) return null;

  const childCtx: TraceContext = {
    traceId: parentCtx.traceId,
    spanId: generateId(),
    parentSpanId: parentCtx.spanId,
    sampled: parentCtx.sampled,
    baggage: parentCtx.baggage,
  };

  return tracingService.startSpan(operationName, childCtx, tags);
}

// Decorator for tracing async functions
export function traced(operationName: string) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const ctx: TraceContext = {
        traceId: generateId(),
        spanId: generateId(),
        sampled: shouldSample(),
        baggage: {},
      };

      const span = tracingService.startSpan(operationName, ctx);

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (error) {
        if (error instanceof Error) {
          tracingService.setSpanError(span.spanId, error);
        }
        throw error;
      } finally {
        tracingService.endSpan(span.spanId);
      }
    } as T;

    return descriptor;
  };
}
