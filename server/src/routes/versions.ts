// Version History Routes
// Manage article version history, comparison, and restoration

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth, type AuthContext } from '../middleware/auth.js';
import { versioningService } from '../services/versioning.service.js';

export const versionsRouter = new Hono<AuthContext>();

// ============ Version Retrieval ============

// Get all versions for a draft
versionsRouter.get('/drafts/:draftId/versions', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const versions = await versioningService.getVersions(draftId);

  return c.json({
    success: true,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      title: v.title,
      wordCount: v.wordCount,
      readingTime: v.readingTime,
      changeType: v.changeType,
      changeMessage: v.changeMessage,
      changeStats: v.changeStats,
      createdBy: v.createdBy,
      createdAt: v.createdAt.toISOString(),
    })),
  });
});

// Get specific version
versionsRouter.get('/drafts/:draftId/versions/:version', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const versionNumber = parseInt(c.req.param('version'), 10);

  if (isNaN(versionNumber)) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  const version = await versioningService.getVersion(draftId, versionNumber);
  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  return c.json({
    success: true,
    version: {
      id: version.id,
      version: version.version,
      title: version.title,
      content: version.content,
      excerpt: version.excerpt,
      coverImage: version.coverImage,
      tags: version.tags,
      wordCount: version.wordCount,
      readingTime: version.readingTime,
      changeType: version.changeType,
      changeMessage: version.changeMessage,
      changeStats: version.changeStats,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
    },
  });
});

// Get version statistics
versionsRouter.get('/drafts/:draftId/versions/stats', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const stats = await versioningService.getVersionStats(draftId);

  return c.json({
    success: true,
    stats: {
      totalVersions: stats.totalVersions,
      firstVersion: stats.firstVersion?.toISOString() || null,
      lastVersion: stats.lastVersion?.toISOString() || null,
      totalEdits: stats.totalEdits,
      totalRestores: stats.totalRestores,
      avgTimeBetweenEdits: stats.avgTimeBetweenEdits,
      contributorCount: stats.contributorCount,
    },
  });
});

// Get contributor activity
versionsRouter.get('/drafts/:draftId/versions/contributors', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const activity = await versioningService.getContributorActivity(draftId);

  return c.json({
    success: true,
    contributors: activity.map((a) => ({
      userId: a.userId,
      userName: a.userName,
      versionCount: a.versionCount,
      lastEdit: a.lastEdit.toISOString(),
    })),
  });
});

// ============ Version Creation ============

// Create manual version snapshot
versionsRouter.post(
  '/drafts/:draftId/versions',
  requireAuth,
  zValidator(
    'json',
    z.object({
      message: z.string().max(500).optional(),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const draftId = c.req.param('draftId');
    const { message } = c.req.valid('json');

    const version = await versioningService.createVersion(
      draftId,
      user.id,
      'edit',
      message
    );

    if (!version) {
      return c.json({ error: 'Failed to create version' }, 400);
    }

    return c.json({
      success: true,
      version: {
        id: version.id,
        version: version.version,
        createdAt: version.createdAt.toISOString(),
      },
    }, 201);
  }
);

// Auto-save version (called by editor)
versionsRouter.post('/drafts/:draftId/versions/autosave', requireAuth, async (c) => {
  const user = c.get('user')!;
  const draftId = c.req.param('draftId');

  const version = await versioningService.autoSaveVersion(draftId, user.id);

  if (!version) {
    return c.json({
      success: true,
      message: 'No changes to save or rate limited',
      saved: false,
    });
  }

  return c.json({
    success: true,
    saved: true,
    version: {
      id: version.id,
      version: version.version,
      createdAt: version.createdAt.toISOString(),
    },
  });
});

// ============ Version Restoration ============

// Restore draft to a specific version
versionsRouter.post(
  '/drafts/:draftId/versions/:version/restore',
  requireAuth,
  async (c) => {
    const user = c.get('user')!;
    const draftId = c.req.param('draftId');
    const versionNumber = parseInt(c.req.param('version'), 10);

    if (isNaN(versionNumber)) {
      return c.json({ error: 'Invalid version number' }, 400);
    }

    const result = await versioningService.restoreVersion(draftId, versionNumber, user.id);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      success: true,
      message: `Draft restored to version ${versionNumber}`,
    });
  }
);

// ============ Version Comparison ============

// Compare two versions
versionsRouter.get('/drafts/:draftId/versions/compare', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const from = parseInt(c.req.query('from') || '0', 10);
  const to = parseInt(c.req.query('to') || '0', 10);

  if (isNaN(from) || isNaN(to) || from <= 0 || to <= 0) {
    return c.json({ error: 'Invalid version numbers' }, 400);
  }

  const diff = await versioningService.compareVersions(draftId, from, to);
  if (!diff) {
    return c.json({ error: 'Versions not found' }, 404);
  }

  return c.json({
    success: true,
    diff: {
      version1: diff.version1,
      version2: diff.version2,
      titleChanged: diff.titleChanged,
      oldTitle: diff.oldTitle,
      newTitle: diff.newTitle,
      contentDiff: diff.contentDiff,
      statsChange: diff.statsChange,
    },
  });
});

// Get diff from current draft to latest version
versionsRouter.get('/drafts/:draftId/versions/diff', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const diff = await versioningService.getDraftDiff(draftId);

  if (!diff) {
    return c.json({
      success: true,
      hasDiff: false,
      message: 'No versions exist for this draft',
    });
  }

  const hasChanges =
    diff.titleChanged ||
    diff.contentDiff.some((d) => d.type !== 'unchanged') ||
    diff.statsChange.wordsDelta !== 0;

  return c.json({
    success: true,
    hasDiff: hasChanges,
    diff: hasChanges ? diff : null,
  });
});

// ============ Version Cleanup ============

// Prune old versions
versionsRouter.delete('/drafts/:draftId/versions/prune', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const keepStr = c.req.query('keep');
  const keep = keepStr ? parseInt(keepStr, 10) : 50;

  if (isNaN(keep) || keep < 1) {
    return c.json({ error: 'Invalid keep count' }, 400);
  }

  const removed = await versioningService.pruneVersions(draftId, keep);

  return c.json({
    success: true,
    removed,
    message: `Removed ${removed} old versions`,
  });
});

// ============ Branching (Advanced) ============

// Create branch from version
versionsRouter.post(
  '/drafts/:draftId/versions/:version/branch',
  requireAuth,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(100),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const draftId = c.req.param('draftId');
    const versionNumber = parseInt(c.req.param('version'), 10);
    const { name } = c.req.valid('json');

    if (isNaN(versionNumber)) {
      return c.json({ error: 'Invalid version number' }, 400);
    }

    const result = await versioningService.createBranch(
      draftId,
      versionNumber,
      name,
      user.id
    );

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      success: true,
      branchId: result.branchId,
    }, 201);
  }
);
