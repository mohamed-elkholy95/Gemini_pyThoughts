import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { db, tags, draftTags, drafts } from '../db/index.js';

const tagsRouter = new Hono();

// Get all tags with article counts
tagsRouter.get('/', async (c) => {
  const allTags = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      description: tags.description,
      articleCount: sql<number>`(
        SELECT COUNT(DISTINCT dt.draft_id)
        FROM draft_tags dt
        INNER JOIN drafts d ON dt.draft_id = d.id
        WHERE dt.tag_id = ${tags.id}
          AND d.status = 'published'
          AND d.is_deleted = false
      )`,
    })
    .from(tags)
    .orderBy(tags.name);

  return c.json({ tags: allTags });
});

// Get popular tags
tagsRouter.get(
  '/popular',
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().int().min(1).max(50).optional().default(10),
    })
  ),
  async (c) => {
    const { limit } = c.req.valid('query');

    const popularTags = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        articleCount: sql<number>`(
          SELECT COUNT(DISTINCT dt.draft_id)
          FROM draft_tags dt
          INNER JOIN drafts d ON dt.draft_id = d.id
          WHERE dt.tag_id = ${tags.id}
            AND d.status = 'published'
            AND d.is_deleted = false
        )`,
      })
      .from(tags)
      .orderBy(
        sql`(
          SELECT COUNT(DISTINCT dt.draft_id)
          FROM draft_tags dt
          INNER JOIN drafts d ON dt.draft_id = d.id
          WHERE dt.tag_id = ${tags.id}
            AND d.status = 'published'
            AND d.is_deleted = false
        ) DESC`
      )
      .limit(limit);

    return c.json({ tags: popularTags });
  }
);

// Get a specific tag by slug
tagsRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug');

  const [tag] = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      description: tags.description,
      articleCount: sql<number>`(
        SELECT COUNT(DISTINCT dt.draft_id)
        FROM draft_tags dt
        INNER JOIN drafts d ON dt.draft_id = d.id
        WHERE dt.tag_id = ${tags.id}
          AND d.status = 'published'
          AND d.is_deleted = false
      )`,
    })
    .from(tags)
    .where(eq(tags.slug, slug));

  if (!tag) {
    return c.json({ error: 'Tag not found' }, 404);
  }

  return c.json({ tag });
});

// Get articles by tag
tagsRouter.get(
  '/:slug/articles',
  zValidator(
    'query',
    z.object({
      page: z.coerce.number().int().positive().optional().default(1),
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    })
  ),
  async (c) => {
    const slug = c.req.param('slug');
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));

    if (!tag) {
      return c.json({ error: 'Tag not found' }, 404);
    }

    const articles = await db.execute(sql`
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
        (SELECT COUNT(*) FROM likes WHERE likes.draft_id = d.id) as "likesCount",
        (SELECT COUNT(*) FROM comments WHERE comments.draft_id = d.id AND comments.is_deleted = false) as "commentsCount"
      FROM drafts d
      INNER JOIN users u ON d.author_id = u.id
      INNER JOIN draft_tags dt ON d.id = dt.draft_id
      WHERE dt.tag_id = ${tag.id}
        AND d.status = 'published'
        AND d.is_deleted = false
      ORDER BY d.published_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const [countResult] = await db
      .select({ count: sql<number>`count(DISTINCT ${draftTags.draftId})` })
      .from(draftTags)
      .innerJoin(drafts, eq(draftTags.draftId, drafts.id))
      .where(sql`${draftTags.tagId} = ${tag.id} AND ${drafts.status} = 'published' AND ${drafts.isDeleted} = false`);

    return c.json({
      articles,
      tag,
      total: Number(countResult?.count || 0),
      page,
      limit,
      hasMore: Number(countResult?.count || 0) > page * limit,
    });
  }
);

export { tagsRouter };
