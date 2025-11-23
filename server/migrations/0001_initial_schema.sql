-- Migration: 0001_initial_schema
-- Generated for Pythoughts

-- Users table (Better Auth compatible)
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "bio" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT PRIMARY KEY,
  "expires_at" TIMESTAMP NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);

-- Accounts table (OAuth)
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMP,
  "refresh_token_expires_at" TIMESTAMP,
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Verifications table
CREATE TABLE IF NOT EXISTS "verifications" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Drafts table
CREATE TABLE IF NOT EXISTS "drafts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL DEFAULT 'Untitled',
  "content" JSONB,
  "excerpt" TEXT,
  "cover_image" TEXT,
  "slug" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'archived')),
  "author_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "published_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "word_count" INTEGER DEFAULT 0,
  "reading_time" INTEGER DEFAULT 0,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "drafts_author_idx" ON "drafts"("author_id");
CREATE INDEX IF NOT EXISTS "drafts_status_idx" ON "drafts"("status");
CREATE INDEX IF NOT EXISTS "drafts_created_idx" ON "drafts"("created_at");

-- Draft versions table
CREATE TABLE IF NOT EXISTS "draft_versions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "draft_id" UUID NOT NULL REFERENCES "drafts"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB,
  "author_id" TEXT NOT NULL REFERENCES "users"("id"),
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "change_note" TEXT
);

CREATE INDEX IF NOT EXISTS "draft_versions_draft_idx" ON "draft_versions"("draft_id");
CREATE INDEX IF NOT EXISTS "draft_versions_version_idx" ON "draft_versions"("version");

-- Tags table
CREATE TABLE IF NOT EXISTS "tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL UNIQUE,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Draft tags junction table
CREATE TABLE IF NOT EXISTS "draft_tags" (
  "draft_id" UUID NOT NULL REFERENCES "drafts"("id") ON DELETE CASCADE,
  "tag_id" UUID NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  PRIMARY KEY ("draft_id", "tag_id")
);

-- Follows table
CREATE TABLE IF NOT EXISTS "follows" (
  "follower_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "following_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("follower_id", "following_id")
);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS "bookmarks" (
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "draft_id" UUID NOT NULL REFERENCES "drafts"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "draft_id")
);

-- Comments table
CREATE TABLE IF NOT EXISTS "comments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "content" TEXT NOT NULL,
  "draft_id" UUID NOT NULL REFERENCES "drafts"("id") ON DELETE CASCADE,
  "author_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "parent_id" UUID,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "comments_draft_idx" ON "comments"("draft_id");
CREATE INDEX IF NOT EXISTS "comments_author_idx" ON "comments"("author_id");

-- Add self-reference for comment replies
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_fk"
  FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE;
