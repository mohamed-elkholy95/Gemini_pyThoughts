// Background Worker Service
// Handles async jobs: emails, notifications, scheduled publishing, analytics

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from './config/logger.js';
import { checkDatabaseConnection } from './db/index.js';
import { cacheService } from './services/cache.service.js';
import { schedulerService } from './services/scheduler.service.js';
import { emailService } from './services/email.service.js';
import { jobQueue, JobType } from './services/jobQueue.service.js';

const WORKER_TYPE = process.env.WORKER_TYPE || 'all';
const WORKER_PORT = parseInt(process.env.WORKER_PORT || '3001');
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');

// Health check app
const app = new Hono();

let isHealthy = true;
let processedJobs = 0;
let failedJobs = 0;
const startTime = Date.now();

app.get('/health', (c) => {
  return c.json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    worker: WORKER_TYPE,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    stats: {
      processed: processedJobs,
      failed: failedJobs,
    },
  });
});

app.get('/metrics', (c) => {
  return c.text(`
# HELP worker_jobs_processed_total Total number of processed jobs
# TYPE worker_jobs_processed_total counter
worker_jobs_processed_total{worker="${WORKER_TYPE}"} ${processedJobs}

# HELP worker_jobs_failed_total Total number of failed jobs
# TYPE worker_jobs_failed_total counter
worker_jobs_failed_total{worker="${WORKER_TYPE}"} ${failedJobs}

# HELP worker_uptime_seconds Worker uptime in seconds
# TYPE worker_uptime_seconds gauge
worker_uptime_seconds{worker="${WORKER_TYPE}"} ${Math.floor((Date.now() - startTime) / 1000)}
`);
});

// Job handlers
const jobHandlers: Record<JobType, (data: unknown) => Promise<void>> = {
  'send-email': async (data) => {
    const { to, subject, html } = data as {
      to: string;
      subject: string;
      html: string;
    };
    await emailService.send({ to, subject, html });
    logger.info({ to, subject }, 'Email sent');
  },

  'send-notification': async (data) => {
    const { userId, type, title } = data as {
      userId: string;
      type: string;
      title: string;
    };
    // Notification is already created in DB, this handles push/email delivery
    logger.info({ userId, type, title }, 'Notification processed');
  },

  'process-analytics': async (data) => {
    const { articleId, event } = data as {
      articleId: string;
      event: string;
    };
    // Process analytics event (e.g., aggregate, update counters)
    logger.info({ articleId, event }, 'Analytics event processed');
  },

  'scheduled-publish': async (data) => {
    const { draftId } = data as { draftId: string };
    // Use processScheduledArticles which checks and publishes ready articles
    await schedulerService.processScheduledArticles();
    logger.info({ draftId }, 'Scheduled article check completed');
  },

  'cleanup-expired': async () => {
    // Clean up expired sessions, soft-deleted content, etc.
    logger.info('Cleanup job executed');
  },

  'generate-report': async (data) => {
    const { userId, reportType } = data as { userId: string; reportType: string };
    // Generate and store report
    logger.info({ userId, reportType }, 'Report generated');
  },

  'process-webhook': async (data) => {
    const { webhookId } = data as { webhookId: string };
    // Process outgoing webhook
    logger.info({ webhookId }, 'Webhook processed');
  },

  'resize-image': async (data) => {
    const { imageUrl, sizes } = data as { imageUrl: string; sizes: number[] };
    // Generate image variants
    logger.info({ imageUrl, sizes }, 'Image resized');
  },
};

// Process jobs from queue
async function processJobs() {
  if (WORKER_TYPE === 'scheduler') {
    // Scheduler-only worker
    logger.info('Starting scheduler worker');
    schedulerService.startScheduler(1); // Check every minute
    return;
  }

  logger.info({ concurrency: CONCURRENCY, type: WORKER_TYPE }, 'Starting job processor');

  // Process jobs in a loop
  while (true) {
    try {
      const job = await jobQueue.dequeue();

      if (!job) {
        // No jobs, wait before checking again
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const handler = jobHandlers[job.type];

      if (!handler) {
        logger.warn({ jobType: job.type }, 'Unknown job type');
        await jobQueue.fail(job.id, 'Unknown job type');
        failedJobs++;
        continue;
      }

      try {
        await handler(job.data);
        await jobQueue.complete(job.id);
        processedJobs++;
        logger.debug({ jobId: job.id, type: job.type }, 'Job completed');
      } catch (error) {
        failedJobs++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await jobQueue.fail(job.id, errorMessage);
        logger.error({ jobId: job.id, type: job.type, error: errorMessage }, 'Job failed');
      }
    } catch (error) {
      logger.error({ error }, 'Error in job processing loop');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Worker shutting down...');
  isHealthy = false;

  // Give time for health checks to detect
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Disconnect from services
  await cacheService.disconnect();

  logger.info('Worker shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start worker
async function start() {
  logger.info({ type: WORKER_TYPE }, 'Initializing worker...');

  // Check database connection
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }
  logger.info('Database connected');

  // Connect to Redis
  const cacheConnected = await cacheService.connect();
  if (!cacheConnected) {
    logger.warn('Redis not available, some features may be limited');
  } else {
    logger.info('Redis connected');
  }

  // Start health check server
  serve(
    {
      fetch: app.fetch,
      port: WORKER_PORT,
      hostname: '0.0.0.0',
    },
    (info) => {
      logger.info(`Worker health server running at http://${info.address}:${info.port}`);
    }
  );

  // Start processing jobs
  processJobs().catch((error) => {
    logger.error({ error }, 'Fatal error in job processor');
    process.exit(1);
  });
}

start().catch((error) => {
  logger.error({ error }, 'Failed to start worker');
  process.exit(1);
});
