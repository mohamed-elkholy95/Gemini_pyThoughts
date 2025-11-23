import { Context, Next } from 'hono';
import { auth } from '../config/auth.js';
import { logger } from '../config/logger.js';

export type AuthContext = {
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
};

// Middleware to get session (optional auth)
export async function getSession(c: Context<AuthContext>, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    c.set('user', session?.user ?? null);
    c.set('session', session?.session ?? null);
  } catch (error) {
    logger.error({ error }, 'Failed to get session');
    c.set('user', null);
    c.set('session', null);
  }

  await next();
}

// Middleware to require authentication
export async function requireAuth(c: Context<AuthContext>, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    c.set('user', session.user);
    c.set('session', session.session);
    await next();
  } catch (error) {
    logger.error({ error }, 'Auth middleware error');
    return c.json({ error: 'Unauthorized', message: 'Invalid session' }, 401);
  }
}

// Helper to get current user from context
export function getCurrentUser(c: Context<AuthContext>) {
  return c.get('user');
}

export function getCurrentSession(c: Context<AuthContext>) {
  return c.get('session');
}
