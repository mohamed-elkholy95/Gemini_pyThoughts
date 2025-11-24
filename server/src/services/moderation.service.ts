// Moderation Service
// Admin moderation tools for content and user management

import { eq, sql, and, gte, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, drafts, comments, contentReports } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { trustService } from './trust.service.js';
import { spamService } from './spam.service.js';
import { notificationService } from './notification.service.js';
import { auditService } from './audit.service.js';

interface ModerationQueueItem {
  id: string;
  type: 'article' | 'comment' | 'user';
  title?: string;
  content?: string;
  authorId: string;
  authorName: string;
  reason: string;
  reportCount: number;
  trustLevel: string;
  createdAt: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface ModerationAction {
  type: 'approve' | 'reject' | 'warn' | 'suspend' | 'ban' | 'delete';
  reason: string;
  duration?: number; // In hours for temporary actions
  notifyUser?: boolean;
}

interface ModerationStats {
  pendingReports: number;
  resolvedToday: number;
  flaggedContent: number;
  suspendedUsers: number;
  spamBlocked24h: number;
}

export const moderationService = {
  // Get moderation queue (items needing review)
  async getModerationQueue(
    page = 1,
    limit = 20,
    filter?: 'all' | 'articles' | 'comments' | 'users'
  ): Promise<{ items: ModerationQueueItem[]; total: number }> {
    const offset = (page - 1) * limit;
    const items: ModerationQueueItem[] = [];

    // Get pending reports grouped by content
    const typeFilter = filter === 'all' || !filter ? ['article', 'comment', 'user'] : [filter === 'articles' ? 'article' : filter === 'users' ? 'user' : 'comment'];

    const reports = await db.execute(sql`
      SELECT
        cr.content_type as type,
        cr.content_id as id,
        COUNT(*) as report_count,
        array_agg(DISTINCT cr.reason) as reasons,
        MIN(cr.created_at) as first_reported
      FROM content_reports cr
      WHERE cr.status = 'pending'
        AND cr.content_type = ANY(${typeFilter})
      GROUP BY cr.content_type, cr.content_id
      ORDER BY report_count DESC, first_reported ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Enrich with content details
    for (const report of reports as unknown as Array<{
      type: string;
      id: string;
      report_count: number;
      reasons: string[];
      first_reported: Date;
    }>) {
      let item: ModerationQueueItem | null = null;

      if (report.type === 'article') {
        const [article] = await db
          .select({
            id: drafts.id,
            title: drafts.title,
            authorId: drafts.authorId,
            authorName: users.name,
            createdAt: drafts.createdAt,
          })
          .from(drafts)
          .innerJoin(users, eq(drafts.authorId, users.id))
          .where(eq(drafts.id, report.id));

        if (article) {
          const trust = await trustService.calculateTrustScore(article.authorId);
          item = {
            id: article.id,
            type: 'article',
            title: article.title,
            authorId: article.authorId,
            authorName: article.authorName || 'Unknown',
            reason: report.reasons.join(', '),
            reportCount: Number(report.report_count),
            trustLevel: trust.level,
            createdAt: report.first_reported,
            priority: this.calculatePriority(Number(report.report_count), trust.level),
          };
        }
      } else if (report.type === 'comment') {
        const [comment] = await db
          .select({
            id: comments.id,
            content: comments.content,
            authorId: comments.authorId,
            authorName: users.name,
            createdAt: comments.createdAt,
          })
          .from(comments)
          .innerJoin(users, eq(comments.authorId, users.id))
          .where(eq(comments.id, report.id));

        if (comment) {
          const trust = await trustService.calculateTrustScore(comment.authorId);
          item = {
            id: comment.id,
            type: 'comment',
            content: comment.content,
            authorId: comment.authorId,
            authorName: comment.authorName || 'Unknown',
            reason: report.reasons.join(', '),
            reportCount: Number(report.report_count),
            trustLevel: trust.level,
            createdAt: report.first_reported,
            priority: this.calculatePriority(Number(report.report_count), trust.level),
          };
        }
      } else if (report.type === 'user') {
        const [user] = await db
          .select({ id: users.id, name: users.name, createdAt: users.createdAt })
          .from(users)
          .where(eq(users.id, report.id));

        if (user) {
          const trust = await trustService.calculateTrustScore(user.id);
          item = {
            id: user.id,
            type: 'user',
            title: user.name || 'Unknown User',
            authorId: user.id,
            authorName: user.name || 'Unknown',
            reason: report.reasons.join(', '),
            reportCount: Number(report.report_count),
            trustLevel: trust.level,
            createdAt: report.first_reported,
            priority: this.calculatePriority(Number(report.report_count), trust.level),
          };
        }
      }

      if (item) {
        items.push(item);
      }
    }

    // Get total count
    const [totalResult] = await db.execute(sql`
      SELECT COUNT(DISTINCT (content_type, content_id)) as total
      FROM content_reports
      WHERE status = 'pending'
    `);

    return {
      items: items.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }),
      total: Number((totalResult as unknown as { total: number }).total || 0),
    };
  },

  // Calculate priority based on report count and trust level
  calculatePriority(reportCount: number, trustLevel: string): 'low' | 'medium' | 'high' | 'critical' {
    if (reportCount >= 10 || trustLevel === 'new') return 'critical';
    if (reportCount >= 5 || trustLevel === 'low') return 'high';
    if (reportCount >= 3) return 'medium';
    return 'low';
  },

  // Take action on a moderation item
  async takeAction(
    contentType: 'article' | 'comment' | 'user',
    contentId: string,
    action: ModerationAction,
    moderatorId: string
  ): Promise<{ success: boolean; message: string }> {
    logger.info({ contentType, contentId, action, moderatorId }, 'Moderation action');

    try {
      switch (action.type) {
        case 'approve':
          await this.approveContent(contentType, contentId, moderatorId);
          break;
        case 'reject':
        case 'delete':
          await this.deleteContent(contentType, contentId, action.reason, moderatorId);
          break;
        case 'warn':
          await this.warnUser(contentType, contentId, action.reason, moderatorId);
          break;
        case 'suspend':
          await this.suspendUser(contentType, contentId, action.reason, action.duration || 24, moderatorId);
          break;
        case 'ban':
          await this.banUser(contentType, contentId, action.reason, moderatorId);
          break;
      }

      // Update report status
      await db
        .update(contentReports)
        .set({
          status: action.type === 'approve' ? 'dismissed' : 'resolved',
          reviewedAt: new Date(),
          reviewedBy: moderatorId,
          resolution: action.reason,
        })
        .where(and(eq(contentReports.contentType, contentType), eq(contentReports.contentId, contentId)));

      // Audit log - map moderation actions to audit actions
      const auditAction = action.type === 'ban' ? 'admin:user_ban' :
        action.type === 'delete' || action.type === 'reject' ? 'admin:content_remove' :
        action.type === 'approve' ? 'admin:content_restore' : 'admin:content_remove';

      await auditService.log({
        userId: moderatorId,
        action: auditAction,
        entityType: contentType === 'article' ? 'draft' : contentType === 'comment' ? 'comment' : 'user',
        entityId: contentId,
        metadata: { reason: action.reason, duration: action.duration, moderationAction: action.type },
      });

      return { success: true, message: `Action ${action.type} completed` };
    } catch (error) {
      logger.error({ error, contentType, contentId, action }, 'Moderation action failed');
      return { success: false, message: 'Action failed' };
    }
  },

  // Approve content (dismiss reports)
  async approveContent(contentType: string, contentId: string, _moderatorId: string): Promise<void> {
    // Just update reports to dismissed
    logger.info({ contentType, contentId }, 'Content approved');
  },

  // Delete content
  async deleteContent(contentType: string, contentId: string, reason: string, _moderatorId: string): Promise<void> {
    if (contentType === 'article') {
      await db
        .update(drafts)
        .set({ isDeleted: true, deletedAt: new Date() })
        .where(eq(drafts.id, contentId));
    } else if (contentType === 'comment') {
      await db
        .update(comments)
        .set({ isDeleted: true, content: '[Removed by moderator]' })
        .where(eq(comments.id, contentId));
    }

    logger.info({ contentType, contentId, reason }, 'Content deleted');
  },

  // Warn user
  async warnUser(contentType: string, contentId: string, reason: string, _moderatorId: string): Promise<void> {
    // Get the user ID
    let userId: string | null = null;

    if (contentType === 'article') {
      const [article] = await db.select({ authorId: drafts.authorId }).from(drafts).where(eq(drafts.id, contentId));
      userId = article?.authorId || null;
    } else if (contentType === 'comment') {
      const [comment] = await db.select({ authorId: comments.authorId }).from(comments).where(eq(comments.id, contentId));
      userId = comment?.authorId || null;
    } else if (contentType === 'user') {
      userId = contentId;
    }

    if (userId) {
      await notificationService.create({
        userId,
        type: 'mention', // Using mention as system notification type
        title: 'Content Warning',
        message: `Your content has been flagged: ${reason}. Please review our community guidelines.`,
      });
    }
  },

  // Suspend user temporarily
  async suspendUser(
    contentType: string,
    contentId: string,
    reason: string,
    durationHours: number,
    _moderatorId: string
  ): Promise<void> {
    let userId: string | null = null;

    if (contentType === 'user') {
      userId = contentId;
    } else if (contentType === 'article') {
      const [article] = await db.select({ authorId: drafts.authorId }).from(drafts).where(eq(drafts.id, contentId));
      userId = article?.authorId || null;
    } else if (contentType === 'comment') {
      const [comment] = await db.select({ authorId: comments.authorId }).from(comments).where(eq(comments.id, contentId));
      userId = comment?.authorId || null;
    }

    if (userId) {
      // Block user from spam service (temporary)
      await spamService.blockUser(userId, `Suspended: ${reason}`);

      await notificationService.create({
        userId,
        type: 'mention',
        title: 'Account Suspended',
        message: `Your account has been suspended for ${durationHours} hours due to: ${reason}`,
      });

      logger.info({ userId, durationHours, reason }, 'User suspended');
    }
  },

  // Ban user permanently
  async banUser(contentType: string, contentId: string, reason: string, _moderatorId: string): Promise<void> {
    let userId: string | null = null;

    if (contentType === 'user') {
      userId = contentId;
    } else if (contentType === 'article') {
      const [article] = await db.select({ authorId: drafts.authorId }).from(drafts).where(eq(drafts.id, contentId));
      userId = article?.authorId || null;
    } else if (contentType === 'comment') {
      const [comment] = await db.select({ authorId: comments.authorId }).from(comments).where(eq(comments.id, contentId));
      userId = comment?.authorId || null;
    }

    if (userId) {
      // Permanently block
      await spamService.blockUser(userId, `Banned: ${reason}`);

      // Anonymize user
      await db
        .update(users)
        .set({
          name: 'Banned User',
          bio: null,
          image: null,
        })
        .where(eq(users.id, userId));

      logger.warn({ userId, reason }, 'User banned');
    }
  },

  // Get moderation statistics
  async getStats(): Promise<ModerationStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingReports] = await db
      .select({ count: count() })
      .from(contentReports)
      .where(eq(contentReports.status, 'pending'));

    const [resolvedToday] = await db
      .select({ count: count() })
      .from(contentReports)
      .where(and(gte(contentReports.reviewedAt, today), eq(contentReports.status, 'resolved')));

    const [flaggedContent] = await db.execute(sql`
      SELECT COUNT(DISTINCT (content_type, content_id)) as count
      FROM content_reports
      WHERE status = 'pending'
    `);

    const spamStats = await spamService.getSpamStats();

    return {
      pendingReports: Number(pendingReports?.count || 0),
      resolvedToday: Number(resolvedToday?.count || 0),
      flaggedContent: Number((flaggedContent as unknown as { count: number }).count || 0),
      suspendedUsers: spamStats.blockedUsers,
      spamBlocked24h: spamStats.recentAttempts,
    };
  },

  // Get recent moderation activity
  async getRecentActivity(limit = 20): Promise<Array<{
    id: string;
    action: string;
    contentType: string;
    contentId: string;
    moderatorName: string;
    createdAt: Date;
  }>> {
    const activity = await db.execute(sql`
      SELECT
        al.id,
        al.action,
        al.entity_type as content_type,
        al.entity_id as content_id,
        u.name as moderator_name,
        al.created_at
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action LIKE 'moderation:%'
      ORDER BY al.created_at DESC
      LIMIT ${limit}
    `);

    return (activity as unknown as Array<{
      id: string;
      action: string;
      content_type: string;
      content_id: string;
      moderator_name: string;
      created_at: Date;
    }>).map((a) => ({
      id: a.id,
      action: a.action,
      contentType: a.content_type,
      contentId: a.content_id,
      moderatorName: a.moderator_name || 'System',
      createdAt: a.created_at,
    }));
  },

  // Bulk approve reports
  async bulkApprove(reportIds: string[], moderatorId: string): Promise<number> {
    let approved = 0;
    for (const reportId of reportIds) {
      const [report] = await db
        .select()
        .from(contentReports)
        .where(eq(contentReports.id, reportId));

      if (report) {
        await this.takeAction(
          report.contentType as 'article' | 'comment' | 'user',
          report.contentId,
          { type: 'approve', reason: 'Bulk approved' },
          moderatorId
        );
        approved++;
      }
    }
    return approved;
  },

  // Auto-moderate content based on spam score
  async autoModerate(
    contentType: 'article' | 'comment',
    contentId: string,
    content: string,
    authorId: string
  ): Promise<{ action: 'allow' | 'review' | 'block'; reason?: string }> {
    const spamAnalysis = await spamService.analyzeContent({
      text: content,
      userId: authorId,
      contentType,
    });

    if (spamAnalysis.recommendation === 'block') {
      // Auto-delete and create report
      await this.deleteContent(contentType, contentId, 'Auto-blocked by spam filter', 'system');

      await db.insert(contentReports).values({
        contentType,
        contentId,
        reporterId: 'system',
        reason: 'spam',
        description: `Auto-detected spam (score: ${spamAnalysis.score.toFixed(2)})`,
        status: 'resolved',
        reviewedAt: new Date(),
        reviewedBy: 'system',
        resolution: 'Auto-blocked',
      });

      return { action: 'block', reason: 'Spam detected' };
    }

    if (spamAnalysis.recommendation === 'review') {
      // Create report for manual review
      await db.insert(contentReports).values({
        contentType,
        contentId,
        reporterId: 'system',
        reason: 'spam',
        description: `Flagged for review (score: ${spamAnalysis.score.toFixed(2)})`,
        status: 'pending',
      });

      return { action: 'review', reason: 'Flagged for review' };
    }

    return { action: 'allow' };
  },
};
