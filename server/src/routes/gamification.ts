import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { gamificationService } from '../services/gamification.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const gamificationRouter = new Hono<AuthContext>();

// Validation schemas
const leaderboardSchema = z.object({
  period: z.enum(['weekly', 'monthly', 'all_time']).default('weekly'),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

// Public: Get all available badges
gamificationRouter.get('/badges', async (c) => {
  const badges = await gamificationService.getAllBadges();
  return c.json({ badges });
});

// Public: Get leaderboard
gamificationRouter.get('/leaderboard', zValidator('query', leaderboardSchema), async (c) => {
  const { period, limit } = c.req.valid('query');
  const leaderboard = await gamificationService.getLeaderboard(period, limit);
  return c.json({ leaderboard, period });
});

// Protected routes
gamificationRouter.use('/*', requireAuth);

// Record daily activity (login streak)
gamificationRouter.post('/activity', async (c) => {
  const user = getCurrentUser(c);
  const result = await gamificationService.recordActivity(user!.id, 'login');
  return c.json(result);
});

// Get current user's points and level
gamificationRouter.get('/points', async (c) => {
  const user = getCurrentUser(c);
  const points = await gamificationService.getUserPoints(user!.id);
  return c.json(points);
});

// Get current user's streak
gamificationRouter.get('/streak', async (c) => {
  const user = getCurrentUser(c);
  const streak = await gamificationService.getUserStreak(user!.id);
  return c.json(streak);
});

// Get current user's badges
gamificationRouter.get('/my-badges', async (c) => {
  const user = getCurrentUser(c);
  const badges = await gamificationService.getUserBadges(user!.id);
  return c.json({ badges });
});

// Get another user's public badges
gamificationRouter.get('/users/:userId/badges', async (c) => {
  const userId = c.req.param('userId');
  const badges = await gamificationService.getUserBadges(userId);
  return c.json({ badges });
});

// Get another user's public points
gamificationRouter.get('/users/:userId/points', async (c) => {
  const userId = c.req.param('userId');
  const points = await gamificationService.getUserPoints(userId);
  // Return only public info
  return c.json({
    totalPoints: points.totalPoints,
    level: points.level,
  });
});

// Get full gamification profile
gamificationRouter.get('/profile', async (c) => {
  const user = getCurrentUser(c);
  const [points, streak, badges] = await Promise.all([
    gamificationService.getUserPoints(user!.id),
    gamificationService.getUserStreak(user!.id),
    gamificationService.getUserBadges(user!.id),
  ]);

  return c.json({
    points,
    streak,
    badges,
    badgeCount: badges.length,
  });
});

export { gamificationRouter };
