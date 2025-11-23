import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { userService } from '../services/user.service.js';
import { requireAuth, getSession, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const usersRouter = new Hono<AuthContext>();

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  image: z.string().url().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Get current user profile
usersRouter.get('/me', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const profile = await userService.getProfile(user!.id);
  return c.json({ user: profile });
});

// Update current user profile
usersRouter.patch('/me', requireAuth, zValidator('json', updateProfileSchema), async (c) => {
  const user = getCurrentUser(c);
  const input = c.req.valid('json');

  const updated = await userService.updateProfile(user!.id, input);
  return c.json({ user: updated });
});

// Get user by ID (public)
usersRouter.get('/:id', getSession, async (c) => {
  const id = c.req.param('id');
  const currentUser = getCurrentUser(c);

  const profile = await userService.getProfile(id, currentUser?.id);
  return c.json({ user: profile });
});

// Follow a user
usersRouter.post('/:id/follow', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const followingId = c.req.param('id');

  await userService.follow(user!.id, followingId);
  return c.json({ message: 'User followed successfully' });
});

// Unfollow a user
usersRouter.delete('/:id/follow', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const followingId = c.req.param('id');

  await userService.unfollow(user!.id, followingId);
  return c.json({ message: 'User unfollowed successfully' });
});

// Get user's followers
usersRouter.get('/:id/followers', zValidator('query', paginationSchema), async (c) => {
  const userId = c.req.param('id');
  const { page, limit } = c.req.valid('query');

  const result = await userService.getFollowers(userId, page, limit);
  return c.json({
    users: result.users,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get users that a user follows
usersRouter.get('/:id/following', zValidator('query', paginationSchema), async (c) => {
  const userId = c.req.param('id');
  const { page, limit } = c.req.valid('query');

  const result = await userService.getFollowing(userId, page, limit);
  return c.json({
    users: result.users,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Get current user's bookmarks
usersRouter.get('/me/bookmarks', requireAuth, zValidator('query', paginationSchema), async (c) => {
  const user = getCurrentUser(c);
  const { page, limit } = c.req.valid('query');

  const result = await userService.getBookmarks(user!.id, page, limit);
  return c.json({
    bookmarks: result.bookmarks,
    pagination: {
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    },
  });
});

// Bookmark an article
usersRouter.post('/me/bookmarks/:draftId', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('draftId');

  await userService.bookmark(user!.id, draftId);
  return c.json({ message: 'Article bookmarked' }, 201);
});

// Remove bookmark
usersRouter.delete('/me/bookmarks/:draftId', requireAuth, async (c) => {
  const user = getCurrentUser(c);
  const draftId = c.req.param('draftId');

  await userService.removeBookmark(user!.id, draftId);
  return c.json({ message: 'Bookmark removed' });
});

export { usersRouter };
