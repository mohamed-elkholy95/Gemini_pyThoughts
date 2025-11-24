import { eq, and, desc, sql } from 'drizzle-orm';
import { db, notifications, users, userPreferences } from '../db/index.js';
import { logger } from '../config/logger.js';
import { realtimeService } from './realtime.service.js';

type NotificationType = 'follow' | 'comment' | 'reply' | 'publish' | 'mention' | 'like';

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
}

export const notificationService = {
  // Create a notification
  async create(input: CreateNotificationInput) {
    // Check user preferences before creating
    const prefs = await this.getUserPreferences(input.userId);

    // Skip notification based on preferences
    if (prefs) {
      if (input.type === 'follow' && !prefs.notifyNewFollower) return null;
      if ((input.type === 'comment' || input.type === 'reply') && !prefs.notifyComments) return null;
      if (input.type === 'mention' && !prefs.notifyMentions) return null;
    }

    const [notification] = await db
      .insert(notifications)
      .values(input)
      .returning();

    logger.info({ notificationId: notification.id, userId: input.userId, type: input.type }, 'Notification created');

    // Send real-time notification via SSE
    realtimeService.notifyUser(input.userId, {
      id: notification.id,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
    });

    return notification;
  },

  // Get user's notifications
  async getByUserId(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const offset = (page - 1) * limit;

    const conditions = [eq(notifications.userId, userId)];
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    const notificationsList = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        link: notifications.link,
        actorId: notifications.actorId,
        actorName: users.name,
        actorImage: users.image,
        entityType: notifications.entityType,
        entityId: notifications.entityId,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(...conditions));

    return {
      notifications: notificationsList.map((n) => ({
        ...n,
        actor: n.actorId ? { id: n.actorId, name: n.actorName, image: n.actorImage } : null,
      })),
      total: Number(countResult?.count || 0),
    };
  },

  // Get unread count
  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    return Number(result?.count || 0);
  },

  // Mark notification as read
  async markAsRead(notificationId: string, userId: string) {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();

    return !!updated;
  },

  // Mark all notifications as read
  async markAllAsRead(userId: string) {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    logger.info({ userId }, 'All notifications marked as read');
    return { success: true };
  },

  // Delete a notification
  async delete(notificationId: string, userId: string) {
    const [deleted] = await db
      .delete(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();

    return !!deleted;
  },

  // Get user preferences
  async getUserPreferences(userId: string) {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    return prefs;
  },

  // Update user preferences
  async updateUserPreferences(userId: string, data: Partial<typeof userPreferences.$inferInsert>) {
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    if (existing) {
      const [updated] = await db
        .update(userPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userPreferences)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  },

  // Helper: Notify on new follower
  async notifyNewFollower(followedUserId: string, followerId: string) {
    const [follower] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, followerId));

    if (!follower) return;

    await this.create({
      userId: followedUserId,
      type: 'follow',
      title: 'New follower',
      message: `${follower.name} started following you`,
      actorId: followerId,
      entityType: 'user',
      entityId: followerId,
      link: `/profile/${followerId}`,
    });
  },

  // Helper: Notify on new comment
  async notifyNewComment(articleAuthorId: string, commenterId: string, articleId: string, articleTitle: string) {
    if (articleAuthorId === commenterId) return; // Don't notify self

    const [commenter] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, commenterId));

    if (!commenter) return;

    await this.create({
      userId: articleAuthorId,
      type: 'comment',
      title: 'New comment',
      message: `${commenter.name} commented on "${articleTitle}"`,
      actorId: commenterId,
      entityType: 'draft',
      entityId: articleId,
      link: `/article/${articleId}`,
    });
  },

  // Helper: Notify on reply
  async notifyReply(parentCommentAuthorId: string, replierId: string, articleId: string) {
    if (parentCommentAuthorId === replierId) return;

    const [replier] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, replierId));

    if (!replier) return;

    await this.create({
      userId: parentCommentAuthorId,
      type: 'reply',
      title: 'New reply',
      message: `${replier.name} replied to your comment`,
      actorId: replierId,
      entityType: 'draft',
      entityId: articleId,
      link: `/article/${articleId}`,
    });
  },

  // Helper: Notify on like
  async notifyLike(articleAuthorId: string, likerId: string, articleId: string, articleTitle: string) {
    if (articleAuthorId === likerId) return;

    const [liker] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, likerId));

    if (!liker) return;

    await this.create({
      userId: articleAuthorId,
      type: 'like',
      title: 'New like',
      message: `${liker.name} liked "${articleTitle}"`,
      actorId: likerId,
      entityType: 'draft',
      entityId: articleId,
      link: `/article/${articleId}`,
    });
  },
};
