import { sql, eq, and, desc, gte, count } from 'drizzle-orm';
import { db, articleViews, drafts, users, likes, comments, follows } from '../db/index.js';
import { logger } from '../config/logger.js';
import { cacheService, CACHE_TTL } from './cache.service.js';

interface TimeRange {
  start: Date;
  end: Date;
}

interface ArticleAnalytics {
  id: string;
  title: string;
  views: number;
  uniqueViews: number;
  likes: number;
  comments: number;
  readTime: number;
  engagementRate: number;
}

interface UserAnalytics {
  totalArticles: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalFollowers: number;
  totalFollowing: number;
  engagementRate: number;
}

interface PlatformStats {
  totalUsers: number;
  totalArticles: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  activeUsers7d: number;
  newUsers7d: number;
  newArticles7d: number;
}

export const analyticsService = {
  // Get time ranges for common periods
  getTimeRange(period: '24h' | '7d' | '30d' | '90d' | 'year'): TimeRange {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case '24h':
        start.setHours(start.getHours() - 24);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    return { start, end };
  },

  // Get article analytics
  async getArticleAnalytics(articleId: string): Promise<ArticleAnalytics | null> {
    const cacheKey = `analytics:article:${articleId}`;
    const cached = await cacheService.get<ArticleAnalytics>(cacheKey);
    if (cached) return cached;

    const [article] = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        readingTime: drafts.readingTime,
      })
      .from(drafts)
      .where(eq(drafts.id, articleId));

    if (!article) return null;

    // Get view counts
    const [viewStats] = await db
      .select({
        totalViews: count(),
        uniqueViews: sql<number>`COUNT(DISTINCT COALESCE(viewer_id, ip_hash))`,
      })
      .from(articleViews)
      .where(eq(articleViews.draftId, articleId));

    // Get likes count
    const [likesCount] = await db
      .select({ count: count() })
      .from(likes)
      .where(eq(likes.draftId, articleId));

    // Get comments count
    const [commentsCount] = await db
      .select({ count: count() })
      .from(comments)
      .where(and(eq(comments.draftId, articleId), eq(comments.isDeleted, false)));

    const views = Number(viewStats?.totalViews || 0);
    const likesTotal = Number(likesCount?.count || 0);
    const commentsTotal = Number(commentsCount?.count || 0);

    // Calculate engagement rate (likes + comments) / views * 100
    const engagementRate = views > 0 ? ((likesTotal + commentsTotal) / views) * 100 : 0;

    const analytics: ArticleAnalytics = {
      id: article.id,
      title: article.title,
      views,
      uniqueViews: Number(viewStats?.uniqueViews || 0),
      likes: likesTotal,
      comments: commentsTotal,
      readTime: article.readingTime || 0,
      engagementRate: Math.round(engagementRate * 100) / 100,
    };

    await cacheService.set(cacheKey, analytics, CACHE_TTL.ARTICLE_COUNT);
    return analytics;
  },

  // Get article views over time
  async getArticleViewsTimeline(articleId: string, period: '7d' | '30d' | '90d' = '30d') {
    const { start } = this.getTimeRange(period);

    const views = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as views,
        COUNT(DISTINCT COALESCE(viewer_id, ip_hash)) as unique_views
      FROM article_views
      WHERE draft_id = ${articleId}
        AND created_at >= ${start}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `);

    return views;
  },

  // Get user analytics
  async getUserAnalytics(userId: string): Promise<UserAnalytics> {
    const cacheKey = `analytics:user:${userId}`;
    const cached = await cacheService.get<UserAnalytics>(cacheKey);
    if (cached) return cached;

    // Get article stats
    const [articleStats] = await db
      .select({
        totalArticles: count(),
      })
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.status, 'published'), eq(drafts.isDeleted, false)));

    // Get view stats
    const [viewStats] = await db
      .select({
        totalViews: count(),
      })
      .from(articleViews)
      .innerJoin(drafts, eq(articleViews.draftId, drafts.id))
      .where(eq(drafts.authorId, userId));

    // Get engagement stats
    const [likeStats] = await db
      .select({ count: count() })
      .from(likes)
      .innerJoin(drafts, eq(likes.draftId, drafts.id))
      .where(eq(drafts.authorId, userId));

    const [commentStats] = await db
      .select({ count: count() })
      .from(comments)
      .innerJoin(drafts, eq(comments.draftId, drafts.id))
      .where(and(eq(drafts.authorId, userId), eq(comments.isDeleted, false)));

    // Get follower/following stats
    const [followerStats] = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followingId, userId));

    const [followingStats] = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerId, userId));

    const totalViews = Number(viewStats?.totalViews || 0);
    const totalLikes = Number(likeStats?.count || 0);
    const totalComments = Number(commentStats?.count || 0);
    const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

    const analytics: UserAnalytics = {
      totalArticles: Number(articleStats?.totalArticles || 0),
      totalViews,
      totalLikes,
      totalComments,
      totalFollowers: Number(followerStats?.count || 0),
      totalFollowing: Number(followingStats?.count || 0),
      engagementRate: Math.round(engagementRate * 100) / 100,
    };

    await cacheService.set(cacheKey, analytics, CACHE_TTL.USER_PROFILE);
    return analytics;
  },

  // Get user's top performing articles
  async getUserTopArticles(userId: string, limit = 10): Promise<ArticleAnalytics[]> {
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        readingTime: drafts.readingTime,
      })
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.status, 'published'), eq(drafts.isDeleted, false)))
      .orderBy(desc(drafts.publishedAt))
      .limit(50); // Get more to sort by views

    const analytics = await Promise.all(
      articles.map(async (article) => this.getArticleAnalytics(article.id))
    );

    // Sort by views and return top N
    return analytics
      .filter((a): a is ArticleAnalytics => a !== null)
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  },

  // Get platform-wide statistics
  async getPlatformStats(): Promise<PlatformStats> {
    const cacheKey = 'analytics:platform';
    const cached = await cacheService.get<PlatformStats>(cacheKey);
    if (cached) return cached;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      userCount,
      articleCount,
      viewCount,
      likeCount,
      commentCount,
      activeUsers,
      newUsers,
      newArticles,
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(drafts).where(and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false))),
      db.select({ count: count() }).from(articleViews),
      db.select({ count: count() }).from(likes),
      db.select({ count: count() }).from(comments).where(eq(comments.isDeleted, false)),
      db.select({ count: sql<number>`COUNT(DISTINCT author_id)` }).from(drafts).where(gte(drafts.updatedAt, sevenDaysAgo)),
      db.select({ count: count() }).from(users).where(gte(users.createdAt, sevenDaysAgo)),
      db.select({ count: count() }).from(drafts).where(and(eq(drafts.status, 'published'), gte(drafts.publishedAt, sevenDaysAgo))),
    ]);

    const stats: PlatformStats = {
      totalUsers: Number(userCount[0]?.count || 0),
      totalArticles: Number(articleCount[0]?.count || 0),
      totalViews: Number(viewCount[0]?.count || 0),
      totalLikes: Number(likeCount[0]?.count || 0),
      totalComments: Number(commentCount[0]?.count || 0),
      activeUsers7d: Number(activeUsers[0]?.count || 0),
      newUsers7d: Number(newUsers[0]?.count || 0),
      newArticles7d: Number(newArticles[0]?.count || 0),
    };

    await cacheService.set(cacheKey, stats, CACHE_TTL.TRENDING);
    return stats;
  },

  // Get trending topics (based on article content/tags)
  async getTrendingTopics(limit = 10) {
    const { start } = this.getTimeRange('7d');

    const topics = await db.execute(sql`
      SELECT
        t.name,
        t.slug,
        COUNT(DISTINCT av.id) as views,
        COUNT(DISTINCT l.id) as likes
      FROM tags t
      INNER JOIN draft_tags dt ON t.id = dt.tag_id
      INNER JOIN drafts d ON dt.draft_id = d.id
      LEFT JOIN article_views av ON d.id = av.draft_id AND av.created_at >= ${start}
      LEFT JOIN likes l ON d.id = l.draft_id AND l.created_at >= ${start}
      WHERE d.status = 'published' AND d.is_deleted = false
      GROUP BY t.id, t.name, t.slug
      ORDER BY views DESC, likes DESC
      LIMIT ${limit}
    `);

    return topics;
  },

  // Get referrer statistics for an article
  async getArticleReferrers(articleId: string, limit = 10) {
    const referrers = await db.execute(sql`
      SELECT
        COALESCE(referrer, 'direct') as source,
        COUNT(*) as count
      FROM article_views
      WHERE draft_id = ${articleId}
      GROUP BY COALESCE(referrer, 'direct')
      ORDER BY count DESC
      LIMIT ${limit}
    `);

    return referrers;
  },

  // Get geographic distribution (based on IP)
  async getArticleGeography(_articleId: string) {
    // This would require IP geolocation service integration
    // Placeholder for now
    return {
      message: 'Geographic analytics requires IP geolocation service',
    };
  },

  // Record a custom event
  async recordEvent(eventType: string, data: Record<string, unknown>) {
    logger.info({ eventType, data }, 'Analytics event recorded');
    // Could be extended to store in a separate events table or send to external analytics
  },

  // Generate report for a user
  async generateUserReport(userId: string): Promise<{
    overview: UserAnalytics;
    topArticles: ArticleAnalytics[];
    viewsTimeline: unknown;
  }> {
    const [overview, topArticles] = await Promise.all([
      this.getUserAnalytics(userId),
      this.getUserTopArticles(userId, 5),
    ]);

    // Get aggregated views for all user's articles over 30 days
    const { start } = this.getTimeRange('30d');
    const viewsTimeline = await db.execute(sql`
      SELECT
        DATE_TRUNC('day', av.created_at) as date,
        COUNT(*) as views
      FROM article_views av
      INNER JOIN drafts d ON av.draft_id = d.id
      WHERE d.author_id = ${userId}
        AND av.created_at >= ${start}
      GROUP BY DATE_TRUNC('day', av.created_at)
      ORDER BY date ASC
    `);

    return {
      overview,
      topArticles,
      viewsTimeline,
    };
  },
};
