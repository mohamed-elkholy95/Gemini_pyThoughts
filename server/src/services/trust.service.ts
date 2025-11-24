// Trust Scoring Service
// Multi-signal trust scoring for content moderation and spam prevention

import { eq, sql, and, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, drafts, follows } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { cacheService, CACHE_TTL } from './cache.service.js';

// Trust score weights
const TRUST_WEIGHTS = {
  accountAge: 0.15, // Days since account creation
  emailVerified: 0.10, // Email verification status
  articlesPublished: 0.20, // Number of published articles
  engagementRatio: 0.15, // Likes/comments received ratio
  followerCount: 0.15, // Number of followers
  reportCount: -0.25, // Negative weight for reports
} as const;

// Trust thresholds
const TRUST_THRESHOLDS = {
  NEW_USER: 0.2,
  LOW_TRUST: 0.4,
  NORMAL: 0.6,
  TRUSTED: 0.8,
  HIGHLY_TRUSTED: 0.95,
} as const;

export type TrustLevel = 'new' | 'low' | 'normal' | 'trusted' | 'highly_trusted';

interface TrustScore {
  score: number;
  level: TrustLevel;
  factors: {
    accountAge: number;
    emailVerified: number;
    articlesPublished: number;
    engagementRatio: number;
    followerCount: number;
    reportCount: number;
  };
  calculatedAt: Date;
}

interface RateLimitTier {
  commentsPerHour: number;
  articlesPerDay: number;
  likesPerHour: number;
  reportsPerDay: number;
}

export const trustService = {
  // Calculate trust score for a user
  async calculateTrustScore(userId: string): Promise<TrustScore> {
    // Check cache first
    const cacheKey = `trust:${userId}`;
    const cached = await cacheService.get<TrustScore>(cacheKey);
    if (cached) return cached;

    // Get user data
    const [user] = await db
      .select({
        id: users.id,
        createdAt: users.createdAt,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return this.defaultTrustScore();
    }

    // Calculate account age factor (max 1.0 at 365 days)
    const accountAgeDays = Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const accountAgeFactor = Math.min(accountAgeDays / 365, 1.0);

    // Email verified factor
    const emailVerifiedFactor = user.emailVerified ? 1.0 : 0.0;

    // Articles published factor (max 1.0 at 10 articles)
    const [articleCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.status, 'published')));
    const articlesPublishedFactor = Math.min(Number(articleCount?.count || 0) / 10, 1.0);

    // Engagement ratio factor (likes + comments received)
    const [engagementResult] = await db.execute(sql`
      SELECT
        COALESCE(
          (SELECT COUNT(*) FROM likes l JOIN drafts d ON l.draft_id = d.id WHERE d.author_id = ${userId}),
          0
        ) +
        COALESCE(
          (SELECT COUNT(*) FROM comments c JOIN drafts d ON c.draft_id = d.id WHERE d.author_id = ${userId} AND c.author_id != ${userId}),
          0
        ) as engagement_count
    `);
    const engagementCount = Number((engagementResult as unknown as { engagement_count: number }).engagement_count || 0);
    const engagementRatioFactor = Math.min(engagementCount / 100, 1.0);

    // Follower count factor (max 1.0 at 100 followers)
    const [followerCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, userId));
    const followerCountFactor = Math.min(Number(followerCount?.count || 0) / 100, 1.0);

    // Report count factor (negative, max -1.0 at 5 reports)
    const [reportResult] = await db.execute(sql`
      SELECT COUNT(*) as report_count
      FROM content_reports
      WHERE reported_user_id = ${userId}
        AND status IN ('pending', 'confirmed')
        AND created_at > NOW() - INTERVAL '90 days'
    `);
    const reportCount = Number((reportResult as unknown as { report_count: number }).report_count || 0);
    const reportCountFactor = -Math.min(reportCount / 5, 1.0);

    // Calculate weighted score
    const rawScore =
      accountAgeFactor * TRUST_WEIGHTS.accountAge +
      emailVerifiedFactor * TRUST_WEIGHTS.emailVerified +
      articlesPublishedFactor * TRUST_WEIGHTS.articlesPublished +
      engagementRatioFactor * TRUST_WEIGHTS.engagementRatio +
      followerCountFactor * TRUST_WEIGHTS.followerCount +
      reportCountFactor * Math.abs(TRUST_WEIGHTS.reportCount);

    // Normalize to 0-1 range
    const score = Math.max(0, Math.min(1, rawScore));
    const level = this.scoreToLevel(score);

    const trustScore: TrustScore = {
      score,
      level,
      factors: {
        accountAge: accountAgeFactor,
        emailVerified: emailVerifiedFactor,
        articlesPublished: articlesPublishedFactor,
        engagementRatio: engagementRatioFactor,
        followerCount: followerCountFactor,
        reportCount: reportCountFactor,
      },
      calculatedAt: new Date(),
    };

    // Cache for 1 hour
    await cacheService.set(cacheKey, trustScore, CACHE_TTL.USER_PROFILE);

    logger.debug({ userId, score, level }, 'Trust score calculated');
    return trustScore;
  },

  // Convert score to trust level
  scoreToLevel(score: number): TrustLevel {
    if (score >= TRUST_THRESHOLDS.HIGHLY_TRUSTED) return 'highly_trusted';
    if (score >= TRUST_THRESHOLDS.TRUSTED) return 'trusted';
    if (score >= TRUST_THRESHOLDS.NORMAL) return 'normal';
    if (score >= TRUST_THRESHOLDS.LOW_TRUST) return 'low';
    return 'new';
  },

  // Get default trust score for unknown users
  defaultTrustScore(): TrustScore {
    return {
      score: 0.1,
      level: 'new',
      factors: {
        accountAge: 0,
        emailVerified: 0,
        articlesPublished: 0,
        engagementRatio: 0,
        followerCount: 0,
        reportCount: 0,
      },
      calculatedAt: new Date(),
    };
  },

  // Get rate limit tier based on trust level
  getRateLimitTier(level: TrustLevel): RateLimitTier {
    const tiers: Record<TrustLevel, RateLimitTier> = {
      new: {
        commentsPerHour: 5,
        articlesPerDay: 1,
        likesPerHour: 20,
        reportsPerDay: 3,
      },
      low: {
        commentsPerHour: 15,
        articlesPerDay: 3,
        likesPerHour: 50,
        reportsPerDay: 5,
      },
      normal: {
        commentsPerHour: 30,
        articlesPerDay: 10,
        likesPerHour: 100,
        reportsPerDay: 10,
      },
      trusted: {
        commentsPerHour: 60,
        articlesPerDay: 20,
        likesPerHour: 200,
        reportsPerDay: 15,
      },
      highly_trusted: {
        commentsPerHour: 120,
        articlesPerDay: 50,
        likesPerHour: 500,
        reportsPerDay: 25,
      },
    };
    return tiers[level];
  },

  // Check if user can perform action based on trust
  async canPerformAction(
    userId: string,
    action: 'comment' | 'publish' | 'like' | 'report'
  ): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
    const trustScore = await this.calculateTrustScore(userId);
    const rateLimits = this.getRateLimitTier(trustScore.level);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    switch (action) {
      case 'comment': {
        const [result] = await db.execute(sql`
          SELECT COUNT(*) as count FROM comments
          WHERE author_id = ${userId} AND created_at > ${oneHourAgo}
        `);
        const count = Number((result as unknown as { count: number }).count);
        if (count >= rateLimits.commentsPerHour) {
          return {
            allowed: false,
            reason: `Comment limit reached (${rateLimits.commentsPerHour}/hour)`,
            retryAfter: 3600,
          };
        }
        break;
      }
      case 'publish': {
        const [result] = await db
          .select({ count: sql<number>`count(*)` })
          .from(drafts)
          .where(
            and(
              eq(drafts.authorId, userId),
              eq(drafts.status, 'published'),
              gte(drafts.publishedAt, oneDayAgo)
            )
          );
        const count = Number(result?.count || 0);
        if (count >= rateLimits.articlesPerDay) {
          return {
            allowed: false,
            reason: `Publish limit reached (${rateLimits.articlesPerDay}/day)`,
            retryAfter: 86400,
          };
        }
        break;
      }
      case 'like': {
        const [result] = await db.execute(sql`
          SELECT COUNT(*) as count FROM likes
          WHERE user_id = ${userId} AND created_at > ${oneHourAgo}
        `);
        const count = Number((result as unknown as { count: number }).count);
        if (count >= rateLimits.likesPerHour) {
          return {
            allowed: false,
            reason: `Like limit reached (${rateLimits.likesPerHour}/hour)`,
            retryAfter: 3600,
          };
        }
        break;
      }
      case 'report': {
        const [result] = await db.execute(sql`
          SELECT COUNT(*) as count FROM content_reports
          WHERE reporter_id = ${userId} AND created_at > ${oneDayAgo}
        `);
        const count = Number((result as unknown as { count: number }).count);
        if (count >= rateLimits.reportsPerDay) {
          return {
            allowed: false,
            reason: `Report limit reached (${rateLimits.reportsPerDay}/day)`,
            retryAfter: 86400,
          };
        }
        break;
      }
    }

    return { allowed: true };
  },

  // Invalidate cached trust score (call after significant events)
  async invalidateTrustScore(userId: string): Promise<void> {
    await cacheService.delete(`trust:${userId}`);
  },

  // Check if content needs moderation based on author trust
  async needsModeration(userId: string): Promise<boolean> {
    const trustScore = await this.calculateTrustScore(userId);
    return trustScore.level === 'new' || trustScore.level === 'low';
  },

  // Get user's trust info for display
  async getUserTrustInfo(userId: string): Promise<{
    level: TrustLevel;
    privileges: string[];
  }> {
    const trustScore = await this.calculateTrustScore(userId);

    const privileges: string[] = [];

    if (trustScore.level !== 'new') {
      privileges.push('Standard posting');
    }
    if (trustScore.level === 'trusted' || trustScore.level === 'highly_trusted') {
      privileges.push('Priority support');
      privileges.push('Extended rate limits');
    }
    if (trustScore.level === 'highly_trusted') {
      privileges.push('Community moderation');
      privileges.push('Beta features');
    }

    return {
      level: trustScore.level,
      privileges,
    };
  },
};
