// Activity Feed Service
// Implements hybrid fan-out feed architecture for scalable activity streams

import { eq, sql, and, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, users, follows } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { cacheService, CACHE_TTL } from './cache.service.js';
import { realtimeService } from './realtime.service.js';

// Activity types
type ActivityType =
  | 'article_published'
  | 'article_updated'
  | 'comment_added'
  | 'like_given'
  | 'user_followed'
  | 'badge_earned';

interface Activity {
  id: string;
  type: ActivityType;
  actorId: string;
  actorName: string;
  actorImage: string | null;
  targetType: 'article' | 'user' | 'comment' | 'badge';
  targetId: string;
  targetTitle?: string;
  targetSlug?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

interface FeedItem {
  activity: Activity;
  score: number; // For ranking
}

// Fan-out threshold: users with more followers get pull-based feed
const FOLLOWER_THRESHOLD = 1000;

export const activityService = {
  // Record an activity
  async recordActivity(
    type: ActivityType,
    actorId: string,
    targetType: 'article' | 'user' | 'comment' | 'badge',
    targetId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const activity: Activity = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      actorId,
      actorName: '',
      actorImage: null,
      targetType,
      targetId,
      metadata,
      createdAt: new Date(),
    };

    // Get actor info
    const [actor] = await db
      .select({ name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, actorId));

    if (actor) {
      activity.actorName = actor.name || 'Unknown';
      activity.actorImage = actor.image;
    }

    // Get target info if it's an article
    if (targetType === 'article') {
      const [article] = await db
        .select({ title: drafts.title, slug: drafts.slug })
        .from(drafts)
        .where(eq(drafts.id, targetId));
      if (article) {
        activity.targetTitle = article.title;
        activity.targetSlug = article.slug || undefined;
      }
    }

    // Determine fan-out strategy
    const [followerCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, actorId));
    const followerCount = Number(followerCountResult?.count || 0);

    if (followerCount < FOLLOWER_THRESHOLD) {
      // Push-based: fan out to follower timelines
      await this.fanOutActivity(activity);
    } else {
      // Pull-based: store in actor's activity log only
      await this.storeActivityForActor(activity);
    }

    // Always store in actor's activity history
    await this.addToActivityHistory(actorId, activity);

    logger.debug({ type, actorId, targetType, targetId }, 'Activity recorded');
  },

  // Fan out activity to followers' feeds (push model)
  async fanOutActivity(activity: Activity): Promise<void> {
    // Get all follower IDs
    const followers = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(eq(follows.followingId, activity.actorId));

    if (followers.length === 0) return;

    // Batch update follower feeds in cache
    const feedItem: FeedItem = {
      activity,
      score: activity.createdAt.getTime(),
    };

    const promises = followers.map(async ({ followerId }) => {
      const feedKey = `feed:${followerId}`;

      // Add to cached feed (sorted set simulation using array)
      const existingFeed = (await cacheService.get<FeedItem[]>(feedKey)) || [];
      existingFeed.unshift(feedItem);

      // Keep only last 100 items in cache
      const trimmedFeed = existingFeed.slice(0, 100);
      await cacheService.set(feedKey, trimmedFeed, CACHE_TTL.FEED);

      // Send realtime update
      realtimeService.sendToUser(followerId, 'feed_update', {
        type: activity.type,
        actorId: activity.actorId,
        actorName: activity.actorName,
        targetId: activity.targetId,
        targetTitle: activity.targetTitle,
      });
    });

    await Promise.all(promises);
  },

  // Store activity for pull-based retrieval (for high-follower accounts)
  async storeActivityForActor(activity: Activity): Promise<void> {
    const key = `activities:${activity.actorId}`;
    const existingActivities = (await cacheService.get<Activity[]>(key)) || [];
    existingActivities.unshift(activity);
    const trimmed = existingActivities.slice(0, 100);
    await cacheService.set(key, trimmed, CACHE_TTL.FEED);
  },

  // Add to user's activity history
  async addToActivityHistory(userId: string, activity: Activity): Promise<void> {
    const key = `history:${userId}`;
    const existingHistory = (await cacheService.get<Activity[]>(key)) || [];
    existingHistory.unshift(activity);
    const trimmed = existingHistory.slice(0, 50);
    await cacheService.set(key, trimmed, CACHE_TTL.FEED);
  },

  // Get personalized feed for user (hybrid approach)
  async getFeed(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{ items: Activity[]; hasMore: boolean }> {
    const offset = (page - 1) * limit;

    // Check cache first
    const cacheKey = `feed:${userId}`;
    const cachedFeed = await cacheService.get<FeedItem[]>(cacheKey);

    if (cachedFeed && cachedFeed.length >= offset + limit) {
      const items = cachedFeed.slice(offset, offset + limit).map((f) => f.activity);
      return { items, hasMore: cachedFeed.length > offset + limit };
    }

    // Build feed from database
    const feed = await this.buildFeedFromDb(userId, limit * 2, offset);

    // Cache for subsequent requests
    if (page === 1 && feed.length > 0) {
      const feedItems: FeedItem[] = feed.map((activity) => ({
        activity,
        score: activity.createdAt.getTime(),
      }));
      await cacheService.set(cacheKey, feedItems, CACHE_TTL.FEED);
    }

    return {
      items: feed.slice(0, limit),
      hasMore: feed.length > limit,
    };
  },

  // Build feed from database (fallback/initial load)
  async buildFeedFromDb(userId: string, limit: number, offset: number): Promise<Activity[]> {
    // Get users this person follows
    const following = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    const followingIds = following.map((f) => f.followingId);

    if (followingIds.length === 0) {
      // No follows - return trending/recent content instead
      return this.getTrendingFeed(limit, offset);
    }

    // Get recent articles from followed users
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        slug: drafts.slug,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(
          inArray(drafts.authorId, followingIds),
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false)
        )
      )
      .orderBy(desc(drafts.publishedAt))
      .limit(limit)
      .offset(offset);

    return articles.map((article) => ({
      id: `article-${article.id}`,
      type: 'article_published' as ActivityType,
      actorId: article.authorId,
      actorName: article.authorName || 'Unknown',
      actorImage: article.authorImage,
      targetType: 'article' as const,
      targetId: article.id,
      targetTitle: article.title,
      targetSlug: article.slug || undefined,
      createdAt: article.publishedAt || new Date(),
    }));
  },

  // Get trending feed for users with no follows
  async getTrendingFeed(limit: number, offset: number): Promise<Activity[]> {
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        slug: drafts.slug,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false)))
      .orderBy(desc(drafts.isFeatured), desc(drafts.publishedAt))
      .limit(limit)
      .offset(offset);

    return articles.map((article) => ({
      id: `article-${article.id}`,
      type: 'article_published' as ActivityType,
      actorId: article.authorId,
      actorName: article.authorName || 'Unknown',
      actorImage: article.authorImage,
      targetType: 'article' as const,
      targetId: article.id,
      targetTitle: article.title,
      targetSlug: article.slug || undefined,
      createdAt: article.publishedAt || new Date(),
    }));
  },

  // Get user's own activity history
  async getUserActivityHistory(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{ items: Activity[]; hasMore: boolean }> {
    const key = `history:${userId}`;
    const history = (await cacheService.get<Activity[]>(key)) || [];

    const offset = (page - 1) * limit;
    const items = history.slice(offset, offset + limit);

    return {
      items,
      hasMore: history.length > offset + limit,
    };
  },

  // Get activity for a specific user (their public activity)
  async getUserActivity(
    targetUserId: string,
    _viewerId: string | null,
    page = 1,
    limit = 20
  ): Promise<{ items: Activity[]; hasMore: boolean }> {
    const offset = (page - 1) * limit;

    // Get articles
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        slug: drafts.slug,
        publishedAt: drafts.publishedAt,
        authorName: users.name,
        authorImage: users.image,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(
          eq(drafts.authorId, targetUserId),
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false)
        )
      )
      .orderBy(desc(drafts.publishedAt))
      .limit(limit + 1)
      .offset(offset);

    const items: Activity[] = articles.slice(0, limit).map((article) => ({
      id: `article-${article.id}`,
      type: 'article_published' as ActivityType,
      actorId: targetUserId,
      actorName: article.authorName || 'Unknown',
      actorImage: article.authorImage,
      targetType: 'article' as const,
      targetId: article.id,
      targetTitle: article.title,
      targetSlug: article.slug || undefined,
      createdAt: article.publishedAt || new Date(),
    }));

    return {
      items,
      hasMore: articles.length > limit,
    };
  },

  // Invalidate feed cache for user
  async invalidateFeed(userId: string): Promise<void> {
    await cacheService.delete(`feed:${userId}`);
  },

  // Invalidate all follower feeds when user publishes (for high-follower accounts)
  async notifyFollowersOfActivity(
    actorId: string,
    type: ActivityType,
    targetId: string,
    targetTitle?: string
  ): Promise<void> {
    const followers = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(eq(follows.followingId, actorId));

    const followerIds = followers.map((f) => f.followerId);

    if (followerIds.length > 0) {
      // Send realtime notification to all followers
      realtimeService.sendToUsers(followerIds, 'feed_update', {
        type,
        actorId,
        targetId,
        targetTitle,
      });

      // Invalidate their feed caches
      await Promise.all(followerIds.map((id) => this.invalidateFeed(id)));
    }
  },
};
