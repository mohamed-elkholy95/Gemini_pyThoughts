import { eq, and, desc, sql } from 'drizzle-orm';
import { db, drafts, users, tags } from '../db/index.js';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const APP_NAME = process.env.APP_NAME || 'Pythoughts';

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author: string;
  guid: string;
  categories?: string[];
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export const seoService = {
  // Generate RSS feed for the main site
  async generateMainRSSFeed(limit = 50): Promise<string> {
    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        publishedAt: drafts.publishedAt,
        authorName: users.name,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false)))
      .orderBy(desc(drafts.publishedAt))
      .limit(limit);

    const items: RSSItem[] = articles.map((article) => ({
      title: article.title,
      link: `${APP_URL}/article/${article.slug || article.id}`,
      description: article.excerpt || '',
      pubDate: article.publishedAt?.toUTCString() || new Date().toUTCString(),
      author: article.authorName || 'Unknown',
      guid: `${APP_URL}/article/${article.id}`,
    }));

    return this.buildRSSXML({
      title: APP_NAME,
      description: `Latest articles from ${APP_NAME}`,
      link: APP_URL,
      items,
    });
  },

  // Generate RSS feed for a specific user
  async generateUserRSSFeed(userId: string, limit = 50): Promise<string | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) return null;

    const articles = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        publishedAt: drafts.publishedAt,
      })
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.status, 'published'), eq(drafts.isDeleted, false)))
      .orderBy(desc(drafts.publishedAt))
      .limit(limit);

    const items: RSSItem[] = articles.map((article) => ({
      title: article.title,
      link: `${APP_URL}/article/${article.slug || article.id}`,
      description: article.excerpt || '',
      pubDate: article.publishedAt?.toUTCString() || new Date().toUTCString(),
      author: user.name || 'Unknown',
      guid: `${APP_URL}/article/${article.id}`,
    }));

    return this.buildRSSXML({
      title: `${user.name} on ${APP_NAME}`,
      description: user.bio || `Articles by ${user.name}`,
      link: `${APP_URL}/profile/${userId}`,
      items,
    });
  },

  // Generate RSS feed for a specific tag
  async generateTagRSSFeed(tagSlug: string, limit = 50): Promise<string | null> {
    const [tag] = await db.select().from(tags).where(eq(tags.slug, tagSlug));

    if (!tag) return null;

    const articles = await db.execute(sql`
      SELECT d.id, d.title, d.excerpt, d.slug, d.published_at, u.name as author_name
      FROM drafts d
      INNER JOIN users u ON d.author_id = u.id
      INNER JOIN draft_tags dt ON d.id = dt.draft_id
      WHERE dt.tag_id = ${tag.id}
        AND d.status = 'published'
        AND d.is_deleted = false
      ORDER BY d.published_at DESC
      LIMIT ${limit}
    `);

    const items: RSSItem[] = (articles as unknown as Array<{
      id: string;
      title: string;
      excerpt: string;
      slug: string;
      published_at: Date;
      author_name: string;
    }>).map((article) => ({
      title: article.title,
      link: `${APP_URL}/article/${article.slug || article.id}`,
      description: article.excerpt || '',
      pubDate: article.published_at?.toUTCString() || new Date().toUTCString(),
      author: article.author_name || 'Unknown',
      guid: `${APP_URL}/article/${article.id}`,
      categories: [tag.name],
    }));

    return this.buildRSSXML({
      title: `${tag.name} - ${APP_NAME}`,
      description: tag.description || `Articles tagged with ${tag.name}`,
      link: `${APP_URL}/tag/${tagSlug}`,
      items,
    });
  },

  // Build RSS XML string
  buildRSSXML(feed: {
    title: string;
    description: string;
    link: string;
    items: RSSItem[];
  }): string {
    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const itemsXml = feed.items
      .map(
        (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate}</pubDate>
      <author>${escapeXml(item.author)}</author>
      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>
      ${item.categories?.map((cat) => `<category>${escapeXml(cat)}</category>`).join('') || ''}
    </item>`
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <description>${escapeXml(feed.description)}</description>
    <link>${escapeXml(feed.link)}</link>
    <atom:link href="${escapeXml(feed.link)}/rss" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>${APP_NAME}</generator>
    ${itemsXml}
  </channel>
</rss>`;
  },

  // Generate main sitemap
  async generateSitemap(): Promise<string> {
    const urls: SitemapUrl[] = [];

    // Static pages
    urls.push(
      { loc: `${APP_URL}/`, changefreq: 'daily', priority: 1.0 },
      { loc: `${APP_URL}/explore`, changefreq: 'daily', priority: 0.9 },
      { loc: `${APP_URL}/trending`, changefreq: 'hourly', priority: 0.9 }
    );

    // Published articles
    const articles = await db
      .select({
        id: drafts.id,
        slug: drafts.slug,
        updatedAt: drafts.updatedAt,
      })
      .from(drafts)
      .where(and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false)))
      .orderBy(desc(drafts.publishedAt))
      .limit(50000); // Sitemap limit

    for (const article of articles) {
      urls.push({
        loc: `${APP_URL}/article/${article.slug || article.id}`,
        lastmod: article.updatedAt.toISOString(),
        changefreq: 'weekly',
        priority: 0.8,
      });
    }

    // User profiles
    const usersList = await db
      .select({ id: users.id, updatedAt: users.updatedAt })
      .from(users)
      .limit(50000);

    for (const user of usersList) {
      urls.push({
        loc: `${APP_URL}/profile/${user.id}`,
        lastmod: user.updatedAt.toISOString(),
        changefreq: 'weekly',
        priority: 0.6,
      });
    }

    // Tags
    const tagsList = await db.select({ slug: tags.slug }).from(tags);

    for (const tag of tagsList) {
      urls.push({
        loc: `${APP_URL}/tag/${tag.slug}`,
        changefreq: 'weekly',
        priority: 0.7,
      });
    }

    return this.buildSitemapXML(urls);
  },

  // Generate sitemap index (for large sites)
  async generateSitemapIndex(): Promise<string> {
    const sitemaps = [
      { loc: `${APP_URL}/sitemap-articles.xml` },
      { loc: `${APP_URL}/sitemap-users.xml` },
      { loc: `${APP_URL}/sitemap-tags.xml` },
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map((s) => `  <sitemap><loc>${s.loc}</loc><lastmod>${new Date().toISOString()}</lastmod></sitemap>`).join('\n')}
</sitemapindex>`;
  },

  // Generate articles sitemap
  async generateArticlesSitemap(): Promise<string> {
    const articles = await db
      .select({
        id: drafts.id,
        slug: drafts.slug,
        updatedAt: drafts.updatedAt,
      })
      .from(drafts)
      .where(and(eq(drafts.status, 'published'), eq(drafts.isDeleted, false)))
      .orderBy(desc(drafts.publishedAt))
      .limit(50000);

    const urls: SitemapUrl[] = articles.map((article) => ({
      loc: `${APP_URL}/article/${article.slug || article.id}`,
      lastmod: article.updatedAt.toISOString(),
      changefreq: 'weekly',
      priority: 0.8,
    }));

    return this.buildSitemapXML(urls);
  },

  // Build sitemap XML
  buildSitemapXML(urls: SitemapUrl[]): string {
    const urlsXml = urls
      .map(
        (url) => `
  <url>
    <loc>${url.loc}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
    ${url.changefreq ? `<changefreq>${url.changefreq}</changefreq>` : ''}
    ${url.priority !== undefined ? `<priority>${url.priority}</priority>` : ''}
  </url>`
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;
  },

  // Generate robots.txt
  generateRobotsTxt(): string {
    return `User-agent: *
Allow: /

Sitemap: ${APP_URL}/sitemap.xml

# Disallow admin and private areas
Disallow: /admin/
Disallow: /settings/
Disallow: /api/

# Allow specific API endpoints for search engines
Allow: /api/articles
Allow: /api/users
`;
  },

  // Generate Open Graph meta tags
  generateOGTags(data: {
    title: string;
    description: string;
    url: string;
    image?: string;
    type?: 'website' | 'article' | 'profile';
    author?: string;
    publishedAt?: Date;
    tags?: string[];
  }): Record<string, string> {
    const tags: Record<string, string> = {
      'og:title': data.title,
      'og:description': data.description,
      'og:url': data.url,
      'og:type': data.type || 'website',
      'og:site_name': APP_NAME,
      'twitter:card': data.image ? 'summary_large_image' : 'summary',
      'twitter:title': data.title,
      'twitter:description': data.description,
    };

    if (data.image) {
      tags['og:image'] = data.image;
      tags['twitter:image'] = data.image;
    }

    if (data.type === 'article') {
      if (data.author) tags['article:author'] = data.author;
      if (data.publishedAt) tags['article:published_time'] = data.publishedAt.toISOString();
      if (data.tags) {
        data.tags.forEach((tag, i) => {
          tags[`article:tag:${i}`] = tag;
        });
      }
    }

    return tags;
  },

  // Generate JSON-LD structured data for an article
  generateArticleJsonLd(article: {
    title: string;
    description: string;
    url: string;
    image?: string;
    author: { name: string; url: string };
    publishedAt: Date;
    updatedAt?: Date;
  }): string {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      url: article.url,
      image: article.image,
      author: {
        '@type': 'Person',
        name: article.author.name,
        url: article.author.url,
      },
      publisher: {
        '@type': 'Organization',
        name: APP_NAME,
        url: APP_URL,
      },
      datePublished: article.publishedAt.toISOString(),
      dateModified: (article.updatedAt || article.publishedAt).toISOString(),
    };

    return JSON.stringify(jsonLd);
  },
};
