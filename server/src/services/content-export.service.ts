// Content Export Service
// Export articles and user data for backup/migration

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, users, comments, tags, draftTags, bookmarks, follows, series, seriesArticles, readingLists, readingListItems, type EditorJSContent } from '../db/schema.js';
import { logger } from '../config/logger.js';

interface ExportedArticle {
  id: string;
  title: string;
  content: unknown;
  excerpt: string | null;
  slug: string | null;
  coverImage: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  wordCount: number | null;
  readingTime: number | null;
  tags: string[];
  series?: {
    id: string;
    title: string;
    order: number;
  };
}

interface ExportedComment {
  id: string;
  content: string;
  articleId: string;
  articleTitle: string;
  parentId: string | null;
  createdAt: string;
}

interface ExportedSeries {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  isPublished: boolean;
  articles: Array<{
    id: string;
    title: string;
    order: number;
  }>;
}

interface ExportedReadingList {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  articles: Array<{
    id: string;
    title: string;
    note: string | null;
  }>;
}

interface UserDataExport {
  exportedAt: string;
  format: string;
  version: string;
  user: {
    id: string;
    name: string;
    email: string;
    bio: string | null;
    image: string | null;
    createdAt: string;
  };
  articles: ExportedArticle[];
  comments: ExportedComment[];
  series: ExportedSeries[];
  readingLists: ExportedReadingList[];
  bookmarks: Array<{ articleId: string; articleTitle: string; createdAt: string }>;
  following: Array<{ userId: string; userName: string; followedAt: string }>;
  followers: Array<{ userId: string; userName: string; followedAt: string }>;
}

interface ImportOptions {
  overwriteExisting?: boolean;
  importDrafts?: boolean;
  importComments?: boolean;
  importSeries?: boolean;
  importReadingLists?: boolean;
}

export const contentExportService = {
  // Export all user data (GDPR compliant)
  async exportUserData(userId: string): Promise<UserDataExport> {
    logger.info({ userId }, 'Starting user data export');

    // Get user info
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        bio: users.bio,
        image: users.image,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // Get all articles
    const articles = await this.exportArticles(userId);

    // Get all comments
    const userComments = await this.exportComments(userId);

    // Get series
    const userSeries = await this.exportSeries(userId);

    // Get reading lists
    const userReadingLists = await this.exportReadingLists(userId);

    // Get bookmarks
    const userBookmarks = await this.exportBookmarks(userId);

    // Get following
    const following = await this.exportFollowing(userId);

    // Get followers
    const followers = await this.exportFollowers(userId);

    const exportData: UserDataExport = {
      exportedAt: new Date().toISOString(),
      format: 'pythoughts-export-v1',
      version: '1.0.0',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        image: user.image,
        createdAt: user.createdAt.toISOString(),
      },
      articles,
      comments: userComments,
      series: userSeries,
      readingLists: userReadingLists,
      bookmarks: userBookmarks,
      following,
      followers,
    };

    logger.info(
      {
        userId,
        articleCount: articles.length,
        commentCount: userComments.length,
        seriesCount: userSeries.length,
      },
      'User data export completed'
    );

    return exportData;
  },

  // Export articles for a user
  async exportArticles(userId: string): Promise<ExportedArticle[]> {
    const userDrafts = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.isDeleted, false)))
      .orderBy(desc(drafts.createdAt));

    const articlesWithTags: ExportedArticle[] = [];

    for (const draft of userDrafts) {
      // Get tags for this article
      const articleTags = await db
        .select({ name: tags.name })
        .from(draftTags)
        .innerJoin(tags, eq(draftTags.tagId, tags.id))
        .where(eq(draftTags.draftId, draft.id));

      // Get series info if part of a series
      const [seriesInfo] = await db
        .select({
          id: series.id,
          title: series.title,
          order: seriesArticles.order,
        })
        .from(seriesArticles)
        .innerJoin(series, eq(seriesArticles.seriesId, series.id))
        .where(eq(seriesArticles.draftId, draft.id));

      articlesWithTags.push({
        id: draft.id,
        title: draft.title,
        content: draft.content,
        excerpt: draft.excerpt,
        slug: draft.slug,
        coverImage: draft.coverImage,
        status: draft.status,
        publishedAt: draft.publishedAt?.toISOString() || null,
        createdAt: draft.createdAt.toISOString(),
        updatedAt: draft.updatedAt.toISOString(),
        wordCount: draft.wordCount,
        readingTime: draft.readingTime,
        tags: articleTags.map((t) => t.name),
        series: seriesInfo
          ? {
              id: seriesInfo.id,
              title: seriesInfo.title,
              order: seriesInfo.order,
            }
          : undefined,
      });
    }

    return articlesWithTags;
  },

  // Export comments
  async exportComments(userId: string): Promise<ExportedComment[]> {
    const userComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        draftId: comments.draftId,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        articleTitle: drafts.title,
      })
      .from(comments)
      .innerJoin(drafts, eq(comments.draftId, drafts.id))
      .where(and(eq(comments.authorId, userId), eq(comments.isDeleted, false)))
      .orderBy(desc(comments.createdAt));

    return userComments.map((c) => ({
      id: c.id,
      content: c.content,
      articleId: c.draftId,
      articleTitle: c.articleTitle,
      parentId: c.parentId,
      createdAt: c.createdAt.toISOString(),
    }));
  },

  // Export series
  async exportSeries(userId: string): Promise<ExportedSeries[]> {
    const userSeries = await db
      .select()
      .from(series)
      .where(eq(series.authorId, userId))
      .orderBy(desc(series.createdAt));

    const seriesWithArticles: ExportedSeries[] = [];

    for (const s of userSeries) {
      const articles = await db
        .select({
          id: drafts.id,
          title: drafts.title,
          order: seriesArticles.order,
        })
        .from(seriesArticles)
        .innerJoin(drafts, eq(seriesArticles.draftId, drafts.id))
        .where(eq(seriesArticles.seriesId, s.id))
        .orderBy(seriesArticles.order);

      seriesWithArticles.push({
        id: s.id,
        title: s.title,
        slug: s.slug,
        description: s.description,
        coverImage: s.coverImage,
        isPublished: s.isPublished,
        articles: articles.map((a) => ({
          id: a.id,
          title: a.title,
          order: a.order,
        })),
      });
    }

    return seriesWithArticles;
  },

  // Export reading lists
  async exportReadingLists(userId: string): Promise<ExportedReadingList[]> {
    const lists = await db
      .select()
      .from(readingLists)
      .where(eq(readingLists.userId, userId))
      .orderBy(desc(readingLists.createdAt));

    const listsWithArticles: ExportedReadingList[] = [];

    for (const list of lists) {
      const items = await db
        .select({
          id: drafts.id,
          title: drafts.title,
          note: readingListItems.note,
        })
        .from(readingListItems)
        .innerJoin(drafts, eq(readingListItems.draftId, drafts.id))
        .where(eq(readingListItems.readingListId, list.id));

      listsWithArticles.push({
        id: list.id,
        name: list.name,
        description: list.description,
        isPublic: list.isPublic,
        articles: items.map((i) => ({
          id: i.id,
          title: i.title,
          note: i.note,
        })),
      });
    }

    return listsWithArticles;
  },

  // Export bookmarks
  async exportBookmarks(
    userId: string
  ): Promise<Array<{ articleId: string; articleTitle: string; createdAt: string }>> {
    const userBookmarks = await db
      .select({
        draftId: bookmarks.draftId,
        createdAt: bookmarks.createdAt,
        title: drafts.title,
      })
      .from(bookmarks)
      .innerJoin(drafts, eq(bookmarks.draftId, drafts.id))
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt));

    return userBookmarks.map((b) => ({
      articleId: b.draftId,
      articleTitle: b.title,
      createdAt: b.createdAt.toISOString(),
    }));
  },

  // Export following
  async exportFollowing(
    userId: string
  ): Promise<Array<{ userId: string; userName: string; followedAt: string }>> {
    const following = await db
      .select({
        followingId: follows.followingId,
        createdAt: follows.createdAt,
        name: users.name,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt));

    return following.map((f) => ({
      userId: f.followingId,
      userName: f.name,
      followedAt: f.createdAt.toISOString(),
    }));
  },

  // Export followers
  async exportFollowers(
    userId: string
  ): Promise<Array<{ userId: string; userName: string; followedAt: string }>> {
    const followers = await db
      .select({
        followerId: follows.followerId,
        createdAt: follows.createdAt,
        name: users.name,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followingId, userId))
      .orderBy(desc(follows.createdAt));

    return followers.map((f) => ({
      userId: f.followerId,
      userName: f.name,
      followedAt: f.createdAt.toISOString(),
    }));
  },

  // Export to different formats
  async exportToFormat(
    userId: string,
    format: 'json' | 'zip' | 'markdown'
  ): Promise<{ data: Buffer | string; contentType: string; filename: string }> {
    const exportData = await this.exportUserData(userId);

    switch (format) {
      case 'json':
        return {
          data: JSON.stringify(exportData, null, 2),
          contentType: 'application/json',
          filename: `pythoughts-export-${Date.now()}.json`,
        };

      case 'markdown':
        const markdown = this.convertToMarkdown(exportData);
        return {
          data: markdown,
          contentType: 'text/markdown',
          filename: `pythoughts-export-${Date.now()}.md`,
        };

      case 'zip':
        // For zip, we return JSON with articles embedded (simplified without JSZip)
        const fullExport = {
          ...exportData,
          articlesMarkdown: exportData.articles.map((a) => ({
            filename: `${a.slug || a.id}.md`,
            content: this.articleToMarkdown(a),
          })),
        };
        return {
          data: JSON.stringify(fullExport, null, 2),
          contentType: 'application/json',
          filename: `pythoughts-export-full-${Date.now()}.json`,
        };

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  },

  // Convert export to markdown
  convertToMarkdown(data: UserDataExport): string {
    let md = `# Pythoughts Export\n\n`;
    md += `Exported: ${data.exportedAt}\n\n`;
    md += `## User: ${data.user.name}\n\n`;
    md += `Email: ${data.user.email}\n\n`;

    if (data.user.bio) {
      md += `Bio: ${data.user.bio}\n\n`;
    }

    md += `---\n\n## Articles (${data.articles.length})\n\n`;

    for (const article of data.articles) {
      md += `### ${article.title}\n\n`;
      md += `Status: ${article.status}\n`;
      if (article.publishedAt) {
        md += `Published: ${article.publishedAt}\n`;
      }
      if (article.tags.length > 0) {
        md += `Tags: ${article.tags.join(', ')}\n`;
      }
      md += `\n`;
      if (article.excerpt) {
        md += `${article.excerpt}\n\n`;
      }
      // Content would need to be converted from EditorJS format
      md += `---\n\n`;
    }

    if (data.series.length > 0) {
      md += `## Series (${data.series.length})\n\n`;
      for (const s of data.series) {
        md += `### ${s.title}\n\n`;
        if (s.description) {
          md += `${s.description}\n\n`;
        }
        md += `Articles:\n`;
        for (const a of s.articles) {
          md += `${a.order + 1}. ${a.title}\n`;
        }
        md += `\n`;
      }
    }

    if (data.readingLists.length > 0) {
      md += `## Reading Lists (${data.readingLists.length})\n\n`;
      for (const list of data.readingLists) {
        md += `### ${list.name}\n\n`;
        if (list.description) {
          md += `${list.description}\n\n`;
        }
        for (const a of list.articles) {
          md += `- ${a.title}`;
          if (a.note) {
            md += ` (${a.note})`;
          }
          md += `\n`;
        }
        md += `\n`;
      }
    }

    return md;
  },

  // Convert single article to markdown
  articleToMarkdown(article: ExportedArticle): string {
    let md = `# ${article.title}\n\n`;
    md += `Status: ${article.status}\n`;
    if (article.publishedAt) {
      md += `Published: ${article.publishedAt}\n`;
    }
    if (article.tags.length > 0) {
      md += `Tags: ${article.tags.join(', ')}\n`;
    }
    md += `\n---\n\n`;
    if (article.excerpt) {
      md += `${article.excerpt}\n\n`;
    }
    // Add raw content as JSON for potential re-import
    md += `\n\n<!-- Raw Content: ${JSON.stringify(article.content)} -->`;
    return md;
  },

  // Import articles from external sources
  async importArticles(
    userId: string,
    importData: {
      source: 'medium' | 'devto' | 'wordpress' | 'pythoughts';
      data: unknown;
    },
    _options: ImportOptions = {}
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    switch (importData.source) {
      case 'pythoughts':
        return this.importPythoughtsExport(userId, importData.data as UserDataExport);

      case 'medium':
        return this.importMediumExport(userId, importData.data);

      case 'devto':
        return this.importDevtoExport(userId, importData.data);

      case 'wordpress':
        return this.importWordpressExport(userId, importData.data);

      default:
        results.errors.push(`Unsupported import source: ${importData.source}`);
        return results;
    }
  },

  // Import from Pythoughts export
  async importPythoughtsExport(
    userId: string,
    data: UserDataExport
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (const article of data.articles) {
      try {
        // Check if article with same slug exists
        if (article.slug) {
          const [existing] = await db
            .select({ id: drafts.id })
            .from(drafts)
            .where(eq(drafts.slug, article.slug));

          if (existing) {
            results.skipped++;
            continue;
          }
        }

        // Create new article
        const [newDraft] = await db
          .insert(drafts)
          .values({
            title: article.title,
            content: article.content as EditorJSContent,
            excerpt: article.excerpt,
            slug: article.slug,
            coverImage: article.coverImage,
            status: 'draft', // Always import as draft for safety
            authorId: userId,
            wordCount: article.wordCount,
            readingTime: article.readingTime,
          })
          .returning({ id: drafts.id });

        // Add tags
        if (article.tags.length > 0) {
          for (const tagName of article.tags) {
            // Find or create tag
            let [tag] = await db.select().from(tags).where(eq(tags.name, tagName));

            if (!tag) {
              [tag] = await db
                .insert(tags)
                .values({
                  name: tagName,
                  slug: tagName.toLowerCase().replace(/\s+/g, '-'),
                })
                .returning();
            }

            // Link tag to draft
            await db.insert(draftTags).values({
              draftId: newDraft.id,
              tagId: tag.id,
            }).onConflictDoNothing();
          }
        }

        results.imported++;
      } catch (error) {
        results.errors.push(`Failed to import "${article.title}": ${error}`);
      }
    }

    logger.info({ userId, results }, 'Pythoughts import completed');
    return results;
  },

  // Import from Medium export (HTML format)
  async importMediumExport(
    _userId: string,
    _data: unknown
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    // Medium exports are HTML files - would need HTML parsing
    return {
      imported: 0,
      skipped: 0,
      errors: ['Medium import not yet implemented - please use JSON export'],
    };
  },

  // Import from Dev.to export
  async importDevtoExport(
    _userId: string,
    _data: unknown
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    // Dev.to exports are markdown files
    return {
      imported: 0,
      skipped: 0,
      errors: ['Dev.to import not yet implemented'],
    };
  },

  // Import from WordPress export
  async importWordpressExport(
    _userId: string,
    _data: unknown
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    // WordPress exports are XML (WXR format)
    return {
      imported: 0,
      skipped: 0,
      errors: ['WordPress import not yet implemented'],
    };
  },
};
