// Health Dashboard Service
// Comprehensive system health monitoring and reporting

import { checkDatabaseConnection } from '../db/index.js';
import { cacheService } from './cache.service.js';
import { jobQueue } from './jobQueue.service.js';
import { logger } from '../config/logger.js';
import os from 'os';

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
  lastCheck: Date;
}

export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    loadAverage: number[];
  };
  uptime: number;
  pid: number;
  nodeVersion: string;
}

export interface ApplicationMetrics {
  requestsPerMinute: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  version: string;
  environment: string;
  services: ServiceHealth[];
  system: SystemMetrics;
  application: ApplicationMetrics;
  checks: {
    database: boolean;
    cache: boolean;
    jobQueue: boolean;
  };
}

// Request tracking for metrics
const requestMetrics = {
  windowStart: Date.now(),
  requestCount: 0,
  totalResponseTime: 0,
  errorCount: 0,
  activeConnections: 0,
};

export const healthDashboardService = {
  // Track a request for metrics
  trackRequest(responseTime: number, isError: boolean): void {
    const now = Date.now();

    // Reset window every minute
    if (now - requestMetrics.windowStart > 60000) {
      requestMetrics.windowStart = now;
      requestMetrics.requestCount = 0;
      requestMetrics.totalResponseTime = 0;
      requestMetrics.errorCount = 0;
    }

    requestMetrics.requestCount++;
    requestMetrics.totalResponseTime += responseTime;
    if (isError) requestMetrics.errorCount++;
  },

  // Update active connections
  updateConnections(delta: number): void {
    requestMetrics.activeConnections += delta;
  },

  // Check database health
  async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const healthy = await checkDatabaseConnection();
      const latency = Date.now() - start;

      return {
        name: 'PostgreSQL',
        status: healthy ? 'healthy' : 'unhealthy',
        latency,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        name: 'PostgreSQL',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      };
    }
  },

  // Check cache health
  async checkCache(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const client = cacheService.getClient();
      if (!client) {
        return {
          name: 'Redis',
          status: 'unhealthy',
          message: 'Not connected',
          lastCheck: new Date(),
        };
      }

      // Ping Redis
      await client.ping();
      const latency = Date.now() - start;

      return {
        name: 'Redis',
        status: latency < 100 ? 'healthy' : 'degraded',
        latency,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        name: 'Redis',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      };
    }
  },

  // Check job queue health
  async checkJobQueue(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const stats = await jobQueue.getStats();
      const latency = Date.now() - start;

      // Degraded if too many failed jobs
      const status = stats.failed > 100 ? 'degraded' : 'healthy';

      return {
        name: 'JobQueue',
        status,
        latency,
        message: `Queued: ${stats.queued}, Processing: ${stats.processing}, Failed: ${stats.failed}`,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        name: 'JobQueue',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      };
    }
  },

  // Get system metrics
  getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();

    return {
      memory: {
        used: memUsage.heapUsed,
        total: totalMem,
        percentage: (memUsage.heapUsed / totalMem) * 100,
      },
      cpu: {
        loadAverage: os.loadavg(),
      },
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
    };
  },

  // Get application metrics
  getApplicationMetrics(): ApplicationMetrics {
    const windowDuration = (Date.now() - requestMetrics.windowStart) / 60000; // minutes
    const requestsPerMinute =
      windowDuration > 0 ? requestMetrics.requestCount / windowDuration : 0;

    const averageResponseTime =
      requestMetrics.requestCount > 0
        ? requestMetrics.totalResponseTime / requestMetrics.requestCount
        : 0;

    const errorRate =
      requestMetrics.requestCount > 0
        ? (requestMetrics.errorCount / requestMetrics.requestCount) * 100
        : 0;

    return {
      requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      activeConnections: requestMetrics.activeConnections,
    };
  },

  // Generate full health report
  async generateReport(): Promise<HealthReport> {
    const [dbHealth, cacheHealth, queueHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
      this.checkJobQueue(),
    ]);

    const services = [dbHealth, cacheHealth, queueHealth];

    // Determine overall status
    const unhealthyCount = services.filter((s) => s.status === 'unhealthy').length;
    const degradedCount = services.filter((s) => s.status === 'degraded').length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      status = dbHealth.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    } else if (degradedCount > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const report: HealthReport = {
      status,
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services,
      system: this.getSystemMetrics(),
      application: this.getApplicationMetrics(),
      checks: {
        database: dbHealth.status !== 'unhealthy',
        cache: cacheHealth.status !== 'unhealthy',
        jobQueue: queueHealth.status !== 'unhealthy',
      },
    };

    logger.debug({ status: report.status }, 'Health report generated');
    return report;
  },

  // Quick health check (for k8s probes)
  async quickCheck(): Promise<{ healthy: boolean; database: boolean; cache: boolean }> {
    const [dbHealthy, cacheClient] = await Promise.all([
      checkDatabaseConnection(),
      Promise.resolve(cacheService.getClient() !== null),
    ]);

    return {
      healthy: dbHealthy,
      database: dbHealthy,
      cache: cacheClient,
    };
  },
};
