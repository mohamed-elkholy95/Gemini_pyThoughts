import { pgTable, text, timestamp, boolean, jsonb, integer, uuid, primaryKey, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table - integrated with better-auth
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  bio: text('bio'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Sessions table for better-auth
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

// Accounts table for OAuth providers
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Verification tokens for email verification
export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Drafts table - main content storage
export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull().default('Untitled'),
  content: jsonb('content').$type<EditorJSContent>(),
  excerpt: text('excerpt'),
  coverImage: text('cover_image'),
  slug: text('slug').unique(),
  status: text('status', { enum: ['draft', 'published', 'archived', 'scheduled'] }).notNull().default('draft'),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publishedAt: timestamp('published_at'),
  scheduledAt: timestamp('scheduled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  wordCount: integer('word_count').default(0),
  readingTime: integer('reading_time').default(0),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  isFeatured: boolean('is_featured').notNull().default(false),
  featuredAt: timestamp('featured_at'),
}, (table) => [
  index('drafts_author_idx').on(table.authorId),
  index('drafts_status_idx').on(table.status),
  index('drafts_created_idx').on(table.createdAt),
  index('drafts_scheduled_idx').on(table.scheduledAt),
  index('drafts_featured_idx').on(table.isFeatured),
]);

// Draft versions for version control
export const draftVersions = pgTable('draft_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  content: jsonb('content').$type<EditorJSContent>(),
  authorId: text('author_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  changeNote: text('change_note'),
}, (table) => [
  index('draft_versions_draft_idx').on(table.draftId),
  index('draft_versions_version_idx').on(table.version),
]);

// Tags table
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Draft tags junction table
export const draftTags = pgTable('draft_tags', {
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.draftId, table.tagId] }),
]);

// User follows for social features
export const follows = pgTable('follows', {
  followerId: text('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: text('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.followerId, table.followingId] }),
]);

// Bookmarks
export const bookmarks = pgTable('bookmarks', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.draftId] }),
]);

// Notifications
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['follow', 'comment', 'reply', 'publish', 'mention', 'like'] }).notNull(),
  title: text('title').notNull(),
  message: text('message'),
  link: text('link'),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('notifications_user_idx').on(table.userId),
  index('notifications_read_idx').on(table.isRead),
]);

// User preferences
export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  pushNotifications: boolean('push_notifications').notNull().default(true),
  notifyNewFollower: boolean('notify_new_follower').notNull().default(true),
  notifyComments: boolean('notify_comments').notNull().default(true),
  notifyMentions: boolean('notify_mentions').notNull().default(true),
  theme: text('theme').default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Likes
export const likes = pgTable('likes', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.draftId] }),
  index('likes_draft_idx').on(table.draftId),
]);

// Article views for analytics
export const articleViews = pgTable('article_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  viewerId: text('viewer_id').references(() => users.id, { onDelete: 'set null' }),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
  referrer: text('referrer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('article_views_draft_idx').on(table.draftId),
  index('article_views_created_idx').on(table.createdAt),
]);

// Comments
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').notNull().default(false),
}, (table) => [
  index('comments_draft_idx').on(table.draftId),
  index('comments_author_idx').on(table.authorId),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  drafts: many(drafts),
  draftVersions: many(draftVersions),
  comments: many(comments),
  bookmarks: many(bookmarks),
  followers: many(follows, { relationName: 'following' }),
  following: many(follows, { relationName: 'follower' }),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  author: one(users, {
    fields: [drafts.authorId],
    references: [users.id],
  }),
  versions: many(draftVersions),
  tags: many(draftTags),
  comments: many(comments),
  bookmarks: many(bookmarks),
}));

export const draftVersionsRelations = relations(draftVersions, ({ one }) => ({
  draft: one(drafts, {
    fields: [draftVersions.draftId],
    references: [drafts.id],
  }),
  author: one(users, {
    fields: [draftVersions.authorId],
    references: [users.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  drafts: many(draftTags),
}));

export const draftTagsRelations = relations(draftTags, ({ one }) => ({
  draft: one(drafts, {
    fields: [draftTags.draftId],
    references: [drafts.id],
  }),
  tag: one(tags, {
    fields: [draftTags.tagId],
    references: [tags.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  draft: one(drafts, {
    fields: [comments.draftId],
    references: [drafts.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'replies',
  }),
  replies: many(comments, { relationName: 'replies' }),
}));

// Article Series/Collections
export const series = pgTable('series', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  coverImage: text('cover_image'),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isPublished: boolean('is_published').notNull().default(false),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('series_author_idx').on(table.authorId),
  index('series_published_idx').on(table.isPublished),
]);

// Series articles junction table
export const seriesArticles = pgTable('series_articles', {
  seriesId: uuid('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
  addedAt: timestamp('added_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.seriesId, table.draftId] }),
  index('series_articles_order_idx').on(table.seriesId, table.order),
]);

// Reading Lists
export const readingLists = pgTable('reading_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('reading_lists_user_idx').on(table.userId),
  index('reading_lists_public_idx').on(table.isPublic),
]);

// Reading list items junction table
export const readingListItems = pgTable('reading_list_items', {
  readingListId: uuid('reading_list_id').notNull().references(() => readingLists.id, { onDelete: 'cascade' }),
  draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  note: text('note'),
  addedAt: timestamp('added_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.readingListId, table.draftId] }),
]);

// Content Reports
export const contentReports = pgTable('content_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: text('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type', { enum: ['article', 'comment', 'user'] }).notNull(),
  contentId: text('content_id').notNull(),
  reason: text('reason', { enum: ['spam', 'harassment', 'hate_speech', 'misinformation', 'copyright', 'other'] }).notNull(),
  description: text('description'),
  status: text('status', { enum: ['pending', 'reviewed', 'resolved', 'dismissed'] }).notNull().default('pending'),
  reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('content_reports_status_idx').on(table.status),
  index('content_reports_content_idx').on(table.contentType, table.contentId),
  index('content_reports_reporter_idx').on(table.reporterId),
]);

// Series relations
export const seriesRelations = relations(series, ({ one, many }) => ({
  author: one(users, {
    fields: [series.authorId],
    references: [users.id],
  }),
  articles: many(seriesArticles),
}));

export const seriesArticlesRelations = relations(seriesArticles, ({ one }) => ({
  series: one(series, {
    fields: [seriesArticles.seriesId],
    references: [series.id],
  }),
  draft: one(drafts, {
    fields: [seriesArticles.draftId],
    references: [drafts.id],
  }),
}));

// Reading list relations
export const readingListsRelations = relations(readingLists, ({ one, many }) => ({
  user: one(users, {
    fields: [readingLists.userId],
    references: [users.id],
  }),
  items: many(readingListItems),
}));

export const readingListItemsRelations = relations(readingListItems, ({ one }) => ({
  readingList: one(readingLists, {
    fields: [readingListItems.readingListId],
    references: [readingLists.id],
  }),
  draft: one(drafts, {
    fields: [readingListItems.draftId],
    references: [drafts.id],
  }),
}));

// Type definitions
export interface EditorJSContent {
  time?: number;
  blocks: EditorJSBlock[];
  version?: string;
}

export interface EditorJSBlock {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

// Export types for use in application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
export type DraftVersion = typeof draftVersions.$inferSelect;
export type NewDraftVersion = typeof draftVersions.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Like = typeof likes.$inferSelect;
export type ArticleView = typeof articleViews.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
export type SeriesArticle = typeof seriesArticles.$inferSelect;
export type ReadingList = typeof readingLists.$inferSelect;
export type NewReadingList = typeof readingLists.$inferInsert;
export type ReadingListItem = typeof readingListItems.$inferSelect;
export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;
