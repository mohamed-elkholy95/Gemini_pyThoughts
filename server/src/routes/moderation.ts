// Moderation Routes
// Admin moderation dashboard and actions

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { moderationService } from '../services/moderation.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const moderationRouter = new Hono<AuthContext>();

// All moderation routes require admin auth
moderationRouter.use('/*', requireAuth);

// TODO: Add admin role check middleware
// For now, assume all authenticated users can access (should be restricted in production)

// Validation schemas
const queueQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  filter: z.enum(['all', 'articles', 'comments', 'users']).default('all'),
});

const actionSchema = z.object({
  type: z.enum(['approve', 'reject', 'warn', 'suspend', 'ban', 'delete']),
  reason: z.string().min(1).max(500),
  duration: z.number().int().positive().optional(), // Hours for temporary actions
  notifyUser: z.boolean().default(true),
});

const bulkActionSchema = z.object({
  reportIds: z.array(z.string()).min(1),
  action: z.enum(['approve', 'reject']),
});

// Get moderation queue
moderationRouter.get('/queue', zValidator('query', queueQuerySchema), async (c) => {
  const { page, limit, filter } = c.req.valid('query');
  const queue = await moderationService.getModerationQueue(page, limit, filter);

  return c.json({
    items: queue.items,
    total: queue.total,
    page,
    limit,
    totalPages: Math.ceil(queue.total / limit),
  });
});

// Get moderation statistics
moderationRouter.get('/stats', async (c) => {
  const stats = await moderationService.getStats();
  return c.json(stats);
});

// Get recent moderation activity
moderationRouter.get('/activity', zValidator('query', z.object({ limit: z.coerce.number().default(20) })), async (c) => {
  const { limit } = c.req.valid('query');
  const activity = await moderationService.getRecentActivity(limit);

  return c.json({ activity });
});

// Take action on a moderation item
moderationRouter.post(
  '/action/:type/:id',
  zValidator('json', actionSchema),
  async (c) => {
    const user = getCurrentUser(c);
    const contentType = c.req.param('type') as 'article' | 'comment' | 'user';
    const contentId = c.req.param('id');
    const action = c.req.valid('json');

    const result = await moderationService.takeAction(contentType, contentId, action, user!.id);

    if (result.success) {
      return c.json(result);
    }
    return c.json(result, 400);
  }
);

// Bulk approve reports
moderationRouter.post('/bulk-action', zValidator('json', bulkActionSchema), async (c) => {
  const user = getCurrentUser(c);
  const { reportIds, action } = c.req.valid('json');

  if (action === 'approve') {
    const count = await moderationService.bulkApprove(reportIds, user!.id);
    return c.json({ message: `${count} reports approved`, count });
  }

  return c.json({ error: 'Invalid bulk action' }, 400);
});

// Get specific item details for review
moderationRouter.get('/item/:type/:id', async (c) => {
  const contentType = c.req.param('type');
  const contentId = c.req.param('id');

  // Get full details for the item
  // This could include full content, history, related reports, etc.
  // For now, return basic info

  return c.json({
    type: contentType,
    id: contentId,
    message: 'Full item details endpoint - extend as needed',
  });
});

export { moderationRouter };
