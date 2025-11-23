import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { feedService } from '../services/feed.service.js';
import { getSession, requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';
import crypto from 'crypto';

const feedRouter = new Hono<AuthContext>();

// Validation schemas
const feedQuerySchema = z.object({
  type: z.enum(['following', 'trending', 'latest', 'personalized']).default('personalized'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// Get feed (public with optional auth for personalization)
feedRouter.get('/', getSession, zValidator('query', feedQuerySchema), async (c) => {
  const user = getCurrentUser(c);
  const { type, page, limit } = c.req.valid('query');

  const result = await feedService.getFeed({
    userId: user?.id,
    type,
    page,
    limit,
  });

  return c.json({
    articles: result.articles,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get following feed (auth required)
feedRouter.get('/following', requireAuth, zValidator('query', z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
})), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await feedService.getFollowingFeed({
    userId: user!.id,
    page,
    limit,
  });

  return c.json({
    articles: result.articles,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get trending feed
feedRouter.get('/trending', getSession, zValidator('query', z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
})), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await feedService.getTrendingFeed({
    userId: user?.id,
    page,
    limit,
  });

  return c.json({
    articles: result.articles,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Like an article
feedRouter.post('/articles/:id/like', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('id');

  const result = await feedService.like(user!.id, draftId);

  if (!result.success) {
    return c.json({ error: result.message }, 400);
  }

  return c.json({ message: 'Article liked' });
});

// Unlike an article
feedRouter.delete('/articles/:id/like', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('id');

  const result = await feedService.unlike(user!.id, draftId);

  if (!result.success) {
    return c.json({ error: result.message }, 400);
  }

  return c.json({ message: 'Article unliked' });
});

// Record article view
feedRouter.post('/articles/:id/view', getSession, async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('id');

  // Hash IP for privacy
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '';
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) : undefined;

  const userAgent = c.req.header('user-agent');
  const referrer = c.req.header('referer');

  await feedService.recordView(draftId, user?.id, ipHash, userAgent, referrer);

  return c.json({ recorded: true });
});

// Get like count for an article
feedRouter.get('/articles/:id/likes', async (c) => {
  const draftId = c.req.param('id');
  const count = await feedService.getLikeCount(draftId);
  return c.json({ count });
});

export { feedRouter };
