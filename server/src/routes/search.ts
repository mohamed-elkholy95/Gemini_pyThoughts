import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { searchService } from '../services/search.service.js';
import { optionalAuth, type AuthContext } from '../middleware/auth.js';

const searchRouter = new Hono<AuthContext>();

// Search articles
searchRouter.get(
  '/articles',
  optionalAuth,
  zValidator(
    'query',
    z.object({
      q: z.string().min(1),
      page: z.coerce.number().int().positive().optional().default(1),
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
      sortBy: z.enum(['relevance', 'date', 'popularity']).optional().default('relevance'),
      authorId: z.string().uuid().optional(),
    })
  ),
  async (c) => {
    const { q, page, limit, sortBy, authorId } = c.req.valid('query');

    const result = await searchService.searchArticles({
      query: q,
      page,
      limit,
      sortBy,
      authorId,
    });

    return c.json({
      ...result,
      page,
      limit,
      hasMore: result.total > page * limit,
    });
  }
);

// Search users
searchRouter.get(
  '/users',
  zValidator(
    'query',
    z.object({
      q: z.string().min(1),
      page: z.coerce.number().int().positive().optional().default(1),
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    })
  ),
  async (c) => {
    const { q, page, limit } = c.req.valid('query');

    const result = await searchService.searchUsers(q, page, limit);

    return c.json({
      ...result,
      page,
      limit,
      hasMore: result.total > page * limit,
    });
  }
);

// Search tags
searchRouter.get(
  '/tags',
  zValidator(
    'query',
    z.object({
      q: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
  ),
  async (c) => {
    const { q, limit } = c.req.valid('query');

    const results = await searchService.searchTags(q, limit);

    return c.json({ results });
  }
);

// Get search suggestions (autocomplete)
searchRouter.get(
  '/suggestions',
  zValidator(
    'query',
    z.object({
      q: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(10).optional().default(5),
    })
  ),
  async (c) => {
    const { q, limit } = c.req.valid('query');

    const suggestions = await searchService.getSuggestions(q, limit);

    return c.json(suggestions);
  }
);

// Get articles by tag
searchRouter.get(
  '/tag/:slug',
  optionalAuth,
  zValidator(
    'query',
    z.object({
      page: z.coerce.number().int().positive().optional().default(1),
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    })
  ),
  async (c) => {
    const slug = c.req.param('slug');
    const { page, limit } = c.req.valid('query');

    const result = await searchService.getArticlesByTag(slug, page, limit);

    return c.json({
      ...result,
      page,
      limit,
      hasMore: result.total > page * limit,
    });
  }
);

export { searchRouter };
