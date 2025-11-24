// Collaborative Editing Routes
// Real-time collaboration endpoints

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth, type AuthContext } from '../middleware/auth.js';
import { collaborationService } from '../services/collaboration.service.js';

export const collaborationRouter = new Hono<AuthContext>();

// ============ Session Management ============

// Join collaborative editing session
collaborationRouter.post(
  '/drafts/:draftId/join',
  requireAuth,
  async (c) => {
    const user = c.get('user')!;
    const draftId = c.req.param('draftId');
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const result = await collaborationService.joinSession(draftId, user.id, sessionId);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      success: true,
      sessionId,
      session: {
        id: result.session!.id,
        startedAt: result.session!.startedAt.toISOString(),
      },
      collaborators: result.collaborators?.map((c) => ({
        sessionId: c.sessionId,
        userName: c.userName,
        userImage: c.userImage,
        color: c.color,
        isActive: c.isActive,
      })),
      document: result.document ? {
        version: result.document.version,
        lastModified: result.document.lastModified.toISOString(),
      } : null,
    });
  }
);

// Leave collaborative editing session
collaborationRouter.post(
  '/drafts/:draftId/leave',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId } = c.req.valid('json');

    await collaborationService.leaveSession(draftId, sessionId);

    return c.json({ success: true });
  }
);

// Get active collaborators
collaborationRouter.get('/drafts/:draftId/collaborators', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const collaborators = await collaborationService.getCollaborators(draftId);

  return c.json({
    success: true,
    collaborators: collaborators.map((collab) => ({
      sessionId: collab.sessionId,
      userName: collab.userName,
      userImage: collab.userImage,
      color: collab.color,
      cursor: collab.cursor,
      selection: collab.selection,
      isActive: collab.isActive,
      lastActivity: collab.lastActivity.toISOString(),
    })),
  });
});

// ============ Presence Updates ============

// Update cursor position
collaborationRouter.post(
  '/drafts/:draftId/cursor',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
      cursor: z.object({
        blockIndex: z.number(),
        offset: z.number(),
      }),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId, cursor } = c.req.valid('json');

    await collaborationService.updateCursor(draftId, sessionId, cursor);

    return c.json({ success: true });
  }
);

// Update selection
collaborationRouter.post(
  '/drafts/:draftId/selection',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
      selection: z.object({
        startBlock: z.number(),
        startOffset: z.number(),
        endBlock: z.number(),
        endOffset: z.number(),
      }).nullable(),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId, selection } = c.req.valid('json');

    await collaborationService.updateSelection(draftId, sessionId, selection);

    return c.json({ success: true });
  }
);

// Heartbeat
collaborationRouter.post(
  '/drafts/:draftId/heartbeat',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId } = c.req.valid('json');

    await collaborationService.heartbeat(draftId, sessionId);

    return c.json({ success: true });
  }
);

// ============ Operations ============

// Apply operation
collaborationRouter.post(
  '/drafts/:draftId/operations',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
      operation: z.object({
        type: z.enum(['insert', 'delete', 'update', 'move']),
        blockIndex: z.number(),
        data: z.record(z.unknown()),
        userId: z.string(),
      }),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId, operation } = c.req.valid('json');

    const result = await collaborationService.applyOperation(draftId, sessionId, operation);

    if (!result.success) {
      return c.json({ error: 'Failed to apply operation' }, 400);
    }

    return c.json({
      success: true,
      operation: result.operation ? {
        id: result.operation.id,
        version: result.operation.version,
        timestamp: result.operation.timestamp,
      } : null,
      hadConflicts: (result.conflicts?.length || 0) > 0,
    });
  }
);

// Batch apply operations
collaborationRouter.post(
  '/drafts/:draftId/operations/batch',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
      operations: z.array(z.object({
        type: z.enum(['insert', 'delete', 'update', 'move']),
        blockIndex: z.number(),
        data: z.record(z.unknown()),
        userId: z.string(),
      })),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId, operations } = c.req.valid('json');

    const result = await collaborationService.applyOperationBatch(draftId, sessionId, operations);

    return c.json({
      success: result.success,
      operationsApplied: result.operations?.length || 0,
    });
  }
);

// Sync document state
collaborationRouter.get('/drafts/:draftId/sync', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const clientVersionStr = c.req.query('version');
  const clientVersion = clientVersionStr ? parseInt(clientVersionStr, 10) : 0;

  const sync = await collaborationService.syncDocumentState(draftId, clientVersion);

  return c.json({
    success: true,
    needsSync: sync.needsSync,
    currentVersion: sync.currentVersion,
    operations: sync.operations?.map((op) => ({
      id: op.id,
      type: op.type,
      blockIndex: op.blockIndex,
      data: op.data,
      version: op.version,
      timestamp: op.timestamp,
    })),
  });
});

// ============ Block Locking ============

// Lock block
collaborationRouter.post(
  '/drafts/:draftId/lock',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
      blockIndex: z.number(),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId, blockIndex } = c.req.valid('json');

    const result = await collaborationService.lockBlock(draftId, sessionId, blockIndex);

    return c.json({
      success: result.success,
      lockedBy: result.lockedBy,
    });
  }
);

// Unlock block
collaborationRouter.post(
  '/drafts/:draftId/unlock',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
      blockIndex: z.number(),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId, blockIndex } = c.req.valid('json');

    await collaborationService.unlockBlock(draftId, sessionId, blockIndex);

    return c.json({ success: true });
  }
);

// ============ Inline Comments ============

// Add inline comment
collaborationRouter.post(
  '/drafts/:draftId/comments',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
      blockIndex: z.number(),
      text: z.string().min(1).max(1000),
      selection: z.object({
        startBlock: z.number(),
        startOffset: z.number(),
        endBlock: z.number(),
        endOffset: z.number(),
      }).optional(),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const { sessionId, blockIndex, text, selection } = c.req.valid('json');

    const result = await collaborationService.addInlineComment(
      draftId,
      sessionId,
      blockIndex,
      text,
      selection
    );

    if (!result.success) {
      return c.json({ error: 'Failed to add comment' }, 400);
    }

    return c.json({
      success: true,
      commentId: result.commentId,
    }, 201);
  }
);

// Resolve inline comment
collaborationRouter.post(
  '/drafts/:draftId/comments/:commentId/resolve',
  requireAuth,
  zValidator(
    'json',
    z.object({
      sessionId: z.string(),
    })
  ),
  async (c) => {
    const draftId = c.req.param('draftId');
    const commentId = c.req.param('commentId');
    const { sessionId } = c.req.valid('json');

    await collaborationService.resolveInlineComment(draftId, sessionId, commentId);

    return c.json({ success: true });
  }
);

// ============ Statistics ============

// Get session statistics
collaborationRouter.get('/session/:sessionId/stats', requireAuth, async (c) => {
  const sessionId = c.req.param('sessionId');
  const stats = await collaborationService.getSessionStats(sessionId);

  if (!stats) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    success: true,
    stats: {
      duration: stats.duration,
      durationFormatted: `${Math.floor(stats.duration / 60000)}m ${Math.floor((stats.duration % 60000) / 1000)}s`,
      operationCount: stats.operationCount,
    },
  });
});

// Get draft collaboration statistics
collaborationRouter.get('/drafts/:draftId/stats', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const stats = await collaborationService.getDraftCollaborationStats(draftId);

  return c.json({
    success: true,
    stats,
  });
});
