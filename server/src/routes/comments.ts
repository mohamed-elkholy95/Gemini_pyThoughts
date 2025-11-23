import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { commentService } from '../services/comment.service.js';
import { requireAuth, getSession, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const commentsRouter = new Hono<AuthContext>();

// Validation schemas
const createCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().uuid().optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// Get comments for an article (public)
commentsRouter.get('/article/:draftId', getSession, zValidator('query', paginationSchema), async (c) => {
  const draftId = c.req.param('draftId');
  const { page, limit } = c.req.valid('query');

  const result = await commentService.getByDraftId(draftId, page, limit);

  return c.json({
    comments: result.comments,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get replies to a comment (public)
commentsRouter.get('/:id/replies', zValidator('query', paginationSchema), async (c) => {
  const commentId = c.req.param('id');
  const { page, limit } = c.req.valid('query');

  const result = await commentService.getReplies(commentId, page, limit);

  return c.json({
    replies: result.replies,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Create a comment (auth required)
commentsRouter.post('/article/:draftId', requireAuth, zValidator('json', createCommentSchema), async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('draftId');
  const { content, parentId } = c.req.valid('json');

  const comment = await commentService.create({
    content,
    draftId,
    authorId: user!.id,
    parentId,
  });

  return c.json({ comment }, 201);
});

// Update a comment (auth required)
commentsRouter.patch('/:id', requireAuth, zValidator('json', updateCommentSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { content } = c.req.valid('json');

  const comment = await commentService.update(id, user!.id, { content });
  return c.json({ comment });
});

// Delete a comment (auth required)
commentsRouter.delete('/:id', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  await commentService.delete(id, user!.id);
  return c.json({ message: 'Comment deleted' });
});

// Get comment count for an article
commentsRouter.get('/article/:draftId/count', async (c) => {
  const draftId = c.req.param('draftId');
  const count = await commentService.getCount(draftId);
  return c.json({ count });
});

export { commentsRouter };
