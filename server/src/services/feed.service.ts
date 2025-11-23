import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db, drafts, follows, likes, articleViews, users, bookmarks } from '../db/index.js';
import { logger } from '../config/logger.js';

interface FeedOptions {
  userId?: string;
  page?: number;
  limit?: number;
  type?: 'following' | 'trending' | 'latest' | 'personalized';
}

interface FeedArticle {
  id: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  slug: string | null;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  publishedAt: Date | null;
  readingTime: number | null;
  wordCount: number | null;
  likesCount: number;
  commentsCount: number;
  isBookmarked?: boolean;
  isLiked?: boolean;
}

export const feedService = {
  // Get personalized feed for authenticated user
  async getPersonalizedFeed(options: FeedOptions): Promise<{ articles: FeedArticle[]; total: number }> {
    const { userId, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    if (!userId) {
      return this.getTrendingFeed(options);
    }

    // Get users that the current user follows
    const following = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    const followingIds = following.map((f) => f.followingId);

    // If not following anyone, return trending
    if (followingIds.length === 0) {
      return this.getTrendingFeed(options);
    }

    // Get articles from followed users + some trending
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        slug: drafts.slug,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
        readingTime: drafts.readingTime,
        wordCount: drafts.wordCount,
        likesCount: sql<number>`(SELECT COUNT(*) FROM likes WHERE likes.draft_id = drafts.id)`,
        commentsCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE comments.draft_id = drafts.id AND comments.is_deleted = false)`,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false),
          inArray(drafts.authorId, followingIds)
        )
      )
      .orderBy(desc(drafts.publishedAt))
      .limit(limit)
      .offset(offset);

    // Get bookmark/like status for current user
    const articlesWithStatus = await this.addUserStatus(articles, userId);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(
        and(
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false),
          inArray(drafts.authorId, followingIds)
        )
      );

    return {
      articles: articlesWithStatus,
      total: Number(countResult?.count || 0),
    };
  },

  // Get articles from users the current user follows
  async getFollowingFeed(options: FeedOptions): Promise<{ articles: FeedArticle[]; total: number }> {
    const { userId, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    if (!userId) {
      return { articles: [], total: 0 };
    }

    const following = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    const followingIds = following.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return { articles: [], total: 0 };
    }

    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        slug: drafts.slug,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
        readingTime: drafts.readingTime,
        wordCount: drafts.wordCount,
        likesCount: sql<number>`(SELECT COUNT(*) FROM likes WHERE likes.draft_id = drafts.id)`,
        commentsCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE comments.draft_id = drafts.id AND comments.is_deleted = false)`,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false),
          inArray(drafts.authorId, followingIds)
        )
      )
      .orderBy(desc(drafts.publishedAt))
      .limit(limit)
      .offset(offset);

    const articlesWithStatus = await this.addUserStatus(articles, userId);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(
        and(
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false),
          inArray(drafts.authorId, followingIds)
        )
      );

    return {
      articles: articlesWithStatus,
      total: Number(countResult?.count || 0),
    };
  },

  // Get trending articles (based on views, likes, comments in last 7 days)
  async getTrendingFeed(options: FeedOptions): Promise<{ articles: FeedArticle[]; total: number }> {
    const { userId, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Trending score = (likes * 3) + (comments * 2) + (views * 0.1)
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        slug: drafts.slug,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
        readingTime: drafts.readingTime,
        wordCount: drafts.wordCount,
        likesCount: sql<number>`(SELECT COUNT(*) FROM likes WHERE likes.draft_id = drafts.id)`,
        commentsCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE comments.draft_id = drafts.id AND comments.is_deleted = false)`,
        trendingScore: sql<number>`(
          (SELECT COUNT(*) FROM likes WHERE likes.draft_id = drafts.id) * 3 +
          (SELECT COUNT(*) FROM comments WHERE comments.draft_id = drafts.id AND comments.is_deleted = false) * 2 +
          (SELECT COUNT(*) FROM article_views WHERE article_views.draft_id = drafts.id AND article_views.created_at > ${sevenDaysAgo}) * 0.1
        )`,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false)
        )
      )
      .orderBy(sql`trending_score DESC`, desc(drafts.publishedAt))
      .limit(limit)
      .offset(offset);

    const articlesWithStatus = userId ? await this.addUserStatus(articles, userId) : articles.map(a => ({
      ...a,
      isBookmarked: false,
      isLiked: false,
    }));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(
        and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false))
      );

    return {
      articles: articlesWithStatus,
      total: Number(countResult?.count || 0),
    };
  },

  // Get latest articles
  async getLatestFeed(options: FeedOptions): Promise<{ articles: FeedArticle[]; total: number }> {
    const { userId, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        slug: drafts.slug,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
        readingTime: drafts.readingTime,
        wordCount: drafts.wordCount,
        likesCount: sql<number>`(SELECT COUNT(*) FROM likes WHERE likes.draft_id = drafts.id)`,
        commentsCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE comments.draft_id = drafts.id AND comments.is_deleted = false)`,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false))
      )
      .orderBy(desc(drafts.publishedAt))
      .limit(limit)
      .offset(offset);

    const articlesWithStatus = userId ? await this.addUserStatus(articles, userId) : articles.map(a => ({
      ...a,
      isBookmarked: false,
      isLiked: false,
    }));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(
        and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false))
      );

    return {
      articles: articlesWithStatus,
      total: Number(countResult?.count || 0),
    };
  },

  // Get feed based on type
  async getFeed(options: FeedOptions) {
    const { type = 'personalized' } = options;

    switch (type) {
      case 'following':
        return this.getFollowingFeed(options);
      case 'trending':
        return this.getTrendingFeed(options);
      case 'latest':
        return this.getLatestFeed(options);
      case 'personalized':
      default:
        return this.getPersonalizedFeed(options);
    }
  },

  // Helper to add bookmark/like status
  async addUserStatus(articles: FeedArticle[], userId: string): Promise<FeedArticle[]> {
    if (articles.length === 0) return [];

    const articleIds = articles.map((a) => a.id);

    const [userBookmarks, userLikes] = await Promise.all([
      db
        .select({ draftId: bookmarks.draftId })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.draftId, articleIds))),
      db
        .select({ draftId: likes.draftId })
        .from(likes)
        .where(and(eq(likes.userId, userId), inArray(likes.draftId, articleIds))),
    ]);

    const bookmarkedIds = new Set(userBookmarks.map((b) => b.draftId));
    const likedIds = new Set(userLikes.map((l) => l.draftId));

    return articles.map((article) => ({
      ...article,
      isBookmarked: bookmarkedIds.has(article.id),
      isLiked: likedIds.has(article.id),
    }));
  },

  // Record article view
  async recordView(draftId: string, viewerId?: string, ipHash?: string, userAgent?: string, referrer?: string) {
    try {
      await db.insert(articleViews).values({
        draftId,
        viewerId,
        ipHash,
        userAgent,
        referrer,
      });
    } catch (error) {
      logger.error({ error, draftId }, 'Failed to record article view');
    }
  },

  // Like an article
  async like(userId: string, draftId: string) {
    const [existing] = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.draftId, draftId)));

    if (existing) {
      return { success: false, message: 'Already liked' };
    }

    await db.insert(likes).values({ userId, draftId });
    logger.info({ userId, draftId }, 'Article liked');
    return { success: true };
  },

  // Unlike an article
  async unlike(userId: string, draftId: string) {
    const [result] = await db
      .delete(likes)
      .where(and(eq(likes.userId, userId), eq(likes.draftId, draftId)))
      .returning();

    if (!result) {
      return { success: false, message: 'Not liked' };
    }

    logger.info({ userId, draftId }, 'Article unliked');
    return { success: true };
  },

  // Get like count
  async getLikeCount(draftId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(likes)
      .where(eq(likes.draftId, draftId));

    return Number(result?.count || 0);
  },
};
