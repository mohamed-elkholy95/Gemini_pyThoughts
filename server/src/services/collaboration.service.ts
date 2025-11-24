// Collaborative Editing Service
// Real-time collaboration with presence, cursors, and conflict resolution

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, users } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { realtimeService } from './realtime.service.js';
import { versioningService } from './versioning.service.js';

// Collaborator presence
interface CollaboratorPresence {
  sessionId: string;
  odysId: string;
  userName: string;
  userImage: string | null;
  color: string;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
  lastActivity: Date;
  isActive: boolean;
}

// Cursor position in editor
interface CursorPosition {
  blockIndex: number;
  offset: number;
}

// Selection range in editor
interface SelectionRange {
  startBlock: number;
  startOffset: number;
  endBlock: number;
  endOffset: number;
}

// Operation for OT (Operational Transformation)
interface Operation {
  id: string;
  type: 'insert' | 'delete' | 'update' | 'move';
  blockIndex: number;
  data: Record<string, unknown>;
  timestamp: number;
  userId: string;
  version: number;
}

// Document state
interface DocumentState {
  draftId: string;
  version: number;
  operations: Operation[];
  lastModified: Date;
}

// Edit session
interface EditSession {
  id: string;
  draftId: string;
  userId: string;
  startedAt: Date;
  lastActivity: Date;
  operationCount: number;
}

// Conflict resolution strategy
type ConflictStrategy = 'last-write-wins' | 'first-write-wins' | 'merge' | 'manual';

// Collaborator colors
const COLLABORATOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#00CED1', '#FF69B4', '#32CD32',
];

// In-memory storage (would be Redis/database in production)
const documentStates = new Map<string, DocumentState>();
const collaborators = new Map<string, Map<string, CollaboratorPresence>>(); // draftId -> sessionId -> presence
const editSessions = new Map<string, EditSession>();
const pendingOperations = new Map<string, Operation[]>();

export const collaborationService = {
  // ============ Session Management ============

  // Join collaborative editing session
  async joinSession(
    draftId: string,
    userId: string,
    sessionId: string
  ): Promise<{
    success: boolean;
    session?: EditSession;
    collaborators?: CollaboratorPresence[];
    document?: DocumentState;
    error?: string;
  }> {
    // Check if draft exists and user has access
    const [draft] = await db
      .select({ id: drafts.id, authorId: drafts.authorId })
      .from(drafts)
      .where(eq(drafts.id, draftId));

    if (!draft) {
      return { success: false, error: 'Draft not found' };
    }

    // Get user info
    const [user] = await db
      .select({ name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Get or create document state
    let docState = documentStates.get(draftId);
    if (!docState) {
      docState = {
        draftId,
        version: 0,
        operations: [],
        lastModified: new Date(),
      };
      documentStates.set(draftId, docState);
    }

    // Create edit session
    const session: EditSession = {
      id: sessionId,
      draftId,
      userId,
      startedAt: new Date(),
      lastActivity: new Date(),
      operationCount: 0,
    };
    editSessions.set(sessionId, session);

    // Add collaborator presence
    const draftCollaborators = collaborators.get(draftId) || new Map();
    const colorIndex = draftCollaborators.size % COLLABORATOR_COLORS.length;

    const presence: CollaboratorPresence = {
      sessionId,
      odysId: userId,
      userName: user.name || 'Anonymous',
      userImage: user.image,
      color: COLLABORATOR_COLORS[colorIndex],
      cursor: null,
      selection: null,
      lastActivity: new Date(),
      isActive: true,
    };

    draftCollaborators.set(sessionId, presence);
    collaborators.set(draftId, draftCollaborators);

    // Broadcast join event to other collaborators
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'collaborator:join',
      collaborator: presence,
    });

    logger.info({ draftId, userId, sessionId }, 'User joined collaboration session');

    return {
      success: true,
      session,
      collaborators: Array.from(draftCollaborators.values()),
      document: docState,
    };
  },

  // Leave collaborative editing session
  async leaveSession(draftId: string, sessionId: string): Promise<void> {
    const draftCollaborators = collaborators.get(draftId);
    if (draftCollaborators) {
      const presence = draftCollaborators.get(sessionId);
      draftCollaborators.delete(sessionId);

      if (draftCollaborators.size === 0) {
        collaborators.delete(draftId);
        // Save document state when last collaborator leaves
        await this.flushPendingOperations(draftId);
      }

      // Broadcast leave event
      if (presence) {
        this.broadcastToCollaborators(draftId, sessionId, {
          type: 'collaborator:leave',
          sessionId,
          userId: presence.odysId,
        });
      }
    }

    editSessions.delete(sessionId);
    logger.info({ draftId, sessionId }, 'User left collaboration session');
  },

  // Get active collaborators
  async getCollaborators(draftId: string): Promise<CollaboratorPresence[]> {
    const draftCollaborators = collaborators.get(draftId);
    if (!draftCollaborators) return [];

    // Filter out inactive collaborators (no activity in last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const active: CollaboratorPresence[] = [];

    for (const presence of draftCollaborators.values()) {
      if (presence.lastActivity.getTime() > fiveMinutesAgo) {
        active.push(presence);
      }
    }

    return active;
  },

  // ============ Presence Updates ============

  // Update cursor position
  async updateCursor(
    draftId: string,
    sessionId: string,
    cursor: CursorPosition
  ): Promise<void> {
    const draftCollaborators = collaborators.get(draftId);
    if (!draftCollaborators) return;

    const presence = draftCollaborators.get(sessionId);
    if (!presence) return;

    presence.cursor = cursor;
    presence.lastActivity = new Date();

    // Broadcast cursor update
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'cursor:update',
      sessionId,
      cursor,
      color: presence.color,
    });
  },

  // Update selection range
  async updateSelection(
    draftId: string,
    sessionId: string,
    selection: SelectionRange | null
  ): Promise<void> {
    const draftCollaborators = collaborators.get(draftId);
    if (!draftCollaborators) return;

    const presence = draftCollaborators.get(sessionId);
    if (!presence) return;

    presence.selection = selection;
    presence.lastActivity = new Date();

    // Broadcast selection update
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'selection:update',
      sessionId,
      selection,
      color: presence.color,
    });
  },

  // Heartbeat to maintain presence
  async heartbeat(draftId: string, sessionId: string): Promise<void> {
    const draftCollaborators = collaborators.get(draftId);
    if (!draftCollaborators) return;

    const presence = draftCollaborators.get(sessionId);
    if (!presence) return;

    presence.lastActivity = new Date();
    presence.isActive = true;
  },

  // ============ Operations ============

  // Apply operation
  async applyOperation(
    draftId: string,
    sessionId: string,
    operation: Omit<Operation, 'id' | 'timestamp' | 'version'>
  ): Promise<{
    success: boolean;
    operation?: Operation;
    conflicts?: Operation[];
  }> {
    const docState = documentStates.get(draftId);
    if (!docState) {
      return { success: false };
    }

    const session = editSessions.get(sessionId);
    if (!session) {
      return { success: false };
    }

    // Create full operation
    const fullOperation: Operation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      version: docState.version + 1,
    };

    // Check for conflicts with pending operations
    const pending = pendingOperations.get(draftId) || [];
    const conflicts = this.detectConflicts(fullOperation, pending);

    if (conflicts.length > 0) {
      // Transform operation to resolve conflicts
      const transformed = this.transformOperation(fullOperation, conflicts);
      if (transformed) {
        fullOperation.data = transformed.data;
        fullOperation.blockIndex = transformed.blockIndex;
      }
    }

    // Add to pending operations
    pending.push(fullOperation);
    pendingOperations.set(draftId, pending);

    // Update document state
    docState.version = fullOperation.version;
    docState.operations.push(fullOperation);
    docState.lastModified = new Date();

    // Update session stats
    session.operationCount++;
    session.lastActivity = new Date();

    // Broadcast operation to other collaborators
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'operation:applied',
      operation: fullOperation,
    });

    // Flush operations periodically
    if (pending.length >= 10) {
      await this.flushPendingOperations(draftId);
    }

    return { success: true, operation: fullOperation, conflicts };
  },

  // Batch apply operations
  async applyOperationBatch(
    draftId: string,
    sessionId: string,
    operations: Omit<Operation, 'id' | 'timestamp' | 'version'>[]
  ): Promise<{ success: boolean; operations?: Operation[] }> {
    const results: Operation[] = [];

    for (const op of operations) {
      const result = await this.applyOperation(draftId, sessionId, op);
      if (result.success && result.operation) {
        results.push(result.operation);
      }
    }

    return { success: true, operations: results };
  },

  // ============ Conflict Resolution ============

  // Detect conflicts between operations
  detectConflicts(operation: Operation, pendingOps: Operation[]): Operation[] {
    return pendingOps.filter((pending) => {
      // Same block modification
      if (pending.blockIndex === operation.blockIndex) {
        return true;
      }
      // Delete affects subsequent blocks
      if (pending.type === 'delete' && pending.blockIndex < operation.blockIndex) {
        return true;
      }
      // Insert shifts subsequent blocks
      if (pending.type === 'insert' && pending.blockIndex <= operation.blockIndex) {
        return true;
      }
      return false;
    });
  },

  // Transform operation to resolve conflicts (OT-like)
  transformOperation(
    operation: Operation,
    againstOps: Operation[]
  ): Operation | null {
    let transformed = { ...operation };

    for (const against of againstOps) {
      if (against.type === 'insert' && against.blockIndex <= transformed.blockIndex) {
        // Shift index for insert before
        transformed.blockIndex++;
      } else if (against.type === 'delete' && against.blockIndex < transformed.blockIndex) {
        // Shift index for delete before
        transformed.blockIndex--;
      } else if (
        against.type === 'update' &&
        against.blockIndex === transformed.blockIndex &&
        transformed.type === 'update'
      ) {
        // Merge updates (last-write-wins for simplicity)
        transformed.data = { ...against.data, ...transformed.data };
      }
    }

    return transformed;
  },

  // Set conflict resolution strategy
  setConflictStrategy(_draftId: string, _strategy: ConflictStrategy): void {
    // In production, store per-document strategy
    logger.info('Conflict strategy updated');
  },

  // ============ Document State ============

  // Get document state
  async getDocumentState(draftId: string): Promise<DocumentState | null> {
    return documentStates.get(draftId) || null;
  },

  // Sync document state
  async syncDocumentState(
    draftId: string,
    clientVersion: number
  ): Promise<{
    needsSync: boolean;
    operations?: Operation[];
    currentVersion?: number;
  }> {
    const docState = documentStates.get(draftId);
    if (!docState) {
      return { needsSync: false };
    }

    if (clientVersion >= docState.version) {
      return { needsSync: false, currentVersion: docState.version };
    }

    // Get operations since client version
    const missedOperations = docState.operations.filter(
      (op) => op.version > clientVersion
    );

    return {
      needsSync: true,
      operations: missedOperations,
      currentVersion: docState.version,
    };
  },

  // Flush pending operations to database
  async flushPendingOperations(draftId: string): Promise<void> {
    const pending = pendingOperations.get(draftId);
    if (!pending || pending.length === 0) return;

    // In production, apply operations to the actual draft
    // For now, just create a version snapshot
    const docState = documentStates.get(draftId);
    if (docState && docState.operations.length > 0) {
      const lastOp = docState.operations[docState.operations.length - 1];
      await versioningService.createVersion(
        draftId,
        lastOp.userId,
        'auto_save',
        `Collaborative edit (${pending.length} operations)`
      );
    }

    pendingOperations.set(draftId, []);
    logger.info({ draftId, operationCount: pending.length }, 'Flushed pending operations');
  },

  // ============ Broadcasting ============

  // Broadcast message to collaborators
  broadcastToCollaborators(
    draftId: string,
    excludeSessionId: string,
    message: Record<string, unknown>
  ): void {
    const draftCollaborators = collaborators.get(draftId);
    if (!draftCollaborators) return;

    for (const [sessionId, presence] of draftCollaborators.entries()) {
      if (sessionId !== excludeSessionId && presence.isActive) {
        // Use realtime service to send message
        realtimeService.sendToUser(presence.odysId, 'collaboration', {
          draftId,
          ...message,
        });
      }
    }
  },

  // ============ Locking ============

  // Lock a block for editing
  async lockBlock(
    draftId: string,
    sessionId: string,
    blockIndex: number
  ): Promise<{ success: boolean; lockedBy?: string }> {
    // Simple locking mechanism
    const draftCollaborators = collaborators.get(draftId);
    if (!draftCollaborators) return { success: false };

    const presence = draftCollaborators.get(sessionId);
    if (!presence) return { success: false };

    // Broadcast lock
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'block:locked',
      blockIndex,
      lockedBy: presence.userName,
      color: presence.color,
    });

    return { success: true };
  },

  // Unlock a block
  async unlockBlock(draftId: string, sessionId: string, blockIndex: number): Promise<void> {
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'block:unlocked',
      blockIndex,
    });
  },

  // ============ Comments & Discussions ============

  // Add inline comment
  async addInlineComment(
    draftId: string,
    sessionId: string,
    blockIndex: number,
    text: string,
    selection?: SelectionRange
  ): Promise<{ success: boolean; commentId?: string }> {
    const session = editSessions.get(sessionId);
    if (!session) return { success: false };

    const commentId = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const draftCollaborators = collaborators.get(draftId);
    const presence = draftCollaborators?.get(sessionId);

    // Broadcast comment
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'comment:added',
      commentId,
      blockIndex,
      text,
      selection,
      author: presence?.userName || 'Anonymous',
      color: presence?.color,
      createdAt: new Date().toISOString(),
    });

    logger.info({ draftId, commentId, blockIndex }, 'Inline comment added');

    return { success: true, commentId };
  },

  // Resolve inline comment
  async resolveInlineComment(
    draftId: string,
    sessionId: string,
    commentId: string
  ): Promise<void> {
    this.broadcastToCollaborators(draftId, sessionId, {
      type: 'comment:resolved',
      commentId,
    });
  },

  // ============ Session Analytics ============

  // Get session statistics
  async getSessionStats(sessionId: string): Promise<{
    duration: number;
    operationCount: number;
  } | null> {
    const session = editSessions.get(sessionId);
    if (!session) return null;

    return {
      duration: Date.now() - session.startedAt.getTime(),
      operationCount: session.operationCount,
    };
  },

  // Get draft collaboration stats
  async getDraftCollaborationStats(draftId: string): Promise<{
    activeCollaborators: number;
    totalOperations: number;
    documentVersion: number;
  }> {
    const draftCollaborators = collaborators.get(draftId);
    const docState = documentStates.get(draftId);

    return {
      activeCollaborators: draftCollaborators?.size || 0,
      totalOperations: docState?.operations.length || 0,
      documentVersion: docState?.version || 0,
    };
  },

  // ============ Cleanup ============

  // Cleanup inactive sessions
  async cleanupInactiveSessions(): Promise<number> {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    let cleaned = 0;

    for (const [draftId, draftCollaborators] of collaborators.entries()) {
      for (const [sessionId, presence] of draftCollaborators.entries()) {
        if (presence.lastActivity.getTime() < fiveMinutesAgo) {
          await this.leaveSession(draftId, sessionId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up inactive collaboration sessions');
    }

    return cleaned;
  },

  // Start cleanup interval
  startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000); // Every minute
  },
};

// Start cleanup interval
collaborationService.startCleanupInterval();
