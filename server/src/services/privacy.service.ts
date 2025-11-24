// Privacy Service
// Handles user blocking, muting, and privacy controls

import { eq, and, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userBlocks, userMutes, follows } from '../db/schema.js';
import { logger } from '../config/logger.js';

type MuteType = 'posts' | 'comments' | 'all';

interface MuteOptions {
  type?: MuteType;
  durationHours?: number;
}

export const privacyService = {
  // Block a user
  async blockUser(blockerId: string, blockedId: string): Promise<{ success: boolean }> {
    if (blockerId === blockedId) {
      throw new Error('Cannot block yourself');
    }

    await db.transaction(async (tx) => {
      // Create block record
      await tx
        .insert(userBlocks)
        .values({ blockerId, blockedId })
        .onConflictDoNothing();

      // Remove any existing follow relationships (both directions)
      await tx.delete(follows).where(
        or(
          and(eq(follows.followerId, blockerId), eq(follows.followingId, blockedId)),
          and(eq(follows.followerId, blockedId), eq(follows.followingId, blockerId))
        )
      );
    });

    logger.info({ blockerId, blockedId }, 'User blocked');
    return { success: true };
  },

  // Unblock a user
  async unblockUser(blockerId: string, blockedId: string): Promise<{ success: boolean }> {
    await db.delete(userBlocks).where(
      and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId))
    );

    logger.info({ blockerId, blockedId }, 'User unblocked');
    return { success: true };
  },

  // Mute a user
  async muteUser(muterId: string, mutedId: string, options?: MuteOptions): Promise<{ success: boolean }> {
    if (muterId === mutedId) {
      throw new Error('Cannot mute yourself');
    }

    const expiresAt = options?.durationHours
      ? new Date(Date.now() + options.durationHours * 60 * 60 * 1000)
      : null;

    await db
      .insert(userMutes)
      .values({
        muterId,
        mutedId,
        muteType: options?.type || 'all',
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [userMutes.muterId, userMutes.mutedId],
        set: {
          muteType: options?.type || 'all',
          expiresAt,
        },
      });

    logger.info({ muterId, mutedId, type: options?.type }, 'User muted');
    return { success: true };
  },

  // Unmute a user
  async unmuteUser(muterId: string, mutedId: string): Promise<{ success: boolean }> {
    await db.delete(userMutes).where(
      and(eq(userMutes.muterId, muterId), eq(userMutes.mutedId, mutedId))
    );

    logger.info({ muterId, mutedId }, 'User unmuted');
    return { success: true };
  },

  // Check if user is blocked (in either direction)
  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    const [block] = await db
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedId, userId2)),
          and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedId, userId1))
        )
      );
    return !!block;
  },

  // Check if user is muted
  async isMuted(muterId: string, mutedId: string, type?: MuteType): Promise<boolean> {
    const conditions = [
      eq(userMutes.muterId, muterId),
      eq(userMutes.mutedId, mutedId),
    ];

    const [mute] = await db
      .select({ id: userMutes.id, muteType: userMutes.muteType, expiresAt: userMutes.expiresAt })
      .from(userMutes)
      .where(and(...conditions));

    if (!mute) return false;

    // Check expiration
    if (mute.expiresAt && new Date(mute.expiresAt) < new Date()) {
      // Mute expired, clean it up
      await this.unmuteUser(muterId, mutedId);
      return false;
    }

    // Check type match
    if (type && mute.muteType !== 'all' && mute.muteType !== type) {
      return false;
    }

    return true;
  },

  // Get list of blocked user IDs (for filtering content)
  async getBlockedUserIds(userId: string): Promise<string[]> {
    const blocks = await db
      .select({ blockedId: userBlocks.blockedId })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, userId));

    const blockedBy = await db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(eq(userBlocks.blockedId, userId));

    return [...blocks.map((b) => b.blockedId), ...blockedBy.map((b) => b.blockerId)];
  },

  // Get list of muted user IDs
  async getMutedUserIds(userId: string, type?: MuteType): Promise<string[]> {
    const mutes = await db
      .select({ mutedId: userMutes.mutedId, muteType: userMutes.muteType, expiresAt: userMutes.expiresAt })
      .from(userMutes)
      .where(eq(userMutes.muterId, userId));

    const now = new Date();
    return mutes
      .filter((m) => {
        // Check expiration
        if (m.expiresAt && new Date(m.expiresAt) < now) return false;
        // Check type match
        if (type && m.muteType !== 'all' && m.muteType !== type) return false;
        return true;
      })
      .map((m) => m.mutedId);
  },

  // Get combined list of users to exclude from content
  async getExcludedUserIds(userId: string, muteType?: MuteType): Promise<string[]> {
    const [blockedIds, mutedIds] = await Promise.all([
      this.getBlockedUserIds(userId),
      this.getMutedUserIds(userId, muteType),
    ]);
    return [...new Set([...blockedIds, ...mutedIds])];
  },

  // Get user's block list
  async getBlockList(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const blocks = await db
      .select({
        blockedId: userBlocks.blockedId,
        createdAt: userBlocks.createdAt,
      })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, userId))
      .orderBy(userBlocks.createdAt)
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, userId));

    return {
      blocks,
      total: Number(countResult?.count || 0),
    };
  },

  // Get user's mute list
  async getMuteList(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const mutes = await db
      .select({
        mutedId: userMutes.mutedId,
        muteType: userMutes.muteType,
        expiresAt: userMutes.expiresAt,
        createdAt: userMutes.createdAt,
      })
      .from(userMutes)
      .where(eq(userMutes.muterId, userId))
      .orderBy(userMutes.createdAt)
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userMutes)
      .where(eq(userMutes.muterId, userId));

    return {
      mutes,
      total: Number(countResult?.count || 0),
    };
  },

  // Clean up expired mutes (run periodically)
  async cleanupExpiredMutes(): Promise<number> {
    const result = await db
      .delete(userMutes)
      .where(sql`${userMutes.expiresAt} IS NOT NULL AND ${userMutes.expiresAt} < NOW()`)
      .returning({ id: userMutes.id });

    if (result.length > 0) {
      logger.info({ count: result.length }, 'Expired mutes cleaned up');
    }
    return result.length;
  },
};
