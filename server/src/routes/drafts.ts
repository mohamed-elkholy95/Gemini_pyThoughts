import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { draftService, tagService } from '../services/draft.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';
import type { EditorJSContent } from '../db/schema.js';

const draftsRouter = new Hono<AuthContext>();

// Validation schemas
const createDraftSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.any().optional() as z.ZodType<EditorJSContent | undefined>,
  excerpt: z.string().max(1000).optional(),
  coverImage: z.string().url().optional(),
});

const updateDraftSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.any().optional() as z.ZodType<EditorJSContent | undefined>,
  excerpt: z.string().max(1000).optional(),
  coverImage: z.string().url().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

const autoSaveSchema = z.object({
  content: z.any() as z.ZodType<EditorJSContent>,
});

const listDraftsSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Apply auth middleware to all routes
draftsRouter.use('*', requireAuth);

// Create draft
draftsRouter.post('/', zValidator('json', createDraftSchema), async (c) => {
  const user = getCurrentUser(c);
  const input = c.req.valid('json');

  const draft = await draftService.create({
    ...input,
    authorId: user!.id,
  });

  return c.json({ draft }, 201);
});

// List user's drafts
draftsRouter.get('/', zValidator('query', listDraftsSchema), async (c) => {
  const user = getCurrentUser(c);
  const query = c.req.valid('query');

  const result = await draftService.list({
    authorId: user!.id,
    ...query,
  });

  return c.json({
    drafts: result.drafts,
    pagination: {
      total: result.total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(result.total / query.limit),
    },
  });
});

// Get single draft
draftsRouter.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const draft = await draftService.getById(id, user!.id);
  return c.json({ draft });
});

// Update draft
draftsRouter.patch('/:id', zValidator('json', updateDraftSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const draft = await draftService.update(id, user!.id, input);
  return c.json({ draft });
});

// Auto-save endpoint (no version creation)
draftsRouter.put('/:id/autosave', zValidator('json', autoSaveSchema), async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { content } = c.req.valid('json');

  const draft = await draftService.autoSave(id, user!.id, content);
  return c.json({ draft, savedAt: new Date().toISOString() });
});

// Publish draft
draftsRouter.post('/:id/publish', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const draft = await draftService.update(id, user!.id, { status: 'published' });
  return c.json({ draft });
});

// Unpublish draft
draftsRouter.post('/:id/unpublish', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const draft = await draftService.update(id, user!.id, { status: 'draft' });
  return c.json({ draft });
});

// Get draft versions
draftsRouter.get('/:id/versions', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const versions = await draftService.getVersions(id, user!.id);
  return c.json({ versions });
});

// Restore from version
draftsRouter.post('/:id/versions/:versionId/restore', async (c) => {
  const user = getCurrentUser(c);
  const { id, versionId } = c.req.param();

  const draft = await draftService.restoreVersion(id, versionId, user!.id);
  return c.json({ draft });
});

// Delete draft (soft delete)
draftsRouter.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  await draftService.delete(id, user!.id);
  return c.json({ message: 'Draft moved to trash' });
});

// Restore deleted draft
draftsRouter.post('/:id/restore', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const draft = await draftService.restore(id, user!.id);
  return c.json({ draft });
});

// Permanent delete
draftsRouter.delete('/:id/permanent', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  await draftService.permanentDelete(id, user!.id);
  return c.json({ message: 'Draft permanently deleted' });
});

// Tags routes
draftsRouter.get('/tags/all', async (c) => {
  const tagsList = await tagService.list();
  return c.json({ tags: tagsList });
});

draftsRouter.post('/tags', zValidator('json', z.object({ name: z.string().min(1).max(50), description: z.string().max(200).optional() })), async (c) => {
  const { name, description } = c.req.valid('json');
  const tag = await tagService.create(name, description);
  return c.json({ tag }, 201);
});

export { draftsRouter };
