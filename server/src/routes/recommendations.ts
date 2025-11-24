// Recommendation Routes
// Personalized content recommendations for users

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { recommendationService } from '../services/recommendation.service.js';
import { requireAuth, optionalAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const recommendationsRouter = new Hono<AuthContext>();

// Validation schemas
const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  exclude: z.string().optional(), // Comma-separated article IDs to exclude
});

// Get personalized recommendations (requires auth)
recommendationsRouter.get('/', requireAuth, zValidator('query', paginationSchema), async (c) => {
  const user = getCurrentUser(c);
  const { limit, exclude } = c.req.valid('query');

  const excludeIds = exclude ? exclude.split(',').filter(Boolean) : [];
  const recommendations = await recommendationService.getRecommendations(user!.id, limit, excludeIds);

  return c.json({ recommendations });
});

// Get similar articles (public, but personalized if authenticated)
recommendationsRouter.get(
  '/similar/:articleId',
  optionalAuth,
  zValidator('query', z.object({ limit: z.coerce.number().int().positive().max(20).default(6) })),
  async (c) => {
    const articleId = c.req.param('articleId');
    const user = getCurrentUser(c);
    const { limit } = c.req.valid('query');

    const similar = await recommendationService.getSimilarArticles(articleId, user?.id || null, limit);

    return c.json({ articles: similar });
  }
);

// Get recommended authors to follow
recommendationsRouter.get('/authors', requireAuth, zValidator('query', paginationSchema), async (c) => {
  const user = getCurrentUser(c);
  const { limit } = c.req.valid('query');

  const authors = await recommendationService.getRecommendedAuthors(user!.id, limit);

  return c.json({ authors });
});

// Get user interests (for debugging/display)
recommendationsRouter.get('/interests', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const interests = await recommendationService.analyzeUserInterests(user!.id);

  return c.json({ interests });
});

// Refresh recommendations (invalidate cache)
recommendationsRouter.post('/refresh', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  await recommendationService.invalidateRecommendations(user!.id);

  return c.json({ message: 'Recommendations refreshed' });
});

export { recommendationsRouter };
