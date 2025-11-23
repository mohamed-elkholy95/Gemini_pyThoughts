// Advanced Caching Patterns Service
// Implements various caching strategies for optimal performance

import { cacheService } from './cache.service.js';
import { logger } from '../config/logger.js';

// Cache key prefixes
const KEY_PREFIX = {
  ASIDE: 'cache:aside:',
  THROUGH: 'cache:through:',
  STALE: 'cache:stale:',
  LOCK: 'cache:lock:',
  STAMPEDE: 'cache:stampede:',
};

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  staleWhileRevalidate?: number; // Additional time to serve stale data
  tags?: string[]; // Tags for cache invalidation
}

export interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  writes: number;
  deletes: number;
  hitRate: number;
}

// Track statistics
const stats = {
  hits: 0,
  misses: 0,
  staleHits: 0,
  writes: 0,
  deletes: 0,
};

// Cached value wrapper with metadata
interface CachedValue<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  staleUntil?: number;
  tags?: string[];
}

function createCachedValue<T>(
  data: T,
  ttl: number,
  staleTime?: number,
  tags?: string[]
): CachedValue<T> {
  const now = Date.now();
  return {
    data,
    createdAt: now,
    expiresAt: now + ttl * 1000,
    staleUntil: staleTime ? now + (ttl + staleTime) * 1000 : undefined,
    tags,
  };
}

export const cachePatterns = {
  /**
   * Cache-Aside Pattern (Lazy Loading)
   * Data is loaded into cache on demand when a cache miss occurs
   */
  async aside<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = 300, tags } = options;
    const cacheKey = KEY_PREFIX.ASIDE + key;

    // Try to get from cache
    const cached = await cacheService.get<CachedValue<T>>(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      stats.hits++;
      return cached.data;
    }

    stats.misses++;

    // Fetch from source
    const data = await fetchFn();

    // Store in cache
    const value = createCachedValue(data, ttl, undefined, tags);
    await cacheService.set(cacheKey, value, ttl);
    stats.writes++;

    return data;
  },

  /**
   * Read-Through Cache
   * Cache sits between application and data source, automatically loading data
   */
  async readThrough<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = 300, tags } = options;
    const cacheKey = KEY_PREFIX.THROUGH + key;

    // Check cache
    const cached = await cacheService.get<CachedValue<T>>(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      stats.hits++;
      return cached.data;
    }

    stats.misses++;

    // Fetch and cache atomically
    const data = await fetchFn();
    const value = createCachedValue(data, ttl, undefined, tags);
    await cacheService.set(cacheKey, value, ttl);
    stats.writes++;

    return data;
  },

  /**
   * Write-Through Cache
   * Writes go to cache and database simultaneously
   */
  async writeThrough<T>(
    key: string,
    data: T,
    writeFn: (data: T) => Promise<void>,
    options: CacheOptions = {}
  ): Promise<void> {
    const { ttl = 300, tags } = options;
    const cacheKey = KEY_PREFIX.THROUGH + key;

    const value = createCachedValue(data, ttl, undefined, tags);

    // Write to both cache and source
    await Promise.all([cacheService.set(cacheKey, value, ttl), writeFn(data)]);

    stats.writes++;
  },

  /**
   * Write-Behind (Write-Back) Cache
   * Writes go to cache immediately, then asynchronously to database
   */
  async writeBehind<T>(
    key: string,
    data: T,
    writeFn: (data: T) => Promise<void>,
    options: CacheOptions = {}
  ): Promise<void> {
    const { ttl = 300, tags } = options;
    const cacheKey = KEY_PREFIX.THROUGH + key;

    const value = createCachedValue(data, ttl, undefined, tags);

    // Write to cache immediately
    await cacheService.set(cacheKey, value, ttl);
    stats.writes++;

    // Async write to source (fire and forget with error logging)
    writeFn(data).catch((error) => {
      logger.error({ key, error }, 'Write-behind cache write to source failed');
    });
  },

  /**
   * Stale-While-Revalidate Pattern
   * Serve stale data while fetching fresh data in background
   */
  async staleWhileRevalidate<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = 300, staleWhileRevalidate = 60, tags } = options;
    const cacheKey = KEY_PREFIX.STALE + key;

    const cached = await cacheService.get<CachedValue<T>>(cacheKey);
    if (cached) {
      const now = Date.now();

      // Fresh data
      if (cached.expiresAt > now) {
        stats.hits++;
        return cached.data;
      }

      // Stale but within revalidation window
      if (cached.staleUntil && cached.staleUntil > now) {
        stats.staleHits++;

        // Revalidate in background
        this.revalidateInBackground(cacheKey, fetchFn, ttl, staleWhileRevalidate, tags);

        return cached.data;
      }
    }

    stats.misses++;

    // Fetch fresh data
    const data = await fetchFn();
    const value = createCachedValue(data, ttl, staleWhileRevalidate, tags);
    await cacheService.set(cacheKey, value, ttl + staleWhileRevalidate);
    stats.writes++;

    return data;
  },

  /**
   * Background revalidation for stale-while-revalidate
   */
  revalidateInBackground<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    ttl: number,
    staleTime: number,
    tags?: string[]
  ): void {
    fetchFn()
      .then(async (data) => {
        const value = createCachedValue(data, ttl, staleTime, tags);
        await cacheService.set(cacheKey, value, ttl + staleTime);
        stats.writes++;
        logger.debug({ key: cacheKey }, 'Background revalidation complete');
      })
      .catch((error) => {
        logger.error({ key: cacheKey, error }, 'Background revalidation failed');
      });
  },

  /**
   * Cache Stampede Prevention
   * Prevents multiple simultaneous requests from overwhelming the data source
   */
  async withStampedePrevention<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = 300 } = options;
    const cacheKey = KEY_PREFIX.STAMPEDE + key;
    const lockKey = KEY_PREFIX.LOCK + key;

    // Try to get from cache
    const cached = await cacheService.get<CachedValue<T>>(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      stats.hits++;
      return cached.data;
    }

    // Try to acquire lock
    const client = cacheService.getClient();
    if (client) {
      const lockAcquired = await client.set(lockKey, '1', 'EX', 10, 'NX');

      if (!lockAcquired) {
        // Another process is fetching, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.withStampedePrevention(key, fetchFn, options);
      }

      try {
        stats.misses++;
        const data = await fetchFn();
        const value = createCachedValue(data, ttl);
        await cacheService.set(cacheKey, value, ttl);
        stats.writes++;
        return data;
      } finally {
        await client.del(lockKey);
      }
    }

    // No Redis, fallback to normal fetch
    stats.misses++;
    const data = await fetchFn();
    const value = createCachedValue(data, ttl);
    await cacheService.set(cacheKey, value, ttl);
    stats.writes++;
    return data;
  },

  /**
   * Multi-level Cache (L1: Memory, L2: Redis)
   */
  memoryCache: new Map<string, { data: unknown; expiresAt: number }>(),
  MEMORY_CACHE_MAX_SIZE: 1000,

  async multiLevel<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions & { l1Ttl?: number } = {}
  ): Promise<T> {
    const { ttl = 300, l1Ttl = 30 } = options;
    const now = Date.now();

    // L1: Check memory cache
    const memCached = this.memoryCache.get(key);
    if (memCached && memCached.expiresAt > now) {
      stats.hits++;
      return memCached.data as T;
    }

    // L2: Check Redis
    const redisCached = await cacheService.get<CachedValue<T>>(key);
    if (redisCached && redisCached.expiresAt > now) {
      stats.hits++;

      // Populate L1
      this.setMemoryCache(key, redisCached.data, l1Ttl);

      return redisCached.data;
    }

    stats.misses++;

    // Fetch from source
    const data = await fetchFn();

    // Populate both levels
    const value = createCachedValue(data, ttl);
    await cacheService.set(key, value, ttl);
    this.setMemoryCache(key, data, l1Ttl);
    stats.writes++;

    return data;
  },

  setMemoryCache(key: string, data: unknown, ttlSeconds: number): void {
    // Evict if at capacity
    if (this.memoryCache.size >= this.MEMORY_CACHE_MAX_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  },

  /**
   * Invalidate cache by key
   */
  async invalidate(key: string): Promise<void> {
    await cacheService.delete(key);
    this.memoryCache.delete(key);
    stats.deletes++;
  },

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const deletedCount = await cacheService.deletePattern(pattern);
    stats.deletes += deletedCount;

    // Also clear from memory cache (simple approach)
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern.replace('*', ''))) {
        this.memoryCache.delete(key);
      }
    }

    logger.info({ pattern, deletedCount }, 'Cache invalidated by pattern');
    return deletedCount;
  },

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = stats.hits + stats.misses;
    return {
      ...stats,
      hitRate: total > 0 ? stats.hits / total : 0,
    };
  },

  /**
   * Reset statistics
   */
  resetStats(): void {
    stats.hits = 0;
    stats.misses = 0;
    stats.staleHits = 0;
    stats.writes = 0;
    stats.deletes = 0;
  },

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    const client = cacheService.getClient();
    if (client) {
      await client.flushdb();
    }
    logger.info('All caches cleared');
  },

  /**
   * Warm up cache with common data
   */
  async warmUp<T>(
    entries: Array<{ key: string; fetchFn: () => Promise<T>; ttl?: number }>
  ): Promise<void> {
    const results = await Promise.allSettled(
      entries.map(async ({ key, fetchFn, ttl = 300 }) => {
        const data = await fetchFn();
        const value = createCachedValue(data, ttl);
        await cacheService.set(key, value, ttl);
        stats.writes++;
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.info({ successful, failed }, 'Cache warmup complete');
  },
};
