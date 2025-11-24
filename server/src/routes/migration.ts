// Content Migration Routes
// Import content from external platforms

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth, type AuthContext } from '../middleware/auth.js';
import { migrationService } from '../services/migration.service.js';

export const migrationRouter = new Hono<AuthContext>();

// Get supported import sources
migrationRouter.get('/sources', requireAuth, async (c) => {
  const sources = migrationService.getSupportedSources();

  return c.json({
    success: true,
    sources,
  });
});

// Import from WordPress
migrationRouter.post(
  '/wordpress',
  requireAuth,
  zValidator(
    'json',
    z.object({
      xmlContent: z.string().min(1),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { xmlContent } = c.req.valid('json');

    const result = await migrationService.importFromWordPress(user.id, xmlContent);

    return c.json({
      success: result.success,
      result: {
        totalItems: result.totalItems,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
        importedIds: result.importedIds,
      },
    });
  }
);

// Import from Ghost
migrationRouter.post(
  '/ghost',
  requireAuth,
  zValidator(
    'json',
    z.object({
      jsonContent: z.string().min(1),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { jsonContent } = c.req.valid('json');

    const result = await migrationService.importFromGhost(user.id, jsonContent);

    return c.json({
      success: result.success,
      result: {
        totalItems: result.totalItems,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
        importedIds: result.importedIds,
      },
    });
  }
);

// Import from Medium
migrationRouter.post(
  '/medium',
  requireAuth,
  zValidator(
    'json',
    z.object({
      files: z.array(
        z.object({
          name: z.string(),
          content: z.string(),
        })
      ),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { files } = c.req.valid('json');

    const result = await migrationService.importFromMedium(user.id, files);

    return c.json({
      success: result.success,
      result: {
        totalItems: result.totalItems,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
        importedIds: result.importedIds,
      },
    });
  }
);

// Import from Markdown files
migrationRouter.post(
  '/markdown',
  requireAuth,
  zValidator(
    'json',
    z.object({
      files: z.array(
        z.object({
          name: z.string(),
          content: z.string(),
        })
      ),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { files } = c.req.valid('json');

    const result = await migrationService.importFromMarkdown(user.id, files);

    return c.json({
      success: result.success,
      result: {
        totalItems: result.totalItems,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
        importedIds: result.importedIds,
      },
    });
  }
);

// Import single Markdown file
migrationRouter.post(
  '/markdown/single',
  requireAuth,
  zValidator(
    'json',
    z.object({
      filename: z.string(),
      content: z.string().min(1),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { filename, content } = c.req.valid('json');

    const result = await migrationService.importFromMarkdown(user.id, [
      { name: filename.endsWith('.md') ? filename : `${filename}.md`, content },
    ]);

    return c.json({
      success: result.success && result.imported > 0,
      draftId: result.importedIds[0] || null,
      errors: result.errors,
    });
  }
);
