// Gamification Service
// Handles streaks, badges, and points system

import { eq, sql, and, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userStreaks, badges, userBadges, pointsLedger, userPoints } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { notificationService } from './notification.service.js';

// Point values for different actions
const POINT_VALUES = {
  daily_login: 5,
  publish_article: 50,
  receive_like: 5,
  receive_comment: 10,
  give_like: 2,
  post_comment: 5,
  streak_bonus: 10, // per day
  badge_earned: 0, // varies by badge
} as const;

// Level thresholds
const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 1000, 2000, 4000, 7500, 12000, 20000, 35000, 50000,
];

interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  streakMaintained: boolean;
  pointsAwarded: number;
}

interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  category: string;
  tier: string;
  pointsReward: number;
}

export const gamificationService = {
  // Record daily activity and update streak
  async recordActivity(userId: string, streakType = 'login'): Promise<StreakResult> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get current streak data
    const [current] = await db
      .select()
      .from(userStreaks)
      .where(and(eq(userStreaks.userId, userId), eq(userStreaks.streakType, streakType)));

    let newStreak = 1;
    let streakMaintained = false;
    let longestStreak = 0;

    if (current) {
      const lastDate = current.lastActivityDate
        ? new Date(current.lastActivityDate)
        : null;

      if (lastDate) {
        lastDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor(
          (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff === 0) {
          // Already logged today
          return {
            currentStreak: current.currentStreak,
            longestStreak: current.longestStreak,
            streakMaintained: true,
            pointsAwarded: 0,
          };
        } else if (daysDiff === 1) {
          // Streak continues
          newStreak = current.currentStreak + 1;
          streakMaintained = true;
        }
        // daysDiff > 1 means streak broken, reset to 1
      }

      longestStreak = Math.max(newStreak, current.longestStreak);

      await db
        .update(userStreaks)
        .set({
          currentStreak: newStreak,
          longestStreak,
          lastActivityDate: today,
          updatedAt: new Date(),
        })
        .where(and(eq(userStreaks.userId, userId), eq(userStreaks.streakType, streakType)));
    } else {
      // First activity
      longestStreak = 1;
      await db.insert(userStreaks).values({
        userId,
        streakType,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
      });
    }

    // Award streak bonus points (with diminishing returns)
    const points = this.calculateStreakPoints(newStreak);
    if (points > 0) {
      await this.awardPoints(userId, points, 'streak_bonus');
    }

    // Check for streak badges
    await this.checkAndAwardBadges(userId, 'streak');

    return {
      currentStreak: newStreak,
      longestStreak,
      streakMaintained,
      pointsAwarded: points,
    };
  },

  // Calculate points for streak with diminishing returns
  calculateStreakPoints(streak: number): number {
    if (streak <= 7) return streak * 10;
    if (streak <= 30) return 70 + (streak - 7) * 5;
    return Math.min(185 + (streak - 30) * 2, 500); // Cap at 500
  },

  // Award points to user
  async awardPoints(
    userId: string,
    points: number,
    actionType: keyof typeof POINT_VALUES | string,
    referenceId?: string,
    referenceType?: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Add to ledger
      await tx.insert(pointsLedger).values({
        userId,
        points,
        actionType,
        referenceId,
        referenceType,
      });

      // Update totals
      const [existing] = await tx.select().from(userPoints).where(eq(userPoints.userId, userId));

      if (existing) {
        const newTotal = existing.totalPoints + points;
        const newLevel = this.calculateLevel(newTotal);
        const leveledUp = newLevel > existing.level;

        await tx
          .update(userPoints)
          .set({
            totalPoints: newTotal,
            weeklyPoints: existing.weeklyPoints + points,
            monthlyPoints: existing.monthlyPoints + points,
            level: newLevel,
            updatedAt: new Date(),
          })
          .where(eq(userPoints.userId, userId));

        if (leveledUp) {
          await notificationService.create({
            userId,
            type: 'mention', // Using mention as closest type for system notification
            title: 'Level Up!',
            message: `Congratulations! You've reached level ${newLevel}!`,
          });
        }
      } else {
        const level = this.calculateLevel(points);
        await tx.insert(userPoints).values({
          userId,
          totalPoints: points,
          weeklyPoints: points,
          monthlyPoints: points,
          level,
        });
      }
    });
  },

  // Calculate level from total points
  calculateLevel(points: number): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (points >= LEVEL_THRESHOLDS[i]) {
        return i + 1;
      }
    }
    return 1;
  },

  // Get user's points and level
  async getUserPoints(userId: string) {
    const [points] = await db.select().from(userPoints).where(eq(userPoints.userId, userId));

    if (!points) {
      return {
        totalPoints: 0,
        weeklyPoints: 0,
        monthlyPoints: 0,
        level: 1,
        nextLevelPoints: LEVEL_THRESHOLDS[1],
        progress: 0,
      };
    }

    const nextLevelThreshold = LEVEL_THRESHOLDS[points.level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const currentThreshold = LEVEL_THRESHOLDS[points.level - 1] || 0;
    const progress = Math.min(
      ((points.totalPoints - currentThreshold) / (nextLevelThreshold - currentThreshold)) * 100,
      100
    );

    return {
      ...points,
      nextLevelPoints: nextLevelThreshold,
      progress: Math.round(progress),
    };
  },

  // Get user's streak info
  async getUserStreak(userId: string, streakType = 'login') {
    const [streak] = await db
      .select()
      .from(userStreaks)
      .where(and(eq(userStreaks.userId, userId), eq(userStreaks.streakType, streakType)));

    return streak || { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
  },

  // Check and award badges
  async checkAndAwardBadges(userId: string, triggerAction: string): Promise<Badge[]> {
    // Get badges user doesn't have that match trigger action
    const eligibleBadges = await db
      .select()
      .from(badges)
      .where(
        and(
          eq(badges.isActive, true),
          sql`${badges.criteria}->>'trigger' = ${triggerAction}`
        )
      );

    const awarded: Badge[] = [];

    for (const badge of eligibleBadges) {
      // Check if user already has this badge
      const [existing] = await db
        .select({ id: userBadges.id })
        .from(userBadges)
        .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badge.id)));

      if (existing) continue;

      // Evaluate criteria
      const criteria = badge.criteria as { trigger: string; metric: string; value: number };
      const earned = await this.evaluateBadgeCriteria(userId, criteria);

      if (earned) {
        await db.insert(userBadges).values({
          userId,
          badgeId: badge.id,
        });

        if (badge.pointsReward > 0) {
          await this.awardPoints(userId, badge.pointsReward, 'badge_earned', badge.id, 'badge');
        }

        // Notify user
        await notificationService.create({
          userId,
          type: 'mention',
          title: 'Badge Earned!',
          message: `You've earned the "${badge.name}" badge!`,
        });

        awarded.push(badge);
        logger.info({ userId, badgeId: badge.id, badgeName: badge.name }, 'Badge awarded');
      }
    }

    return awarded;
  },

  // Evaluate badge criteria
  async evaluateBadgeCriteria(
    userId: string,
    criteria: { metric: string; value: number }
  ): Promise<boolean> {
    switch (criteria.metric) {
      case 'streak_days': {
        const streak = await this.getUserStreak(userId);
        return streak.currentStreak >= criteria.value;
      }
      case 'total_points': {
        const points = await this.getUserPoints(userId);
        return points.totalPoints >= criteria.value;
      }
      case 'articles_published': {
        const [result] = await db.execute(
          sql`SELECT COUNT(*) as count FROM drafts WHERE author_id = ${userId} AND status = 'published'`
        );
        return Number((result as unknown as { count: number }).count) >= criteria.value;
      }
      case 'total_likes_received': {
        const [result] = await db.execute(
          sql`SELECT COUNT(*) as count FROM likes l JOIN drafts d ON l.draft_id = d.id WHERE d.author_id = ${userId}`
        );
        return Number((result as unknown as { count: number }).count) >= criteria.value;
      }
      default:
        return false;
    }
  },

  // Get user's badges
  async getUserBadges(userId: string) {
    return db
      .select({
        id: badges.id,
        slug: badges.slug,
        name: badges.name,
        description: badges.description,
        iconUrl: badges.iconUrl,
        category: badges.category,
        tier: badges.tier,
        earnedAt: userBadges.earnedAt,
      })
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(eq(userBadges.userId, userId))
      .orderBy(userBadges.earnedAt);
  },

  // Get all available badges
  async getAllBadges() {
    return db.select().from(badges).where(eq(badges.isActive, true)).orderBy(badges.category, badges.tier);
  },

  // Get leaderboard
  async getLeaderboard(period: 'weekly' | 'monthly' | 'all_time' = 'weekly', limit = 10) {
    const pointsColumn =
      period === 'weekly'
        ? userPoints.weeklyPoints
        : period === 'monthly'
          ? userPoints.monthlyPoints
          : userPoints.totalPoints;

    return db
      .select({
        userId: userPoints.userId,
        points: pointsColumn,
        level: userPoints.level,
      })
      .from(userPoints)
      .where(gte(pointsColumn, 1))
      .orderBy(sql`${pointsColumn} DESC`)
      .limit(limit);
  },

  // Reset weekly/monthly points (run on schedule)
  async resetPeriodPoints(period: 'weekly' | 'monthly'): Promise<void> {
    await db.update(userPoints).set({ [period === 'weekly' ? 'weeklyPoints' : 'monthlyPoints']: 0 });
    logger.info({ period }, 'Period points reset');
  },

  // Award points for common actions
  async onArticlePublished(authorId: string, articleId: string): Promise<void> {
    await this.awardPoints(authorId, POINT_VALUES.publish_article, 'publish_article', articleId, 'article');
    await this.checkAndAwardBadges(authorId, 'publish');
  },

  async onLikeReceived(authorId: string, articleId: string): Promise<void> {
    await this.awardPoints(authorId, POINT_VALUES.receive_like, 'receive_like', articleId, 'article');
    await this.checkAndAwardBadges(authorId, 'likes');
  },

  async onCommentReceived(authorId: string, commentId: string): Promise<void> {
    await this.awardPoints(authorId, POINT_VALUES.receive_comment, 'receive_comment', commentId, 'comment');
    await this.checkAndAwardBadges(authorId, 'comments');
  },
};
