// Email Digest Service
// Sends periodic email digests with personalized content summaries

import { eq, sql, and, gte, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, drafts, follows, userPreferences } from '../db/schema.js';
import { emailService } from './email.service.js';
import { recommendationService } from './recommendation.service.js';
import { logger } from '../config/logger.js';
import Handlebars from 'handlebars';

const APP_NAME = process.env.APP_NAME || 'Pythoughts';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Digest email template
const digestTemplate = Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background: white; }
    .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
    .section { padding: 20px 0; border-bottom: 1px solid #eee; }
    .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #2C3E50; }
    .article-card { background: #f9f9f9; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
    .article-title { font-size: 16px; font-weight: 600; margin-bottom: 5px; }
    .article-title a { color: #2C3E50; text-decoration: none; }
    .article-meta { font-size: 13px; color: #666; }
    .article-excerpt { font-size: 14px; color: #555; margin-top: 10px; }
    .stats-grid { display: flex; gap: 20px; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #2C3E50; }
    .stat-label { font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 12px 24px; background: #2C3E50; color: white; text-decoration: none; border-radius: 6px; }
    .footer { text-align: center; padding: 20px 0; color: #666; font-size: 12px; }
    .author-card { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .author-avatar { width: 40px; height: 40px; border-radius: 50%; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{appName}}</h1>
      <p>Your {{frequency}} digest for {{dateRange}}</p>
    </div>

    {{#if stats}}
    <div class="section">
      <div class="section-title">Your Stats</div>
      <div class="stats-grid">
        <div class="stat">
          <div class="stat-value">{{stats.views}}</div>
          <div class="stat-label">Views</div>
        </div>
        <div class="stat">
          <div class="stat-value">{{stats.likes}}</div>
          <div class="stat-label">Likes</div>
        </div>
        <div class="stat">
          <div class="stat-value">{{stats.comments}}</div>
          <div class="stat-label">Comments</div>
        </div>
        <div class="stat">
          <div class="stat-value">{{stats.newFollowers}}</div>
          <div class="stat-label">New Followers</div>
        </div>
      </div>
    </div>
    {{/if}}

    {{#if newArticles.length}}
    <div class="section">
      <div class="section-title">New from people you follow</div>
      {{#each newArticles}}
      <div class="article-card">
        <div class="article-title"><a href="{{../appUrl}}/article/{{this.slug}}">{{this.title}}</a></div>
        <div class="article-meta">by {{this.authorName}} • {{this.readingTime}} min read</div>
        {{#if this.excerpt}}<div class="article-excerpt">{{this.excerpt}}</div>{{/if}}
      </div>
      {{/each}}
    </div>
    {{/if}}

    {{#if recommendations.length}}
    <div class="section">
      <div class="section-title">Recommended for you</div>
      {{#each recommendations}}
      <div class="article-card">
        <div class="article-title"><a href="{{../appUrl}}/article/{{this.slug}}">{{this.title}}</a></div>
        <div class="article-meta">by {{this.authorName}}</div>
      </div>
      {{/each}}
    </div>
    {{/if}}

    {{#if topAuthors.length}}
    <div class="section">
      <div class="section-title">Authors you might like</div>
      {{#each topAuthors}}
      <div class="author-card">
        <img src="{{this.image}}" class="author-avatar" alt="">
        <div>
          <strong>{{this.name}}</strong>
          <div class="article-meta">{{this.articleCount}} articles</div>
        </div>
      </div>
      {{/each}}
    </div>
    {{/if}}

    <div class="section" style="text-align: center;">
      <a href="{{appUrl}}/feed" class="button">Read More on {{appName}}</a>
    </div>

    <div class="footer">
      <p>© {{year}} {{appName}}. All rights reserved.</p>
      <p>
        <a href="{{appUrl}}/settings/notifications">Manage email preferences</a> •
        <a href="{{unsubscribeUrl}}">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
`);

interface DigestData {
  stats: {
    views: number;
    likes: number;
    comments: number;
    newFollowers: number;
  };
  newArticles: Array<{
    id: string;
    title: string;
    slug: string | null;
    excerpt: string | null;
    authorName: string;
    readingTime: number;
  }>;
  recommendations: Array<{
    id: string;
    title: string;
    slug: string | null;
    authorName: string;
  }>;
  topAuthors: Array<{
    id: string;
    name: string;
    image: string | null;
    articleCount: number;
  }>;
}

type DigestFrequency = 'daily' | 'weekly';

export const digestService = {
  // Generate and send digest for a user
  async sendDigest(userId: string, frequency: DigestFrequency): Promise<boolean> {
    // Get user info and preferences
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return false;

    // Check if user wants digests
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    // Check if user wants email notifications (use emailNotifications as proxy for digest preference)
    if (!prefs?.emailNotifications) return false;

    // Generate digest data
    const digestData = await this.generateDigestData(userId, frequency);

    // Skip if no content
    if (
      digestData.newArticles.length === 0 &&
      digestData.recommendations.length === 0 &&
      digestData.stats.views === 0 &&
      digestData.stats.newFollowers === 0
    ) {
      logger.debug({ userId }, 'Skipping empty digest');
      return false;
    }

    // Generate email HTML
    const dateRange = frequency === 'daily' ? 'today' : 'this week';
    const html = digestTemplate({
      appName: APP_NAME,
      appUrl: APP_URL,
      frequency,
      dateRange,
      year: new Date().getFullYear(),
      unsubscribeUrl: `${APP_URL}/unsubscribe?type=digest&user=${userId}`,
      ...digestData,
    });

    // Send email
    const sent = await emailService.send({
      to: user.email,
      subject: `Your ${frequency} digest from ${APP_NAME}`,
      html,
    });

    if (sent) {
      logger.info({ userId, frequency }, 'Digest sent');
    }

    return sent;
  },

  // Generate digest data for a user
  async generateDigestData(userId: string, frequency: DigestFrequency): Promise<DigestData> {
    const periodStart = frequency === 'daily'
      ? new Date(Date.now() - 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get user's stats for the period
    const stats = await this.getUserPeriodStats(userId, periodStart);

    // Get new articles from followed users
    const newArticles = await this.getNewArticlesFromFollowing(userId, periodStart);

    // Get recommendations
    const recommendations = await recommendationService.getRecommendations(userId, 5);

    // Get recommended authors
    const topAuthors = await recommendationService.getRecommendedAuthors(userId, 3);

    return {
      stats,
      newArticles,
      recommendations: recommendations.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        authorName: r.authorName,
      })),
      topAuthors,
    };
  },

  // Get user's stats for a period
  async getUserPeriodStats(
    userId: string,
    since: Date
  ): Promise<{ views: number; likes: number; comments: number; newFollowers: number }> {
    // Get views on user's articles
    const [viewsResult] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM article_views av
      JOIN drafts d ON av.draft_id = d.id
      WHERE d.author_id = ${userId}
        AND av.created_at >= ${since}
    `);

    // Get likes received
    const [likesResult] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM likes l
      JOIN drafts d ON l.draft_id = d.id
      WHERE d.author_id = ${userId}
        AND l.created_at >= ${since}
    `);

    // Get comments received
    const [commentsResult] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM comments c
      JOIN drafts d ON c.draft_id = d.id
      WHERE d.author_id = ${userId}
        AND c.author_id != ${userId}
        AND c.created_at >= ${since}
    `);

    // Get new followers
    const [followersResult] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM follows
      WHERE following_id = ${userId}
        AND created_at >= ${since}
    `);

    return {
      views: Number((viewsResult as unknown as { count: number }).count || 0),
      likes: Number((likesResult as unknown as { count: number }).count || 0),
      comments: Number((commentsResult as unknown as { count: number }).count || 0),
      newFollowers: Number((followersResult as unknown as { count: number }).count || 0),
    };
  },

  // Get new articles from followed users
  async getNewArticlesFromFollowing(
    userId: string,
    since: Date
  ): Promise<Array<{ id: string; title: string; slug: string | null; excerpt: string | null; authorName: string; readingTime: number }>> {
    // Get followed users
    const following = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    const followingIds = following.map((f) => f.followingId);
    if (followingIds.length === 0) return [];

    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        slug: drafts.slug,
        excerpt: drafts.excerpt,
        authorName: users.name,
        readingTime: drafts.readingTime,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false),
          gte(drafts.publishedAt, since),
          sql`${drafts.authorId} IN (${sql.join(followingIds.map(id => sql`${id}`), sql`, `)})`
        )
      )
      .orderBy(desc(drafts.publishedAt))
      .limit(10);

    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt,
      authorName: a.authorName || 'Unknown',
      readingTime: a.readingTime || 5,
    }));
  },

  // Send digests to all users (called by scheduler)
  async sendAllDigests(frequency: DigestFrequency): Promise<{ sent: number; skipped: number; errors: number }> {
    const results = { sent: 0, skipped: 0, errors: 0 };

    // Get users who want email notifications (as proxy for digest)
    const usersToNotify = await db
      .select({ userId: userPreferences.userId })
      .from(userPreferences)
      .where(eq(userPreferences.emailNotifications, true));

    logger.info({ frequency, userCount: usersToNotify.length }, 'Starting digest batch');

    for (const { userId } of usersToNotify) {
      try {
        const sent = await this.sendDigest(userId, frequency);
        if (sent) {
          results.sent++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.errors++;
        logger.error({ error, userId }, 'Failed to send digest');
      }

      // Rate limiting - don't overwhelm email server
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info({ frequency, results }, 'Digest batch completed');
    return results;
  },

  // Update user's email notification preference (used as digest preference)
  async updateDigestPreference(
    userId: string,
    enabled: boolean
  ): Promise<void> {
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    if (existing) {
      await db
        .update(userPreferences)
        .set({ emailNotifications: enabled })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db.insert(userPreferences).values({
        userId,
        emailNotifications: enabled,
      });
    }

    logger.info({ userId, enabled }, 'Digest preference updated');
  },

  // Get user's digest preference
  async getDigestPreference(userId: string): Promise<boolean> {
    const [prefs] = await db
      .select({ emailNotifications: userPreferences.emailNotifications })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    return prefs?.emailNotifications ?? true;
  },
};
