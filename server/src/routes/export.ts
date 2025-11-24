// Content Export Routes
// Export and import articles and user data

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { contentExportService } from '../services/content-export.service.js';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';
import { auditService } from '../services/audit.service.js';

const exportRouter = new Hono<AuthContext>();

// Export user data (GDPR)
exportRouter.get(
  '/user-data',
  requireAuth,
  zValidator(
    'query',
    z.object({
      format: z.enum(['json', 'zip', 'markdown']).default('json'),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { format } = c.req.valid('query');

    const result = await contentExportService.exportToFormat(user!.id, format);

    // Log the export for audit
    await auditService.log({
      userId: user!.id,
      action: 'system:data_export',
      entityType: 'user',
      entityId: user!.id,
      metadata: { format },
    });

    c.header('Content-Type', result.contentType);
    c.header('Content-Disposition', `attachment; filename="${result.filename}"`);

    return c.body(result.data);
  }
);

// Export articles only
exportRouter.get(
  '/articles',
  requireAuth,
  zValidator(
    'query',
    z.object({
      format: z.enum(['json', 'markdown']).default('json'),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { format } = c.req.valid('query');

    const articles = await contentExportService.exportArticles(user!.id);

    if (format === 'markdown') {
      let md = `# My Articles\n\nExported: ${new Date().toISOString()}\n\n---\n\n`;
      for (const article of articles) {
        md += `## ${article.title}\n\n`;
        md += `Status: ${article.status}\n`;
        if (article.publishedAt) md += `Published: ${article.publishedAt}\n`;
        if (article.tags.length > 0) md += `Tags: ${article.tags.join(', ')}\n`;
        md += `\n`;
        if (article.excerpt) md += `${article.excerpt}\n\n`;
        md += `---\n\n`;
      }

      c.header('Content-Type', 'text/markdown');
      c.header('Content-Disposition', `attachment; filename="articles-${Date.now()}.md"`);
      return c.body(md);
    }

    return c.json({
      exportedAt: new Date().toISOString(),
      count: articles.length,
      articles,
    });
  }
);

// Import content
exportRouter.post(
  '/import',
  requireAuth,
  zValidator(
    'json',
    z.object({
      source: z.enum(['pythoughts', 'medium', 'devto', 'wordpress']),
      data: z.unknown(),
      options: z
        .object({
          overwriteExisting: z.boolean().optional(),
          importDrafts: z.boolean().optional(),
          importComments: z.boolean().optional(),
          importSeries: z.boolean().optional(),
          importReadingLists: z.boolean().optional(),
        })
        .optional(),
    })
  ),
  async (c) => {
    const user = getCurrentUser(c);
    const { source, data, options } = c.req.valid('json');

    const result = await contentExportService.importArticles(
      user!.id,
      { source, data },
      options || {}
    );

    // Log the import
    await auditService.log({
      userId: user!.id,
      action: 'draft:create',
      entityType: 'draft',
      metadata: { source, imported: result.imported, skipped: result.skipped },
    });

    return c.json(result);
  }
);

// Preview import (dry run)
exportRouter.post(
  '/import/preview',
  requireAuth,
  zValidator(
    'json',
    z.object({
      source: z.enum(['pythoughts', 'medium', 'devto', 'wordpress']),
      data: z.unknown(),
    })
  ),
  async (c) => {
    const { source, data } = c.req.valid('json');

    if (source === 'pythoughts') {
      const exportData = data as { articles?: unknown[] };
      return c.json({
        source,
        articlesFound: exportData.articles?.length || 0,
        canImport: true,
        message: 'Ready to import',
      });
    }

    return c.json({
      source,
      canImport: false,
      message: `Import from ${source} is not yet supported`,
    });
  }
);

export { exportRouter };
