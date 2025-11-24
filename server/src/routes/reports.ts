import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { reportService } from '../services/report.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const reportsRouter = new Hono<AuthContext>();

// Validation schemas
const createReportSchema = z.object({
  contentType: z.enum(['article', 'comment', 'user']),
  contentId: z.string().min(1),
  reason: z.enum(['spam', 'harassment', 'hate_speech', 'misinformation', 'copyright', 'other']),
  description: z.string().max(1000).optional(),
});

const updateReportSchema = z.object({
  status: z.enum(['pending', 'reviewed', 'resolved', 'dismissed']),
  resolution: z.string().max(500).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['pending', 'reviewed', 'resolved', 'dismissed']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const actionSchema = z.object({
  action: z.enum(['remove', 'warn', 'ban']),
});

// All routes require authentication
reportsRouter.use('*', requireAuth);

// Create a report
reportsRouter.post('/', zValidator('json', createReportSchema), async (c) => {
  const user = getCurrentUser(c);
  const input = c.req.valid('json');

  try {
    const report = await reportService.create({
      ...input,
      reporterId: user!.id,
    });

    return c.json({ report, message: 'Report submitted successfully' }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create report';
    return c.json({ error: message }, 400);
  }
});

// Get user's own reports
reportsRouter.get('/my-reports', zValidator('query', listQuerySchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await reportService.getByReporter(user!.id, page, limit);

  return c.json({
    reports: result.reports,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get report statistics (admin/moderator only)
// Note: In production, add admin role check middleware
reportsRouter.get('/stats', async (c) => {
  // TODO: Add admin role verification
  const stats = await reportService.getStats();
  return c.json({ stats });
});

// List all reports (admin/moderator only)
reportsRouter.get('/', zValidator('query', listQuerySchema), async (c) => {
  // TODO: Add admin role verification
  const { status, page, limit } = c.req.valid('query');

  const result = await reportService.list(status, page, limit);

  return c.json({
    reports: result.reports,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get single report (admin/moderator only)
reportsRouter.get('/:id', async (c) => {
  // TODO: Add admin role verification
  const id = c.req.param('id');

  const report = await reportService.getById(id);

  if (!report) {
    return c.json({ error: 'Report not found' }, 404);
  }

  return c.json({ report });
});

// Update report status (admin/moderator only)
reportsRouter.patch('/:id', zValidator('json', updateReportSchema), async (c) => {
  // TODO: Add admin role verification
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const updated = await reportService.updateStatus(id, user!.id, input);

  if (!updated) {
    return c.json({ error: 'Report not found' }, 404);
  }

  return c.json({ report: updated });
});

// Take action on reported content (admin/moderator only)
reportsRouter.post('/:id/action', zValidator('json', actionSchema), async (c) => {
  // TODO: Add admin role verification
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { action } = c.req.valid('json');

  const success = await reportService.takeAction(id, user!.id, action);

  if (!success) {
    return c.json({ error: 'Unable to take action' }, 400);
  }

  return c.json({ message: `Action '${action}' taken successfully` });
});

export { reportsRouter };
