import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { readingListService } from '../services/readingList.service.js';
import { requireAuth, getCurrentUser, optionalAuth, type AuthContext } from '../middleware/auth.js';

const readingListsRouter = new Hono<AuthContext>();

// Validation schemas
const createListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

const updateListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const addItemSchema = z.object({
  draftId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

const updateNoteSchema = z.object({
  note: z.string().max(500).nullable(),
});

// Public: List public reading lists
readingListsRouter.get('/public', zValidator('query', listQuerySchema), async (c) => {
  const { page, limit } = c.req.valid('query');
  const result = await readingListService.listPublic(page, limit);

  return c.json({
    lists: result.lists,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Public: Get public reading list by ID
readingListsRouter.get('/public/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const user = getCurrentUser(c);

  const list = await readingListService.getById(id, user?.id);

  if (!list) {
    return c.json({ error: 'Reading list not found' }, 404);
  }

  return c.json({ list });
});

// Protected routes - require auth
readingListsRouter.use('/*', requireAuth);

// Create reading list
readingListsRouter.post('/', zValidator('json', createListSchema), async (c) => {
  const user = getCurrentUser(c);
  const input = c.req.valid('json');

  const list = await readingListService.create({
    ...input,
    userId: user!.id,
  });

  return c.json({ list }, 201);
});

// List user's reading lists
readingListsRouter.get('/', zValidator('query', listQuerySchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await readingListService.listByUser(user!.id, page, limit);

  return c.json({
    lists: result.lists,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get single reading list
readingListsRouter.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const list = await readingListService.getById(id, user!.id);

  if (!list) {
    return c.json({ error: 'Reading list not found' }, 404);
  }

  return c.json({ list });
});

// Update reading list
readingListsRouter.patch('/:id', zValidator('json', updateListSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const updated = await readingListService.update(id, user!.id, input);

  if (!updated) {
    return c.json({ error: 'Reading list not found or unauthorized' }, 404);
  }

  return c.json({ list: updated });
});

// Delete reading list
readingListsRouter.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const deleted = await readingListService.delete(id, user!.id);

  if (!deleted) {
    return c.json({ error: 'Reading list not found or unauthorized' }, 404);
  }

  return c.json({ message: 'Reading list deleted' });
});

// Add item to reading list
readingListsRouter.post('/:id/items', zValidator('json', addItemSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { draftId, note } = c.req.valid('json');

  const added = await readingListService.addItem(id, draftId, user!.id, note);

  if (!added) {
    return c.json({ error: 'Unable to add article to reading list' }, 400);
  }

  return c.json({ message: 'Article added to reading list' });
});

// Remove item from reading list
readingListsRouter.delete('/:id/items/:draftId', async (c) => {
  const user = getCurrentUser(c);
  const { id, draftId } = c.req.param();

  const removed = await readingListService.removeItem(id, draftId, user!.id);

  if (!removed) {
    return c.json({ error: 'Unable to remove article from reading list' }, 400);
  }

  return c.json({ message: 'Article removed from reading list' });
});

// Update item note
readingListsRouter.patch('/:id/items/:draftId', zValidator('json', updateNoteSchema), async (c) => {
  const user = getCurrentUser(c);
  const { id, draftId } = c.req.param();
  const { note } = c.req.valid('json');

  const updated = await readingListService.updateItemNote(id, draftId, user!.id, note);

  if (!updated) {
    return c.json({ error: 'Unable to update note' }, 400);
  }

  return c.json({ message: 'Note updated' });
});

// Check which lists contain an article
readingListsRouter.get('/contains/:draftId', async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('draftId');

  const lists = await readingListService.getListsContainingArticle(draftId, user!.id);

  return c.json({ lists });
});

// Quick save (add to default "Saved" list)
readingListsRouter.post('/quick-save/:draftId', async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('draftId');

  const saved = await readingListService.quickSave(draftId, user!.id);

  if (!saved) {
    return c.json({ error: 'Unable to save article' }, 400);
  }

  return c.json({ message: 'Article saved' });
});

export { readingListsRouter };
