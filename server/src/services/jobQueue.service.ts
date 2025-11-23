// Job Queue Service using Redis
// Provides reliable async job processing with retries and dead letter queue

import { cacheService } from './cache.service.js';
import { logger } from '../config/logger.js';

export type JobType =
  | 'send-email'
  | 'send-notification'
  | 'process-analytics'
  | 'scheduled-publish'
  | 'cleanup-expired'
  | 'generate-report'
  | 'process-webhook'
  | 'resize-image';

export interface Job {
  id: string;
  type: JobType;
  data: unknown;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledFor?: string;
  priority: number;
}

interface JobOptions {
  delay?: number; // Delay in milliseconds
  maxAttempts?: number;
  priority?: number; // Higher = more important
}

const QUEUE_KEY = 'pythoughts:jobs:queue';
const PROCESSING_KEY = 'pythoughts:jobs:processing';
const FAILED_KEY = 'pythoughts:jobs:failed';
const COMPLETED_KEY = 'pythoughts:jobs:completed';

export const jobQueue = {
  // Add a job to the queue
  async enqueue(type: JobType, data: unknown, options: JobOptions = {}): Promise<string> {
    const id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const job: Job = {
      id,
      type,
      data,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: now.toISOString(),
      scheduledFor: options.delay
        ? new Date(now.getTime() + options.delay).toISOString()
        : undefined,
      priority: options.priority || 0,
    };

    const redis = cacheService.getClient();
    if (!redis) {
      // Fallback: process synchronously if Redis not available
      logger.warn({ type, id }, 'Redis not available, job will not be queued');
      return id;
    }

    // Add to sorted set with score based on priority and scheduled time
    const score = options.delay
      ? now.getTime() + options.delay
      : now.getTime() - job.priority * 1000000;

    await redis.zadd(QUEUE_KEY, score, JSON.stringify(job));
    logger.debug({ type, id }, 'Job enqueued');

    return id;
  },

  // Dequeue and return next job ready to process
  async dequeue(): Promise<Job | null> {
    const redis = cacheService.getClient();
    if (!redis) return null;

    const now = Date.now();

    // Get jobs that are ready (score <= now)
    const results = await redis.zrangebyscore(QUEUE_KEY, '-inf', now.toString(), 'LIMIT', '0', '1');

    if (results.length === 0) return null;

    const jobStr = results[0];
    const job = JSON.parse(jobStr) as Job;

    // Atomically move to processing set
    const multi = redis.multi();
    multi.zrem(QUEUE_KEY, jobStr);
    multi.hset(PROCESSING_KEY, job.id, JSON.stringify({ ...job, attempts: job.attempts + 1 }));
    await multi.exec();

    return { ...job, attempts: job.attempts + 1 };
  },

  // Mark job as completed
  async complete(jobId: string): Promise<void> {
    const redis = cacheService.getClient();
    if (!redis) return;

    const jobStr = await redis.hget(PROCESSING_KEY, jobId);
    if (!jobStr) return;

    const job = JSON.parse(jobStr) as Job;

    const multi = redis.multi();
    multi.hdel(PROCESSING_KEY, jobId);
    // Store completed job for a short time (for debugging)
    multi.setex(`${COMPLETED_KEY}:${jobId}`, 3600, JSON.stringify({
      ...job,
      completedAt: new Date().toISOString(),
    }));
    await multi.exec();
  },

  // Mark job as failed
  async fail(jobId: string, error: string): Promise<void> {
    const redis = cacheService.getClient();
    if (!redis) return;

    const jobStr = await redis.hget(PROCESSING_KEY, jobId);
    if (!jobStr) return;

    const job = JSON.parse(jobStr) as Job;

    // Remove from processing
    await redis.hdel(PROCESSING_KEY, jobId);

    if (job.attempts < job.maxAttempts) {
      // Retry with exponential backoff
      const backoff = Math.pow(2, job.attempts) * 1000; // 2s, 4s, 8s...
      const retryJob: Job = {
        ...job,
        scheduledFor: new Date(Date.now() + backoff).toISOString(),
      };

      const score = Date.now() + backoff;
      await redis.zadd(QUEUE_KEY, score, JSON.stringify(retryJob));
      logger.info({ jobId, attempts: job.attempts, backoff }, 'Job scheduled for retry');
    } else {
      // Move to dead letter queue
      await redis.hset(FAILED_KEY, jobId, JSON.stringify({
        ...job,
        failedAt: new Date().toISOString(),
        lastError: error,
      }));
      logger.error({ jobId, type: job.type, error }, 'Job moved to dead letter queue');
    }
  },

  // Get queue statistics
  async getStats(): Promise<{
    queued: number;
    processing: number;
    failed: number;
  }> {
    const redis = cacheService.getClient();
    if (!redis) {
      return { queued: 0, processing: 0, failed: 0 };
    }

    const [queued, processing, failed] = await Promise.all([
      redis.zcard(QUEUE_KEY),
      redis.hlen(PROCESSING_KEY),
      redis.hlen(FAILED_KEY),
    ]);

    return { queued, processing, failed };
  },

  // Retry a failed job
  async retryFailed(jobId: string): Promise<boolean> {
    const redis = cacheService.getClient();
    if (!redis) return false;

    const jobStr = await redis.hget(FAILED_KEY, jobId);
    if (!jobStr) return false;

    const job = JSON.parse(jobStr) as Job;

    // Reset attempts and re-queue
    const retryJob: Job = {
      ...job,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    const multi = redis.multi();
    multi.hdel(FAILED_KEY, jobId);
    multi.zadd(QUEUE_KEY, Date.now(), JSON.stringify(retryJob));
    await multi.exec();

    logger.info({ jobId, type: job.type }, 'Failed job re-queued');
    return true;
  },

  // Get all failed jobs
  async getFailedJobs(): Promise<Array<Job & { lastError: string; failedAt: string }>> {
    const redis = cacheService.getClient();
    if (!redis) return [];

    const jobsMap = await redis.hgetall(FAILED_KEY);
    return Object.values(jobsMap).map((str) => JSON.parse(str as string));
  },

  // Clear completed jobs (maintenance)
  async clearCompleted(): Promise<number> {
    const redis = cacheService.getClient();
    if (!redis) return 0;

    const keys = await redis.keys(`${COMPLETED_KEY}:*`);
    if (keys.length === 0) return 0;

    await redis.del(...keys);
    return keys.length;
  },

  // Recover orphaned processing jobs (e.g., after worker crash)
  async recoverOrphaned(maxAge: number = 300000): Promise<number> {
    const redis = cacheService.getClient();
    if (!redis) return 0;

    const jobsMap = await redis.hgetall(PROCESSING_KEY);
    const now = Date.now();
    let recovered = 0;

    for (const [id, jobStr] of Object.entries(jobsMap)) {
      const job = JSON.parse(jobStr as string) as Job;
      const jobTime = new Date(job.createdAt).getTime();

      if (now - jobTime > maxAge) {
        // Re-queue orphaned job
        await redis.hdel(PROCESSING_KEY, id);
        await redis.zadd(QUEUE_KEY, now, JSON.stringify(job));
        recovered++;
        logger.warn({ jobId: id, type: job.type }, 'Recovered orphaned job');
      }
    }

    return recovered;
  },
};

// Helper to enqueue common job types
export const jobs = {
  sendEmail: (to: string, subject: string, template: string, context: Record<string, unknown>) =>
    jobQueue.enqueue('send-email', { to, subject, template, context }),

  sendNotification: (
    userId: string,
    type: string,
    title: string,
    message?: string,
    link?: string
  ) => jobQueue.enqueue('send-notification', { userId, type, title, message, link }),

  processAnalytics: (articleId: string, event: string, metadata?: Record<string, unknown>) =>
    jobQueue.enqueue('process-analytics', { articleId, event, metadata }, { priority: -1 }),

  schedulePublish: (draftId: string, publishAt: Date) =>
    jobQueue.enqueue(
      'scheduled-publish',
      { draftId },
      { delay: publishAt.getTime() - Date.now() }
    ),

  processWebhook: (webhookId: string, payload: unknown) =>
    jobQueue.enqueue('process-webhook', { webhookId, payload }),

  resizeImage: (imageUrl: string, sizes: number[]) =>
    jobQueue.enqueue('resize-image', { imageUrl, sizes }),

  generateReport: (userId: string, reportType: string) =>
    jobQueue.enqueue('generate-report', { userId, reportType }, { priority: -2 }),
};
