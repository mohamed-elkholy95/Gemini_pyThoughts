// Prometheus Metrics Middleware
// Exposes application metrics for monitoring

import type { Context, Next } from 'hono';

// Metrics storage
const metrics = {
  httpRequestsTotal: new Map<string, number>(),
  httpRequestDurationMs: new Map<string, number[]>(),
  httpRequestsInFlight: 0,
  dbQueryTotal: 0,
  dbQueryErrors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  activeConnections: 0,
  errorCount: new Map<string, number>(),
};

// Record HTTP request
export function recordHttpRequest(method: string, path: string, status: number, duration: number) {
  const key = `${method}_${path}_${status}`;
  metrics.httpRequestsTotal.set(key, (metrics.httpRequestsTotal.get(key) || 0) + 1);

  const durationKey = `${method}_${path}`;
  const durations = metrics.httpRequestDurationMs.get(durationKey) || [];
  durations.push(duration);
  // Keep last 1000 samples
  if (durations.length > 1000) durations.shift();
  metrics.httpRequestDurationMs.set(durationKey, durations);
}

// Record database query
export function recordDbQuery(success: boolean) {
  metrics.dbQueryTotal++;
  if (!success) metrics.dbQueryErrors++;
}

// Record cache operation
export function recordCacheOperation(hit: boolean) {
  if (hit) metrics.cacheHits++;
  else metrics.cacheMisses++;
}

// Record error
export function recordError(type: string) {
  metrics.errorCount.set(type, (metrics.errorCount.get(type) || 0) + 1);
}

// Metrics middleware
export function metricsMiddleware() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    metrics.httpRequestsInFlight++;

    try {
      await next();
    } finally {
      metrics.httpRequestsInFlight--;
      const duration = Date.now() - start;
      const path = normalizePath(c.req.path);
      recordHttpRequest(c.req.method, path, c.res.status, duration);
    }
  };
}

// Normalize path to reduce cardinality
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[^/]+@[^/]+/g, '/:email');
}

// Calculate percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Generate Prometheus metrics output
export function generateMetrics(): string {
  const lines: string[] = [];

  // HTTP requests total
  lines.push('# HELP http_requests_total Total number of HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [key, count] of metrics.httpRequestsTotal) {
    const [method, path, status] = key.split('_');
    lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
  }

  // HTTP request duration
  lines.push('# HELP http_request_duration_ms HTTP request duration in milliseconds');
  lines.push('# TYPE http_request_duration_ms summary');
  for (const [key, durations] of metrics.httpRequestDurationMs) {
    const [method, path] = key.split('_');
    if (durations.length > 0) {
      lines.push(`http_request_duration_ms{method="${method}",path="${path}",quantile="0.5"} ${percentile(durations, 50)}`);
      lines.push(`http_request_duration_ms{method="${method}",path="${path}",quantile="0.9"} ${percentile(durations, 90)}`);
      lines.push(`http_request_duration_ms{method="${method}",path="${path}",quantile="0.99"} ${percentile(durations, 99)}`);
      lines.push(`http_request_duration_ms_sum{method="${method}",path="${path}"} ${durations.reduce((a, b) => a + b, 0)}`);
      lines.push(`http_request_duration_ms_count{method="${method}",path="${path}"} ${durations.length}`);
    }
  }

  // HTTP requests in flight
  lines.push('# HELP http_requests_in_flight Current number of HTTP requests being processed');
  lines.push('# TYPE http_requests_in_flight gauge');
  lines.push(`http_requests_in_flight ${metrics.httpRequestsInFlight}`);

  // Database queries
  lines.push('# HELP db_queries_total Total number of database queries');
  lines.push('# TYPE db_queries_total counter');
  lines.push(`db_queries_total ${metrics.dbQueryTotal}`);
  lines.push('# HELP db_query_errors_total Total number of database query errors');
  lines.push('# TYPE db_query_errors_total counter');
  lines.push(`db_query_errors_total ${metrics.dbQueryErrors}`);

  // Cache operations
  lines.push('# HELP cache_hits_total Total number of cache hits');
  lines.push('# TYPE cache_hits_total counter');
  lines.push(`cache_hits_total ${metrics.cacheHits}`);
  lines.push('# HELP cache_misses_total Total number of cache misses');
  lines.push('# TYPE cache_misses_total counter');
  lines.push(`cache_misses_total ${metrics.cacheMisses}`);

  // Cache hit ratio
  const totalCacheOps = metrics.cacheHits + metrics.cacheMisses;
  const hitRatio = totalCacheOps > 0 ? metrics.cacheHits / totalCacheOps : 0;
  lines.push('# HELP cache_hit_ratio Cache hit ratio');
  lines.push('# TYPE cache_hit_ratio gauge');
  lines.push(`cache_hit_ratio ${hitRatio.toFixed(4)}`);

  // Errors by type
  lines.push('# HELP errors_total Total number of errors by type');
  lines.push('# TYPE errors_total counter');
  for (const [type, count] of metrics.errorCount) {
    lines.push(`errors_total{type="${type}"} ${count}`);
  }

  // Process metrics
  const memUsage = process.memoryUsage();
  lines.push('# HELP process_memory_heap_bytes Process heap memory usage');
  lines.push('# TYPE process_memory_heap_bytes gauge');
  lines.push(`process_memory_heap_bytes ${memUsage.heapUsed}`);

  lines.push('# HELP process_memory_rss_bytes Process RSS memory');
  lines.push('# TYPE process_memory_rss_bytes gauge');
  lines.push(`process_memory_rss_bytes ${memUsage.rss}`);

  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${Math.floor(process.uptime())}`);

  return lines.join('\n');
}

// Metrics endpoint handler
export function metricsHandler(c: Context) {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.text(generateMetrics());
}
