import { eq, and, sql } from 'drizzle-orm';
import {
  db,
  users,
  drafts,
  draftVersions,
  comments,
  likes,
  bookmarks,
  follows,
  notifications,
  articleViews,
  userPreferences,
} from '../db/index.js';
import { auditService, auditLogs } from './audit.service.js';
import { logger } from '../config/logger.js';

interface UserData {
  profile: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    bio: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  articles: Array<{
    id: string;
    title: string;
    excerpt: string | null;
    content: unknown;
    status: string;
    createdAt: Date;
    publishedAt: Date | null;
  }>;
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    articleId: string;
  }>;
  likes: Array<{
    articleId: string;
    createdAt: Date;
  }>;
  bookmarks: Array<{
    articleId: string;
    createdAt: Date;
  }>;
  followers: Array<{
    userId: string;
    createdAt: Date;
  }>;
  following: Array<{
    userId: string;
    createdAt: Date;
  }>;
  preferences: Record<string, unknown> | null;
  activityLog: Array<{
    action: string;
    createdAt: Date;
  }>;
}

interface DeletionResult {
  success: boolean;
  deletedItems: {
    articles: number;
    articleVersions: number;
    comments: number;
    likes: number;
    bookmarks: number;
    follows: number;
    notifications: number;
    views: number;
    preferences: number;
    auditLogs: number;
  };
  anonymizedData: boolean;
}

export const gdprService = {
  // Export all user data (Data Portability - Article 20)
  async exportUserData(userId: string): Promise<UserData> {
    logger.info({ userId }, 'Starting GDPR data export');

    // Get user profile
    const [profile] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        bio: users.bio,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!profile) {
      throw new Error('User not found');
    }

    // Get all articles
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        content: drafts.content,
        status: drafts.status,
        createdAt: drafts.createdAt,
        publishedAt: drafts.publishedAt,
      })
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.isDeleted, false)));

    // Get all comments
    const userComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        createdAt: comments.createdAt,
        articleId: comments.draftId,
      })
      .from(comments)
      .where(eq(comments.authorId, userId));

    // Get all likes
    const userLikes = await db
      .select({
        articleId: likes.draftId,
        createdAt: likes.createdAt,
      })
      .from(likes)
      .where(eq(likes.userId, userId));

    // Get all bookmarks
    const userBookmarks = await db
      .select({
        articleId: bookmarks.draftId,
        createdAt: bookmarks.createdAt,
      })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));

    // Get followers
    const userFollowers = await db
      .select({
        userId: follows.followerId,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .where(eq(follows.followingId, userId));

    // Get following
    const userFollowing = await db
      .select({
        userId: follows.followingId,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .where(eq(follows.followerId, userId));

    // Get preferences
    const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));

    // Get activity log (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const activity = await db
      .select({
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, userId), sql`${auditLogs.createdAt} >= ${ninetyDaysAgo}`));

    // Log the export action
    await auditService.log({
      userId,
      action: 'system:data_export',
      metadata: { timestamp: new Date().toISOString() },
    });

    logger.info({ userId }, 'GDPR data export completed');

    return {
      profile,
      articles,
      comments: userComments,
      likes: userLikes,
      bookmarks: userBookmarks,
      followers: userFollowers,
      following: userFollowing,
      preferences: prefs || null,
      activityLog: activity,
    };
  },

  // Delete all user data (Right to Erasure - Article 17)
  async deleteUserData(userId: string, hardDelete = false): Promise<DeletionResult> {
    logger.info({ userId, hardDelete }, 'Starting GDPR data deletion');

    const result: DeletionResult = {
      success: false,
      deletedItems: {
        articles: 0,
        articleVersions: 0,
        comments: 0,
        likes: 0,
        bookmarks: 0,
        follows: 0,
        notifications: 0,
        views: 0,
        preferences: 0,
        auditLogs: 0,
      },
      anonymizedData: !hardDelete,
    };

    try {
      // Start transaction
      await db.transaction(async (tx) => {
        // Get user's article IDs
        const userArticles = await tx.select({ id: drafts.id }).from(drafts).where(eq(drafts.authorId, userId));
        const articleIds = userArticles.map((a) => a.id);

        // Delete article versions
        if (articleIds.length > 0) {
          for (const articleId of articleIds) {
            const deletedVersions = await tx
              .delete(draftVersions)
              .where(eq(draftVersions.draftId, articleId))
              .returning();
            result.deletedItems.articleVersions += deletedVersions.length;
          }
        }

        // Delete or anonymize articles
        if (hardDelete) {
          const deleted = await tx.delete(drafts).where(eq(drafts.authorId, userId)).returning();
          result.deletedItems.articles = deleted.length;
        } else {
          // Soft delete and anonymize
          const updated = await tx
            .update(drafts)
            .set({
              isDeleted: true,
              content: null,
              excerpt: '[Content removed]',
              title: '[Deleted Article]',
            })
            .where(eq(drafts.authorId, userId))
            .returning();
          result.deletedItems.articles = updated.length;
        }

        // Delete comments
        if (hardDelete) {
          const deleted = await tx.delete(comments).where(eq(comments.authorId, userId)).returning();
          result.deletedItems.comments = deleted.length;
        } else {
          // Anonymize comments
          const updated = await tx
            .update(comments)
            .set({
              content: '[Comment removed]',
              isDeleted: true,
            })
            .where(eq(comments.authorId, userId))
            .returning();
          result.deletedItems.comments = updated.length;
        }

        // Delete likes
        const deletedLikes = await tx.delete(likes).where(eq(likes.userId, userId)).returning();
        result.deletedItems.likes = deletedLikes.length;

        // Delete bookmarks
        const deletedBookmarks = await tx.delete(bookmarks).where(eq(bookmarks.userId, userId)).returning();
        result.deletedItems.bookmarks = deletedBookmarks.length;

        // Delete follows (both as follower and following)
        const deletedFollows1 = await tx.delete(follows).where(eq(follows.followerId, userId)).returning();
        const deletedFollows2 = await tx.delete(follows).where(eq(follows.followingId, userId)).returning();
        result.deletedItems.follows = deletedFollows1.length + deletedFollows2.length;

        // Delete notifications
        const deletedNotifications = await tx.delete(notifications).where(eq(notifications.userId, userId)).returning();
        result.deletedItems.notifications = deletedNotifications.length;

        // Delete article views
        const deletedViews = await tx.delete(articleViews).where(eq(articleViews.viewerId, userId)).returning();
        result.deletedItems.views = deletedViews.length;

        // Delete preferences
        const deletedPrefs = await tx.delete(userPreferences).where(eq(userPreferences.userId, userId)).returning();
        result.deletedItems.preferences = deletedPrefs.length;

        // Anonymize audit logs (keep for compliance but remove PII)
        if (!hardDelete) {
          await tx
            .update(auditLogs)
            .set({
              ipAddress: null,
              userAgent: null,
            })
            .where(eq(auditLogs.userId, userId));
        } else {
          const deletedAuditLogs = await tx.delete(auditLogs).where(eq(auditLogs.userId, userId)).returning();
          result.deletedItems.auditLogs = deletedAuditLogs.length;
        }

        // Delete or anonymize user
        if (hardDelete) {
          await tx.delete(users).where(eq(users.id, userId));
        } else {
          await tx
            .update(users)
            .set({
              name: 'Deleted User',
              email: `deleted_${userId}@deleted.local`,
              image: null,
              bio: null,
              emailVerified: false,
            })
            .where(eq(users.id, userId));
        }
      });

      // Log the deletion action (with a system user since the user is deleted)
      await auditService.log({
        action: 'system:data_delete',
        entityType: 'user',
        entityId: userId,
        metadata: {
          timestamp: new Date().toISOString(),
          hardDelete,
          deletedItems: result.deletedItems,
        },
      });

      result.success = true;
      logger.info({ userId, result }, 'GDPR data deletion completed');
    } catch (error) {
      logger.error({ error, userId }, 'GDPR data deletion failed');
      throw error;
    }

    return result;
  },

  // Generate data export in JSON format
  async generateExportFile(userId: string): Promise<{ filename: string; data: string; mimeType: string }> {
    const userData = await this.exportUserData(userId);

    const filename = `user_data_export_${userId}_${Date.now()}.json`;
    const data = JSON.stringify(userData, null, 2);

    return {
      filename,
      data,
      mimeType: 'application/json',
    };
  },

  // Check if user can request deletion (e.g., no pending transactions)
  async canRequestDeletion(_userId: string): Promise<{ canDelete: boolean; reason?: string }> {
    // Check for any conditions that might prevent deletion
    // For example: active subscriptions, pending payouts, etc.

    // For now, always allow deletion
    return { canDelete: true };
  },

  // Get summary of what will be deleted
  async getDeletionPreview(userId: string): Promise<{
    articles: number;
    comments: number;
    likes: number;
    bookmarks: number;
    follows: number;
  }> {
    const [articleCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(eq(drafts.authorId, userId));

    const [commentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.authorId, userId));

    const [likeCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(likes)
      .where(eq(likes.userId, userId));

    const [bookmarkCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));

    const [followCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(sql`${follows.followerId} = ${userId} OR ${follows.followingId} = ${userId}`);

    return {
      articles: Number(articleCount?.count || 0),
      comments: Number(commentCount?.count || 0),
      likes: Number(likeCount?.count || 0),
      bookmarks: Number(bookmarkCount?.count || 0),
      follows: Number(followCount?.count || 0),
    };
  },

  // Request data export (async - for large datasets)
  async requestDataExport(userId: string, email: string): Promise<{ requestId: string }> {
    const requestId = `export_${userId}_${Date.now()}`;

    // In production, this would queue a job to generate and email the export
    logger.info({ userId, email, requestId }, 'Data export requested');

    // Audit log
    await auditService.log({
      userId,
      action: 'system:data_export',
      metadata: { requestId, email },
    });

    return { requestId };
  },

  // Request account deletion (async - with cooling off period)
  async requestAccountDeletion(userId: string): Promise<{ requestId: string; scheduledAt: Date }> {
    const requestId = `deletion_${userId}_${Date.now()}`;
    // Schedule deletion for 30 days from now (cooling off period)
    const scheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    logger.info({ userId, requestId, scheduledAt }, 'Account deletion requested');

    // In production, store this request and process after cooling off period
    await auditService.log({
      userId,
      action: 'system:data_delete',
      metadata: { requestId, scheduledAt: scheduledAt.toISOString(), status: 'pending' },
    });

    return { requestId, scheduledAt };
  },

  // Cancel pending deletion request
  async cancelDeletionRequest(userId: string, _requestId: string): Promise<boolean> {
    // In production, update the stored deletion request
    logger.info({ userId, requestId: _requestId }, 'Deletion request cancelled');

    await auditService.log({
      userId,
      action: 'system:data_delete',
      metadata: { requestId: _requestId, status: 'cancelled' },
    });

    return true;
  },
};
