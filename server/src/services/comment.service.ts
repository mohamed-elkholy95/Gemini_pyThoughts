import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { db, comments, drafts, users } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import sanitizeHtml from 'sanitize-html';

interface CreateCommentInput {
  content: string;
  draftId: string;
  authorId: string;
  parentId?: string;
}

interface UpdateCommentInput {
  content: string;
}

// Sanitize comment content
function sanitizeComment(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'code'],
    allowedAttributes: {
      a: ['href'],
    },
  }).trim();
}

export const commentService = {
  // Create a comment
  async create(input: CreateCommentInput) {
    // Verify draft exists and is published
    const [draft] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, input.draftId), eq(drafts.status, 'published'), eq(drafts.isDeleted, false)));

    if (!draft) {
      throw new AppError(404, 'Article not found', 'ARTICLE_NOT_FOUND');
    }

    // Verify parent comment if provided
    if (input.parentId) {
      const [parent] = await db
        .select()
        .from(comments)
        .where(and(eq(comments.id, input.parentId), eq(comments.draftId, input.draftId), eq(comments.isDeleted, false)));

      if (!parent) {
        throw new AppError(404, 'Parent comment not found', 'PARENT_NOT_FOUND');
      }
    }

    const sanitizedContent = sanitizeComment(input.content);
    if (!sanitizedContent) {
      throw new AppError(400, 'Comment content is required', 'INVALID_CONTENT');
    }

    const [comment] = await db
      .insert(comments)
      .values({
        content: sanitizedContent,
        draftId: input.draftId,
        authorId: input.authorId,
        parentId: input.parentId || null,
      })
      .returning();

    logger.info({ commentId: comment.id, draftId: input.draftId }, 'Comment created');

    // Get author info
    const [author] = await db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, input.authorId));

    return { ...comment, author };
  },

  // Get comments for a draft (top-level only)
  async getByDraftId(draftId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    // Verify draft exists
    const [draft] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.status, 'published'), eq(drafts.isDeleted, false)));

    if (!draft) {
      throw new AppError(404, 'Article not found', 'ARTICLE_NOT_FOUND');
    }

    // Get top-level comments
    const topLevelComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        draftId: comments.draftId,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        authorId: comments.authorId,
        authorName: users.name,
        authorImage: users.image,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(and(eq(comments.draftId, draftId), isNull(comments.parentId), eq(comments.isDeleted, false)))
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(and(eq(comments.draftId, draftId), isNull(comments.parentId), eq(comments.isDeleted, false)));

    // Transform to include author object
    const commentsWithAuthor = topLevelComments.map((c) => ({
      id: c.id,
      content: c.content,
      draftId: c.draftId,
      parentId: c.parentId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: {
        id: c.authorId,
        name: c.authorName,
        image: c.authorImage,
      },
    }));

    return {
      comments: commentsWithAuthor,
      total: Number(countResult?.count || 0),
    };
  },

  // Get replies to a comment
  async getReplies(commentId: string, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const replies = await db
      .select({
        id: comments.id,
        content: comments.content,
        draftId: comments.draftId,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        authorId: comments.authorId,
        authorName: users.name,
        authorImage: users.image,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(and(eq(comments.parentId, commentId), eq(comments.isDeleted, false)))
      .orderBy(comments.createdAt)
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(and(eq(comments.parentId, commentId), eq(comments.isDeleted, false)));

    const repliesWithAuthor = replies.map((c) => ({
      id: c.id,
      content: c.content,
      draftId: c.draftId,
      parentId: c.parentId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: {
        id: c.authorId,
        name: c.authorName,
        image: c.authorImage,
      },
    }));

    return {
      replies: repliesWithAuthor,
      total: Number(countResult?.count || 0),
    };
  },

  // Update a comment
  async update(id: string, authorId: string, input: UpdateCommentInput) {
    const sanitizedContent = sanitizeComment(input.content);
    if (!sanitizedContent) {
      throw new AppError(400, 'Comment content is required', 'INVALID_CONTENT');
    }

    const [updated] = await db
      .update(comments)
      .set({
        content: sanitizedContent,
        updatedAt: new Date(),
      })
      .where(and(eq(comments.id, id), eq(comments.authorId, authorId), eq(comments.isDeleted, false)))
      .returning();

    if (!updated) {
      throw new AppError(404, 'Comment not found', 'COMMENT_NOT_FOUND');
    }

    logger.info({ commentId: id }, 'Comment updated');
    return updated;
  },

  // Delete a comment (soft delete)
  async delete(id: string, authorId: string) {
    const [deleted] = await db
      .update(comments)
      .set({ isDeleted: true })
      .where(and(eq(comments.id, id), eq(comments.authorId, authorId)))
      .returning({ id: comments.id });

    if (!deleted) {
      throw new AppError(404, 'Comment not found', 'COMMENT_NOT_FOUND');
    }

    logger.info({ commentId: id }, 'Comment deleted');
    return { success: true };
  },

  // Get comment count for a draft
  async getCount(draftId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(and(eq(comments.draftId, draftId), eq(comments.isDeleted, false)));

    return Number(result?.count || 0);
  },
};
