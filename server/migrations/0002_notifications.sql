-- Migration: 0002_notifications
-- Add notifications system

-- Notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL CHECK ("type" IN ('follow', 'comment', 'reply', 'publish', 'mention')),
  "title" TEXT NOT NULL,
  "message" TEXT,
  "link" TEXT,
  "actor_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications"("user_id");
CREATE INDEX IF NOT EXISTS "notifications_read_idx" ON "notifications"("is_read");
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "notifications"("created_at" DESC);

-- User preferences table
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "email_notifications" BOOLEAN NOT NULL DEFAULT true,
  "push_notifications" BOOLEAN NOT NULL DEFAULT true,
  "notify_new_follower" BOOLEAN NOT NULL DEFAULT true,
  "notify_comments" BOOLEAN NOT NULL DEFAULT true,
  "notify_mentions" BOOLEAN NOT NULL DEFAULT true,
  "theme" TEXT DEFAULT 'system',
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Article views for analytics
CREATE TABLE IF NOT EXISTS "article_views" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "draft_id" UUID NOT NULL REFERENCES "drafts"("id") ON DELETE CASCADE,
  "viewer_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_hash" TEXT,
  "user_agent" TEXT,
  "referrer" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "article_views_draft_idx" ON "article_views"("draft_id");
CREATE INDEX IF NOT EXISTS "article_views_created_idx" ON "article_views"("created_at");

-- Likes table
CREATE TABLE IF NOT EXISTS "likes" (
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "draft_id" UUID NOT NULL REFERENCES "drafts"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "draft_id")
);

CREATE INDEX IF NOT EXISTS "likes_draft_idx" ON "likes"("draft_id");
