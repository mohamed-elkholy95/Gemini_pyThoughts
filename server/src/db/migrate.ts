// Database Migration Service
// Handles schema migrations with versioning and rollback support

import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { logger } from '../config/logger.js';

interface Migration {
  version: number;
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

// Migration tracking table
const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  checksum VARCHAR(64)
);
`;

// Define migrations
const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: async () => {
      // Users table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          email_verified BOOLEAN NOT NULL DEFAULT false,
          image TEXT,
          bio TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Sessions table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          expires_at TIMESTAMPTZ NOT NULL,
          token TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ip_address TEXT,
          user_agent TEXT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Accounts table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          access_token TEXT,
          refresh_token TEXT,
          id_token TEXT,
          access_token_expires_at TIMESTAMPTZ,
          refresh_token_expires_at TIMESTAMPTZ,
          scope TEXT,
          password TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Verifications table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS verifications (
          id TEXT PRIMARY KEY,
          identifier TEXT NOT NULL,
          value TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Drafts table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS drafts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL DEFAULT 'Untitled',
          content JSONB,
          excerpt TEXT,
          cover_image TEXT,
          slug TEXT UNIQUE,
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'scheduled')),
          author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          published_at TIMESTAMPTZ,
          scheduled_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          word_count INTEGER DEFAULT 0,
          reading_time INTEGER DEFAULT 0,
          is_deleted BOOLEAN NOT NULL DEFAULT false,
          deleted_at TIMESTAMPTZ,
          is_featured BOOLEAN NOT NULL DEFAULT false,
          featured_at TIMESTAMPTZ
        )
      `);

      // Create indexes
      await db.execute(sql`CREATE INDEX IF NOT EXISTS drafts_author_idx ON drafts(author_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS drafts_status_idx ON drafts(status)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS drafts_created_idx ON drafts(created_at)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS drafts_scheduled_idx ON drafts(scheduled_at)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS drafts_featured_idx ON drafts(is_featured)`);
    },
    down: async () => {
      await db.execute(sql`DROP TABLE IF EXISTS drafts CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS verifications CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS accounts CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS sessions CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS users CASCADE`);
    },
  },
  {
    version: 2,
    name: 'add_social_features',
    up: async () => {
      // Tags table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS tags (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL UNIQUE,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Draft tags junction
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS draft_tags (
          draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
          tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (draft_id, tag_id)
        )
      `);

      // Follows table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS follows (
          follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (follower_id, following_id)
        )
      `);

      // Bookmarks table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS bookmarks (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, draft_id)
        )
      `);

      // Likes table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS likes (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, draft_id)
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS likes_draft_idx ON likes(draft_id)`);
    },
    down: async () => {
      await db.execute(sql`DROP TABLE IF EXISTS likes CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS bookmarks CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS follows CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS draft_tags CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS tags CASCADE`);
    },
  },
  {
    version: 3,
    name: 'add_comments_notifications',
    up: async () => {
      // Comments table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS comments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
          author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          parent_id UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          is_deleted BOOLEAN NOT NULL DEFAULT false
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS comments_draft_idx ON comments(draft_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS comments_author_idx ON comments(author_id)`);

      // Notifications table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('follow', 'comment', 'reply', 'publish', 'mention', 'like')),
          title TEXT NOT NULL,
          message TEXT,
          link TEXT,
          actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          entity_type TEXT,
          entity_id TEXT,
          is_read BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(is_read)`);
    },
    down: async () => {
      await db.execute(sql`DROP TABLE IF EXISTS notifications CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS comments CASCADE`);
    },
  },
  {
    version: 4,
    name: 'add_analytics_preferences',
    up: async () => {
      // Article views table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS article_views (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
          viewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          ip_hash TEXT,
          user_agent TEXT,
          referrer TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS article_views_draft_idx ON article_views(draft_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS article_views_created_idx ON article_views(created_at)`);

      // User preferences table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_preferences (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          email_notifications BOOLEAN NOT NULL DEFAULT true,
          push_notifications BOOLEAN NOT NULL DEFAULT true,
          notify_new_follower BOOLEAN NOT NULL DEFAULT true,
          notify_comments BOOLEAN NOT NULL DEFAULT true,
          notify_mentions BOOLEAN NOT NULL DEFAULT true,
          theme TEXT DEFAULT 'system',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Draft versions table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS draft_versions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          title TEXT NOT NULL,
          content JSONB,
          author_id TEXT NOT NULL REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          change_note TEXT
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS draft_versions_draft_idx ON draft_versions(draft_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS draft_versions_version_idx ON draft_versions(version)`);
    },
    down: async () => {
      await db.execute(sql`DROP TABLE IF EXISTS draft_versions CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS user_preferences CASCADE`);
      await db.execute(sql`DROP TABLE IF EXISTS article_views CASCADE`);
    },
  },
];

export const migrationService = {
  // Initialize migrations table
  async init(): Promise<void> {
    await db.execute(sql.raw(MIGRATIONS_TABLE));
    logger.info('Migrations table initialized');
  },

  // Get current version
  async getCurrentVersion(): Promise<number> {
    const result = await db.execute(sql`
      SELECT MAX(version) as version FROM _migrations
    `);
    const row = (result as unknown as Array<{ version: number | null }>)[0];
    return row?.version || 0;
  },

  // Get applied migrations
  async getApplied(): Promise<Array<{ version: number; name: string; applied_at: Date }>> {
    const result = await db.execute(sql`
      SELECT version, name, applied_at FROM _migrations ORDER BY version
    `);
    return result as unknown as Array<{ version: number; name: string; applied_at: Date }>;
  },

  // Run all pending migrations
  async migrate(): Promise<number> {
    await this.init();
    const currentVersion = await this.getCurrentVersion();

    const pending = migrations.filter((m) => m.version > currentVersion);
    if (pending.length === 0) {
      logger.info('No pending migrations');
      return 0;
    }

    logger.info({ count: pending.length }, 'Running migrations');

    for (const migration of pending) {
      logger.info({ version: migration.version, name: migration.name }, 'Applying migration');

      try {
        await migration.up();
        await db.execute(sql`
          INSERT INTO _migrations (version, name) VALUES (${migration.version}, ${migration.name})
        `);
        logger.info({ version: migration.version }, 'Migration applied');
      } catch (error) {
        logger.error({ version: migration.version, error }, 'Migration failed');
        throw error;
      }
    }

    return pending.length;
  },

  // Rollback to a specific version
  async rollback(targetVersion: number): Promise<number> {
    const currentVersion = await this.getCurrentVersion();

    if (targetVersion >= currentVersion) {
      logger.warn({ targetVersion, currentVersion }, 'Target version must be less than current');
      return 0;
    }

    const toRollback = migrations
      .filter((m) => m.version > targetVersion && m.version <= currentVersion)
      .reverse();

    logger.info({ count: toRollback.length }, 'Rolling back migrations');

    for (const migration of toRollback) {
      logger.info({ version: migration.version, name: migration.name }, 'Rolling back migration');

      try {
        await migration.down();
        await db.execute(sql`DELETE FROM _migrations WHERE version = ${migration.version}`);
        logger.info({ version: migration.version }, 'Migration rolled back');
      } catch (error) {
        logger.error({ version: migration.version, error }, 'Rollback failed');
        throw error;
      }
    }

    return toRollback.length;
  },

  // Reset database (rollback all)
  async reset(): Promise<void> {
    await this.rollback(0);
    logger.info('Database reset complete');
  },

  // Get migration status
  async status(): Promise<{
    currentVersion: number;
    pendingCount: number;
    applied: Array<{ version: number; name: string; applied_at: Date }>;
    pending: Array<{ version: number; name: string }>;
  }> {
    await this.init();
    const currentVersion = await this.getCurrentVersion();
    const applied = await this.getApplied();
    const pending = migrations
      .filter((m) => m.version > currentVersion)
      .map((m) => ({ version: m.version, name: m.name }));

    return {
      currentVersion,
      pendingCount: pending.length,
      applied,
      pending,
    };
  },
};

// CLI runner
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case 'up':
          const migratedCount = await migrationService.migrate();
          console.log(`Applied ${migratedCount} migration(s)`);
          break;
        case 'down':
          const targetVersion = parseInt(process.argv[3] || '0');
          const rolledBack = await migrationService.rollback(targetVersion);
          console.log(`Rolled back ${rolledBack} migration(s)`);
          break;
        case 'reset':
          await migrationService.reset();
          console.log('Database reset complete');
          break;
        case 'status':
          const status = await migrationService.status();
          console.log('Migration Status:');
          console.log(`  Current Version: ${status.currentVersion}`);
          console.log(`  Applied: ${status.applied.length}`);
          console.log(`  Pending: ${status.pendingCount}`);
          break;
        default:
          console.log('Usage: npx tsx src/db/migrate.ts [up|down|reset|status]');
      }
    } catch (error) {
      console.error('Migration error:', error);
      process.exit(1);
    }
    process.exit(0);
  })();
}
