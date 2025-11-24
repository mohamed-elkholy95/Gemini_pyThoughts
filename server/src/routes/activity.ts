// Activity Feed Routes
// Provides personalized activity feeds and user activity history

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { activityService } from '../services/activity.service.js';
import { requireAuth, optionalAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const activityRouter = new Hono<AuthContext>();

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// Get personalized feed (requires auth)
activityRouter.get('/feed', requireAuth, zValidator('query', paginationSchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const feed = await activityService.getFeed(user!.id, page, limit);

  return c.json({
    items: feed.items,
    page,
    limit,
    hasMore: feed.hasMore,
  });
});

// Get user's own activity history
activityRouter.get('/history', requireAuth, zValidator('query', paginationSchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const history = await activityService.getUserActivityHistory(user!.id, page, limit);

  return c.json({
    items: history.items,
    page,
    limit,
    hasMore: history.hasMore,
  });
});

// Get public activity for a specific user
activityRouter.get(
  '/users/:userId',
  optionalAuth,
  zValidator('query', paginationSchema),
  async (c) => {
    const targetUserId = c.req.param('userId');
    const viewer = getCurrentUser(c);
    const { page, limit } = c.req.valid('query');

    const activity = await activityService.getUserActivity(
      targetUserId,
      viewer?.id || null,
      page,
      limit
    );

    return c.json({
      items: activity.items,
      page,
      limit,
      hasMore: activity.hasMore,
    });
  }
);

// Refresh feed (invalidate cache)
activityRouter.post('/feed/refresh', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  await activityService.invalidateFeed(user!.id);

  return c.json({ message: 'Feed refreshed' });
});

export { activityRouter };
