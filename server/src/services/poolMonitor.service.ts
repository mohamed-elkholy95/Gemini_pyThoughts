// Database Connection Pool Monitor
// Tracks connection pool health, metrics, and provides alerting

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../config/logger.js';
import { EventEmitter } from 'events';

export interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  maxConnections: number;
  utilizationPercent: number;
  avgQueryTime: number;
  slowQueries: number;
  failedQueries: number;
  timestamp: Date;
}

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface PoolAlert {
  type: 'high_utilization' | 'connection_exhausted' | 'slow_queries' | 'high_error_rate';
  message: string;
  severity: 'warning' | 'critical';
  timestamp: Date;
  metrics: Partial<PoolMetrics>;
}

// Thresholds for alerting
const ALERT_THRESHOLDS = {
  utilizationWarning: 70,
  utilizationCritical: 90,
  slowQueryMs: 1000,
  errorRateWarning: 0.05,
  errorRateCritical: 0.1,
};

class ConnectionPoolMonitor extends EventEmitter {
  private queryHistory: QueryMetrics[] = [];
  private maxHistorySize = 1000;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  // Metrics aggregation
  private totalQueries = 0;
  private failedQueries = 0;
  private totalQueryTime = 0;
  private slowQueryCount = 0;

  constructor() {
    super();
    this.setMaxListeners(20);
  }

  // Start monitoring
  start(intervalMs = 30000): void {
    if (this.isMonitoring) {
      logger.warn('Pool monitor already running');
      return;
    }

    this.isMonitoring = true;
    logger.info({ interval: intervalMs }, 'Starting connection pool monitoring');

    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.checkThresholds(metrics);
        this.emit('metrics', metrics);
      } catch (error) {
        logger.error({ error }, 'Error collecting pool metrics');
      }
    }, intervalMs);

    // Initial collection
    this.collectMetrics().then((metrics) => {
      this.emit('metrics', metrics);
    });
  }

  // Stop monitoring
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Connection pool monitoring stopped');
  }

  // Record a query execution
  recordQuery(query: string, duration: number, success: boolean, error?: string): void {
    const metrics: QueryMetrics = {
      query: this.sanitizeQuery(query),
      duration,
      timestamp: new Date(),
      success,
      error,
    };

    this.queryHistory.push(metrics);
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift();
    }

    this.totalQueries++;
    this.totalQueryTime += duration;

    if (!success) {
      this.failedQueries++;
    }

    if (duration > ALERT_THRESHOLDS.slowQueryMs) {
      this.slowQueryCount++;
      this.emit('slowQuery', metrics);
      logger.warn({ query: metrics.query, duration }, 'Slow query detected');
    }
  }

  // Collect current metrics
  async collectMetrics(): Promise<PoolMetrics> {
    try {
      // Query PostgreSQL for connection stats
      const result = await db.execute(sql`
        SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as total_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') as active_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle') as idle_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
      `);

      const row = (result as unknown as Record<string, unknown>[])[0] || {};
      const totalConnections = Number(row.total_connections) || 0;
      const activeConnections = Number(row.active_connections) || 0;
      const idleConnections = Number(row.idle_connections) || 0;
      const maxConnections = Number(row.max_connections) || 100;

      const utilizationPercent = (totalConnections / maxConnections) * 100;
      const avgQueryTime = this.totalQueries > 0 ? this.totalQueryTime / this.totalQueries : 0;

      return {
        totalConnections,
        activeConnections,
        idleConnections,
        waitingRequests: 0, // Would need connection pool library-specific API
        maxConnections,
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        avgQueryTime: Math.round(avgQueryTime * 100) / 100,
        slowQueries: this.slowQueryCount,
        failedQueries: this.failedQueries,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to collect pool metrics');
      throw error;
    }
  }

  // Check thresholds and emit alerts
  private checkThresholds(metrics: PoolMetrics): void {
    // High utilization
    if (metrics.utilizationPercent >= ALERT_THRESHOLDS.utilizationCritical) {
      this.emitAlert({
        type: 'high_utilization',
        message: `Connection pool utilization critical: ${metrics.utilizationPercent}%`,
        severity: 'critical',
        timestamp: new Date(),
        metrics,
      });
    } else if (metrics.utilizationPercent >= ALERT_THRESHOLDS.utilizationWarning) {
      this.emitAlert({
        type: 'high_utilization',
        message: `Connection pool utilization warning: ${metrics.utilizationPercent}%`,
        severity: 'warning',
        timestamp: new Date(),
        metrics,
      });
    }

    // Connection exhausted
    if (metrics.totalConnections >= metrics.maxConnections - 5) {
      this.emitAlert({
        type: 'connection_exhausted',
        message: `Connection pool near exhaustion: ${metrics.totalConnections}/${metrics.maxConnections}`,
        severity: 'critical',
        timestamp: new Date(),
        metrics,
      });
    }

    // Error rate
    const errorRate = this.totalQueries > 0 ? this.failedQueries / this.totalQueries : 0;
    if (errorRate >= ALERT_THRESHOLDS.errorRateCritical) {
      this.emitAlert({
        type: 'high_error_rate',
        message: `Query error rate critical: ${(errorRate * 100).toFixed(2)}%`,
        severity: 'critical',
        timestamp: new Date(),
        metrics: { failedQueries: this.failedQueries },
      });
    } else if (errorRate >= ALERT_THRESHOLDS.errorRateWarning) {
      this.emitAlert({
        type: 'high_error_rate',
        message: `Query error rate warning: ${(errorRate * 100).toFixed(2)}%`,
        severity: 'warning',
        timestamp: new Date(),
        metrics: { failedQueries: this.failedQueries },
      });
    }
  }

  // Emit alert
  private emitAlert(alert: PoolAlert): void {
    this.emit('alert', alert);
    logger.warn({ alert }, 'Pool alert triggered');
  }

  // Get recent queries
  getRecentQueries(limit = 100): QueryMetrics[] {
    return this.queryHistory.slice(-limit);
  }

  // Get slow queries
  getSlowQueries(thresholdMs = ALERT_THRESHOLDS.slowQueryMs): QueryMetrics[] {
    return this.queryHistory.filter((q) => q.duration >= thresholdMs);
  }

  // Get failed queries
  getFailedQueries(): QueryMetrics[] {
    return this.queryHistory.filter((q) => !q.success);
  }

  // Get statistics
  getStats(): {
    totalQueries: number;
    failedQueries: number;
    slowQueries: number;
    avgQueryTime: number;
    errorRate: number;
  } {
    const errorRate = this.totalQueries > 0 ? this.failedQueries / this.totalQueries : 0;
    const avgQueryTime = this.totalQueries > 0 ? this.totalQueryTime / this.totalQueries : 0;

    return {
      totalQueries: this.totalQueries,
      failedQueries: this.failedQueries,
      slowQueries: this.slowQueryCount,
      avgQueryTime: Math.round(avgQueryTime * 100) / 100,
      errorRate: Math.round(errorRate * 10000) / 10000,
    };
  }

  // Reset statistics
  resetStats(): void {
    this.totalQueries = 0;
    this.failedQueries = 0;
    this.totalQueryTime = 0;
    this.slowQueryCount = 0;
    this.queryHistory = [];
  }

  // Sanitize query for logging (remove sensitive data)
  private sanitizeQuery(query: string): string {
    // Truncate long queries
    const maxLength = 500;
    let sanitized = query.length > maxLength ? query.substring(0, maxLength) + '...' : query;

    // Remove potential sensitive values
    sanitized = sanitized.replace(/password\s*=\s*'[^']*'/gi, "password='***'");
    sanitized = sanitized.replace(/token\s*=\s*'[^']*'/gi, "token='***'");
    sanitized = sanitized.replace(/secret\s*=\s*'[^']*'/gi, "secret='***'");

    return sanitized;
  }
}

// Singleton instance
export const poolMonitor = new ConnectionPoolMonitor();

// Query wrapper for automatic monitoring
export async function monitoredQuery<T>(
  queryFn: () => Promise<T>,
  queryDescription = 'unknown'
): Promise<T> {
  const startTime = Date.now();
  let success = true;
  let error: string | undefined;

  try {
    const result = await queryFn();
    return result;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    poolMonitor.recordQuery(queryDescription, duration, success, error);
  }
}
