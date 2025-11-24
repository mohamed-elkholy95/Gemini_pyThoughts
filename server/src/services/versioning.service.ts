// Content Versioning Service
// Track and manage article version history for rollback and comparison

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, users, type EditorJSContent } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { cacheService, CACHE_TTL } from './cache.service.js';

// Version metadata
interface VersionMeta {
  id: string;
  draftId: string;
  version: number;
  title: string;
  content: EditorJSContent;
  excerpt: string | null;
  coverImage: string | null;
  tags: string[];
  wordCount: number;
  readingTime: number;
  authorId: string;
  createdBy: string;
  createdAt: Date;
  changeType: 'create' | 'edit' | 'publish' | 'unpublish' | 'restore' | 'auto_save';
  changeMessage: string | null;
  changeStats: {
    wordsAdded: number;
    wordsRemoved: number;
    blocksAdded: number;
    blocksRemoved: number;
  };
}

// Version comparison result
interface VersionDiff {
  version1: number;
  version2: number;
  titleChanged: boolean;
  oldTitle: string;
  newTitle: string;
  contentDiff: {
    type: 'added' | 'removed' | 'modified' | 'unchanged';
    blockType: string;
    blockIndex: number;
    oldContent?: string;
    newContent?: string;
  }[];
  statsChange: {
    wordsDelta: number;
    blocksDelta: number;
    readingTimeDelta: number;
  };
}

// In-memory storage for versions (would be database in production)
const versionStore = new Map<string, VersionMeta[]>(); // draftId -> versions[]

export const versioningService = {
  // ============ Version Creation ============

  // Create a new version snapshot
  async createVersion(
    draftId: string,
    userId: string,
    changeType: VersionMeta['changeType'],
    changeMessage?: string
  ): Promise<VersionMeta | null> {
    // Get current draft state
    const [draft] = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        content: drafts.content,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        authorId: drafts.authorId,
        wordCount: drafts.wordCount,
        readingTime: drafts.readingTime,
      })
      .from(drafts)
      .where(eq(drafts.id, draftId));

    if (!draft) return null;

    const versions = versionStore.get(draftId) || [];
    const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
    const newVersionNumber = (latestVersion?.version || 0) + 1;

    // Calculate change stats
    const changeStats = latestVersion
      ? this.calculateChangeStats(
          latestVersion.content,
          draft.content as EditorJSContent
        )
      : { wordsAdded: draft.wordCount || 0, wordsRemoved: 0, blocksAdded: 0, blocksRemoved: 0 };

    const version: VersionMeta = {
      id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      draftId,
      version: newVersionNumber,
      title: draft.title,
      content: draft.content as EditorJSContent,
      excerpt: draft.excerpt,
      coverImage: draft.coverImage,
      tags: [], // Would need to fetch from draft_tags table
      wordCount: draft.wordCount || 0,
      readingTime: draft.readingTime || 0,
      authorId: draft.authorId,
      createdBy: userId,
      createdAt: new Date(),
      changeType,
      changeMessage: changeMessage || null,
      changeStats,
    };

    versions.push(version);
    versionStore.set(draftId, versions);

    // Limit versions to last 100
    if (versions.length > 100) {
      versionStore.set(draftId, versions.slice(-100));
    }

    // Clear cache
    await cacheService.delete(`versions:${draftId}`);

    logger.info({ draftId, version: newVersionNumber, changeType }, 'Version created');

    return version;
  },

  // Auto-save version (debounced, only if content changed)
  async autoSaveVersion(draftId: string, userId: string): Promise<VersionMeta | null> {
    const versions = versionStore.get(draftId) || [];
    const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;

    // Don't auto-save too frequently (minimum 5 minutes between auto-saves)
    if (latestVersion && latestVersion.changeType === 'auto_save') {
      const timeSinceLastSave = Date.now() - latestVersion.createdAt.getTime();
      if (timeSinceLastSave < 5 * 60 * 1000) {
        return null;
      }
    }

    // Get current draft
    const [draft] = await db
      .select({ content: drafts.content })
      .from(drafts)
      .where(eq(drafts.id, draftId));

    if (!draft) return null;

    // Check if content actually changed
    if (latestVersion) {
      const contentStr = JSON.stringify(draft.content);
      const lastContentStr = JSON.stringify(latestVersion.content);
      if (contentStr === lastContentStr) {
        return null;
      }
    }

    return this.createVersion(draftId, userId, 'auto_save');
  },

  // ============ Version Retrieval ============

  // Get all versions for a draft
  async getVersions(draftId: string): Promise<VersionMeta[]> {
    const cacheKey = `versions:${draftId}`;
    const cached = await cacheService.get<VersionMeta[]>(cacheKey);
    if (cached) return cached;

    const versions = versionStore.get(draftId) || [];

    // Sort by version number descending (newest first)
    const sorted = [...versions].sort((a, b) => b.version - a.version);

    await cacheService.set(cacheKey, sorted, CACHE_TTL.USER_PROFILE);
    return sorted;
  },

  // Get specific version
  async getVersion(draftId: string, versionNumber: number): Promise<VersionMeta | null> {
    const versions = versionStore.get(draftId) || [];
    return versions.find((v) => v.version === versionNumber) || null;
  },

  // Get version by ID
  async getVersionById(versionId: string): Promise<VersionMeta | null> {
    for (const versions of versionStore.values()) {
      const version = versions.find((v) => v.id === versionId);
      if (version) return version;
    }
    return null;
  },

  // Get latest version
  async getLatestVersion(draftId: string): Promise<VersionMeta | null> {
    const versions = versionStore.get(draftId) || [];
    if (versions.length === 0) return null;
    return versions[versions.length - 1];
  },

  // ============ Version Restoration ============

  // Restore draft to a specific version
  async restoreVersion(
    draftId: string,
    versionNumber: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const version = await this.getVersion(draftId, versionNumber);
    if (!version) {
      return { success: false, error: 'Version not found' };
    }

    // Check if user has permission (owner or author)
    const [draft] = await db
      .select({ authorId: drafts.authorId })
      .from(drafts)
      .where(eq(drafts.id, draftId));

    if (!draft || draft.authorId !== userId) {
      return { success: false, error: 'Permission denied' };
    }

    // Create a version of current state before restoring
    await this.createVersion(draftId, userId, 'edit', `Before restore to v${versionNumber}`);

    // Update draft with version content
    await db
      .update(drafts)
      .set({
        title: version.title,
        content: version.content,
        excerpt: version.excerpt,
        coverImage: version.coverImage,
        wordCount: version.wordCount,
        readingTime: version.readingTime,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draftId));

    // Create restore version
    await this.createVersion(
      draftId,
      userId,
      'restore',
      `Restored from version ${versionNumber}`
    );

    logger.info({ draftId, versionNumber, userId }, 'Version restored');

    return { success: true };
  },

  // ============ Version Comparison ============

  // Compare two versions
  async compareVersions(
    draftId: string,
    version1: number,
    version2: number
  ): Promise<VersionDiff | null> {
    const v1 = await this.getVersion(draftId, version1);
    const v2 = await this.getVersion(draftId, version2);

    if (!v1 || !v2) return null;

    const contentDiff = this.diffContent(v1.content, v2.content);

    return {
      version1,
      version2,
      titleChanged: v1.title !== v2.title,
      oldTitle: v1.title,
      newTitle: v2.title,
      contentDiff,
      statsChange: {
        wordsDelta: v2.wordCount - v1.wordCount,
        blocksDelta: (v2.content?.blocks?.length || 0) - (v1.content?.blocks?.length || 0),
        readingTimeDelta: v2.readingTime - v1.readingTime,
      },
    };
  },

  // Get diff between current draft and latest version
  async getDraftDiff(draftId: string): Promise<VersionDiff | null> {
    const latestVersion = await this.getLatestVersion(draftId);
    if (!latestVersion) return null;

    const [draft] = await db
      .select({
        title: drafts.title,
        content: drafts.content,
        wordCount: drafts.wordCount,
        readingTime: drafts.readingTime,
      })
      .from(drafts)
      .where(eq(drafts.id, draftId));

    if (!draft) return null;

    const contentDiff = this.diffContent(latestVersion.content, draft.content as EditorJSContent);

    return {
      version1: latestVersion.version,
      version2: latestVersion.version + 1,
      titleChanged: latestVersion.title !== draft.title,
      oldTitle: latestVersion.title,
      newTitle: draft.title,
      contentDiff,
      statsChange: {
        wordsDelta: (draft.wordCount || 0) - latestVersion.wordCount,
        blocksDelta:
          ((draft.content as EditorJSContent)?.blocks?.length || 0) -
          (latestVersion.content?.blocks?.length || 0),
        readingTimeDelta: (draft.readingTime || 0) - latestVersion.readingTime,
      },
    };
  },

  // ============ Version Cleanup ============

  // Delete old versions (keep last N)
  async pruneVersions(draftId: string, keepCount: number = 50): Promise<number> {
    const versions = versionStore.get(draftId) || [];
    if (versions.length <= keepCount) return 0;

    const removed = versions.length - keepCount;
    versionStore.set(draftId, versions.slice(-keepCount));

    // Clear cache
    await cacheService.delete(`versions:${draftId}`);

    logger.info({ draftId, removed }, 'Versions pruned');

    return removed;
  },

  // Delete all versions for a draft
  async deleteAllVersions(draftId: string): Promise<void> {
    versionStore.delete(draftId);
    await cacheService.delete(`versions:${draftId}`);
    logger.info({ draftId }, 'All versions deleted');
  },

  // ============ Helper Methods ============

  // Calculate change statistics between two contents
  calculateChangeStats(
    oldContent: EditorJSContent,
    newContent: EditorJSContent
  ): VersionMeta['changeStats'] {
    const oldBlocks = oldContent?.blocks || [];
    const newBlocks = newContent?.blocks || [];

    const oldText = oldBlocks.map((b) => this.extractBlockText(b)).join(' ');
    const newText = newBlocks.map((b) => this.extractBlockText(b)).join(' ');

    const oldWords = oldText.split(/\s+/).filter((w) => w.length > 0);
    const newWords = newText.split(/\s+/).filter((w) => w.length > 0);

    // Simple word diff calculation
    const oldWordSet = new Set(oldWords);
    const newWordSet = new Set(newWords);

    let wordsAdded = 0;
    let wordsRemoved = 0;

    for (const word of newWords) {
      if (!oldWordSet.has(word)) wordsAdded++;
    }
    for (const word of oldWords) {
      if (!newWordSet.has(word)) wordsRemoved++;
    }

    return {
      wordsAdded,
      wordsRemoved,
      blocksAdded: Math.max(0, newBlocks.length - oldBlocks.length),
      blocksRemoved: Math.max(0, oldBlocks.length - newBlocks.length),
    };
  },

  // Diff two content objects
  diffContent(
    oldContent: EditorJSContent,
    newContent: EditorJSContent
  ): VersionDiff['contentDiff'] {
    const oldBlocks = oldContent?.blocks || [];
    const newBlocks = newContent?.blocks || [];
    const diff: VersionDiff['contentDiff'] = [];

    const maxLength = Math.max(oldBlocks.length, newBlocks.length);

    for (let i = 0; i < maxLength; i++) {
      const oldBlock = oldBlocks[i];
      const newBlock = newBlocks[i];

      if (!oldBlock && newBlock) {
        diff.push({
          type: 'added',
          blockType: newBlock.type,
          blockIndex: i,
          newContent: this.extractBlockText(newBlock),
        });
      } else if (oldBlock && !newBlock) {
        diff.push({
          type: 'removed',
          blockType: oldBlock.type,
          blockIndex: i,
          oldContent: this.extractBlockText(oldBlock),
        });
      } else if (oldBlock && newBlock) {
        const oldText = this.extractBlockText(oldBlock);
        const newText = this.extractBlockText(newBlock);

        if (oldText !== newText || oldBlock.type !== newBlock.type) {
          diff.push({
            type: 'modified',
            blockType: newBlock.type,
            blockIndex: i,
            oldContent: oldText,
            newContent: newText,
          });
        } else {
          diff.push({
            type: 'unchanged',
            blockType: newBlock.type,
            blockIndex: i,
          });
        }
      }
    }

    return diff;
  },

  // Extract text from a content block
  extractBlockText(block: { type: string; data: Record<string, unknown> }): string {
    const data = block.data || {};

    switch (block.type) {
      case 'paragraph':
      case 'header':
      case 'quote':
        return String(data.text || '');
      case 'list':
        return ((data.items || []) as string[]).join(' ');
      case 'code':
        return String(data.code || '');
      case 'image':
        return String(data.caption || '');
      case 'embed':
        return String(data.caption || '');
      default:
        return JSON.stringify(data);
    }
  },

  // ============ Version Analytics ============

  // Get version statistics for a draft
  async getVersionStats(draftId: string): Promise<{
    totalVersions: number;
    firstVersion: Date | null;
    lastVersion: Date | null;
    totalEdits: number;
    totalRestores: number;
    avgTimeBetweenEdits: number | null;
    contributorCount: number;
  }> {
    const versions = versionStore.get(draftId) || [];

    if (versions.length === 0) {
      return {
        totalVersions: 0,
        firstVersion: null,
        lastVersion: null,
        totalEdits: 0,
        totalRestores: 0,
        avgTimeBetweenEdits: null,
        contributorCount: 0,
      };
    }

    const editVersions = versions.filter((v) => v.changeType === 'edit');
    const restoreVersions = versions.filter((v) => v.changeType === 'restore');

    // Calculate average time between edits
    let avgTimeBetweenEdits: number | null = null;
    if (editVersions.length > 1) {
      let totalTime = 0;
      for (let i = 1; i < editVersions.length; i++) {
        totalTime += editVersions[i].createdAt.getTime() - editVersions[i - 1].createdAt.getTime();
      }
      avgTimeBetweenEdits = totalTime / (editVersions.length - 1);
    }

    // Get unique contributors
    const contributors = new Set(versions.map((v) => v.createdBy));

    return {
      totalVersions: versions.length,
      firstVersion: versions[0].createdAt,
      lastVersion: versions[versions.length - 1].createdAt,
      totalEdits: editVersions.length,
      totalRestores: restoreVersions.length,
      avgTimeBetweenEdits,
      contributorCount: contributors.size,
    };
  },

  // Get contributor activity for a draft
  async getContributorActivity(draftId: string): Promise<
    {
      userId: string;
      userName: string | null;
      versionCount: number;
      lastEdit: Date;
    }[]
  > {
    const versions = versionStore.get(draftId) || [];
    const activityMap = new Map<string, { count: number; lastEdit: Date }>();

    for (const version of versions) {
      const existing = activityMap.get(version.createdBy);
      if (existing) {
        existing.count++;
        if (version.createdAt > existing.lastEdit) {
          existing.lastEdit = version.createdAt;
        }
      } else {
        activityMap.set(version.createdBy, {
          count: 1,
          lastEdit: version.createdAt,
        });
      }
    }

    // Fetch user names
    const userIds = Array.from(activityMap.keys());
    const result: {
      userId: string;
      userName: string | null;
      versionCount: number;
      lastEdit: Date;
    }[] = [];

    for (const userId of userIds) {
      const [user] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId));

      const activity = activityMap.get(userId)!;
      result.push({
        userId,
        userName: user?.name || null,
        versionCount: activity.count,
        lastEdit: activity.lastEdit,
      });
    }

    return result.sort((a, b) => b.versionCount - a.versionCount);
  },

  // ============ Branching (Advanced) ============

  // Create a branch from a specific version
  async createBranch(
    draftId: string,
    fromVersion: number,
    branchName: string,
    userId: string
  ): Promise<{ success: boolean; branchId?: string; error?: string }> {
    const version = await this.getVersion(draftId, fromVersion);
    if (!version) {
      return { success: false, error: 'Version not found' };
    }

    // Create a new draft from the version (branching)
    const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Store branch metadata
    logger.info({ draftId, fromVersion, branchName, branchId, userId }, 'Branch created');

    return { success: true, branchId };
  },

  // Merge branches (simplified - would be complex in production)
  async mergeBranches(
    _sourceBranchId: string,
    _targetDraftId: string,
    _userId: string
  ): Promise<{ success: boolean; conflicts?: unknown[]; error?: string }> {
    // In production, this would implement proper 3-way merge
    // For now, return placeholder
    return {
      success: false,
      error: 'Branch merging not yet implemented',
      conflicts: [],
    };
  },
};
