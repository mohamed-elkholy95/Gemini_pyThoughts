import { eq, and, lte, sql } from 'drizzle-orm';
import { db, drafts, users, follows } from '../db/index.js';
import { logger } from '../config/logger.js';
import { webhookService } from './webhook.service.js';
import { notificationService } from './notification.service.js';
import { cacheService } from './cache.service.js';

interface ScheduledArticle {
  id: string;
  title: string;
  authorId: string;
  scheduledAt: Date;
}

export const schedulerService = {
  // Schedule an article for publication
  async scheduleArticle(draftId: string, userId: string, scheduledAt: Date): Promise<boolean> {
    // Validate the draft exists and belongs to user
    const [draft] = await db
      .select({
        id: drafts.id,
        status: drafts.status,
        authorId: drafts.authorId,
      })
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.authorId, userId)));

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (draft.status === 'published') {
      throw new Error('Article is already published');
    }

    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Update draft with scheduled publication time
    await db
      .update(drafts)
      .set({
        scheduledAt,
        status: 'scheduled',
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draftId));

    logger.info({ draftId, scheduledAt }, 'Article scheduled for publication');
    return true;
  },

  // Cancel scheduled publication
  async cancelScheduledPublication(draftId: string, userId: string): Promise<boolean> {
    const [draft] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.authorId, userId)));

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (draft.status !== 'scheduled') {
      throw new Error('Article is not scheduled');
    }

    await db
      .update(drafts)
      .set({
        scheduledAt: null,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draftId));

    logger.info({ draftId }, 'Scheduled publication cancelled');
    return true;
  },

  // Reschedule an article
  async rescheduleArticle(draftId: string, userId: string, newScheduledAt: Date): Promise<boolean> {
    const [draft] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.authorId, userId)));

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (draft.status !== 'scheduled') {
      throw new Error('Article is not scheduled');
    }

    if (newScheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    await db
      .update(drafts)
      .set({
        scheduledAt: newScheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draftId));

    logger.info({ draftId, newScheduledAt }, 'Article rescheduled');
    return true;
  },

  // Get scheduled articles for a user
  async getScheduledArticles(userId: string): Promise<ScheduledArticle[]> {
    const scheduled = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        authorId: drafts.authorId,
        scheduledAt: drafts.scheduledAt,
      })
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.status, 'scheduled')))
      .orderBy(drafts.scheduledAt);

    return scheduled.map((s) => ({
      ...s,
      scheduledAt: s.scheduledAt!,
    }));
  },

  // Process due scheduled articles (called by cron job)
  async processScheduledArticles(): Promise<number> {
    const now = new Date();

    // Get all articles due for publication
    const dueArticles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        authorId: drafts.authorId,
        coverImage: drafts.coverImage,
      })
      .from(drafts)
      .where(
        and(
          eq(drafts.status, 'scheduled'),
          lte(drafts.scheduledAt, now),
          eq(drafts.isDeleted, false)
        )
      );

    if (dueArticles.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const article of dueArticles) {
      try {
        // Publish the article
        await db
          .update(drafts)
          .set({
            status: 'published',
            publishedAt: now,
            scheduledAt: null,
            updatedAt: now,
          })
          .where(eq(drafts.id, article.id));

        // Get author info
        const [author] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, article.authorId));

        // Trigger webhook
        await webhookService.trigger('article.published', {
          articleId: article.id,
          title: article.title,
          authorId: article.authorId,
          publishedAt: now.toISOString(),
        });

        // Notify followers
        const followersList = await db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(eq(follows.followingId, article.authorId));

        for (const follower of followersList) {
          await notificationService.create({
            userId: follower.followerId,
            type: 'publish',
            title: 'New article from someone you follow',
            message: `${author?.name} published "${article.title}"`,
            actorId: article.authorId,
            entityType: 'draft',
            entityId: article.id,
            link: `/article/${article.id}`,
          });
        }

        // Invalidate caches
        await cacheService.invalidation.feeds();
        await cacheService.invalidation.trending();

        publishedCount++;
        logger.info({ articleId: article.id, title: article.title }, 'Scheduled article published');
      } catch (error) {
        logger.error({ error, articleId: article.id }, 'Failed to publish scheduled article');
      }
    }

    return publishedCount;
  },

  // Get publication queue (admin view)
  async getPublicationQueue(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const queue = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        authorId: drafts.authorId,
        authorName: users.name,
        scheduledAt: drafts.scheduledAt,
        createdAt: drafts.createdAt,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(eq(drafts.status, 'scheduled'))
      .orderBy(drafts.scheduledAt)
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(eq(drafts.status, 'scheduled'));

    return {
      queue,
      total: Number(countResult?.count || 0),
    };
  },

  // Start the scheduler (call this on server start)
  startScheduler(intervalMinutes = 1): NodeJS.Timeout {
    logger.info({ intervalMinutes }, 'Starting publication scheduler');

    // Run immediately on start
    this.processScheduledArticles().catch((error) => {
      logger.error({ error }, 'Scheduler error on startup');
    });

    // Then run on interval
    const interval = setInterval(async () => {
      try {
        const published = await this.processScheduledArticles();
        if (published > 0) {
          logger.info({ published }, 'Scheduler published articles');
        }
      } catch (error) {
        logger.error({ error }, 'Scheduler error');
      }
    }, intervalMinutes * 60 * 1000);

    return interval;
  },
};
