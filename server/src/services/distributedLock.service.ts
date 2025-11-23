// Distributed Lock Service
// Provides distributed locking for coordinating between multiple workers/instances

import { cacheService } from './cache.service.js';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

export interface LockOptions {
  ttl?: number; // Lock TTL in milliseconds
  retryCount?: number; // Number of retry attempts
  retryDelay?: number; // Delay between retries in milliseconds
  extend?: boolean; // Allow lock extension
}

export interface LockInfo {
  key: string;
  token: string;
  acquiredAt: Date;
  expiresAt: Date;
  extended: number;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttl: 30000,
  retryCount: 3,
  retryDelay: 200,
  extend: true,
};

const LOCK_PREFIX = 'pythoughts:lock:';

export class DistributedLock {
  private key: string;
  private token: string;
  private options: Required<LockOptions>;
  private acquiredAt: Date | null = null;
  private expiresAt: Date | null = null;
  private extendCount = 0;
  private extendTimer: NodeJS.Timeout | null = null;
  private released = false;

  constructor(key: string, options: LockOptions = {}) {
    this.key = `${LOCK_PREFIX}${key}`;
    this.token = crypto.randomUUID();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // Attempt to acquire the lock
  async acquire(): Promise<boolean> {
    const redis = cacheService.getClient();

    if (!redis) {
      logger.warn({ key: this.key }, 'Redis not available, using local lock');
      return this.acquireLocalLock();
    }

    for (let attempt = 0; attempt <= this.options.retryCount; attempt++) {
      try {
        // Use SET NX with expiration for atomic lock acquisition
        const result = await redis.set(
          this.key,
          this.token,
          'PX',
          this.options.ttl,
          'NX'
        );

        if (result === 'OK') {
          this.acquiredAt = new Date();
          this.expiresAt = new Date(Date.now() + this.options.ttl);
          this.released = false;

          // Start auto-extend if enabled
          if (this.options.extend) {
            this.startAutoExtend();
          }

          logger.debug({ key: this.key, token: this.token }, 'Lock acquired');
          return true;
        }

        // Wait before retry
        if (attempt < this.options.retryCount) {
          await this.sleep(this.options.retryDelay * (attempt + 1));
        }
      } catch (error) {
        logger.error({ key: this.key, error }, 'Error acquiring lock');
        if (attempt === this.options.retryCount) {
          throw error;
        }
      }
    }

    logger.debug({ key: this.key }, 'Failed to acquire lock after retries');
    return false;
  }

  // Release the lock
  async release(): Promise<boolean> {
    if (this.released) {
      return true;
    }

    this.stopAutoExtend();

    const redis = cacheService.getClient();

    if (!redis) {
      return this.releaseLocalLock();
    }

    try {
      // Use Lua script for atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redis.eval(script, 1, this.key, this.token);
      this.released = true;

      if (result === 1) {
        logger.debug({ key: this.key }, 'Lock released');
        return true;
      } else {
        logger.warn({ key: this.key }, 'Lock was not held or expired');
        return false;
      }
    } catch (error) {
      logger.error({ key: this.key, error }, 'Error releasing lock');
      throw error;
    }
  }

  // Extend the lock TTL
  async extend(additionalTtl?: number): Promise<boolean> {
    if (this.released) {
      return false;
    }

    const redis = cacheService.getClient();
    const ttl = additionalTtl || this.options.ttl;

    if (!redis) {
      return this.extendLocalLock(ttl);
    }

    try {
      // Use Lua script for atomic check-and-extend
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await redis.eval(script, 1, this.key, this.token, ttl.toString());

      if (result === 1) {
        this.expiresAt = new Date(Date.now() + ttl);
        this.extendCount++;
        logger.debug({ key: this.key, extendCount: this.extendCount }, 'Lock extended');
        return true;
      } else {
        logger.warn({ key: this.key }, 'Failed to extend lock - not held');
        return false;
      }
    } catch (error) {
      logger.error({ key: this.key, error }, 'Error extending lock');
      return false;
    }
  }

  // Get lock info
  getInfo(): LockInfo | null {
    if (!this.acquiredAt || !this.expiresAt) {
      return null;
    }

    return {
      key: this.key,
      token: this.token,
      acquiredAt: this.acquiredAt,
      expiresAt: this.expiresAt,
      extended: this.extendCount,
    };
  }

  // Check if lock is still valid
  isValid(): boolean {
    if (this.released || !this.expiresAt) {
      return false;
    }
    return new Date() < this.expiresAt;
  }

  // Start auto-extend timer
  private startAutoExtend(): void {
    // Extend at 2/3 of TTL
    const extendInterval = Math.floor(this.options.ttl * 0.66);

    this.extendTimer = setInterval(async () => {
      if (!this.released) {
        const extended = await this.extend();
        if (!extended) {
          this.stopAutoExtend();
        }
      }
    }, extendInterval);
  }

  // Stop auto-extend timer
  private stopAutoExtend(): void {
    if (this.extendTimer) {
      clearInterval(this.extendTimer);
      this.extendTimer = null;
    }
  }

  // Fallback local lock storage
  private static localLocks = new Map<string, { token: string; expiresAt: number }>();

  private acquireLocalLock(): boolean {
    const existing = DistributedLock.localLocks.get(this.key);
    if (existing && existing.expiresAt > Date.now()) {
      return false;
    }

    DistributedLock.localLocks.set(this.key, {
      token: this.token,
      expiresAt: Date.now() + this.options.ttl,
    });

    this.acquiredAt = new Date();
    this.expiresAt = new Date(Date.now() + this.options.ttl);
    return true;
  }

  private releaseLocalLock(): boolean {
    const existing = DistributedLock.localLocks.get(this.key);
    if (existing && existing.token === this.token) {
      DistributedLock.localLocks.delete(this.key);
      this.released = true;
      return true;
    }
    return false;
  }

  private extendLocalLock(ttl: number): boolean {
    const existing = DistributedLock.localLocks.get(this.key);
    if (existing && existing.token === this.token) {
      existing.expiresAt = Date.now() + ttl;
      this.expiresAt = new Date(existing.expiresAt);
      this.extendCount++;
      return true;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Distributed lock service for managing locks
export const distributedLockService = {
  // Acquire a lock
  async acquire(key: string, options?: LockOptions): Promise<DistributedLock | null> {
    const lock = new DistributedLock(key, options);
    const acquired = await lock.acquire();
    return acquired ? lock : null;
  },

  // Execute a function with a lock
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const lock = await this.acquire(key, options);
    if (!lock) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  },

  // Try to execute with lock, return null if lock not acquired
  async tryWithLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T | null> {
    const lock = await this.acquire(key, options);
    if (!lock) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  },

  // Check if a resource is locked
  async isLocked(key: string): Promise<boolean> {
    const redis = cacheService.getClient();
    if (!redis) {
      const existing = (DistributedLock as unknown as { localLocks: Map<string, unknown> }).localLocks?.get(
        `${LOCK_PREFIX}${key}`
      );
      return !!existing;
    }

    const result = await redis.exists(`${LOCK_PREFIX}${key}`);
    return result === 1;
  },
};
