// Social Sharing Service
// Generate share links, track shares, and manage social integrations

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, users } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { seoService } from './seo.service.js';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const APP_NAME = process.env.APP_NAME || 'Pythoughts';

interface ShareData {
  url: string;
  title: string;
  description: string;
  image?: string;
  hashtags?: string[];
}

interface ShareLinks {
  twitter: string;
  facebook: string;
  linkedin: string;
  reddit: string;
  hackernews: string;
  email: string;
  whatsapp: string;
  telegram: string;
  copy: string;
}

interface OEmbedResponse {
  version: string;
  type: 'rich' | 'link';
  title: string;
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  html?: string;
  width?: number;
  height?: number;
  thumbnail_url?: string;
}

export const sharingService = {
  // Generate share links for an article
  async getShareLinks(articleId: string): Promise<ShareLinks | null> {
    const [article] = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        coverImage: drafts.coverImage,
      })
      .from(drafts)
      .where(eq(drafts.id, articleId));

    if (!article) return null;

    const shareUrl = `${APP_URL}/article/${article.slug || article.id}`;
    const shareTitle = encodeURIComponent(article.title);
    const shareDescription = encodeURIComponent(article.excerpt || '');

    return {
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${shareTitle}&via=${APP_NAME}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      reddit: `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${shareTitle}`,
      hackernews: `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(shareUrl)}&t=${shareTitle}`,
      email: `mailto:?subject=${shareTitle}&body=${shareDescription}%0A%0A${encodeURIComponent(shareUrl)}`,
      whatsapp: `https://wa.me/?text=${shareTitle}%20${encodeURIComponent(shareUrl)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${shareTitle}`,
      copy: shareUrl,
    };
  },

  // Generate share data for an article
  async getShareData(articleId: string): Promise<ShareData | null> {
    const [article] = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        coverImage: drafts.coverImage,
      })
      .from(drafts)
      .where(eq(drafts.id, articleId));

    if (!article) return null;

    return {
      url: `${APP_URL}/article/${article.slug || article.id}`,
      title: article.title,
      description: article.excerpt || '',
      image: article.coverImage || undefined,
    };
  },

  // Track a share event
  async trackShare(
    articleId: string,
    platform: string,
    userId?: string
  ): Promise<void> {
    // In production, store this in a shares table
    logger.info({ articleId, platform, userId }, 'Share tracked');

    // Increment share count if tracked
    // Could be implemented with a shares counter or analytics event
  },

  // Generate oEmbed response for article embedding
  async getOEmbed(articleId: string, maxWidth?: number, maxHeight?: number): Promise<OEmbedResponse | null> {
    const [article] = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        excerpt: drafts.excerpt,
        slug: drafts.slug,
        coverImage: drafts.coverImage,
        authorId: drafts.authorId,
        authorName: users.name,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(eq(drafts.id, articleId));

    if (!article) return null;

    const articleUrl = `${APP_URL}/article/${article.slug || article.id}`;
    const authorUrl = `${APP_URL}/profile/${article.authorId}`;

    const width = Math.min(maxWidth || 600, 800);
    const cardHeight = Math.min(maxHeight || 200, 400);

    // Generate embeddable HTML card
    const html = `
      <blockquote class="pythoughts-embed" style="max-width:${width}px;border:1px solid #e1e4e8;border-radius:8px;padding:16px;font-family:sans-serif;">
        <h3 style="margin:0 0 8px 0;"><a href="${articleUrl}" target="_blank" rel="noopener">${this.escapeHtml(article.title)}</a></h3>
        <p style="margin:0 0 8px 0;color:#586069;">${this.escapeHtml(article.excerpt || '').substring(0, 200)}...</p>
        <p style="margin:0;font-size:14px;color:#666;">
          by <a href="${authorUrl}" target="_blank" rel="noopener">${this.escapeHtml(article.authorName || 'Unknown')}</a> on ${APP_NAME}
        </p>
      </blockquote>
    `.trim();

    return {
      version: '1.0',
      type: 'rich',
      title: article.title,
      author_name: article.authorName || 'Unknown',
      author_url: authorUrl,
      provider_name: APP_NAME,
      provider_url: APP_URL,
      html,
      width,
      height: cardHeight,
      thumbnail_url: article.coverImage || undefined,
    };
  },

  // Escape HTML for safe embedding
  escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // Generate a short share code for article
  generateShareCode(articleId: string): string {
    // Create a short base62 code from the article ID
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let hash = 0;
    for (let i = 0; i < articleId.length; i++) {
      hash = ((hash << 5) - hash) + articleId.charCodeAt(i);
      hash = hash & hash;
    }
    hash = Math.abs(hash);

    let code = '';
    while (hash > 0) {
      code = chars[hash % 62] + code;
      hash = Math.floor(hash / 62);
    }

    return code.padStart(6, '0').substring(0, 8);
  },

  // Get share statistics for an article
  async getShareStats(_articleId: string): Promise<{
    total: number;
    byPlatform: Record<string, number>;
  }> {
    // In production, query from shares table
    // For now, return placeholder
    return {
      total: 0,
      byPlatform: {},
    };
  },

  // Generate social preview card HTML
  async getPreviewCard(articleId: string): Promise<string | null> {
    const seo = await seoService.generateArticleSEO(articleId);
    if (!seo) return null;

    const [article] = await db
      .select({
        title: drafts.title,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        authorName: users.name,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(eq(drafts.id, articleId));

    if (!article) return null;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${this.escapeHtml(article.title)}</title>
        ${Object.entries(seo.meta)
          .map(([key, value]) => `<meta property="${key}" content="${this.escapeHtml(value)}">`)
          .join('\n')}
        <script type="application/ld+json">${seo.jsonLd[0]}</script>
      </head>
      <body>
        <h1>${this.escapeHtml(article.title)}</h1>
        <p>by ${this.escapeHtml(article.authorName || 'Unknown')}</p>
        <p>${this.escapeHtml(article.excerpt || '')}</p>
      </body>
      </html>
    `.trim();
  },

  // Get article embed code for external sites
  getEmbedCode(articleId: string, style: 'card' | 'minimal' | 'full' = 'card'): string {
    const embedUrl = `${APP_URL}/embed/${articleId}?style=${style}`;

    return `<iframe src="${embedUrl}" width="100%" height="${style === 'full' ? '600' : '200'}" frameborder="0" allowfullscreen></iframe>`;
  },
};
