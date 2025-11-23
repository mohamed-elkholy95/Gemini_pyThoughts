import { Context, Next } from 'hono';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let rateLimiter: RateLimiterMemory | RateLimiterRedis;

// Initialize rate limiter (Redis if available, otherwise in-memory)
if (env.REDIS_URL) {
  const redisClient = new Redis(env.REDIS_URL);
  rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'pythoughts_rl',
    points: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
    duration: parseInt(env.RATE_LIMIT_WINDOW_MS) / 1000,
  });
  logger.info('Rate limiter initialized with Redis');
} else {
  rateLimiter = new RateLimiterMemory({
    points: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
    duration: parseInt(env.RATE_LIMIT_WINDOW_MS) / 1000,
  });
  logger.info('Rate limiter initialized with in-memory store');
}

export async function rateLimit(c: Context, next: Next) {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

  try {
    const rateLimiterRes = await rateLimiter.consume(ip);

    c.header('X-RateLimit-Limit', env.RATE_LIMIT_MAX_REQUESTS);
    c.header('X-RateLimit-Remaining', rateLimiterRes.remainingPoints.toString());
    c.header('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

    return next();
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ error, ip }, 'Rate limiter error');
      await next();
      return;
    }

    // Rate limit exceeded
    const rateLimiterRes = error as { msBeforeNext: number };
    c.header('Retry-After', Math.ceil(rateLimiterRes.msBeforeNext / 1000).toString());
    return c.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
      },
      429
    );
  }
}

// Stricter rate limiter for auth endpoints
const authRateLimiter = env.REDIS_URL
  ? new RateLimiterRedis({
      storeClient: new Redis(env.REDIS_URL),
      keyPrefix: 'pythoughts_auth_rl',
      points: 10, // 10 attempts
      duration: 60 * 15, // per 15 minutes
      blockDuration: 60 * 15, // Block for 15 minutes
    })
  : new RateLimiterMemory({
      points: 10,
      duration: 60 * 15,
      blockDuration: 60 * 15,
    });

export async function authRateLimit(c: Context, next: Next) {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

  try {
    await authRateLimiter.consume(ip);
    return next();
  } catch {
    return c.json(
      {
        error: 'Too Many Requests',
        message: 'Too many authentication attempts. Please try again later.',
      },
      429
    );
  }
}
