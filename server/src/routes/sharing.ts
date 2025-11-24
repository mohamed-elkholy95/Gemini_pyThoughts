// Sharing Routes
// Social sharing endpoints and oEmbed support

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { sharingService } from '../services/sharing.service.js';
import { optionalAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';

const sharingRouter = new Hono<AuthContext>();

// Get share links for an article
sharingRouter.get('/links/:articleId', async (c) => {
  const articleId = c.req.param('articleId');
  const links = await sharingService.getShareLinks(articleId);

  if (!links) {
    return c.json({ error: 'Article not found' }, 404);
  }

  return c.json({ links });
});

// Get share data for an article
sharingRouter.get('/data/:articleId', async (c) => {
  const articleId = c.req.param('articleId');
  const data = await sharingService.getShareData(articleId);

  if (!data) {
    return c.json({ error: 'Article not found' }, 404);
  }

  return c.json(data);
});

// Track a share event
sharingRouter.post(
  '/track/:articleId',
  optionalAuth,
  zValidator('json', z.object({ platform: z.string().min(1).max(50) })),
  async (c) => {
    const articleId = c.req.param('articleId');
    const { platform } = c.req.valid('json');
    const user = getCurrentUser(c);

    await sharingService.trackShare(articleId, platform, user?.id);

    return c.json({ success: true });
  }
);

// oEmbed endpoint
sharingRouter.get(
  '/oembed',
  zValidator(
    'query',
    z.object({
      url: z.string().url(),
      maxwidth: z.coerce.number().optional(),
      maxheight: z.coerce.number().optional(),
      format: z.enum(['json', 'xml']).default('json'),
    })
  ),
  async (c) => {
    const { url, maxwidth, maxheight, format } = c.req.valid('query');

    // Extract article ID from URL
    const match = url.match(/\/article\/([a-zA-Z0-9-]+)/);
    if (!match) {
      return c.json({ error: 'Invalid article URL' }, 400);
    }

    const articleId = match[1];
    const oembed = await sharingService.getOEmbed(articleId, maxwidth, maxheight);

    if (!oembed) {
      return c.json({ error: 'Article not found' }, 404);
    }

    if (format === 'xml') {
      c.header('Content-Type', 'application/xml');
      return c.body(`<?xml version="1.0" encoding="utf-8"?>
<oembed>
  <version>${oembed.version}</version>
  <type>${oembed.type}</type>
  <title>${sharingService.escapeHtml(oembed.title)}</title>
  <author_name>${sharingService.escapeHtml(oembed.author_name)}</author_name>
  <author_url>${oembed.author_url}</author_url>
  <provider_name>${oembed.provider_name}</provider_name>
  <provider_url>${oembed.provider_url}</provider_url>
  ${oembed.html ? `<html><![CDATA[${oembed.html}]]></html>` : ''}
  ${oembed.width ? `<width>${oembed.width}</width>` : ''}
  ${oembed.height ? `<height>${oembed.height}</height>` : ''}
  ${oembed.thumbnail_url ? `<thumbnail_url>${oembed.thumbnail_url}</thumbnail_url>` : ''}
</oembed>`);
    }

    return c.json(oembed);
  }
);

// Get embed code for an article
sharingRouter.get(
  '/embed-code/:articleId',
  zValidator('query', z.object({ style: z.enum(['card', 'minimal', 'full']).default('card') })),
  async (c) => {
    const articleId = c.req.param('articleId');
    const { style } = c.req.valid('query');

    const embedCode = sharingService.getEmbedCode(articleId, style);

    return c.json({ embedCode });
  }
);

// Get share statistics for an article
sharingRouter.get('/stats/:articleId', async (c) => {
  const articleId = c.req.param('articleId');
  const stats = await sharingService.getShareStats(articleId);

  return c.json(stats);
});

export { sharingRouter };
