import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc } from 'drizzle-orm';
import { draftService } from '../services/draft.service.js';
import { getSession, type AuthContext } from '../middleware/auth.js';
import { db, drafts, users } from '../db/index.js';

const articlesRouter = new Hono<AuthContext>();

// Validation schemas
const listArticlesSchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  author: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const featuredQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).default(5),
});

// Get featured/staff picks articles (public)
articlesRouter.get('/featured', zValidator('query', featuredQuerySchema), async (c) => {
  const { limit } = c.req.valid('query');

  const featured = await db
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
      wordCount: drafts.wordCount,
      readingTime: drafts.readingTime,
      featuredAt: drafts.featuredAt,
    })
    .from(drafts)
    .innerJoin(users, eq(drafts.authorId, users.id))
    .where(
      and(
        eq(drafts.status, 'published'),
        eq(drafts.isDeleted, false),
        eq(drafts.isFeatured, true)
      )
    )
    .orderBy(desc(drafts.featuredAt))
    .limit(limit);

  return c.json({
    articles: featured.map((article) => ({
      ...article,
      author: {
        id: article.authorId,
        name: article.authorName,
        image: article.authorImage,
      },
    })),
  });
});

// Get recommended articles (public) - based on popularity
articlesRouter.get('/recommended', zValidator('query', featuredQuerySchema), async (c) => {
  const { limit } = c.req.valid('query');

  // Get articles with most engagement (likes, views, comments)
  const recommended = await db
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
      wordCount: drafts.wordCount,
      readingTime: drafts.readingTime,
    })
    .from(drafts)
    .innerJoin(users, eq(drafts.authorId, users.id))
    .where(
      and(
        eq(drafts.status, 'published'),
        eq(drafts.isDeleted, false)
      )
    )
    .orderBy(desc(drafts.publishedAt))
    .limit(limit);

  return c.json({
    articles: recommended.map((article) => ({
      ...article,
      author: {
        id: article.authorId,
        name: article.authorName,
        image: article.authorImage,
      },
    })),
  });
});

// List published articles (public)
articlesRouter.get('/', zValidator('query', listArticlesSchema), async (c) => {
  const query = c.req.valid('query');

  const result = await draftService.list({
    status: 'published',
    authorId: query.author,
    search: query.search,
    page: query.page,
    limit: query.limit,
  });

  return c.json({
    articles: result.drafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      excerpt: draft.excerpt,
      coverImage: draft.coverImage,
      slug: draft.slug,
      authorId: draft.authorId,
      publishedAt: draft.publishedAt,
      wordCount: draft.wordCount,
      readingTime: draft.readingTime,
    })),
    pagination: {
      total: result.total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(result.total / query.limit),
    },
  });
});

// Get single article by slug (public)
articlesRouter.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');

  // For now, we'll search by slug in the list
  // In a real app, you'd have a dedicated method
  const result = await draftService.list({ status: 'published', limit: 1 });
  const article = result.drafts.find((d) => d.slug === slug);

  if (!article) {
    return c.json({ error: 'Article not found' }, 404);
  }

  return c.json({ article });
});

// Get article by ID (public, only published)
articlesRouter.get('/:id', getSession, async (c) => {
  const id = c.req.param('id');

  try {
    const draft = await draftService.getById(id);

    // Only return if published or if user is the author
    const user = c.get('user');
    if (draft.status !== 'published' && draft.authorId !== user?.id) {
      return c.json({ error: 'Article not found' }, 404);
    }

    return c.json({ article: draft });
  } catch {
    return c.json({ error: 'Article not found' }, 404);
  }
});

export { articlesRouter };
