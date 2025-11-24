import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { privacyService } from '../services/privacy.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const privacyRouter = new Hono<AuthContext>();

// Validation schemas
const userIdSchema = z.object({
  userId: z.string().min(1),
});

const muteSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['posts', 'comments', 'all']).optional(),
  durationHours: z.number().positive().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// All routes require authentication
privacyRouter.use('*', requireAuth);

// Block a user
privacyRouter.post('/block', zValidator('json', userIdSchema), async (c) => {
  const user = getCurrentUser(c);
  const { userId: targetUserId } = c.req.valid('json');

  try {
    await privacyService.blockUser(user!.id, targetUserId);
    return c.json({ message: 'User blocked successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to block user';
    return c.json({ error: message }, 400);
  }
});

// Unblock a user
privacyRouter.delete('/block/:userId', async (c) => {
  const user = getCurrentUser(c);
  const targetUserId = c.req.param('userId');

  await privacyService.unblockUser(user!.id, targetUserId);
  return c.json({ message: 'User unblocked successfully' });
});

// Mute a user
privacyRouter.post('/mute', zValidator('json', muteSchema), async (c) => {
  const user = getCurrentUser(c);
  const { userId: targetUserId, type, durationHours } = c.req.valid('json');

  try {
    await privacyService.muteUser(user!.id, targetUserId, { type, durationHours });
    return c.json({ message: 'User muted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mute user';
    return c.json({ error: message }, 400);
  }
});

// Unmute a user
privacyRouter.delete('/mute/:userId', async (c) => {
  const user = getCurrentUser(c);
  const targetUserId = c.req.param('userId');

  await privacyService.unmuteUser(user!.id, targetUserId);
  return c.json({ message: 'User unmuted successfully' });
});

// Get block list
privacyRouter.get('/blocked', zValidator('query', listQuerySchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await privacyService.getBlockList(user!.id, page, limit);

  return c.json({
    blocks: result.blocks,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get mute list
privacyRouter.get('/muted', zValidator('query', listQuerySchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await privacyService.getMuteList(user!.id, page, limit);

  return c.json({
    mutes: result.mutes,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Check if a user is blocked
privacyRouter.get('/blocked/:userId', async (c) => {
  const user = getCurrentUser(c);
  const targetUserId = c.req.param('userId');

  const isBlocked = await privacyService.isBlocked(user!.id, targetUserId);
  return c.json({ isBlocked });
});

// Check if a user is muted
privacyRouter.get('/muted/:userId', async (c) => {
  const user = getCurrentUser(c);
  const targetUserId = c.req.param('userId');

  const isMuted = await privacyService.isMuted(user!.id, targetUserId);
  return c.json({ isMuted });
});

export { privacyRouter };
