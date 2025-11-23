import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../config/logger.js';
import { cacheService } from './cache.service.js';
import { pgTable, uuid, text, timestamp, boolean, varchar, jsonb, integer } from 'drizzle-orm/pg-core';

// Feature flags table schema
export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  enabled: boolean('enabled').default(false).notNull(),
  rolloutPercentage: integer('rollout_percentage').default(0).notNull(),
  rules: jsonb('rules').$type<FeatureFlagRule[]>(),
  variants: jsonb('variants').$type<FeatureVariant[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Types for feature flag rules
interface FeatureFlagRule {
  type: 'user_id' | 'user_role' | 'user_attribute' | 'percentage' | 'environment';
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  value: string | string[] | number;
  attribute?: string;
}

interface FeatureVariant {
  key: string;
  name: string;
  weight: number; // 0-100
  payload?: Record<string, unknown>;
}

interface EvaluationContext {
  userId?: string;
  userRole?: string;
  userAttributes?: Record<string, unknown>;
  environment?: string;
}

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'feature_flags';

export const featureFlagsService = {
  // Create a new feature flag
  async create(data: {
    key: string;
    name: string;
    description?: string;
    enabled?: boolean;
    rolloutPercentage?: number;
    rules?: FeatureFlagRule[];
    variants?: FeatureVariant[];
  }) {
    const [flag] = await db
      .insert(featureFlags)
      .values(data)
      .returning();

    await this.invalidateCache();
    logger.info({ flagKey: data.key }, 'Feature flag created');
    return flag;
  },

  // Get all feature flags
  async getAll() {
    const cacheKey = `${CACHE_PREFIX}:all`;
    const cached = await cacheService.get<typeof featureFlags.$inferSelect[]>(cacheKey);

    if (cached) return cached;

    const flags = await db.select().from(featureFlags);
    await cacheService.set(cacheKey, flags, CACHE_TTL);
    return flags;
  },

  // Get a specific feature flag
  async getByKey(key: string) {
    const cacheKey = `${CACHE_PREFIX}:${key}`;
    const cached = await cacheService.get<typeof featureFlags.$inferSelect>(cacheKey);

    if (cached) return cached;

    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));

    if (flag) {
      await cacheService.set(cacheKey, flag, CACHE_TTL);
    }
    return flag;
  },

  // Update a feature flag
  async update(key: string, data: Partial<{
    name: string;
    description: string;
    enabled: boolean;
    rolloutPercentage: number;
    rules: FeatureFlagRule[];
    variants: FeatureVariant[];
  }>) {
    const [updated] = await db
      .update(featureFlags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(featureFlags.key, key))
      .returning();

    await this.invalidateCache();
    logger.info({ flagKey: key }, 'Feature flag updated');
    return updated;
  },

  // Delete a feature flag
  async delete(key: string) {
    const [deleted] = await db
      .delete(featureFlags)
      .where(eq(featureFlags.key, key))
      .returning();

    await this.invalidateCache();
    return !!deleted;
  },

  // Evaluate if a feature flag is enabled for a given context
  async isEnabled(key: string, context: EvaluationContext = {}): Promise<boolean> {
    const flag = await this.getByKey(key);

    if (!flag) {
      logger.warn({ flagKey: key }, 'Feature flag not found');
      return false;
    }

    // Check if globally disabled
    if (!flag.enabled) {
      return false;
    }

    // Check rules
    if (flag.rules && flag.rules.length > 0) {
      const rulesPassed = this.evaluateRules(flag.rules, context);
      if (!rulesPassed) {
        return false;
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashUserForRollout(context.userId || 'anonymous', key);
      if (hash > flag.rolloutPercentage) {
        return false;
      }
    }

    return true;
  },

  // Get the variant for a feature flag
  async getVariant(key: string, context: EvaluationContext = {}): Promise<FeatureVariant | null> {
    const flag = await this.getByKey(key);

    if (!flag || !flag.enabled || !flag.variants || flag.variants.length === 0) {
      return null;
    }

    // Use consistent hashing to assign variant
    const hash = this.hashUserForRollout(context.userId || 'anonymous', key);
    let cumulative = 0;

    for (const variant of flag.variants) {
      cumulative += variant.weight;
      if (hash <= cumulative) {
        return variant;
      }
    }

    return flag.variants[0]; // Fallback to first variant
  },

  // Evaluate all rules
  evaluateRules(rules: FeatureFlagRule[], context: EvaluationContext): boolean {
    for (const rule of rules) {
      if (!this.evaluateRule(rule, context)) {
        return false;
      }
    }
    return true;
  },

  // Evaluate a single rule
  evaluateRule(rule: FeatureFlagRule, context: EvaluationContext): boolean {
    let contextValue: unknown;

    switch (rule.type) {
      case 'user_id':
        contextValue = context.userId;
        break;
      case 'user_role':
        contextValue = context.userRole;
        break;
      case 'user_attribute':
        contextValue = context.userAttributes?.[rule.attribute || ''];
        break;
      case 'environment':
        contextValue = context.environment || process.env.NODE_ENV;
        break;
      case 'percentage':
        return true; // Handled separately
      default:
        return false;
    }

    if (contextValue === undefined) {
      return false;
    }

    switch (rule.operator) {
      case 'equals':
        return contextValue === rule.value;
      case 'not_equals':
        return contextValue !== rule.value;
      case 'contains':
        return String(contextValue).includes(String(rule.value));
      case 'greater_than':
        return Number(contextValue) > Number(rule.value);
      case 'less_than':
        return Number(contextValue) < Number(rule.value);
      case 'in':
        return Array.isArray(rule.value) && rule.value.includes(String(contextValue));
      default:
        return false;
    }
  },

  // Generate consistent hash for rollout
  hashUserForRollout(userId: string, flagKey: string): number {
    const str = `${userId}:${flagKey}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash % 100);
  },

  // Invalidate cache
  async invalidateCache() {
    await cacheService.deletePattern(`${CACHE_PREFIX}:*`);
  },

  // Bulk evaluate multiple flags
  async evaluateAll(context: EvaluationContext = {}): Promise<Record<string, boolean>> {
    const flags = await this.getAll();
    const results: Record<string, boolean> = {};

    for (const flag of flags) {
      results[flag.key] = await this.isEnabled(flag.key, context);
    }

    return results;
  },

  // Toggle a feature flag
  async toggle(key: string) {
    const flag = await this.getByKey(key);
    if (!flag) return null;

    return this.update(key, { enabled: !flag.enabled });
  },

  // Set rollout percentage (gradual rollout)
  async setRollout(key: string, percentage: number) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }
    return this.update(key, { rolloutPercentage: percentage });
  },
};

// SQL migration for feature flags table
export const featureFlagsMigration = `
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER NOT NULL DEFAULT 0,
  rules JSONB,
  variants JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feature_flags_key_idx ON feature_flags(key);
`;

// Middleware to inject feature flags into context
export function featureFlagsMiddleware() {
  return async (c: { set: (key: string, value: unknown) => void; get: (key: string) => unknown }, next: () => Promise<void>) => {
    const user = c.get('user') as { id?: string; role?: string } | null;

    const context: EvaluationContext = {
      userId: user?.id,
      userRole: user?.role,
      environment: process.env.NODE_ENV,
    };

    const flags = await featureFlagsService.evaluateAll(context);
    c.set('featureFlags', flags);

    await next();
  };
}
