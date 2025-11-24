// Article Series/Collections Service
// Manages article series for organizing related content

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { series, seriesArticles, drafts, users, type Series, type NewSeries } from '../db/schema.js';
import { logger } from '../config/logger.js';

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 100);
}

interface CreateSeriesInput {
  title: string;
  description?: string;
  coverImage?: string;
  authorId: string;
}

interface UpdateSeriesInput {
  title?: string;
  description?: string;
  coverImage?: string;
  isPublished?: boolean;
}

interface SeriesWithArticles extends Series {
  articles: Array<{
    id: string;
    title: string;
    slug: string | null;
    excerpt: string | null;
    status: string;
    order: number;
  }>;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
  articleCount: number;
}

export const seriesService = {
  // Create a new series
  async create(input: CreateSeriesInput): Promise<Series> {
    const baseSlug = generateSlug(input.title);
    let slug = baseSlug;
    let counter = 1;

    // Ensure unique slug
    while (true) {
      const existing = await db
        .select({ id: series.id })
        .from(series)
        .where(eq(series.slug, slug))
        .limit(1);

      if (existing.length === 0) break;
      slug = `${baseSlug}-${counter++}`;
    }

    const [created] = await db
      .insert(series)
      .values({
        title: input.title,
        slug,
        description: input.description,
        coverImage: input.coverImage,
        authorId: input.authorId,
      })
      .returning();

    logger.info({ seriesId: created.id, authorId: input.authorId }, 'Series created');
    return created;
  },

  // Get series by ID with articles
  async getById(seriesId: string, userId?: string): Promise<SeriesWithArticles | null> {
    const [seriesData] = await db
      .select({
        id: series.id,
        title: series.title,
        slug: series.slug,
        description: series.description,
        coverImage: series.coverImage,
        authorId: series.authorId,
        isPublished: series.isPublished,
        publishedAt: series.publishedAt,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        authorName: users.name,
        authorImage: users.image,
      })
      .from(series)
      .innerJoin(users, eq(series.authorId, users.id))
      .where(eq(series.id, seriesId));

    if (!seriesData) return null;

    // Check access - published or owned by user
    if (!seriesData.isPublished && seriesData.authorId !== userId) {
      return null;
    }

    // Get articles in order
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        slug: drafts.slug,
        excerpt: drafts.excerpt,
        status: drafts.status,
        order: seriesArticles.order,
      })
      .from(seriesArticles)
      .innerJoin(drafts, eq(seriesArticles.draftId, drafts.id))
      .where(eq(seriesArticles.seriesId, seriesId))
      .orderBy(asc(seriesArticles.order));

    return {
      id: seriesData.id,
      title: seriesData.title,
      slug: seriesData.slug,
      description: seriesData.description,
      coverImage: seriesData.coverImage,
      authorId: seriesData.authorId,
      isPublished: seriesData.isPublished,
      publishedAt: seriesData.publishedAt,
      createdAt: seriesData.createdAt,
      updatedAt: seriesData.updatedAt,
      author: {
        id: seriesData.authorId,
        name: seriesData.authorName,
        image: seriesData.authorImage,
      },
      articles,
      articleCount: articles.length,
    };
  },

  // Get series by slug
  async getBySlug(slug: string, userId?: string): Promise<SeriesWithArticles | null> {
    const [seriesData] = await db
      .select({ id: series.id })
      .from(series)
      .where(eq(series.slug, slug));

    if (!seriesData) return null;
    return this.getById(seriesData.id, userId);
  },

  // List user's series
  async listByAuthor(authorId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const seriesList = await db
      .select({
        id: series.id,
        title: series.title,
        slug: series.slug,
        description: series.description,
        coverImage: series.coverImage,
        isPublished: series.isPublished,
        createdAt: series.createdAt,
      })
      .from(series)
      .where(eq(series.authorId, authorId))
      .orderBy(desc(series.createdAt))
      .limit(limit)
      .offset(offset);

    // Get article counts
    const seriesWithCounts = await Promise.all(
      seriesList.map(async (s) => {
        const [count] = await db
          .select({ count: sql<number>`count(*)` })
          .from(seriesArticles)
          .where(eq(seriesArticles.seriesId, s.id));
        return { ...s, articleCount: Number(count?.count || 0) };
      })
    );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(series)
      .where(eq(series.authorId, authorId));

    return {
      series: seriesWithCounts,
      total: Number(countResult?.count || 0),
    };
  },

  // List published series (public)
  async listPublished(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const seriesList = await db
      .select({
        id: series.id,
        title: series.title,
        slug: series.slug,
        description: series.description,
        coverImage: series.coverImage,
        authorId: series.authorId,
        publishedAt: series.publishedAt,
        authorName: users.name,
        authorImage: users.image,
      })
      .from(series)
      .innerJoin(users, eq(series.authorId, users.id))
      .where(eq(series.isPublished, true))
      .orderBy(desc(series.publishedAt))
      .limit(limit)
      .offset(offset);

    // Get article counts
    const seriesWithCounts = await Promise.all(
      seriesList.map(async (s) => {
        const [count] = await db
          .select({ count: sql<number>`count(*)` })
          .from(seriesArticles)
          .where(eq(seriesArticles.seriesId, s.id));
        return {
          ...s,
          author: { id: s.authorId, name: s.authorName, image: s.authorImage },
          articleCount: Number(count?.count || 0),
        };
      })
    );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(series)
      .where(eq(series.isPublished, true));

    return {
      series: seriesWithCounts,
      total: Number(countResult?.count || 0),
    };
  },

  // Update series
  async update(seriesId: string, authorId: string, input: UpdateSeriesInput): Promise<Series | null> {
    const updateData: Partial<NewSeries> = {
      ...input,
      updatedAt: new Date(),
    };

    // Update slug if title changed
    if (input.title) {
      const baseSlug = generateSlug(input.title);
      let slug = baseSlug;
      let counter = 1;

      while (true) {
        const existing = await db
          .select({ id: series.id })
          .from(series)
          .where(and(eq(series.slug, slug), sql`${series.id} != ${seriesId}`))
          .limit(1);

        if (existing.length === 0) break;
        slug = `${baseSlug}-${counter++}`;
      }
      updateData.slug = slug;
    }

    // Set publishedAt when publishing
    if (input.isPublished === true) {
      updateData.publishedAt = new Date();
    }

    const [updated] = await db
      .update(series)
      .set(updateData)
      .where(and(eq(series.id, seriesId), eq(series.authorId, authorId)))
      .returning();

    return updated || null;
  },

  // Delete series
  async delete(seriesId: string, authorId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(series)
      .where(and(eq(series.id, seriesId), eq(series.authorId, authorId)))
      .returning({ id: series.id });

    return !!deleted;
  },

  // Add article to series
  async addArticle(seriesId: string, draftId: string, authorId: string): Promise<boolean> {
    // Verify ownership
    const [seriesData] = await db
      .select({ authorId: series.authorId })
      .from(series)
      .where(eq(series.id, seriesId));

    if (!seriesData || seriesData.authorId !== authorId) {
      return false;
    }

    // Check if article belongs to user
    const [article] = await db
      .select({ authorId: drafts.authorId })
      .from(drafts)
      .where(eq(drafts.id, draftId));

    if (!article || article.authorId !== authorId) {
      return false;
    }

    // Get next order
    const [maxOrder] = await db
      .select({ max: sql<number>`coalesce(max(${seriesArticles.order}), -1)` })
      .from(seriesArticles)
      .where(eq(seriesArticles.seriesId, seriesId));

    await db
      .insert(seriesArticles)
      .values({
        seriesId,
        draftId,
        order: (maxOrder?.max ?? -1) + 1,
      })
      .onConflictDoNothing();

    return true;
  },

  // Remove article from series
  async removeArticle(seriesId: string, draftId: string, authorId: string): Promise<boolean> {
    // Verify ownership
    const [seriesData] = await db
      .select({ authorId: series.authorId })
      .from(series)
      .where(eq(series.id, seriesId));

    if (!seriesData || seriesData.authorId !== authorId) {
      return false;
    }

    const [deleted] = await db
      .delete(seriesArticles)
      .where(and(eq(seriesArticles.seriesId, seriesId), eq(seriesArticles.draftId, draftId)))
      .returning({ seriesId: seriesArticles.seriesId });

    return !!deleted;
  },

  // Reorder articles in series
  async reorderArticles(seriesId: string, authorId: string, articleIds: string[]): Promise<boolean> {
    // Verify ownership
    const [seriesData] = await db
      .select({ authorId: series.authorId })
      .from(series)
      .where(eq(series.id, seriesId));

    if (!seriesData || seriesData.authorId !== authorId) {
      return false;
    }

    // Update order for each article
    await Promise.all(
      articleIds.map((draftId, index) =>
        db
          .update(seriesArticles)
          .set({ order: index })
          .where(and(eq(seriesArticles.seriesId, seriesId), eq(seriesArticles.draftId, draftId)))
      )
    );

    return true;
  },
};
