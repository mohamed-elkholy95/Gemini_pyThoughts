// Job Management API Routes
// Admin endpoints for managing background jobs and queues

import { Hono } from 'hono';
import { jobQueue, JobType } from '../services/jobQueue.service.js';
import { workerPoolService } from '../services/workerPool.service.js';
import { circuitBreakerRegistry } from '../services/circuitBreaker.service.js';
import { healthDashboardService } from '../services/healthDashboard.service.js';
import { requireAuth } from '../middleware/auth.js';
import { z } from 'zod';

export const jobsRouter = new Hono();

// All job management routes require authentication
jobsRouter.use('*', requireAuth);

// Get job queue statistics
jobsRouter.get('/stats', async (c) => {
  const queueStats = await jobQueue.getStats();
  const pool = workerPoolService.getInstance();
  const poolStats = pool?.getStats();
  const circuitStats = circuitBreakerRegistry.getAllStats();

  return c.json({
    queue: queueStats,
    workerPool: poolStats || null,
    circuitBreakers: circuitStats,
    timestamp: new Date().toISOString(),
  });
});

// Get failed jobs
jobsRouter.get('/failed', async (c) => {
  const failedJobs = await jobQueue.getFailedJobs();

  return c.json({
    jobs: failedJobs,
    count: failedJobs.length,
  });
});

// Retry a failed job
const retryJobSchema = z.object({
  jobId: z.string(),
});

jobsRouter.post('/retry', async (c) => {
  const body = await c.req.json();
  const result = retryJobSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Invalid request', details: result.error.flatten() }, 400);
  }

  const success = await jobQueue.retryFailed(result.data.jobId);

  if (!success) {
    return c.json({ error: 'Job not found or could not be retried' }, 404);
  }

  return c.json({ success: true, message: 'Job re-queued for processing' });
});

// Retry all failed jobs
jobsRouter.post('/retry-all', async (c) => {
  const failedJobs = await jobQueue.getFailedJobs();
  let retriedCount = 0;

  for (const job of failedJobs) {
    const success = await jobQueue.retryFailed(job.id);
    if (success) retriedCount++;
  }

  return c.json({
    success: true,
    retriedCount,
    totalFailed: failedJobs.length,
  });
});

// Enqueue a new job manually
const enqueueJobSchema = z.object({
  type: z.enum([
    'send-email',
    'send-notification',
    'process-analytics',
    'scheduled-publish',
    'cleanup-expired',
    'generate-report',
    'process-webhook',
    'resize-image',
  ] as const),
  data: z.record(z.unknown()),
  options: z
    .object({
      delay: z.number().optional(),
      maxAttempts: z.number().min(1).max(10).optional(),
      priority: z.number().min(-10).max(10).optional(),
    })
    .optional(),
});

jobsRouter.post('/enqueue', async (c) => {
  const body = await c.req.json();
  const result = enqueueJobSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Invalid request', details: result.error.flatten() }, 400);
  }

  const jobId = await jobQueue.enqueue(
    result.data.type as JobType,
    result.data.data,
    result.data.options
  );

  return c.json({
    success: true,
    jobId,
    message: 'Job enqueued successfully',
  });
});

// Clear completed jobs
jobsRouter.delete('/completed', async (c) => {
  const clearedCount = await jobQueue.clearCompleted();

  return c.json({
    success: true,
    clearedCount,
  });
});

// Recover orphaned jobs
jobsRouter.post('/recover-orphaned', async (c) => {
  const maxAge = parseInt(c.req.query('maxAge') || '300000');
  const recoveredCount = await jobQueue.recoverOrphaned(maxAge);

  return c.json({
    success: true,
    recoveredCount,
  });
});

// Get health report
jobsRouter.get('/health', async (c) => {
  const report = await healthDashboardService.generateReport();

  return c.json(report);
});

// Get worker pool status
jobsRouter.get('/workers', async (c) => {
  const pool = workerPoolService.getInstance();
  if (!pool) {
    return c.json({ error: 'Worker pool not initialized' }, 503);
  }

  const stats = pool.getStats();

  return c.json({
    config: stats.config,
    workers: stats.workers,
    queueLength: stats.queueLength,
    processingCount: stats.processingCount,
    metrics: stats.metrics,
  });
});

// Circuit breaker management
jobsRouter.get('/circuit-breakers', async (c) => {
  const stats = circuitBreakerRegistry.getAllStats();

  return c.json({
    breakers: stats,
    isHealthy: circuitBreakerRegistry.isHealthy(),
  });
});

// Reset a specific circuit breaker
jobsRouter.post('/circuit-breakers/:name/reset', async (c) => {
  const { name } = c.req.param();
  const breaker = circuitBreakerRegistry.getAllBreakers().get(name);

  if (!breaker) {
    return c.json({ error: 'Circuit breaker not found' }, 404);
  }

  breaker.reset();

  return c.json({
    success: true,
    message: `Circuit breaker '${name}' has been reset`,
  });
});

// Force open a circuit breaker
jobsRouter.post('/circuit-breakers/:name/open', async (c) => {
  const { name } = c.req.param();
  const breaker = circuitBreakerRegistry.getAllBreakers().get(name);

  if (!breaker) {
    return c.json({ error: 'Circuit breaker not found' }, 404);
  }

  breaker.forceOpen();

  return c.json({
    success: true,
    message: `Circuit breaker '${name}' has been forced open`,
  });
});

// Force close a circuit breaker
jobsRouter.post('/circuit-breakers/:name/close', async (c) => {
  const { name } = c.req.param();
  const breaker = circuitBreakerRegistry.getAllBreakers().get(name);

  if (!breaker) {
    return c.json({ error: 'Circuit breaker not found' }, 404);
  }

  breaker.forceClose();

  return c.json({
    success: true,
    message: `Circuit breaker '${name}' has been forced closed`,
  });
});

// Reset all circuit breakers
jobsRouter.post('/circuit-breakers/reset-all', async (c) => {
  circuitBreakerRegistry.resetAll();

  return c.json({
    success: true,
    message: 'All circuit breakers have been reset',
  });
});
