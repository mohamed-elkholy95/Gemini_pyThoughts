import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { db, drafts, draftVersions, draftTags, tags, type EditorJSContent, type Draft, type NewDraft } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import sanitizeHtml from 'sanitize-html';

interface CreateDraftInput {
  title?: string;
  content?: EditorJSContent;
  excerpt?: string;
  coverImage?: string;
  authorId: string;
}

interface UpdateDraftInput {
  title?: string;
  content?: EditorJSContent;
  excerpt?: string;
  coverImage?: string;
  status?: 'draft' | 'published' | 'archived';
  tagIds?: string[];
}

interface ListDraftsOptions {
  authorId?: string;
  status?: 'draft' | 'published' | 'archived';
  search?: string;
  page?: number;
  limit?: number;
  includeDeleted?: boolean;
}

// Calculate reading metrics from content
function calculateMetrics(content: EditorJSContent | null | undefined): { wordCount: number; readingTime: number } {
  if (!content?.blocks) {
    return { wordCount: 0, readingTime: 0 };
  }

  let text = '';
  for (const block of content.blocks) {
    if (block.type === 'paragraph' || block.type === 'header' || block.type === 'quote') {
      text += ' ' + (block.data.text || '');
    }
    if (block.type === 'list' && Array.isArray(block.data.items)) {
      text += ' ' + block.data.items.join(' ');
    }
  }

  // Strip HTML tags and count words
  const cleanText = text.replace(/<[^>]*>/g, '').trim();
  const words = cleanText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Average reading speed: 200 words per minute
  const readingTime = Math.ceil(wordCount / 200);

  return { wordCount, readingTime };
}

// Sanitize content blocks
function sanitizeContent(content: EditorJSContent | null | undefined): EditorJSContent | null {
  if (!content?.blocks) return null;

  const sanitizedBlocks = content.blocks.map((block) => {
    const sanitizedData = { ...block.data };

    // Sanitize text fields
    if (typeof sanitizedData.text === 'string') {
      sanitizedData.text = sanitizeHtml(sanitizedData.text, {
        allowedTags: ['b', 'i', 'em', 'strong', 'a', 'code', 'mark'],
        allowedAttributes: {
          a: ['href', 'target', 'rel'],
        },
      });
    }

    // Sanitize list items
    if (Array.isArray(sanitizedData.items)) {
      sanitizedData.items = sanitizedData.items.map((item: unknown) =>
        typeof item === 'string'
          ? sanitizeHtml(item, {
              allowedTags: ['b', 'i', 'em', 'strong', 'a', 'code'],
              allowedAttributes: { a: ['href'] },
            })
          : item
      );
    }

    return { ...block, data: sanitizedData };
  });

  return { ...content, blocks: sanitizedBlocks };
}

// Generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

export const draftService = {
  // Create a new draft
  async create(input: CreateDraftInput): Promise<Draft> {
    const sanitizedContent = sanitizeContent(input.content);
    const metrics = calculateMetrics(sanitizedContent);

    const [draft] = await db
      .insert(drafts)
      .values({
        title: input.title || 'Untitled',
        content: sanitizedContent,
        excerpt: input.excerpt,
        coverImage: input.coverImage,
        authorId: input.authorId,
        ...metrics,
      })
      .returning();

    logger.info({ draftId: draft.id, authorId: input.authorId }, 'Draft created');
    return draft;
  },

  // Get draft by ID
  async getById(id: string, authorId?: string): Promise<Draft> {
    const conditions = [eq(drafts.id, id), eq(drafts.isDeleted, false)];
    if (authorId) {
      conditions.push(eq(drafts.authorId, authorId));
    }

    const [draft] = await db
      .select()
      .from(drafts)
      .where(and(...conditions));

    if (!draft) {
      throw new AppError(404, 'Draft not found', 'DRAFT_NOT_FOUND');
    }

    return draft;
  },

  // Update draft with version control
  async update(id: string, authorId: string, input: UpdateDraftInput, createVersion = true): Promise<Draft> {
    // Get current draft
    const current = await this.getById(id, authorId);

    // Create version before update (if content changed)
    if (createVersion && input.content) {
      const [latestVersion] = await db
        .select({ version: draftVersions.version })
        .from(draftVersions)
        .where(eq(draftVersions.draftId, id))
        .orderBy(desc(draftVersions.version))
        .limit(1);

      const nextVersion = (latestVersion?.version || 0) + 1;

      await db.insert(draftVersions).values({
        draftId: id,
        version: nextVersion,
        title: current.title,
        content: current.content,
        authorId,
      });

      logger.info({ draftId: id, version: nextVersion }, 'Draft version created');
    }

    // Prepare update data
    const sanitizedContent = input.content ? sanitizeContent(input.content) : undefined;
    const metrics = sanitizedContent ? calculateMetrics(sanitizedContent) : {};

    const updateData: Partial<Draft> = {
      ...input,
      ...(sanitizedContent && { content: sanitizedContent }),
      ...metrics,
      updatedAt: new Date(),
    };

    // Handle publish
    if (input.status === 'published' && current.status !== 'published') {
      updateData.publishedAt = new Date();
      updateData.slug = generateSlug(input.title || current.title) + '-' + Date.now().toString(36);
    }

    // Update draft
    const [updated] = await db
      .update(drafts)
      .set(updateData)
      .where(and(eq(drafts.id, id), eq(drafts.authorId, authorId)))
      .returning();

    // Update tags if provided
    if (input.tagIds !== undefined) {
      await db.delete(draftTags).where(eq(draftTags.draftId, id));

      if (input.tagIds.length > 0) {
        await db.insert(draftTags).values(
          input.tagIds.map((tagId) => ({ draftId: id, tagId }))
        );
      }
    }

    logger.info({ draftId: id }, 'Draft updated');
    return updated;
  },

  // Auto-save (no version creation)
  async autoSave(id: string, authorId: string, content: EditorJSContent): Promise<Draft> {
    return this.update(id, authorId, { content }, false);
  },

  // List drafts with filtering
  async list(options: ListDraftsOptions = {}): Promise<{ drafts: Draft[]; total: number }> {
    const { authorId, status, search, page = 1, limit = 20, includeDeleted = false } = options;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (!includeDeleted) {
      conditions.push(eq(drafts.isDeleted, false));
    }
    if (authorId) {
      conditions.push(eq(drafts.authorId, authorId));
    }
    if (status) {
      conditions.push(eq(drafts.status, status));
    }
    if (search) {
      conditions.push(
        or(ilike(drafts.title, `%${search}%`), ilike(drafts.excerpt, `%${search}%`))
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [results, countResult] = await Promise.all([
      db
        .select()
        .from(drafts)
        .where(whereClause)
        .orderBy(desc(drafts.updatedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(drafts)
        .where(whereClause),
    ]);

    return {
      drafts: results,
      total: Number(countResult[0]?.count || 0),
    };
  },

  // Get draft versions
  async getVersions(draftId: string, authorId: string) {
    // Verify ownership
    await this.getById(draftId, authorId);

    return db
      .select()
      .from(draftVersions)
      .where(eq(draftVersions.draftId, draftId))
      .orderBy(desc(draftVersions.version));
  },

  // Restore from version
  async restoreVersion(draftId: string, versionId: string, authorId: string): Promise<Draft> {
    const [version] = await db
      .select()
      .from(draftVersions)
      .where(and(eq(draftVersions.id, versionId), eq(draftVersions.draftId, draftId)));

    if (!version) {
      throw new AppError(404, 'Version not found', 'VERSION_NOT_FOUND');
    }

    return this.update(draftId, authorId, {
      title: version.title,
      content: version.content || undefined,
    });
  },

  // Soft delete
  async delete(id: string, authorId: string): Promise<void> {
    const [result] = await db
      .update(drafts)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(and(eq(drafts.id, id), eq(drafts.authorId, authorId)))
      .returning({ id: drafts.id });

    if (!result) {
      throw new AppError(404, 'Draft not found', 'DRAFT_NOT_FOUND');
    }

    logger.info({ draftId: id }, 'Draft deleted');
  },

  // Restore deleted draft
  async restore(id: string, authorId: string): Promise<Draft> {
    const [draft] = await db
      .update(drafts)
      .set({ isDeleted: false, deletedAt: null })
      .where(and(eq(drafts.id, id), eq(drafts.authorId, authorId)))
      .returning();

    if (!draft) {
      throw new AppError(404, 'Draft not found', 'DRAFT_NOT_FOUND');
    }

    logger.info({ draftId: id }, 'Draft restored');
    return draft;
  },

  // Permanent delete
  async permanentDelete(id: string, authorId: string): Promise<void> {
    const [result] = await db
      .delete(drafts)
      .where(and(eq(drafts.id, id), eq(drafts.authorId, authorId), eq(drafts.isDeleted, true)))
      .returning({ id: drafts.id });

    if (!result) {
      throw new AppError(404, 'Draft not found or not in trash', 'DRAFT_NOT_FOUND');
    }

    logger.info({ draftId: id }, 'Draft permanently deleted');
  },
};

// Tag service
export const tagService = {
  async create(name: string, description?: string) {
    const slug = generateSlug(name);

    const [tag] = await db
      .insert(tags)
      .values({ name, slug, description })
      .onConflictDoUpdate({
        target: tags.slug,
        set: { name, description },
      })
      .returning();

    return tag;
  },

  async list() {
    return db.select().from(tags).orderBy(tags.name);
  },

  async getBySlug(slug: string) {
    const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
    return tag;
  },
};
