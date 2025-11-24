// Content Recommendation Service
// Personalized article recommendations using collaborative filtering and content-based approaches

import { eq, sql, and, desc, ne, notInArray, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, users, follows, articleViews, draftTags } from '../db/schema.js';
import { cacheService, CACHE_TTL } from './cache.service.js';
import { privacyService } from './privacy.service.js';

interface RecommendedArticle {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string | null;
  coverImage: string | null;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  publishedAt: Date;
  score: number;
  reason: 'similar_tags' | 'popular' | 'from_following' | 'liked_by_similar' | 'trending';
}

interface UserInterests {
  tags: Array<{ id: string; name: string; weight: number }>;
  authors: Array<{ id: string; name: string; weight: number }>;
  categories: string[];
}

export const recommendationService = {
  // Get personalized recommendations for a user
  async getRecommendations(
    userId: string,
    limit = 20,
    excludeArticleIds: string[] = []
  ): Promise<RecommendedArticle[]> {
    const cacheKey = `recommendations:${userId}`;
    const cached = await cacheService.get<RecommendedArticle[]>(cacheKey);
    if (cached && excludeArticleIds.length === 0) {
      return cached.slice(0, limit);
    }

    // Get user's blocked/muted users
    const excludedUserIds = await privacyService.getExcludedUserIds(userId);

    // Get user's interests
    const interests = await this.analyzeUserInterests(userId);

    // Get articles user has already seen
    const viewedArticles = await this.getViewedArticleIds(userId);
    const allExcluded = [...new Set([...excludeArticleIds, ...viewedArticles])];

    // Collect recommendations from multiple sources
    const recommendations: RecommendedArticle[] = [];

    // 1. Similar tags (content-based)
    if (interests.tags.length > 0) {
      const tagBased = await this.getTagBasedRecommendations(
        interests.tags.map((t) => t.id),
        allExcluded,
        excludedUserIds,
        Math.ceil(limit * 0.4)
      );
      recommendations.push(...tagBased);
    }

    // 2. From followed authors
    const followingBased = await this.getFollowingBasedRecommendations(
      userId,
      allExcluded,
      Math.ceil(limit * 0.3)
    );
    recommendations.push(...followingBased);

    // 3. Popular/trending (fallback)
    const trending = await this.getTrendingRecommendations(
      allExcluded,
      excludedUserIds,
      Math.ceil(limit * 0.3)
    );
    recommendations.push(...trending);

    // Deduplicate and sort by score
    const uniqueRecs = this.deduplicateAndRank(recommendations);
    const finalRecs = uniqueRecs.slice(0, limit);

    // Cache results
    if (excludeArticleIds.length === 0) {
      await cacheService.set(cacheKey, finalRecs, CACHE_TTL.FEED);
    }

    return finalRecs;
  },

  // Analyze user's interests based on their activity
  async analyzeUserInterests(userId: string): Promise<UserInterests> {
    const cacheKey = `interests:${userId}`;
    const cached = await cacheService.get<UserInterests>(cacheKey);
    if (cached) return cached;

    // Get tags from liked and bookmarked articles
    const interactedTags = await db.execute(sql`
      WITH user_articles AS (
        SELECT draft_id, 2 as weight FROM likes WHERE user_id = ${userId}
        UNION ALL
        SELECT draft_id, 3 as weight FROM bookmarks WHERE user_id = ${userId}
        UNION ALL
        SELECT draft_id, 1 as weight FROM article_views WHERE viewer_id = ${userId}
      )
      SELECT t.id, t.name, SUM(ua.weight) as total_weight
      FROM user_articles ua
      JOIN draft_tags dt ON ua.draft_id = dt.draft_id
      JOIN tags t ON dt.tag_id = t.id
      GROUP BY t.id, t.name
      ORDER BY total_weight DESC
      LIMIT 20
    `);

    // Get favorite authors
    const favoriteAuthors = await db.execute(sql`
      WITH user_interactions AS (
        SELECT d.author_id, 2 as weight FROM likes l
        JOIN drafts d ON l.draft_id = d.id WHERE l.user_id = ${userId}
        UNION ALL
        SELECT d.author_id, 3 as weight FROM bookmarks b
        JOIN drafts d ON b.draft_id = d.id WHERE b.user_id = ${userId}
      )
      SELECT u.id, u.name, SUM(ui.weight) as total_weight
      FROM user_interactions ui
      JOIN users u ON ui.author_id = u.id
      WHERE u.id != ${userId}
      GROUP BY u.id, u.name
      ORDER BY total_weight DESC
      LIMIT 10
    `);

    const interests: UserInterests = {
      tags: (interactedTags as unknown as Array<{ id: string; name: string; total_weight: number }>).map((t) => ({
        id: t.id,
        name: t.name,
        weight: Number(t.total_weight),
      })),
      authors: (favoriteAuthors as unknown as Array<{ id: string; name: string; total_weight: number }>).map((a) => ({
        id: a.id,
        name: a.name,
        weight: Number(a.total_weight),
      })),
      categories: [], // Can be extended
    };

    await cacheService.set(cacheKey, interests, CACHE_TTL.USER_PROFILE);
    return interests;
  },

  // Get articles user has viewed
  async getViewedArticleIds(userId: string): Promise<string[]> {
    const views = await db
      .select({ draftId: articleViews.draftId })
      .from(articleViews)
      .where(eq(articleViews.viewerId, userId))
      .limit(200);

    return views.map((v) => v.draftId);
  },

  // Get recommendations based on similar tags
  async getTagBasedRecommendations(
    tagIds: string[],
    excludeIds: string[],
    excludeUserIds: string[],
    limit: number
  ): Promise<RecommendedArticle[]> {
    if (tagIds.length === 0) return [];

    const baseConditions = [
      eq(drafts.status, 'published'),
      eq(drafts.isDeleted, false),
    ];

    if (excludeIds.length > 0) {
      baseConditions.push(notInArray(drafts.id, excludeIds));
    }
    if (excludeUserIds.length > 0) {
      baseConditions.push(notInArray(drafts.authorId, excludeUserIds));
    }

    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        coverImage: drafts.coverImage,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
        matchCount: sql<number>`COUNT(DISTINCT ${draftTags.tagId})`,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .innerJoin(draftTags, eq(drafts.id, draftTags.draftId))
      .where(and(...baseConditions, inArray(draftTags.tagId, tagIds)))
      .groupBy(drafts.id, users.id)
      .orderBy(desc(sql`COUNT(DISTINCT ${draftTags.tagId})`), desc(drafts.publishedAt))
      .limit(limit);

    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      excerpt: a.excerpt,
      slug: a.slug,
      coverImage: a.coverImage,
      authorId: a.authorId,
      authorName: a.authorName || 'Unknown',
      authorImage: a.authorImage,
      publishedAt: a.publishedAt || new Date(),
      score: Number(a.matchCount) * 10,
      reason: 'similar_tags' as const,
    }));
  },

  // Get recommendations from followed authors
  async getFollowingBasedRecommendations(
    userId: string,
    excludeIds: string[],
    limit: number
  ): Promise<RecommendedArticle[]> {
    const following = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    const followingIds = following.map((f) => f.followingId);
    if (followingIds.length === 0) return [];

    const baseConditions = [
      eq(drafts.status, 'published'),
      eq(drafts.isDeleted, false),
      inArray(drafts.authorId, followingIds),
    ];

    if (excludeIds.length > 0) {
      baseConditions.push(notInArray(drafts.id, excludeIds));
    }

    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        coverImage: drafts.coverImage,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(and(...baseConditions))
      .orderBy(desc(drafts.publishedAt))
      .limit(limit);

    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      excerpt: a.excerpt,
      slug: a.slug,
      coverImage: a.coverImage,
      authorId: a.authorId,
      authorName: a.authorName || 'Unknown',
      authorImage: a.authorImage,
      publishedAt: a.publishedAt || new Date(),
      score: 15, // Boost for following
      reason: 'from_following' as const,
    }));
  },

  // Get trending/popular recommendations
  async getTrendingRecommendations(
    excludeIds: string[],
    excludeUserIds: string[],
    limit: number
  ): Promise<RecommendedArticle[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const baseConditions = [
      eq(drafts.status, 'published'),
      eq(drafts.isDeleted, false),
    ];

    if (excludeIds.length > 0) {
      baseConditions.push(notInArray(drafts.id, excludeIds));
    }
    if (excludeUserIds.length > 0) {
      baseConditions.push(notInArray(drafts.authorId, excludeUserIds));
    }

    const articles = await db.execute(sql`
      SELECT
        d.id, d.title, d.excerpt, d.slug, d.cover_image,
        d.author_id, u.name as author_name, u.image as author_image,
        d.published_at,
        COALESCE(view_count, 0) + COALESCE(like_count, 0) * 5 as score
      FROM drafts d
      JOIN users u ON d.author_id = u.id
      LEFT JOIN (
        SELECT draft_id, COUNT(*) as view_count
        FROM article_views
        WHERE created_at > ${sevenDaysAgo}
        GROUP BY draft_id
      ) v ON d.id = v.draft_id
      LEFT JOIN (
        SELECT draft_id, COUNT(*) as like_count
        FROM likes
        WHERE created_at > ${sevenDaysAgo}
        GROUP BY draft_id
      ) l ON d.id = l.draft_id
      WHERE d.status = 'published'
        AND d.is_deleted = false
        ${excludeIds.length > 0 ? sql`AND d.id NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`, `)})` : sql``}
        ${excludeUserIds.length > 0 ? sql`AND d.author_id NOT IN (${sql.join(excludeUserIds.map(id => sql`${id}`), sql`, `)})` : sql``}
      ORDER BY score DESC, d.published_at DESC
      LIMIT ${limit}
    `);

    return (articles as unknown as Array<{
      id: string;
      title: string;
      excerpt: string | null;
      slug: string | null;
      cover_image: string | null;
      author_id: string;
      author_name: string;
      author_image: string | null;
      published_at: Date;
      score: number;
    }>).map((a) => ({
      id: a.id,
      title: a.title,
      excerpt: a.excerpt,
      slug: a.slug,
      coverImage: a.cover_image,
      authorId: a.author_id,
      authorName: a.author_name || 'Unknown',
      authorImage: a.author_image,
      publishedAt: a.published_at || new Date(),
      score: Number(a.score),
      reason: 'trending' as const,
    }));
  },

  // Get "more like this" recommendations for a specific article
  async getSimilarArticles(
    articleId: string,
    userId: string | null,
    limit = 6
  ): Promise<RecommendedArticle[]> {
    // Get the article's tags
    const articleTags = await db
      .select({ tagId: draftTags.tagId })
      .from(draftTags)
      .where(eq(draftTags.draftId, articleId));

    const tagIds = articleTags.map((t) => t.tagId);
    if (tagIds.length === 0) return [];

    // Get excluded users if userId provided
    let excludedUserIds: string[] = [];
    if (userId) {
      excludedUserIds = await privacyService.getExcludedUserIds(userId);
    }

    const baseConditions = [
      eq(drafts.status, 'published'),
      eq(drafts.isDeleted, false),
      ne(drafts.id, articleId),
    ];

    if (excludedUserIds.length > 0) {
      baseConditions.push(notInArray(drafts.authorId, excludedUserIds));
    }

    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        coverImage: drafts.coverImage,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
        matchCount: sql<number>`COUNT(*)`,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .innerJoin(draftTags, eq(drafts.id, draftTags.draftId))
      .where(and(...baseConditions, inArray(draftTags.tagId, tagIds)))
      .groupBy(drafts.id, users.id)
      .orderBy(desc(sql`COUNT(*)`), desc(drafts.publishedAt))
      .limit(limit);

    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      excerpt: a.excerpt,
      slug: a.slug,
      coverImage: a.coverImage,
      authorId: a.authorId,
      authorName: a.authorName || 'Unknown',
      authorImage: a.authorImage,
      publishedAt: a.publishedAt || new Date(),
      score: Number(a.matchCount) * 10,
      reason: 'similar_tags' as const,
    }));
  },

  // Deduplicate and rank recommendations
  deduplicateAndRank(recommendations: RecommendedArticle[]): RecommendedArticle[] {
    const seen = new Map<string, RecommendedArticle>();

    for (const rec of recommendations) {
      const existing = seen.get(rec.id);
      if (!existing || rec.score > existing.score) {
        seen.set(rec.id, rec);
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.score - a.score);
  },

  // Invalidate user's recommendation cache
  async invalidateRecommendations(userId: string): Promise<void> {
    await cacheService.delete(`recommendations:${userId}`);
    await cacheService.delete(`interests:${userId}`);
  },

  // Get recommended authors to follow
  async getRecommendedAuthors(
    userId: string,
    limit = 10
  ): Promise<Array<{ id: string; name: string; image: string | null; bio: string | null; articleCount: number }>> {
    // Get users the current user already follows
    const following = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    const followingIds = [...following.map((f) => f.followingId), userId];

    // Get excluded users
    const excludedUserIds = await privacyService.getExcludedUserIds(userId);
    const allExcluded = [...new Set([...followingIds, ...excludedUserIds])];

    // Find authors that are popular or similar to followed authors
    const authors = await db.execute(sql`
      SELECT
        u.id, u.name, u.image, u.bio,
        COUNT(DISTINCT d.id) as article_count,
        COUNT(DISTINCT f.id) as follower_count
      FROM users u
      JOIN drafts d ON u.id = d.author_id AND d.status = 'published' AND d.is_deleted = false
      LEFT JOIN follows f ON u.id = f.following_id
      WHERE u.id NOT IN (${sql.join(allExcluded.map(id => sql`${id}`), sql`, `)})
      GROUP BY u.id
      HAVING COUNT(DISTINCT d.id) >= 1
      ORDER BY follower_count DESC, article_count DESC
      LIMIT ${limit}
    `);

    return (authors as unknown as Array<{
      id: string;
      name: string;
      image: string | null;
      bio: string | null;
      article_count: number;
    }>).map((a) => ({
      id: a.id,
      name: a.name,
      image: a.image,
      bio: a.bio,
      articleCount: Number(a.article_count),
    }));
  },
};
