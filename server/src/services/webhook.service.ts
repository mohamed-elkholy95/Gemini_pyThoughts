import crypto from 'crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../config/logger.js';
import { pgTable, uuid, text, timestamp, boolean, varchar, jsonb, index, integer } from 'drizzle-orm/pg-core';

// Webhook tables schema
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    events: jsonb('events').notNull().$type<WebhookEvent[]>(),
    isActive: boolean('is_active').default(true).notNull(),
    headers: jsonb('headers').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('webhooks_user_id_idx').on(table.userId),
  })
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    webhookId: uuid('webhook_id').notNull(),
    event: varchar('event', { length: 50 }).notNull(),
    payload: jsonb('payload').notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    error: text('error'),
    duration: integer('duration'), // in milliseconds
    attempts: integer('attempts').default(1).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    webhookIdIdx: index('webhook_deliveries_webhook_id_idx').on(table.webhookId),
    eventIdx: index('webhook_deliveries_event_idx').on(table.event),
  })
);

// Webhook event types
export type WebhookEvent =
  | 'article.published'
  | 'article.updated'
  | 'article.deleted'
  | 'comment.created'
  | 'comment.deleted'
  | 'user.followed'
  | 'user.unfollowed'
  | 'like.created'
  | 'like.deleted';

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

interface CreateWebhookInput {
  userId: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  headers?: Record<string, string>;
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  duration: number;
  error?: string;
}

export const webhookService = {
  // Create a new webhook
  async create(input: CreateWebhookInput) {
    const secret = crypto.randomBytes(32).toString('hex');

    const [webhook] = await db
      .insert(webhooks)
      .values({
        ...input,
        secret,
      })
      .returning();

    logger.info({ webhookId: webhook.id, userId: input.userId }, 'Webhook created');
    return { ...webhook, secret }; // Return secret only on creation
  },

  // Get webhooks for a user
  async getByUserId(userId: string) {
    const userWebhooks = await db
      .select({
        id: webhooks.id,
        name: webhooks.name,
        url: webhooks.url,
        events: webhooks.events,
        isActive: webhooks.isActive,
        createdAt: webhooks.createdAt,
      })
      .from(webhooks)
      .where(eq(webhooks.userId, userId))
      .orderBy(desc(webhooks.createdAt));

    return userWebhooks;
  },

  // Get a specific webhook
  async getById(webhookId: string, userId: string) {
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

    return webhook;
  },

  // Update a webhook
  async update(webhookId: string, userId: string, data: Partial<CreateWebhookInput>) {
    const [updated] = await db
      .update(webhooks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
      .returning();

    return updated;
  },

  // Delete a webhook
  async delete(webhookId: string, userId: string) {
    const [deleted] = await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
      .returning();

    return !!deleted;
  },

  // Regenerate webhook secret
  async regenerateSecret(webhookId: string, userId: string) {
    const newSecret = crypto.randomBytes(32).toString('hex');

    const [updated] = await db
      .update(webhooks)
      .set({ secret: newSecret, updatedAt: new Date() })
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
      .returning();

    if (!updated) return null;
    return { secret: newSecret };
  },

  // Sign a webhook payload
  signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  },

  // Verify webhook signature
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.signPayload(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  },

  // Deliver a webhook
  async deliver(webhook: typeof webhooks.$inferSelect, payload: WebhookPayload): Promise<DeliveryResult> {
    const payloadStr = JSON.stringify(payload);
    const signature = this.signPayload(payloadStr, webhook.secret);

    const startTime = Date.now();
    let result: DeliveryResult;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp,
          ...webhook.headers,
        },
        body: payloadStr,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const duration = Date.now() - startTime;
      const responseBody = await response.text().catch(() => '');

      result = {
        success: response.ok,
        statusCode: response.status,
        duration,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };

      // Log delivery
      await db.insert(webhookDeliveries).values({
        webhookId: webhook.id,
        event: payload.event,
        payload,
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 1000), // Limit stored response
        duration,
        deliveredAt: new Date(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      result = {
        success: false,
        duration,
        error: errorMessage,
      };

      // Log failed delivery
      await db.insert(webhookDeliveries).values({
        webhookId: webhook.id,
        event: payload.event,
        payload,
        error: errorMessage,
        duration,
      });

      logger.error({ error, webhookId: webhook.id, event: payload.event }, 'Webhook delivery failed');
    }

    return result;
  },

  // Trigger webhooks for an event
  async trigger(event: WebhookEvent, data: Record<string, unknown>, userId?: string) {
    // Get all active webhooks subscribed to this event
    let query = db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.isActive, true),
          sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`
        )
      );

    // If userId provided, only trigger webhooks for that user
    if (userId) {
      query = db
        .select()
        .from(webhooks)
        .where(
          and(
            eq(webhooks.isActive, true),
            eq(webhooks.userId, userId),
            sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`
          )
        );
    }

    const targetWebhooks = await query;

    if (targetWebhooks.length === 0) {
      return { triggered: 0, results: [] };
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Deliver to all webhooks concurrently
    const results = await Promise.all(
      targetWebhooks.map(async (webhook) => ({
        webhookId: webhook.id,
        result: await this.deliver(webhook, payload),
      }))
    );

    logger.info({ event, triggered: targetWebhooks.length }, 'Webhooks triggered');

    return {
      triggered: targetWebhooks.length,
      results,
    };
  },

  // Get webhook deliveries
  async getDeliveries(webhookId: string, userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    // Verify ownership
    const [webhook] = await db
      .select({ id: webhooks.id })
      .from(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

    if (!webhook) {
      return { deliveries: [], total: 0 };
    }

    const deliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId));

    return {
      deliveries,
      total: Number(countResult?.count || 0),
    };
  },

  // Retry a failed delivery
  async retryDelivery(deliveryId: string, userId: string) {
    const [delivery] = await db
      .select({
        delivery: webhookDeliveries,
        webhook: webhooks,
      })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhookDeliveries.webhookId, webhooks.id))
      .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhooks.userId, userId)));

    if (!delivery) {
      return { success: false, error: 'Delivery not found' };
    }

    const payload = delivery.delivery.payload as WebhookPayload;
    const result = await this.deliver(delivery.webhook, payload);

    // Update original delivery attempt count
    await db
      .update(webhookDeliveries)
      .set({ attempts: sql`${webhookDeliveries.attempts} + 1` })
      .where(eq(webhookDeliveries.id, deliveryId));

    return result;
  },

  // Test a webhook
  async test(webhookId: string, userId: string) {
    const webhook = await this.getById(webhookId, userId);

    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    const testPayload: WebhookPayload = {
      event: 'article.published',
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'This is a test webhook delivery',
      },
    };

    return this.deliver(webhook, testPayload);
  },

  // Clean up old deliveries
  async cleanupOldDeliveries(retentionDays = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(webhookDeliveries)
      .where(sql`${webhookDeliveries.createdAt} < ${cutoffDate}`)
      .returning({ id: webhookDeliveries.id });

    logger.info({ deleted: result.length, retentionDays }, 'Webhook deliveries cleanup completed');
    return result.length;
  },
};

// SQL migration for webhooks tables
export const webhooksMigration = `
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  headers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhooks_user_id_idx ON webhooks(user_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error TEXT,
  duration INTEGER,
  attempts INTEGER NOT NULL DEFAULT 1,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_id_idx ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_event_idx ON webhook_deliveries(event);
`;
