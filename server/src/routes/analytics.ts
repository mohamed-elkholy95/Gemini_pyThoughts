import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';
import { analyticsService } from '../services/analytics.service.js';

const analyticsRouter = new Hono<AuthContext>();

// Get current user's analytics
analyticsRouter.get('/me', requireAuth, async (c) => {
  const user = getCurrentUser(c)!;
  const analytics = await analyticsService.getUserAnalytics(user.id);
  return c.json(analytics);
});

// Get current user's top articles
analyticsRouter.get(
  '/me/top-articles',
  requireAuth,
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c)!;
    const { limit } = c.req.valid('query');
    const articles = await analyticsService.getUserTopArticles(user.id, limit);
    return c.json({ articles });
  }
);

// Get current user's analytics report
analyticsRouter.get('/me/report', requireAuth, async (c) => {
  const user = getCurrentUser(c)!;
  const report = await analyticsService.generateUserReport(user.id);
  return c.json(report);
});

// Get specific article analytics (must be author)
analyticsRouter.get('/articles/:id', requireAuth, async (c) => {
  // User authentication verified by requireAuth middleware
  getCurrentUser(c);
  const articleId = c.req.param('id');

  const analytics = await analyticsService.getArticleAnalytics(articleId);

  if (!analytics) {
    return c.json({ error: 'Article not found' }, 404);
  }

  return c.json(analytics);
});

// Get article views timeline
analyticsRouter.get(
  '/articles/:id/timeline',
  requireAuth,
  zValidator(
    'query',
    z.object({
      period: z.enum(['7d', '30d', '90d']).optional().default('30d'),
    })
  ),
  async (c) => {
    const articleId = c.req.param('id');
    const { period } = c.req.valid('query');

    const timeline = await analyticsService.getArticleViewsTimeline(articleId, period);
    return c.json({ timeline });
  }
);

// Get article referrers
analyticsRouter.get(
  '/articles/:id/referrers',
  requireAuth,
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
  ),
  async (c) => {
    const articleId = c.req.param('id');
    const { limit } = c.req.valid('query');

    const referrers = await analyticsService.getArticleReferrers(articleId, limit);
    return c.json({ referrers });
  }
);

// Get platform stats (admin only in production)
analyticsRouter.get('/platform', async (c) => {
  const stats = await analyticsService.getPlatformStats();
  return c.json(stats);
});

// Get trending topics
analyticsRouter.get(
  '/trending-topics',
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
  ),
  async (c) => {
    const { limit } = c.req.valid('query');
    const topics = await analyticsService.getTrendingTopics(limit);
    return c.json({ topics });
  }
);

export { analyticsRouter };
