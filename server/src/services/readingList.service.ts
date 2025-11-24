// Reading Lists Service
// Allows users to create and manage curated reading lists

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { readingLists, readingListItems, drafts, users, type ReadingList } from '../db/schema.js';
import { logger } from '../config/logger.js';

interface CreateReadingListInput {
  name: string;
  description?: string;
  isPublic?: boolean;
  userId: string;
}

interface UpdateReadingListInput {
  name?: string;
  description?: string;
  isPublic?: boolean;
}

interface ReadingListWithItems extends ReadingList {
  items: Array<{
    draftId: string;
    title: string;
    slug: string | null;
    excerpt: string | null;
    coverImage: string | null;
    authorId: string;
    authorName: string;
    authorImage: string | null;
    note: string | null;
    addedAt: Date;
  }>;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
  itemCount: number;
}

export const readingListService = {
  // Create a new reading list
  async create(input: CreateReadingListInput): Promise<ReadingList> {
    const [created] = await db
      .insert(readingLists)
      .values({
        name: input.name,
        description: input.description,
        isPublic: input.isPublic ?? false,
        userId: input.userId,
      })
      .returning();

    logger.info({ listId: created.id, userId: input.userId }, 'Reading list created');
    return created;
  },

  // Get reading list by ID with items
  async getById(listId: string, requesterId?: string): Promise<ReadingListWithItems | null> {
    const [listData] = await db
      .select({
        id: readingLists.id,
        name: readingLists.name,
        description: readingLists.description,
        userId: readingLists.userId,
        isPublic: readingLists.isPublic,
        createdAt: readingLists.createdAt,
        updatedAt: readingLists.updatedAt,
        userName: users.name,
        userImage: users.image,
      })
      .from(readingLists)
      .innerJoin(users, eq(readingLists.userId, users.id))
      .where(eq(readingLists.id, listId));

    if (!listData) return null;

    // Check access - public or owned by requester
    if (!listData.isPublic && listData.userId !== requesterId) {
      return null;
    }

    // Get items with article details
    const items = await db
      .select({
        draftId: drafts.id,
        title: drafts.title,
        slug: drafts.slug,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
        authorId: drafts.authorId,
        authorName: users.name,
        authorImage: users.image,
        note: readingListItems.note,
        addedAt: readingListItems.addedAt,
      })
      .from(readingListItems)
      .innerJoin(drafts, eq(readingListItems.draftId, drafts.id))
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(
        and(
          eq(readingListItems.readingListId, listId),
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false)
        )
      )
      .orderBy(desc(readingListItems.addedAt));

    return {
      id: listData.id,
      name: listData.name,
      description: listData.description,
      userId: listData.userId,
      isPublic: listData.isPublic,
      createdAt: listData.createdAt,
      updatedAt: listData.updatedAt,
      user: {
        id: listData.userId,
        name: listData.userName,
        image: listData.userImage,
      },
      items,
      itemCount: items.length,
    };
  },

  // List user's reading lists
  async listByUser(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const lists = await db
      .select({
        id: readingLists.id,
        name: readingLists.name,
        description: readingLists.description,
        isPublic: readingLists.isPublic,
        createdAt: readingLists.createdAt,
      })
      .from(readingLists)
      .where(eq(readingLists.userId, userId))
      .orderBy(desc(readingLists.updatedAt))
      .limit(limit)
      .offset(offset);

    // Get item counts
    const listsWithCounts = await Promise.all(
      lists.map(async (list) => {
        const [count] = await db
          .select({ count: sql<number>`count(*)` })
          .from(readingListItems)
          .where(eq(readingListItems.readingListId, list.id));
        return { ...list, itemCount: Number(count?.count || 0) };
      })
    );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(readingLists)
      .where(eq(readingLists.userId, userId));

    return {
      lists: listsWithCounts,
      total: Number(countResult?.count || 0),
    };
  },

  // List public reading lists
  async listPublic(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const lists = await db
      .select({
        id: readingLists.id,
        name: readingLists.name,
        description: readingLists.description,
        userId: readingLists.userId,
        createdAt: readingLists.createdAt,
        userName: users.name,
        userImage: users.image,
      })
      .from(readingLists)
      .innerJoin(users, eq(readingLists.userId, users.id))
      .where(eq(readingLists.isPublic, true))
      .orderBy(desc(readingLists.createdAt))
      .limit(limit)
      .offset(offset);

    // Get item counts
    const listsWithCounts = await Promise.all(
      lists.map(async (list) => {
        const [count] = await db
          .select({ count: sql<number>`count(*)` })
          .from(readingListItems)
          .where(eq(readingListItems.readingListId, list.id));
        return {
          ...list,
          user: { id: list.userId, name: list.userName, image: list.userImage },
          itemCount: Number(count?.count || 0),
        };
      })
    );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(readingLists)
      .where(eq(readingLists.isPublic, true));

    return {
      lists: listsWithCounts,
      total: Number(countResult?.count || 0),
    };
  },

  // Update reading list
  async update(listId: string, userId: string, input: UpdateReadingListInput): Promise<ReadingList | null> {
    const [updated] = await db
      .update(readingLists)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(and(eq(readingLists.id, listId), eq(readingLists.userId, userId)))
      .returning();

    return updated || null;
  },

  // Delete reading list
  async delete(listId: string, userId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(readingLists)
      .where(and(eq(readingLists.id, listId), eq(readingLists.userId, userId)))
      .returning({ id: readingLists.id });

    return !!deleted;
  },

  // Add article to reading list
  async addItem(listId: string, draftId: string, userId: string, note?: string): Promise<boolean> {
    // Verify ownership
    const [list] = await db
      .select({ userId: readingLists.userId })
      .from(readingLists)
      .where(eq(readingLists.id, listId));

    if (!list || list.userId !== userId) {
      return false;
    }

    // Verify article exists and is published
    const [article] = await db
      .select({ id: drafts.id })
      .from(drafts)
      .where(
        and(
          eq(drafts.id, draftId),
          eq(drafts.status, 'published'),
          eq(drafts.isDeleted, false)
        )
      );

    if (!article) {
      return false;
    }

    await db
      .insert(readingListItems)
      .values({
        readingListId: listId,
        draftId,
        note,
      })
      .onConflictDoNothing();

    // Update list timestamp
    await db
      .update(readingLists)
      .set({ updatedAt: new Date() })
      .where(eq(readingLists.id, listId));

    return true;
  },

  // Remove article from reading list
  async removeItem(listId: string, draftId: string, userId: string): Promise<boolean> {
    // Verify ownership
    const [list] = await db
      .select({ userId: readingLists.userId })
      .from(readingLists)
      .where(eq(readingLists.id, listId));

    if (!list || list.userId !== userId) {
      return false;
    }

    const [deleted] = await db
      .delete(readingListItems)
      .where(
        and(
          eq(readingListItems.readingListId, listId),
          eq(readingListItems.draftId, draftId)
        )
      )
      .returning({ readingListId: readingListItems.readingListId });

    return !!deleted;
  },

  // Update item note
  async updateItemNote(listId: string, draftId: string, userId: string, note: string | null): Promise<boolean> {
    // Verify ownership
    const [list] = await db
      .select({ userId: readingLists.userId })
      .from(readingLists)
      .where(eq(readingLists.id, listId));

    if (!list || list.userId !== userId) {
      return false;
    }

    const [updated] = await db
      .update(readingListItems)
      .set({ note })
      .where(
        and(
          eq(readingListItems.readingListId, listId),
          eq(readingListItems.draftId, draftId)
        )
      )
      .returning({ readingListId: readingListItems.readingListId });

    return !!updated;
  },

  // Check if article is in any of user's reading lists
  async getListsContainingArticle(draftId: string, userId: string) {
    const lists = await db
      .select({
        id: readingLists.id,
        name: readingLists.name,
      })
      .from(readingListItems)
      .innerJoin(readingLists, eq(readingListItems.readingListId, readingLists.id))
      .where(
        and(
          eq(readingListItems.draftId, draftId),
          eq(readingLists.userId, userId)
        )
      );

    return lists;
  },

  // Quick save: add to default "Saved" list or create it
  async quickSave(draftId: string, userId: string): Promise<boolean> {
    // Find or create default "Saved" list
    let [savedList] = await db
      .select({ id: readingLists.id })
      .from(readingLists)
      .where(
        and(
          eq(readingLists.userId, userId),
          eq(readingLists.name, 'Saved')
        )
      );

    if (!savedList) {
      const [created] = await db
        .insert(readingLists)
        .values({
          name: 'Saved',
          description: 'Quick saved articles',
          userId,
          isPublic: false,
        })
        .returning();
      savedList = created;
    }

    return this.addItem(savedList.id, draftId, userId);
  },
};
