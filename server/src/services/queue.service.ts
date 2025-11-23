import Redis from 'ioredis';
import { logger } from '../config/logger.js';
import { emailService } from './email.service.js';
import { notificationService } from './notification.service.js';

// Queue configuration
const QUEUE_CONFIG = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  prefix: 'pythoughts:queue:',
  concurrency: 5,
  retryAttempts: 3,
  retryDelay: 5000, // 5 seconds
};

// Job types
export type JobType =
  | 'email:welcome'
  | 'email:password-reset'
  | 'email:new-follower'
  | 'email:new-comment'
  | 'email:article-published'
  | 'notification:new-follower'
  | 'notification:new-comment'
  | 'notification:reply'
  | 'notification:like'
  | 'analytics:view'
  | 'cleanup:sessions'
  | 'cleanup:drafts';

interface Job<T = unknown> {
  id: string;
  type: JobType;
  data: T;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledAt?: string;
  error?: string;
}

interface QueueStats {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
}

let client: Redis | null = null;
let subscriber: Redis | null = null;
let isProcessing = false;
let processingPromise: Promise<void> | null = null;

export const queueService = {
  // Initialize queue connections
  async connect(): Promise<boolean> {
    try {
      client = new Redis(QUEUE_CONFIG.url);
      subscriber = new Redis(QUEUE_CONFIG.url);

      client.on('error', (err) => {
        logger.error({ error: err }, 'Queue client error');
      });

      // Test connection
      await client.ping();
      logger.info('Queue service connected');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to connect queue service');
      return false;
    }
  },

  // Disconnect from Redis
  async disconnect(): Promise<void> {
    isProcessing = false;
    if (processingPromise) {
      await processingPromise;
    }
    if (client) {
      await client.quit();
      client = null;
    }
    if (subscriber) {
      await subscriber.quit();
      subscriber = null;
    }
    logger.info('Queue service disconnected');
  },

  // Add a job to the queue
  async addJob<T>(type: JobType, data: T, options?: { delay?: number; priority?: number }): Promise<string> {
    if (!client) {
      throw new Error('Queue not connected');
    }

    const jobId = `${type}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const job: Job<T> = {
      id: jobId,
      type,
      data,
      attempts: 0,
      maxAttempts: QUEUE_CONFIG.retryAttempts,
      createdAt: new Date().toISOString(),
    };

    if (options?.delay) {
      job.scheduledAt = new Date(Date.now() + options.delay).toISOString();
    }

    const queueKey = `${QUEUE_CONFIG.prefix}pending`;
    const score = options?.priority || Date.now();

    await client.zadd(queueKey, score, JSON.stringify(job));
    logger.debug({ jobId, type }, 'Job added to queue');

    return jobId;
  },

  // Process jobs from the queue
  async processJobs(): Promise<void> {
    if (!client || isProcessing) {
      return;
    }

    isProcessing = true;
    const queueKey = `${QUEUE_CONFIG.prefix}pending`;
    const processingKey = `${QUEUE_CONFIG.prefix}processing`;

    processingPromise = (async () => {
      while (isProcessing) {
        try {
          // Get the next job (with lowest score/priority)
          const result = await client!.zpopmin(queueKey);

          if (!result || result.length === 0) {
            // No jobs, wait a bit
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }

          const [jobJson] = result;
          const job: Job = JSON.parse(jobJson);

          // Check if job is scheduled for later
          if (job.scheduledAt && new Date(job.scheduledAt) > new Date()) {
            // Re-add with scheduled time as score
            await client!.zadd(queueKey, new Date(job.scheduledAt).getTime(), jobJson);
            continue;
          }

          // Mark as processing
          await client!.hset(processingKey, job.id, jobJson);

          try {
            await this.executeJob(job);

            // Remove from processing
            await client!.hdel(processingKey, job.id);

            // Increment completed counter
            await client!.incr(`${QUEUE_CONFIG.prefix}stats:completed`);

            logger.info({ jobId: job.id, type: job.type }, 'Job completed');
          } catch (error) {
            job.attempts++;
            job.error = error instanceof Error ? error.message : 'Unknown error';

            if (job.attempts < job.maxAttempts) {
              // Retry with exponential backoff
              const delay = QUEUE_CONFIG.retryDelay * Math.pow(2, job.attempts - 1);
              job.scheduledAt = new Date(Date.now() + delay).toISOString();
              await client!.zadd(queueKey, Date.now() + delay, JSON.stringify(job));
              logger.warn({ jobId: job.id, attempts: job.attempts, error: job.error }, 'Job failed, retrying');
            } else {
              // Move to failed queue
              await client!.lpush(`${QUEUE_CONFIG.prefix}failed`, JSON.stringify(job));
              await client!.incr(`${QUEUE_CONFIG.prefix}stats:failed`);
              logger.error({ jobId: job.id, error: job.error }, 'Job failed permanently');
            }

            // Remove from processing
            await client!.hdel(processingKey, job.id);
          }
        } catch (error) {
          logger.error({ error }, 'Queue processing error');
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    })();
  },

  // Execute a specific job
  async executeJob(job: Job): Promise<void> {
    logger.debug({ jobId: job.id, type: job.type }, 'Executing job');

    switch (job.type) {
      case 'email:welcome': {
        const { to, name } = job.data as { to: string; name: string };
        await emailService.sendWelcome(to, name);
        break;
      }

      case 'email:password-reset': {
        const { to, name, resetToken } = job.data as { to: string; name: string; resetToken: string };
        await emailService.sendPasswordReset(to, name, resetToken);
        break;
      }

      case 'email:new-follower': {
        const { to, recipientName, followerName, followerId } = job.data as {
          to: string;
          recipientName: string;
          followerName: string;
          followerId: string;
        };
        await emailService.sendNewFollower(to, recipientName, followerName, followerId);
        break;
      }

      case 'email:new-comment': {
        const { to, recipientName, commenterName, articleTitle, articleId, commentPreview } = job.data as {
          to: string;
          recipientName: string;
          commenterName: string;
          articleTitle: string;
          articleId: string;
          commentPreview: string;
        };
        await emailService.sendNewComment(to, recipientName, commenterName, articleTitle, articleId, commentPreview);
        break;
      }

      case 'email:article-published': {
        const { to, authorName, articleTitle, articleExcerpt, articleId, coverImage } = job.data as {
          to: string;
          authorName: string;
          articleTitle: string;
          articleExcerpt: string;
          articleId: string;
          coverImage?: string;
        };
        await emailService.sendArticlePublished(to, authorName, articleTitle, articleExcerpt, articleId, coverImage);
        break;
      }

      case 'notification:new-follower': {
        const { followedUserId, followerId } = job.data as { followedUserId: string; followerId: string };
        await notificationService.notifyNewFollower(followedUserId, followerId);
        break;
      }

      case 'notification:new-comment': {
        const { articleAuthorId, commenterId, articleId, articleTitle } = job.data as {
          articleAuthorId: string;
          commenterId: string;
          articleId: string;
          articleTitle: string;
        };
        await notificationService.notifyNewComment(articleAuthorId, commenterId, articleId, articleTitle);
        break;
      }

      case 'notification:reply': {
        const { parentCommentAuthorId, replierId, articleId } = job.data as {
          parentCommentAuthorId: string;
          replierId: string;
          articleId: string;
        };
        await notificationService.notifyReply(parentCommentAuthorId, replierId, articleId);
        break;
      }

      case 'notification:like': {
        const { articleAuthorId, likerId, articleId, articleTitle } = job.data as {
          articleAuthorId: string;
          likerId: string;
          articleId: string;
          articleTitle: string;
        };
        await notificationService.notifyLike(articleAuthorId, likerId, articleId, articleTitle);
        break;
      }

      case 'cleanup:sessions': {
        // Cleanup expired sessions
        logger.info('Running session cleanup');
        // Implementation depends on session store
        break;
      }

      case 'cleanup:drafts': {
        // Cleanup old draft versions
        logger.info('Running draft cleanup');
        // Keep only last N versions per draft
        break;
      }

      default:
        logger.warn({ type: job.type }, 'Unknown job type');
    }
  },

  // Stop processing
  stop(): void {
    isProcessing = false;
  },

  // Get queue statistics
  async getStats(): Promise<QueueStats> {
    if (!client) {
      return { pending: 0, processing: 0, failed: 0, completed: 0 };
    }

    const [pending, processing, failed, completed] = await Promise.all([
      client.zcard(`${QUEUE_CONFIG.prefix}pending`),
      client.hlen(`${QUEUE_CONFIG.prefix}processing`),
      client.llen(`${QUEUE_CONFIG.prefix}failed`),
      client.get(`${QUEUE_CONFIG.prefix}stats:completed`).then((v) => parseInt(v || '0')),
    ]);

    return { pending, processing, failed, completed };
  },

  // Retry failed jobs
  async retryFailed(count = 10): Promise<number> {
    if (!client) {
      return 0;
    }

    const failedKey = `${QUEUE_CONFIG.prefix}failed`;
    const pendingKey = `${QUEUE_CONFIG.prefix}pending`;

    let retried = 0;
    for (let i = 0; i < count; i++) {
      const jobJson = await client.rpop(failedKey);
      if (!jobJson) break;

      const job: Job = JSON.parse(jobJson);
      job.attempts = 0;
      job.error = undefined;

      await client.zadd(pendingKey, Date.now(), JSON.stringify(job));
      retried++;
    }

    logger.info({ retried }, 'Retried failed jobs');
    return retried;
  },

  // Clear failed jobs
  async clearFailed(): Promise<number> {
    if (!client) {
      return 0;
    }

    const count = await client.llen(`${QUEUE_CONFIG.prefix}failed`);
    await client.del(`${QUEUE_CONFIG.prefix}failed`);
    logger.info({ count }, 'Cleared failed jobs');
    return count;
  },

  // Schedule recurring jobs
  async scheduleRecurringJobs(): Promise<void> {
    // Schedule session cleanup every hour
    setInterval(async () => {
      await this.addJob('cleanup:sessions', {});
    }, 60 * 60 * 1000);

    // Schedule draft cleanup every day
    setInterval(async () => {
      await this.addJob('cleanup:drafts', {});
    }, 24 * 60 * 60 * 1000);

    logger.info('Scheduled recurring jobs');
  },
};

// Helper functions for common job additions
export const jobs = {
  async sendWelcomeEmail(to: string, name: string) {
    return queueService.addJob('email:welcome', { to, name });
  },

  async sendPasswordResetEmail(to: string, name: string, resetToken: string) {
    return queueService.addJob('email:password-reset', { to, name, resetToken });
  },

  async notifyNewFollower(followedUserId: string, followerId: string) {
    return queueService.addJob('notification:new-follower', { followedUserId, followerId });
  },

  async notifyNewComment(articleAuthorId: string, commenterId: string, articleId: string, articleTitle: string) {
    return queueService.addJob('notification:new-comment', { articleAuthorId, commenterId, articleId, articleTitle });
  },

  async notifyReply(parentCommentAuthorId: string, replierId: string, articleId: string) {
    return queueService.addJob('notification:reply', { parentCommentAuthorId, replierId, articleId });
  },

  async notifyLike(articleAuthorId: string, likerId: string, articleId: string, articleTitle: string) {
    return queueService.addJob('notification:like', { articleAuthorId, likerId, articleId, articleTitle });
  },
};
