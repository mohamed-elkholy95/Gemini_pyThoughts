import { sql, eq, and, desc, or, ilike } from 'drizzle-orm';
import { db, drafts, users, tags, draftTags } from '../db/index.js';
import { logger } from '../config/logger.js';

interface SearchOptions {
  query: string;
  page?: number;
  limit?: number;
  authorId?: string;
  tagSlug?: string;
  sortBy?: 'relevance' | 'date' | 'popularity';
}

interface SearchResult {
  id: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  slug: string | null;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  publishedAt: Date | null;
  readingTime: number | null;
  relevanceScore?: number;
}

// Database migration for search (run once)
export const searchMigration = `
-- Add search vector column to drafts
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast search
CREATE INDEX IF NOT EXISTS drafts_search_idx ON drafts USING GIN (search_vector);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION drafts_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(
      (SELECT string_agg(value->>'text', ' ')
       FROM jsonb_array_elements(NEW.content->'blocks')
       WHERE value->>'type' IN ('paragraph', 'header', 'quote')
      ), ''
    )), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search vector
DROP TRIGGER IF EXISTS drafts_search_trigger ON drafts;
CREATE TRIGGER drafts_search_trigger
  BEFORE INSERT OR UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION drafts_search_update();

-- Update existing rows
UPDATE drafts SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(excerpt, '')), 'B');
`;

export const searchService = {
  // Full-text search articles
  async searchArticles(options: SearchOptions): Promise<{ results: SearchResult[]; total: number }> {
    const { query, page = 1, limit = 20, authorId, sortBy = 'relevance' } = options;
    const offset = (page - 1) * limit;

    // Sanitize and prepare search query
    const searchTerms = query
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => term.replace(/[^\w\s]/g, ''))
      .join(' & ');

    if (!searchTerms) {
      return { results: [], total: 0 };
    }

    try {
      // Build the search query with ts_rank for relevance scoring
      let results: SearchResult[];
      let countResult: { count: number }[];

      if (sortBy === 'relevance') {
        // Use full-text search with ranking
        const rawResults = await db.execute(sql`
          SELECT
            d.id,
            d.title,
            d.excerpt,
            d.cover_image as "coverImage",
            d.slug,
            d.author_id as "authorId",
            u.name as "authorName",
            u.image as "authorImage",
            d.published_at as "publishedAt",
            d.reading_time as "readingTime",
            ts_rank(d.search_vector, to_tsquery('english', ${searchTerms})) as "relevanceScore"
          FROM drafts d
          INNER JOIN users u ON d.author_id = u.id
          WHERE d.status = 'published'
            AND d.is_deleted = false
            AND d.search_vector @@ to_tsquery('english', ${searchTerms})
            ${authorId ? sql`AND d.author_id = ${authorId}` : sql``}
          ORDER BY ts_rank(d.search_vector, to_tsquery('english', ${searchTerms})) DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);
        results = rawResults as unknown as SearchResult[];

        const rawCount = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM drafts
          WHERE status = 'published'
            AND is_deleted = false
            AND search_vector @@ to_tsquery('english', ${searchTerms})
            ${authorId ? sql`AND author_id = ${authorId}` : sql``}
        `);
        countResult = rawCount as unknown as { count: number }[];
      } else {
        // Fallback to ILIKE search for simpler cases
        const searchPattern = `%${query}%`;

        results = await db
          .select({
            id: drafts.id,
            title: drafts.title,
            excerpt: drafts.excerpt,
            coverImage: drafts.coverImage,
            slug: drafts.slug,
            authorId: drafts.authorId,
            authorName: users.name,
            authorImage: users.image,
            publishedAt: drafts.publishedAt,
            readingTime: drafts.readingTime,
          })
          .from(drafts)
          .innerJoin(users, eq(drafts.authorId, users.id))
          .where(
            and(
              eq(drafts.status, 'published'),
              eq(drafts.isDeleted, false),
              or(ilike(drafts.title, searchPattern), ilike(drafts.excerpt, searchPattern)),
              authorId ? eq(drafts.authorId, authorId) : undefined
            )
          )
          .orderBy(sortBy === 'date' ? desc(drafts.publishedAt) : desc(drafts.createdAt))
          .limit(limit)
          .offset(offset) as SearchResult[];

        const countRes = await db
          .select({ count: sql<number>`count(*)` })
          .from(drafts)
          .where(
            and(
              eq(drafts.status, 'published'),
              eq(drafts.isDeleted, false),
              or(ilike(drafts.title, `%${query}%`), ilike(drafts.excerpt, `%${query}%`)),
              authorId ? eq(drafts.authorId, authorId) : undefined
            )
          );

        countResult = [{ count: Number(countRes[0]?.count || 0) }];
      }

      return {
        results,
        total: Number(countResult[0]?.count || 0),
      };
    } catch (error) {
      // Fallback to simple ILIKE search if full-text search fails
      logger.warn({ error }, 'Full-text search failed, falling back to ILIKE');

      const searchPattern = `%${query}%`;
      const results = await db
        .select({
          id: drafts.id,
          title: drafts.title,
          excerpt: drafts.excerpt,
          coverImage: drafts.coverImage,
          slug: drafts.slug,
          authorId: drafts.authorId,
          authorName: users.name,
          authorImage: users.image,
          publishedAt: drafts.publishedAt,
          readingTime: drafts.readingTime,
        })
        .from(drafts)
        .innerJoin(users, eq(drafts.authorId, users.id))
        .where(
          and(
            eq(drafts.status, 'published'),
            eq(drafts.isDeleted, false),
            or(ilike(drafts.title, searchPattern), ilike(drafts.excerpt, searchPattern))
          )
        )
        .orderBy(desc(drafts.publishedAt))
        .limit(limit)
        .offset(offset);

      const countRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(drafts)
        .where(
          and(
            eq(drafts.status, 'published'),
            eq(drafts.isDeleted, false),
            or(ilike(drafts.title, `%${query}%`), ilike(drafts.excerpt, `%${query}%`))
          )
        );

      return {
        results: results as SearchResult[],
        total: Number(countRes[0]?.count || 0),
      };
    }
  },

  // Search users
  async searchUsers(query: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const searchPattern = `%${query}%`;

    const results = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        bio: users.bio,
      })
      .from(users)
      .where(or(ilike(users.name, searchPattern), ilike(users.bio, searchPattern)))
      .orderBy(users.name)
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(or(ilike(users.name, searchPattern), ilike(users.bio, searchPattern)));

    return {
      results,
      total: Number(countResult?.count || 0),
    };
  },

  // Search tags
  async searchTags(query: string, limit = 10) {
    const searchPattern = `%${query}%`;

    const results = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        description: tags.description,
      })
      .from(tags)
      .where(or(ilike(tags.name, searchPattern), ilike(tags.slug, searchPattern)))
      .limit(limit);

    return results;
  },

  // Get search suggestions (autocomplete)
  async getSuggestions(query: string, limit = 5) {
    const searchPattern = `${query}%`;

    // Get article title suggestions
    const titleSuggestions = await db
      .selectDistinct({ suggestion: drafts.title })
      .from(drafts)
      .where(
        and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false), ilike(drafts.title, searchPattern))
      )
      .limit(limit);

    // Get tag suggestions
    const tagSuggestions = await db
      .select({ suggestion: tags.name })
      .from(tags)
      .where(ilike(tags.name, searchPattern))
      .limit(limit);

    return {
      articles: titleSuggestions.map((t) => t.suggestion),
      tags: tagSuggestions.map((t) => t.suggestion),
    };
  },

  // Get articles by tag
  async getArticlesByTag(tagSlug: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [tag] = await db.select().from(tags).where(eq(tags.slug, tagSlug));

    if (!tag) {
      return { results: [], total: 0, tag: null };
    }

    const results = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        slug: drafts.slug,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        publishedAt: drafts.publishedAt,
        readingTime: drafts.readingTime,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .innerJoin(draftTags, eq(drafts.id, draftTags.draftId))
      .where(
        and(eq(draftTags.tagId, tag.id), eq(drafts.status, 'published'), eq(drafts.isDeleted, false))
      )
      .orderBy(desc(drafts.publishedAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drafts)
      .innerJoin(draftTags, eq(drafts.id, draftTags.draftId))
      .where(
        and(eq(draftTags.tagId, tag.id), eq(drafts.status, 'published'), eq(drafts.isDeleted, false))
      );

    return {
      results,
      total: Number(countResult?.count || 0),
      tag,
    };
  },
};
