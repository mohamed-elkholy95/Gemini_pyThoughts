import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { seriesService } from '../services/series.service.js';
import { requireAuth, getCurrentUser, optionalAuth, type AuthContext } from '../middleware/auth.js';

const seriesRouter = new Hono<AuthContext>();

// Validation schemas
const createSeriesSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  coverImage: z.string().url().optional(),
});

const updateSeriesSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  coverImage: z.string().url().optional(),
  isPublished: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const addArticleSchema = z.object({
  draftId: z.string().uuid(),
});

const reorderSchema = z.object({
  articleIds: z.array(z.string().uuid()),
});

// Public: List published series
seriesRouter.get('/public', zValidator('query', listQuerySchema), async (c) => {
  const { page, limit } = c.req.valid('query');
  const result = await seriesService.listPublished(page, limit);

  return c.json({
    series: result.series,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Public: Get published series by slug
seriesRouter.get('/public/:slug', optionalAuth, async (c) => {
  const slug = c.req.param('slug');
  const user = getCurrentUser(c);

  const seriesData = await seriesService.getBySlug(slug, user?.id);

  if (!seriesData) {
    return c.json({ error: 'Series not found' }, 404);
  }

  return c.json({ series: seriesData });
});

// Protected routes - require auth
seriesRouter.use('/*', requireAuth);

// Create series
seriesRouter.post('/', zValidator('json', createSeriesSchema), async (c) => {
  const user = getCurrentUser(c);
  const input = c.req.valid('json');

  const seriesData = await seriesService.create({
    ...input,
    authorId: user!.id,
  });

  return c.json({ series: seriesData }, 201);
});

// List user's series
seriesRouter.get('/', zValidator('query', listQuerySchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await seriesService.listByAuthor(user!.id, page, limit);

  return c.json({
    series: result.series,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get single series
seriesRouter.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const seriesData = await seriesService.getById(id, user!.id);

  if (!seriesData) {
    return c.json({ error: 'Series not found' }, 404);
  }

  return c.json({ series: seriesData });
});

// Update series
seriesRouter.patch('/:id', zValidator('json', updateSeriesSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const updated = await seriesService.update(id, user!.id, input);

  if (!updated) {
    return c.json({ error: 'Series not found or unauthorized' }, 404);
  }

  return c.json({ series: updated });
});

// Delete series
seriesRouter.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const deleted = await seriesService.delete(id, user!.id);

  if (!deleted) {
    return c.json({ error: 'Series not found or unauthorized' }, 404);
  }

  return c.json({ message: 'Series deleted' });
});

// Add article to series
seriesRouter.post('/:id/articles', zValidator('json', addArticleSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { draftId } = c.req.valid('json');

  const added = await seriesService.addArticle(id, draftId, user!.id);

  if (!added) {
    return c.json({ error: 'Unable to add article to series' }, 400);
  }

  return c.json({ message: 'Article added to series' });
});

// Remove article from series
seriesRouter.delete('/:id/articles/:draftId', async (c) => {
  const user = getCurrentUser(c);
  const { id, draftId } = c.req.param();

  const removed = await seriesService.removeArticle(id, draftId, user!.id);

  if (!removed) {
    return c.json({ error: 'Unable to remove article from series' }, 400);
  }

  return c.json({ message: 'Article removed from series' });
});

// Reorder articles in series
seriesRouter.put('/:id/articles/order', zValidator('json', reorderSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { articleIds } = c.req.valid('json');

  const reordered = await seriesService.reorderArticles(id, user!.id, articleIds);

  if (!reordered) {
    return c.json({ error: 'Unable to reorder articles' }, 400);
  }

  return c.json({ message: 'Articles reordered' });
});

// Publish series
seriesRouter.post('/:id/publish', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const updated = await seriesService.update(id, user!.id, { isPublished: true });

  if (!updated) {
    return c.json({ error: 'Series not found or unauthorized' }, 404);
  }

  return c.json({ series: updated });
});

// Unpublish series
seriesRouter.post('/:id/unpublish', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const updated = await seriesService.update(id, user!.id, { isPublished: false });

  if (!updated) {
    return c.json({ error: 'Series not found or unauthorized' }, 404);
  }

  return c.json({ series: updated });
});

export { seriesRouter };
