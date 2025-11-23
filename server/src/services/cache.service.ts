import Redis from 'ioredis';
import { logger } from '../config/logger.js';

// Cache configuration
const CACHE_CONFIG = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  prefix: 'pythoughts:',
  defaultTTL: 300, // 5 minutes
};

// Cache TTLs for different data types (in seconds)
export const CACHE_TTL = {
  FEED: 60, // 1 minute
  TRENDING: 300, // 5 minutes
  USER_PROFILE: 600, // 10 minutes
  ARTICLE: 900, // 15 minutes
  ARTICLE_COUNT: 300, // 5 minutes
  SEARCH_RESULTS: 120, // 2 minutes
  TAGS: 3600, // 1 hour
  SESSION: 86400, // 24 hours
};

let client: Redis | null = null;
let isConnected = false;

export const cacheService = {
  // Initialize Redis connection
  async connect(): Promise<boolean> {
    if (isConnected && client) {
      return true;
    }

    try {
      client = new Redis(CACHE_CONFIG.url, {
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error('Redis retry limit exceeded');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        maxRetriesPerRequest: 3,
      });

      client.on('error', (err) => {
        logger.error({ error: err }, 'Redis Client Error');
        isConnected = false;
      });

      client.on('connect', () => {
        logger.info('Redis connected');
        isConnected = true;
      });

      client.on('close', () => {
        logger.warn('Redis disconnected');
        isConnected = false;
      });

      // Test connection
      await client.ping();
      isConnected = true;
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
      isConnected = false;
      return false;
    }
  },

  // Disconnect from Redis
  async disconnect(): Promise<void> {
    if (client) {
      await client.quit();
      client = null;
      isConnected = false;
      logger.info('Redis disconnected');
    }
  },

  // Check if Redis is connected
  isConnected(): boolean {
    return isConnected && client !== null;
  },

  // Get raw Redis client (for advanced operations)
  getClient(): Redis | null {
    return isConnected ? client : null;
  },

  // Get a key with prefix
  getKey(key: string): string {
    return `${CACHE_CONFIG.prefix}${key}`;
  },

  // Get value from cache
  async get<T>(key: string): Promise<T | null> {
    if (!client || !isConnected) {
      return null;
    }

    try {
      const value = await client.get(this.getKey(key));
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  },

  // Set value in cache
  async set<T>(key: string, value: T, ttl: number = CACHE_CONFIG.defaultTTL): Promise<boolean> {
    if (!client || !isConnected) {
      return false;
    }

    try {
      await client.setex(this.getKey(key), ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
      return false;
    }
  },

  // Delete a key from cache
  async delete(key: string): Promise<boolean> {
    if (!client || !isConnected) {
      return false;
    }

    try {
      await client.del(this.getKey(key));
      return true;
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
      return false;
    }
  },

  // Delete multiple keys matching a pattern
  async deletePattern(pattern: string): Promise<number> {
    if (!client || !isConnected) {
      return 0;
    }

    try {
      const keys = await client.keys(this.getKey(pattern));
      if (keys.length > 0) {
        await client.del(...keys);
      }
      return keys.length;
    } catch (error) {
      logger.error({ error, pattern }, 'Cache deletePattern error');
      return 0;
    }
  },

  // Increment a counter
  async increment(key: string, ttl?: number): Promise<number> {
    if (!client || !isConnected) {
      return 0;
    }

    try {
      const fullKey = this.getKey(key);
      const value = await client.incr(fullKey);
      if (ttl && value === 1) {
        await client.expire(fullKey, ttl);
      }
      return value;
    } catch (error) {
      logger.error({ error, key }, 'Cache increment error');
      return 0;
    }
  },

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    if (!client || !isConnected) {
      return false;
    }

    try {
      const exists = await client.exists(this.getKey(key));
      return exists === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  },

  // Get with cache-aside pattern
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = CACHE_CONFIG.defaultTTL
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch from source
    const value = await fetchFn();

    // Store in cache (don't await to not block response)
    this.set(key, value, ttl).catch((error) => {
      logger.error({ error, key }, 'Failed to cache value');
    });

    return value;
  },

  // Cache keys for common operations
  keys: {
    feed: (type: string, page: number, userId?: string) =>
      `feed:${type}:${userId || 'anon'}:${page}`,
    article: (id: string) => `article:${id}`,
    articleBySlug: (slug: string) => `article:slug:${slug}`,
    userProfile: (id: string) => `user:profile:${id}`,
    userArticles: (userId: string, page: number) => `user:${userId}:articles:${page}`,
    tags: () => 'tags:all',
    tagArticles: (tagSlug: string, page: number) => `tag:${tagSlug}:articles:${page}`,
    search: (query: string, page: number) => `search:${encodeURIComponent(query)}:${page}`,
    trending: (page: number) => `trending:${page}`,
    notifications: (userId: string, page: number) => `notifications:${userId}:${page}`,
    notificationCount: (userId: string) => `notifications:${userId}:count`,
    likesCount: (articleId: string) => `article:${articleId}:likes`,
    commentsCount: (articleId: string) => `article:${articleId}:comments`,
  },

  // Invalidation helpers
  invalidation: {
    // Invalidate all caches related to an article
    async article(articleId: string, authorId: string) {
      await Promise.all([
        cacheService.delete(cacheService.keys.article(articleId)),
        cacheService.deletePattern(`feed:*`),
        cacheService.deletePattern(`user:${authorId}:articles:*`),
        cacheService.deletePattern(`trending:*`),
        cacheService.delete(cacheService.keys.likesCount(articleId)),
        cacheService.delete(cacheService.keys.commentsCount(articleId)),
      ]);
    },

    // Invalidate user profile cache
    async userProfile(userId: string) {
      await cacheService.delete(cacheService.keys.userProfile(userId));
    },

    // Invalidate feed caches
    async feeds() {
      await cacheService.deletePattern('feed:*');
    },

    // Invalidate trending cache
    async trending() {
      await cacheService.deletePattern('trending:*');
    },

    // Invalidate user's notification cache
    async notifications(userId: string) {
      await Promise.all([
        cacheService.deletePattern(`notifications:${userId}:*`),
        cacheService.delete(cacheService.keys.notificationCount(userId)),
      ]);
    },

    // Invalidate tag caches
    async tags(tagSlug?: string) {
      if (tagSlug) {
        await cacheService.deletePattern(`tag:${tagSlug}:*`);
      }
      await cacheService.delete(cacheService.keys.tags());
    },

    // Invalidate search caches
    async search() {
      await cacheService.deletePattern('search:*');
    },
  },

  // Rate limiting helpers
  rateLimit: {
    // Check and increment rate limit
    async check(identifier: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
      const key = `ratelimit:${identifier}`;
      const current = await cacheService.increment(key, windowSeconds);

      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);
      const resetAt = Math.floor(Date.now() / 1000) + windowSeconds;

      return { allowed, remaining, resetAt };
    },
  },
};
