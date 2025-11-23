import { logger } from '../config/logger.js';
import { checkDatabaseConnection } from '../db/index.js';
import { cacheService } from './cache.service.js';
import { queueService } from './queue.service.js';

// Health check statuses
type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthCheck {
  status: ServiceStatus;
  timestamp: string;
  uptime: number;
  services: {
    database: { status: ServiceStatus; latency?: number };
    cache: { status: ServiceStatus; connected: boolean };
    queue: { status: ServiceStatus; stats?: { pending: number; failed: number } };
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

interface ReadinessCheck {
  ready: boolean;
  checks: {
    database: boolean;
    cache: boolean;
    queue: boolean;
  };
}

// Track server state
let isShuttingDown = false;
let startTime: Date;
let activeConnections = 0;

// Shutdown handlers
const shutdownHandlers: (() => Promise<void>)[] = [];

export const lifecycleService = {
  // Initialize lifecycle tracking
  init() {
    startTime = new Date();
    this.setupSignalHandlers();
    logger.info('Lifecycle service initialized');
  },

  // Setup signal handlers for graceful shutdown
  setupSignalHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info({ signal }, 'Received shutdown signal');
        await this.gracefulShutdown();
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      this.gracefulShutdown().then(() => process.exit(1));
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled rejection');
    });
  },

  // Register a shutdown handler
  onShutdown(handler: () => Promise<void>) {
    shutdownHandlers.push(handler);
  },

  // Track active connections
  connectionStart() {
    activeConnections++;
  },

  connectionEnd() {
    activeConnections--;
  },

  getActiveConnections() {
    return activeConnections;
  },

  // Check if server is shutting down
  isShuttingDown() {
    return isShuttingDown;
  },

  // Perform graceful shutdown
  async gracefulShutdown(): Promise<void> {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    // Set a hard timeout for shutdown
    const shutdownTimeout = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      // Wait for active connections to complete (with timeout)
      const connectionDrainTimeout = 10000; // 10 seconds
      const startDrain = Date.now();

      while (activeConnections > 0 && Date.now() - startDrain < connectionDrainTimeout) {
        logger.info({ activeConnections }, 'Waiting for connections to drain...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (activeConnections > 0) {
        logger.warn({ activeConnections }, 'Forcing shutdown with active connections');
      }

      // Stop accepting new queue jobs
      queueService.stop();
      logger.info('Queue processing stopped');

      // Run registered shutdown handlers
      for (const handler of shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          logger.error({ error }, 'Shutdown handler error');
        }
      }

      // Disconnect services
      await Promise.allSettled([
        cacheService.disconnect(),
        queueService.disconnect(),
      ]);

      logger.info('All services disconnected');
      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  },

  // Perform health check
  async healthCheck(): Promise<HealthCheck> {
    const now = new Date();
    const uptime = startTime ? Math.floor((now.getTime() - startTime.getTime()) / 1000) : 0;

    // Check database
    const dbStart = Date.now();
    const dbHealthy = await checkDatabaseConnection();
    const dbLatency = Date.now() - dbStart;

    // Check cache
    const cacheConnected = cacheService.isConnected();

    // Check queue
    let queueStats = { pending: 0, failed: 0 };
    try {
      queueStats = await queueService.getStats();
    } catch {
      // Queue might not be connected
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    const memoryUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memoryTotal = Math.round(memUsage.heapTotal / 1024 / 1024);

    // Determine overall status
    let overallStatus: ServiceStatus = 'healthy';
    if (!dbHealthy) {
      overallStatus = 'unhealthy';
    } else if (!cacheConnected || queueStats.failed > 100) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: now.toISOString(),
      uptime,
      services: {
        database: {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          latency: dbHealthy ? dbLatency : undefined,
        },
        cache: {
          status: cacheConnected ? 'healthy' : 'degraded',
          connected: cacheConnected,
        },
        queue: {
          status: queueStats.failed > 100 ? 'degraded' : 'healthy',
          stats: {
            pending: queueStats.pending,
            failed: queueStats.failed,
          },
        },
      },
      memory: {
        used: memoryUsed,
        total: memoryTotal,
        percentage: Math.round((memoryUsed / memoryTotal) * 100),
      },
    };
  },

  // Perform readiness check (for Kubernetes)
  async readinessCheck(): Promise<ReadinessCheck> {
    // During shutdown, report not ready
    if (isShuttingDown) {
      return {
        ready: false,
        checks: {
          database: false,
          cache: false,
          queue: false,
        },
      };
    }

    const [dbReady, cacheReady] = await Promise.all([
      checkDatabaseConnection(),
      Promise.resolve(cacheService.isConnected()),
    ]);

    // Queue is optional for readiness
    const queueReady = true;

    return {
      ready: dbReady, // Database is required
      checks: {
        database: dbReady,
        cache: cacheReady,
        queue: queueReady,
      },
    };
  },

  // Perform liveness check (for Kubernetes)
  async livenessCheck(): Promise<{ alive: boolean }> {
    // Simple check - if this code runs, we're alive
    // Could add more checks like event loop lag
    return { alive: !isShuttingDown };
  },

  // Get system info
  getSystemInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime(),
      startTime: startTime?.toISOString(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };
  },
};

// Middleware to track connections
export function connectionTracker() {
  return async (_c: unknown, next: () => Promise<void>) => {
    lifecycleService.connectionStart();
    try {
      await next();
    } finally {
      lifecycleService.connectionEnd();
    }
  };
}

// Middleware to reject requests during shutdown
export function shutdownGuard() {
  return async (ctx: { json: (data: unknown, status: number) => unknown }, next: () => Promise<unknown>) => {
    if (lifecycleService.isShuttingDown()) {
      return ctx.json({ error: 'Server is shutting down' }, 503);
    }
    return next();
  };
}
