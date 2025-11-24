// Content Report Service
// Handles user reports for inappropriate content

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contentReports, users, drafts, comments, type ContentReport } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { notificationService } from './notification.service.js';

type ReportReason = 'spam' | 'harassment' | 'hate_speech' | 'misinformation' | 'copyright' | 'other';
type ContentType = 'article' | 'comment' | 'user';
type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

interface CreateReportInput {
  reporterId: string;
  contentType: ContentType;
  contentId: string;
  reason: ReportReason;
  description?: string;
}

interface UpdateReportInput {
  status: ReportStatus;
  resolution?: string;
}

interface ReportWithDetails extends ContentReport {
  reporter: {
    id: string;
    name: string;
  };
  reviewer?: {
    id: string;
    name: string;
  } | null;
  contentPreview?: string;
  contentAuthor?: {
    id: string;
    name: string;
  };
}

export const reportService = {
  // Create a new report
  async create(input: CreateReportInput): Promise<ContentReport> {
    // Check for duplicate report from same user
    const [existing] = await db
      .select({ id: contentReports.id })
      .from(contentReports)
      .where(
        and(
          eq(contentReports.reporterId, input.reporterId),
          eq(contentReports.contentType, input.contentType),
          eq(contentReports.contentId, input.contentId),
          eq(contentReports.status, 'pending')
        )
      );

    if (existing) {
      throw new Error('You have already reported this content');
    }

    // Validate content exists
    const contentExists = await this.validateContent(input.contentType, input.contentId);
    if (!contentExists) {
      throw new Error('Content not found');
    }

    const [report] = await db
      .insert(contentReports)
      .values({
        reporterId: input.reporterId,
        contentType: input.contentType,
        contentId: input.contentId,
        reason: input.reason,
        description: input.description,
      })
      .returning();

    logger.info(
      {
        reportId: report.id,
        contentType: input.contentType,
        contentId: input.contentId,
        reason: input.reason,
      },
      'Content report created'
    );

    return report;
  },

  // Validate that the reported content exists
  async validateContent(contentType: ContentType, contentId: string): Promise<boolean> {
    switch (contentType) {
      case 'article': {
        const [article] = await db
          .select({ id: drafts.id })
          .from(drafts)
          .where(eq(drafts.id, contentId));
        return !!article;
      }
      case 'comment': {
        const [comment] = await db
          .select({ id: comments.id })
          .from(comments)
          .where(eq(comments.id, contentId));
        return !!comment;
      }
      case 'user': {
        const [user] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, contentId));
        return !!user;
      }
      default:
        return false;
    }
  },

  // Get report by ID with details
  async getById(reportId: string): Promise<ReportWithDetails | null> {
    const [report] = await db
      .select({
        id: contentReports.id,
        reporterId: contentReports.reporterId,
        contentType: contentReports.contentType,
        contentId: contentReports.contentId,
        reason: contentReports.reason,
        description: contentReports.description,
        status: contentReports.status,
        reviewedBy: contentReports.reviewedBy,
        reviewedAt: contentReports.reviewedAt,
        resolution: contentReports.resolution,
        createdAt: contentReports.createdAt,
        reporterName: users.name,
      })
      .from(contentReports)
      .innerJoin(users, eq(contentReports.reporterId, users.id))
      .where(eq(contentReports.id, reportId));

    if (!report) return null;

    // Get reviewer details if exists
    let reviewer = null;
    if (report.reviewedBy) {
      const [reviewerData] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, report.reviewedBy));
      reviewer = reviewerData;
    }

    // Get content preview and author
    const { preview, author } = await this.getContentDetails(report.contentType as ContentType, report.contentId);

    return {
      id: report.id,
      reporterId: report.reporterId,
      contentType: report.contentType,
      contentId: report.contentId,
      reason: report.reason,
      description: report.description,
      status: report.status,
      reviewedBy: report.reviewedBy,
      reviewedAt: report.reviewedAt,
      resolution: report.resolution,
      createdAt: report.createdAt,
      reporter: {
        id: report.reporterId,
        name: report.reporterName,
      },
      reviewer,
      contentPreview: preview,
      contentAuthor: author,
    };
  },

  // Get content details for report view
  async getContentDetails(
    contentType: ContentType,
    contentId: string
  ): Promise<{ preview: string; author?: { id: string; name: string } }> {
    switch (contentType) {
      case 'article': {
        const [article] = await db
          .select({
            title: drafts.title,
            authorId: drafts.authorId,
            authorName: users.name,
          })
          .from(drafts)
          .innerJoin(users, eq(drafts.authorId, users.id))
          .where(eq(drafts.id, contentId));
        return {
          preview: article?.title || 'Unknown article',
          author: article ? { id: article.authorId, name: article.authorName } : undefined,
        };
      }
      case 'comment': {
        const [comment] = await db
          .select({
            content: comments.content,
            authorId: comments.authorId,
            authorName: users.name,
          })
          .from(comments)
          .innerJoin(users, eq(comments.authorId, users.id))
          .where(eq(comments.id, contentId));
        return {
          preview: comment?.content.slice(0, 200) || 'Unknown comment',
          author: comment ? { id: comment.authorId, name: comment.authorName } : undefined,
        };
      }
      case 'user': {
        const [user] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, contentId));
        return {
          preview: `User: ${user?.name || 'Unknown'}`,
        };
      }
      default:
        return { preview: 'Unknown content' };
    }
  },

  // List reports (for admins/moderators)
  async list(
    status?: ReportStatus,
    page = 1,
    limit = 20
  ): Promise<{ reports: ReportWithDetails[]; total: number }> {
    const offset = (page - 1) * limit;

    // Build where condition
    const whereCondition = status ? eq(contentReports.status, status) : undefined;

    // Execute query with optional status filter
    const reportRows = await db
      .select({
        id: contentReports.id,
        reporterId: contentReports.reporterId,
        contentType: contentReports.contentType,
        contentId: contentReports.contentId,
        reason: contentReports.reason,
        description: contentReports.description,
        status: contentReports.status,
        reviewedBy: contentReports.reviewedBy,
        reviewedAt: contentReports.reviewedAt,
        resolution: contentReports.resolution,
        createdAt: contentReports.createdAt,
        reporterName: users.name,
      })
      .from(contentReports)
      .innerJoin(users, eq(contentReports.reporterId, users.id))
      .where(whereCondition)
      .orderBy(desc(contentReports.createdAt))
      .limit(limit)
      .offset(offset);

    // Get additional details for each report
    const reports = await Promise.all(
      reportRows.map(async (row) => {
        const { preview, author } = await this.getContentDetails(
          row.contentType as ContentType,
          row.contentId
        );

        return {
          id: row.id,
          reporterId: row.reporterId,
          contentType: row.contentType,
          contentId: row.contentId,
          reason: row.reason,
          description: row.description,
          status: row.status,
          reviewedBy: row.reviewedBy,
          reviewedAt: row.reviewedAt,
          resolution: row.resolution,
          createdAt: row.createdAt,
          reporter: {
            id: row.reporterId,
            name: row.reporterName,
          },
          reviewer: null,
          contentPreview: preview,
          contentAuthor: author,
        };
      })
    );

    // Count total
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentReports)
      .where(whereCondition);

    return {
      reports,
      total: Number(countResult?.count || 0),
    };
  },

  // Update report status (resolve/dismiss)
  async updateStatus(
    reportId: string,
    reviewerId: string,
    input: UpdateReportInput
  ): Promise<ContentReport | null> {
    const [updated] = await db
      .update(contentReports)
      .set({
        status: input.status,
        resolution: input.resolution,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(contentReports.id, reportId))
      .returning();

    if (updated) {
      logger.info(
        {
          reportId,
          reviewerId,
          newStatus: input.status,
        },
        'Report status updated'
      );

      // Notify reporter about resolution
      if (input.status === 'resolved' || input.status === 'dismissed') {
        await notificationService.create({
          userId: updated.reporterId,
          type: 'mention', // Using 'mention' as closest fit for system notification
          title: 'Report Update',
          message: `Your report has been ${input.status}`,
        });
      }
    }

    return updated || null;
  },

  // Get reports by user (their own reports)
  async getByReporter(reporterId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const reports = await db
      .select({
        id: contentReports.id,
        contentType: contentReports.contentType,
        contentId: contentReports.contentId,
        reason: contentReports.reason,
        status: contentReports.status,
        createdAt: contentReports.createdAt,
        resolution: contentReports.resolution,
      })
      .from(contentReports)
      .where(eq(contentReports.reporterId, reporterId))
      .orderBy(desc(contentReports.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentReports)
      .where(eq(contentReports.reporterId, reporterId));

    return {
      reports,
      total: Number(countResult?.count || 0),
    };
  },

  // Get report statistics
  async getStats() {
    const [pending] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentReports)
      .where(eq(contentReports.status, 'pending'));

    const [reviewed] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentReports)
      .where(eq(contentReports.status, 'reviewed'));

    const [resolved] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentReports)
      .where(eq(contentReports.status, 'resolved'));

    const [dismissed] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentReports)
      .where(eq(contentReports.status, 'dismissed'));

    // Reports by reason
    const byReason = await db
      .select({
        reason: contentReports.reason,
        count: sql<number>`count(*)`,
      })
      .from(contentReports)
      .groupBy(contentReports.reason);

    // Reports by content type
    const byType = await db
      .select({
        type: contentReports.contentType,
        count: sql<number>`count(*)`,
      })
      .from(contentReports)
      .groupBy(contentReports.contentType);

    return {
      byStatus: {
        pending: Number(pending?.count || 0),
        reviewed: Number(reviewed?.count || 0),
        resolved: Number(resolved?.count || 0),
        dismissed: Number(dismissed?.count || 0),
      },
      byReason: byReason.reduce(
        (acc, row) => ({ ...acc, [row.reason]: Number(row.count) }),
        {} as Record<string, number>
      ),
      byType: byType.reduce(
        (acc, row) => ({ ...acc, [row.type]: Number(row.count) }),
        {} as Record<string, number>
      ),
    };
  },

  // Take action on reported content
  async takeAction(
    reportId: string,
    reviewerId: string,
    action: 'remove' | 'warn' | 'ban'
  ): Promise<boolean> {
    const report = await this.getById(reportId);
    if (!report) return false;

    switch (action) {
      case 'remove':
        // Remove the content
        if (report.contentType === 'article') {
          await db
            .update(drafts)
            .set({ isDeleted: true, deletedAt: new Date() })
            .where(eq(drafts.id, report.contentId));
        } else if (report.contentType === 'comment') {
          await db
            .update(comments)
            .set({ isDeleted: true })
            .where(eq(comments.id, report.contentId));
        }
        break;

      case 'warn':
        // Send warning notification to content author
        if (report.contentAuthor) {
          await notificationService.create({
            userId: report.contentAuthor.id,
            type: 'mention',
            title: 'Content Warning',
            message: 'Your content has been flagged for violating community guidelines. Please review our policies.',
          });
        }
        break;

      // 'ban' would require admin role implementation
    }

    // Update report status
    await this.updateStatus(reportId, reviewerId, {
      status: 'resolved',
      resolution: `Action taken: ${action}`,
    });

    logger.info({ reportId, action, reviewerId }, 'Moderation action taken');
    return true;
  },
};
