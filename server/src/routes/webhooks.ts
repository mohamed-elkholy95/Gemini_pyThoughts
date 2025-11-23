import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { webhookService, WebhookEvent } from '../services/webhook.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const webhooksRouter = new Hono<AuthContext>();

// All webhook routes require auth
webhooksRouter.use('*', requireAuth);

const webhookEventSchema = z.enum([
  'article.published',
  'article.updated',
  'article.deleted',
  'comment.created',
  'comment.deleted',
  'user.followed',
  'user.unfollowed',
  'like.created',
  'like.deleted',
]);

// Create a new webhook
webhooksRouter.post(
  '/',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(100),
      url: z.string().url(),
      events: z.array(webhookEventSchema).min(1),
      headers: z.record(z.string()).optional(),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c)!;
    const data = c.req.valid('json');

    const webhook = await webhookService.create({
      userId: user.id,
      name: data.name,
      url: data.url,
      events: data.events as WebhookEvent[],
      headers: data.headers,
    });

    return c.json({ webhook }, 201);
  }
);

// Get all webhooks for current user
webhooksRouter.get('/', async (c) => {
  const user = getCurrentUser(c)!;
  const webhooks = await webhookService.getByUserId(user.id);
  return c.json({ webhooks });
});

// Get a specific webhook
webhooksRouter.get('/:id', async (c) => {
  const user = getCurrentUser(c)!;
  const webhookId = c.req.param('id');

  const webhook = await webhookService.getById(webhookId, user.id);

  if (!webhook) {
    return c.json({ error: 'Webhook not found' }, 404);
  }

  return c.json({ webhook });
});

// Update a webhook
webhooksRouter.patch(
  '/:id',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(100).optional(),
      url: z.string().url().optional(),
      events: z.array(webhookEventSchema).min(1).optional(),
      headers: z.record(z.string()).optional(),
      isActive: z.boolean().optional(),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c)!;
    const webhookId = c.req.param('id');
    const data = c.req.valid('json');

    const webhook = await webhookService.update(webhookId, user.id, data as Parameters<typeof webhookService.update>[2]);

    if (!webhook) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    return c.json({ webhook });
  }
);

// Delete a webhook
webhooksRouter.delete('/:id', async (c) => {
  const user = getCurrentUser(c)!;
  const webhookId = c.req.param('id');

  const deleted = await webhookService.delete(webhookId, user.id);

  if (!deleted) {
    return c.json({ error: 'Webhook not found' }, 404);
  }

  return c.json({ success: true });
});

// Regenerate webhook secret
webhooksRouter.post('/:id/regenerate-secret', async (c) => {
  const user = getCurrentUser(c)!;
  const webhookId = c.req.param('id');

  const result = await webhookService.regenerateSecret(webhookId, user.id);

  if (!result) {
    return c.json({ error: 'Webhook not found' }, 404);
  }

  return c.json(result);
});

// Test a webhook
webhooksRouter.post('/:id/test', async (c) => {
  const user = getCurrentUser(c)!;
  const webhookId = c.req.param('id');

  const result = await webhookService.test(webhookId, user.id);

  return c.json(result);
});

// Get webhook deliveries
webhooksRouter.get(
  '/:id/deliveries',
  zValidator(
    'query',
    z.object({
      page: z.coerce.number().int().positive().optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c)!;
    const webhookId = c.req.param('id');
    const { page, limit } = c.req.valid('query');

    const result = await webhookService.getDeliveries(webhookId, user.id, page, limit);

    return c.json({
      ...result,
      page,
      limit,
      hasMore: result.total > page * limit,
    });
  }
);

// Retry a failed delivery
webhooksRouter.post('/deliveries/:deliveryId/retry', async (c) => {
  const user = getCurrentUser(c)!;
  const deliveryId = c.req.param('deliveryId');

  const result = await webhookService.retryDelivery(deliveryId, user.id);

  return c.json(result);
});

export { webhooksRouter };
