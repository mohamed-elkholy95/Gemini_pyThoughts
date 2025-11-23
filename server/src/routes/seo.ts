import { Hono } from 'hono';
import { seoService } from '../services/seo.service.js';
import { cacheService, CACHE_TTL } from '../services/cache.service.js';

const seoRouter = new Hono();

// Main RSS feed
seoRouter.get('/rss', async (c) => {
  const cacheKey = 'rss:main';
  let rss = await cacheService.get<string>(cacheKey);

  if (!rss) {
    rss = await seoService.generateMainRSSFeed();
    await cacheService.set(cacheKey, rss, CACHE_TTL.FEED);
  }

  c.header('Content-Type', 'application/rss+xml; charset=utf-8');
  return c.body(rss);
});

// User RSS feed
seoRouter.get('/rss/user/:userId', async (c) => {
  const userId = c.req.param('userId');
  const cacheKey = `rss:user:${userId}`;

  let rss = await cacheService.get<string>(cacheKey);

  if (!rss) {
    rss = await seoService.generateUserRSSFeed(userId);
    if (!rss) {
      return c.json({ error: 'User not found' }, 404);
    }
    await cacheService.set(cacheKey, rss, CACHE_TTL.FEED);
  }

  c.header('Content-Type', 'application/rss+xml; charset=utf-8');
  return c.body(rss);
});

// Tag RSS feed
seoRouter.get('/rss/tag/:tagSlug', async (c) => {
  const tagSlug = c.req.param('tagSlug');
  const cacheKey = `rss:tag:${tagSlug}`;

  let rss = await cacheService.get<string>(cacheKey);

  if (!rss) {
    rss = await seoService.generateTagRSSFeed(tagSlug);
    if (!rss) {
      return c.json({ error: 'Tag not found' }, 404);
    }
    await cacheService.set(cacheKey, rss, CACHE_TTL.FEED);
  }

  c.header('Content-Type', 'application/rss+xml; charset=utf-8');
  return c.body(rss);
});

// Main sitemap
seoRouter.get('/sitemap.xml', async (c) => {
  const cacheKey = 'sitemap:main';
  let sitemap = await cacheService.get<string>(cacheKey);

  if (!sitemap) {
    sitemap = await seoService.generateSitemap();
    await cacheService.set(cacheKey, sitemap, CACHE_TTL.TAGS); // Cache for 1 hour
  }

  c.header('Content-Type', 'application/xml; charset=utf-8');
  return c.body(sitemap);
});

// Sitemap index
seoRouter.get('/sitemap-index.xml', async (c) => {
  const sitemap = await seoService.generateSitemapIndex();
  c.header('Content-Type', 'application/xml; charset=utf-8');
  return c.body(sitemap);
});

// Articles sitemap
seoRouter.get('/sitemap-articles.xml', async (c) => {
  const cacheKey = 'sitemap:articles';
  let sitemap = await cacheService.get<string>(cacheKey);

  if (!sitemap) {
    sitemap = await seoService.generateArticlesSitemap();
    await cacheService.set(cacheKey, sitemap, CACHE_TTL.TAGS);
  }

  c.header('Content-Type', 'application/xml; charset=utf-8');
  return c.body(sitemap);
});

// robots.txt
seoRouter.get('/robots.txt', (c) => {
  const robots = seoService.generateRobotsTxt();
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.body(robots);
});

export { seoRouter };
