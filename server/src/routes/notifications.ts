import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { notificationService } from '../services/notification.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const notificationsRouter = new Hono<AuthContext>();

// All routes require auth
notificationsRouter.use('*', requireAuth);

// Validation schemas
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  unread: z.coerce.boolean().default(false),
});

const preferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  notifyNewFollower: z.boolean().optional(),
  notifyComments: z.boolean().optional(),
  notifyMentions: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

// Get notifications
notificationsRouter.get('/', zValidator('query', listSchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit, unread } = c.req.valid('query');

  const result = await notificationService.getByUserId(user!.id, page, limit, unread);

  return c.json({
    notifications: result.notifications,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get unread count
notificationsRouter.get('/unread-count', async (c) => {
  const user = getCurrentUser(c);
  const count = await notificationService.getUnreadCount(user!.id);
  return c.json({ count });
});

// Mark single notification as read
notificationsRouter.patch('/:id/read', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const success = await notificationService.markAsRead(id, user!.id);

  if (!success) {
    return c.json({ error: 'Notification not found' }, 404);
  }

  return c.json({ success: true });
});

// Mark all notifications as read
notificationsRouter.post('/mark-all-read', async (c) => {
  const user = getCurrentUser(c);
  await notificationService.markAllAsRead(user!.id);
  return c.json({ success: true });
});

// Delete notification
notificationsRouter.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const success = await notificationService.delete(id, user!.id);

  if (!success) {
    return c.json({ error: 'Notification not found' }, 404);
  }

  return c.json({ success: true });
});

// Get preferences
notificationsRouter.get('/preferences', async (c) => {
  const user = getCurrentUser(c);
  const prefs = await notificationService.getUserPreferences(user!.id);

  return c.json({
    preferences: prefs || {
      emailNotifications: true,
      pushNotifications: true,
      notifyNewFollower: true,
      notifyComments: true,
      notifyMentions: true,
      theme: 'system',
    },
  });
});

// Update preferences
notificationsRouter.patch('/preferences', zValidator('json', preferencesSchema), async (c) => {
  const user = getCurrentUser(c);
  const data = c.req.valid('json');

  const prefs = await notificationService.updateUserPreferences(user!.id, data);
  return c.json({ preferences: prefs });
});

export { notificationsRouter };
