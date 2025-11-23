import { sql, eq, and, desc, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../config/logger.js';
import { pgTable, uuid, text, timestamp, jsonb, varchar, index } from 'drizzle-orm/pg-core';

// Audit log table schema
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id'),
    sessionId: text('session_id'),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }),
    entityId: uuid('entity_id'),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    metadata: jsonb('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('audit_user_id_idx').on(table.userId),
    actionIdx: index('audit_action_idx').on(table.action),
    entityIdx: index('audit_entity_idx').on(table.entityType, table.entityId),
    createdAtIdx: index('audit_created_at_idx').on(table.createdAt),
  })
);

// Action types for audit logging
export type AuditAction =
  // Authentication
  | 'auth:login'
  | 'auth:logout'
  | 'auth:register'
  | 'auth:password_reset_request'
  | 'auth:password_reset_complete'
  | 'auth:password_change'
  | 'auth:email_change'
  // User actions
  | 'user:profile_update'
  | 'user:avatar_change'
  | 'user:settings_update'
  | 'user:delete_account'
  // Content actions
  | 'draft:create'
  | 'draft:update'
  | 'draft:delete'
  | 'draft:publish'
  | 'draft:unpublish'
  | 'draft:archive'
  // Social actions
  | 'follow:create'
  | 'follow:delete'
  | 'bookmark:create'
  | 'bookmark:delete'
  | 'like:create'
  | 'like:delete'
  | 'comment:create'
  | 'comment:update'
  | 'comment:delete'
  // Admin actions
  | 'admin:user_ban'
  | 'admin:user_unban'
  | 'admin:content_remove'
  | 'admin:content_restore'
  | 'admin:role_change'
  // System actions
  | 'system:data_export'
  | 'system:data_delete'
  | 'system:api_key_create'
  | 'system:api_key_revoke';

// Entity types
export type EntityType = 'user' | 'draft' | 'comment' | 'tag' | 'notification' | 'session';

interface AuditLogInput {
  userId?: string;
  sessionId?: string;
  action: AuditAction;
  entityType?: EntityType;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

interface AuditLogQuery {
  userId?: string;
  action?: AuditAction;
  entityType?: EntityType;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export const auditService = {
  // Log an audit event
  async log(input: AuditLogInput): Promise<void> {
    try {
      await db.insert(auditLogs).values(input);

      logger.debug({
        action: input.action,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
      }, 'Audit log created');
    } catch (error) {
      // Don't throw - audit logging should not break main flow
      logger.error({ error, input }, 'Failed to create audit log');
    }
  },

  // Get audit logs with filters
  async getLogs(query: AuditLogQuery) {
    const { userId, action, entityType, entityId, startDate, endDate, page = 1, limit = 50 } = query;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (userId) {
      conditions.push(eq(auditLogs.userId, userId));
    }
    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }
    if (entityType) {
      conditions.push(eq(auditLogs.entityType, entityType));
    }
    if (entityId) {
      conditions.push(eq(auditLogs.entityId, entityId));
    }
    if (startDate) {
      conditions.push(gte(auditLogs.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(auditLogs.createdAt, endDate));
    }

    const logs = await db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      logs,
      total: Number(countResult?.count || 0),
      page,
      limit,
    };
  },

  // Get user activity timeline
  async getUserActivity(userId: string, days = 30, limit = 100) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await db
      .select({
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, userId), gte(auditLogs.createdAt, startDate)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return logs;
  },

  // Get entity history
  async getEntityHistory(entityType: EntityType, entityId: string, limit = 50) {
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return logs;
  },

  // Get recent security events for a user
  async getSecurityEvents(userId: string, limit = 20) {
    const securityActions: AuditAction[] = [
      'auth:login',
      'auth:logout',
      'auth:password_reset_request',
      'auth:password_reset_complete',
      'auth:password_change',
      'auth:email_change',
    ];

    const logs = await db
      .select({
        action: auditLogs.action,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.userId, userId),
          sql`${auditLogs.action} = ANY(${securityActions})`
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return logs;
  },

  // Get admin actions
  async getAdminActions(page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const adminActions = ['admin:user_ban', 'admin:user_unban', 'admin:content_remove', 'admin:content_restore', 'admin:role_change'];

    const logs = await db
      .select()
      .from(auditLogs)
      .where(sql`${auditLogs.action} = ANY(${adminActions})`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return logs;
  },

  // Clean up old audit logs (retention policy)
  async cleanup(retentionDays = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(auditLogs)
      .where(lte(auditLogs.createdAt, cutoffDate))
      .returning({ id: auditLogs.id });

    logger.info({ deleted: result.length, retentionDays }, 'Audit logs cleanup completed');
    return result.length;
  },

  // Export audit logs for compliance
  async exportLogs(query: AuditLogQuery): Promise<string> {
    const { logs } = await this.getLogs({ ...query, limit: 10000 });

    // Convert to CSV format
    const headers = ['timestamp', 'user_id', 'action', 'entity_type', 'entity_id', 'ip_address', 'user_agent'];
    const rows = logs.map((log) => [
      log.createdAt.toISOString(),
      log.userId || '',
      log.action,
      log.entityType || '',
      log.entityId || '',
      log.ipAddress || '',
      log.userAgent?.replace(/,/g, ';') || '',
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    return csv;
  },
};

// SQL migration for audit logs table
export const auditLogsMigration = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_created_at_idx ON audit_logs(created_at);
`;
