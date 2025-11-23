import { Hono, Context, Next } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc, sql, ilike } from 'drizzle-orm';
import { db, users, drafts, comments, articleViews } from '../db/index.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';

const adminRouter = new Hono<AuthContext>();

// Admin role check middleware (simplified - in production use proper RBAC)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);

async function requireAdmin(c: Context<AuthContext>, next: Next) {
  const user = getCurrentUser(c);

  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    throw new AppError(403, 'Admin access required', 'FORBIDDEN');
  }

  return next();
}

adminRouter.use('*', requireAuth);
adminRouter.use('*', requireAdmin);

// Dashboard stats
adminRouter.get('/stats', async (c) => {
  const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [draftsCount] = await db.select({ count: sql<number>`count(*)` }).from(drafts);
  const [publishedCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(drafts)
    .where(eq(drafts.status, 'published'));
  const [commentsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(eq(comments.isDeleted, false));

  // Views in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [viewsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articleViews)
    .where(sql`${articleViews.createdAt} > ${sevenDaysAgo}`);

  return c.json({
    stats: {
      users: Number(usersCount?.count || 0),
      drafts: Number(draftsCount?.count || 0),
      published: Number(publishedCount?.count || 0),
      comments: Number(commentsCount?.count || 0),
      weeklyViews: Number(viewsCount?.count || 0),
    },
  });
});

// List all users
adminRouter.get(
  '/users',
  zValidator(
    'query',
    z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      search: z.string().optional(),
    })
  ),
  async (c) => {
    const { page, limit, search } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(ilike(users.name, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [usersList, countResult] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(users).where(whereClause),
    ]);

    return c.json({
      users: usersList,
      pagination: {
        total: Number(countResult[0]?.count || 0),
        page,
        limit,
        pages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
      },
    });
  }
);

// Get user details
adminRouter.get('/users/:id', async (c) => {
  const id = c.req.param('id');

  const [user] = await db.select().from(users).where(eq(users.id, id));

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Get user's stats
  const [draftsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(drafts)
    .where(eq(drafts.authorId, id));

  const [commentsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(and(eq(comments.authorId, id), eq(comments.isDeleted, false)));

  return c.json({
    user: {
      ...user,
      password: undefined, // Don't expose password
    },
    stats: {
      drafts: Number(draftsCount?.count || 0),
      comments: Number(commentsCount?.count || 0),
    },
  });
});

// List all articles (including drafts)
adminRouter.get(
  '/articles',
  zValidator(
    'query',
    z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      search: z.string().optional(),
    })
  ),
  async (c) => {
    const { page, limit, status, search } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [eq(drafts.isDeleted, false)];
    if (status) {
      conditions.push(eq(drafts.status, status));
    }
    if (search) {
      conditions.push(ilike(drafts.title, `%${search}%`));
    }

    const whereClause = and(...conditions);

    const [articlesList, countResult] = await Promise.all([
      db
        .select({
          id: drafts.id,
          title: drafts.title,
          excerpt: drafts.excerpt,
          status: drafts.status,
          authorId: drafts.authorId,
          authorName: users.name,
          publishedAt: drafts.publishedAt,
          createdAt: drafts.createdAt,
          wordCount: drafts.wordCount,
        })
        .from(drafts)
        .innerJoin(users, eq(drafts.authorId, users.id))
        .where(whereClause)
        .orderBy(desc(drafts.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(drafts).where(whereClause),
    ]);

    return c.json({
      articles: articlesList,
      pagination: {
        total: Number(countResult[0]?.count || 0),
        page,
        limit,
        pages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
      },
    });
  }
);

// Moderate article (unpublish/archive)
adminRouter.patch(
  '/articles/:id/moderate',
  zValidator('json', z.object({ action: z.enum(['unpublish', 'archive', 'restore']) })),
  async (c) => {
    const id = c.req.param('id');
    const { action } = c.req.valid('json');

    let updateData: { status?: 'draft' | 'published' | 'archived'; isDeleted?: boolean };

    switch (action) {
      case 'unpublish':
        updateData = { status: 'draft' };
        break;
      case 'archive':
        updateData = { status: 'archived' };
        break;
      case 'restore':
        updateData = { status: 'draft', isDeleted: false };
        break;
      default:
        updateData = {};
    }

    const [updated] = await db.update(drafts).set(updateData).where(eq(drafts.id, id)).returning();

    if (!updated) {
      return c.json({ error: 'Article not found' }, 404);
    }

    logger.info({ articleId: id, action, adminId: getCurrentUser(c)?.id }, 'Article moderated');

    return c.json({ article: updated });
  }
);

// Delete article permanently
adminRouter.delete('/articles/:id', async (c) => {
  const id = c.req.param('id');

  const [deleted] = await db.delete(drafts).where(eq(drafts.id, id)).returning({ id: drafts.id });

  if (!deleted) {
    return c.json({ error: 'Article not found' }, 404);
  }

  logger.info({ articleId: id, adminId: getCurrentUser(c)?.id }, 'Article permanently deleted by admin');

  return c.json({ success: true });
});

// List comments for moderation
adminRouter.get(
  '/comments',
  zValidator(
    'query',
    z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      articleId: z.string().uuid().optional(),
    })
  ),
  async (c) => {
    const { page, limit, articleId } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [eq(comments.isDeleted, false)];
    if (articleId) {
      conditions.push(eq(comments.draftId, articleId));
    }

    const whereClause = and(...conditions);

    const [commentsList, countResult] = await Promise.all([
      db
        .select({
          id: comments.id,
          content: comments.content,
          draftId: comments.draftId,
          authorId: comments.authorId,
          authorName: users.name,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(whereClause)
        .orderBy(desc(comments.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(comments).where(whereClause),
    ]);

    return c.json({
      comments: commentsList,
      pagination: {
        total: Number(countResult[0]?.count || 0),
        page,
        limit,
        pages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
      },
    });
  }
);

// Delete comment
adminRouter.delete('/comments/:id', async (c) => {
  const id = c.req.param('id');

  const [deleted] = await db
    .update(comments)
    .set({ isDeleted: true })
    .where(eq(comments.id, id))
    .returning({ id: comments.id });

  if (!deleted) {
    return c.json({ error: 'Comment not found' }, 404);
  }

  logger.info({ commentId: id, adminId: getCurrentUser(c)?.id }, 'Comment deleted by admin');

  return c.json({ success: true });
});

export { adminRouter };
