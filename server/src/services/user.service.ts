import { eq, and, sql, desc } from 'drizzle-orm';
import { db, users, follows, bookmarks, drafts } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';

interface UpdateProfileInput {
  name?: string;
  bio?: string;
  image?: string;
}

export const userService = {
  // Get user by ID
  async getById(id: string) {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        bio: users.bio,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id));

    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    return user;
  },

  // Get user profile with stats
  async getProfile(id: string, currentUserId?: string) {
    const user = await this.getById(id);

    // Get follower/following counts
    const [followerCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, id));

    const [followingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, id));

    // Get published articles count
    const [articleCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .where(and(eq(drafts.authorId, id), eq(drafts.status, 'published'), eq(drafts.isDeleted, false)));

    // Check if current user follows this user
    let isFollowing = false;
    if (currentUserId && currentUserId !== id) {
      const [follow] = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, currentUserId), eq(follows.followingId, id)));
      isFollowing = !!follow;
    }

    return {
      ...user,
      stats: {
        followers: Number(followerCount?.count || 0),
        following: Number(followingCount?.count || 0),
        articles: Number(articleCount?.count || 0),
      },
      isFollowing,
    };
  },

  // Update user profile
  async updateProfile(id: string, input: UpdateProfileInput) {
    const [updated] = await db
      .update(users)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        bio: users.bio,
      });

    if (!updated) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    logger.info({ userId: id }, 'Profile updated');
    return updated;
  },

  // Follow a user
  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new AppError(400, 'Cannot follow yourself', 'INVALID_FOLLOW');
    }

    // Check if user exists
    await this.getById(followingId);

    // Check if already following
    const [existing] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));

    if (existing) {
      throw new AppError(400, 'Already following this user', 'ALREADY_FOLLOWING');
    }

    await db.insert(follows).values({ followerId, followingId });
    logger.info({ followerId, followingId }, 'User followed');

    return { success: true };
  },

  // Unfollow a user
  async unfollow(followerId: string, followingId: string) {
    const [result] = await db
      .delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .returning();

    if (!result) {
      throw new AppError(400, 'Not following this user', 'NOT_FOLLOWING');
    }

    logger.info({ followerId, followingId }, 'User unfollowed');
    return { success: true };
  },

  // Get followers
  async getFollowers(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const followers = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        bio: users.bio,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followingId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, userId));

    return {
      users: followers,
      total: Number(countResult?.count || 0),
    };
  },

  // Get following
  async getFollowing(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const following = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        bio: users.bio,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId));

    return {
      users: following,
      total: Number(countResult?.count || 0),
    };
  },

  // Bookmark an article
  async bookmark(userId: string, draftId: string) {
    // Check if draft exists and is published
    const [draft] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.status, 'published'), eq(drafts.isDeleted, false)));

    if (!draft) {
      throw new AppError(404, 'Article not found', 'ARTICLE_NOT_FOUND');
    }

    // Check if already bookmarked
    const [existing] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.draftId, draftId)));

    if (existing) {
      throw new AppError(400, 'Already bookmarked', 'ALREADY_BOOKMARKED');
    }

    await db.insert(bookmarks).values({ userId, draftId });
    logger.info({ userId, draftId }, 'Article bookmarked');

    return { success: true };
  },

  // Remove bookmark
  async removeBookmark(userId: string, draftId: string) {
    const [result] = await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.draftId, draftId)))
      .returning();

    if (!result) {
      throw new AppError(400, 'Bookmark not found', 'BOOKMARK_NOT_FOUND');
    }

    logger.info({ userId, draftId }, 'Bookmark removed');
    return { success: true };
  },

  // Get user bookmarks
  async getBookmarks(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const bookmarkedDrafts = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        slug: drafts.slug,
        authorId: drafts.authorId,
        publishedAt: drafts.publishedAt,
        readingTime: drafts.readingTime,
        bookmarkedAt: bookmarks.createdAt,
      })
      .from(bookmarks)
      .innerJoin(drafts, eq(bookmarks.draftId, drafts.id))
      .where(and(eq(bookmarks.userId, userId), eq(drafts.isDeleted, false)))
      .orderBy(desc(bookmarks.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .innerJoin(drafts, eq(bookmarks.draftId, drafts.id))
      .where(and(eq(bookmarks.userId, userId), eq(drafts.isDeleted, false)));

    return {
      bookmarks: bookmarkedDrafts,
      total: Number(countResult?.count || 0),
    };
  },

  // Check if article is bookmarked
  async isBookmarked(userId: string, draftId: string): Promise<boolean> {
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.draftId, draftId)));

    return !!bookmark;
  },
};
