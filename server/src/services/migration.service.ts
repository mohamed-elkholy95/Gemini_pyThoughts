// Content Migration Service
// Import content from WordPress, Ghost, Medium, and other platforms

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, tags, draftTags, type EditorJSContent } from '../db/schema.js';
import { logger } from '../config/logger.js';

// Generate unique ID
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Migration source types
type MigrationSource = 'wordpress' | 'ghost' | 'medium' | 'dev.to' | 'markdown' | 'html';

// Import result
interface ImportResult {
  success: boolean;
  totalItems: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: { item: string; error: string }[];
  importedIds: string[];
}

// WordPress export item
interface WordPressPost {
  title: string;
  content: string;
  excerpt: string;
  date: string;
  status: string;
  slug: string;
  categories: string[];
  tags: string[];
  author: string;
  featured_media?: string;
}

// Ghost export item
interface GhostPost {
  title: string;
  html: string;
  plaintext: string;
  slug: string;
  status: string;
  created_at: string;
  published_at: string;
  custom_excerpt: string;
  feature_image: string;
  tags: { name: string; slug: string }[];
}

// Medium export item
interface MediumPost {
  title: string;
  content: string;
  createdAt: string;
  tags: string[];
  canonicalUrl: string;
}

// Markdown import item
interface MarkdownPost {
  title: string;
  content: string;
  frontmatter?: {
    title?: string;
    date?: string;
    tags?: string[];
    excerpt?: string;
    coverImage?: string;
  };
}

export const migrationService = {
  // ============ WordPress Import ============

  // Import from WordPress XML export
  async importFromWordPress(
    userId: string,
    data: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      totalItems: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      importedIds: [],
    };

    try {
      // Parse WordPress XML (simplified - would use proper XML parser)
      const posts = this.parseWordPressXML(data);
      result.totalItems = posts.length;

      for (const post of posts) {
        try {
          const draftId = await this.createDraftFromWordPress(userId, post);
          if (draftId) {
            result.imported++;
            result.importedIds.push(draftId);
          } else {
            result.skipped++;
          }
        } catch (err) {
          result.failed++;
          result.errors.push({
            item: post.title,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    } catch (err) {
      result.success = false;
      result.errors.push({
        item: 'WordPress import',
        error: err instanceof Error ? err.message : 'Failed to parse WordPress export',
      });
    }

    logger.info({
      source: 'wordpress',
      imported: result.imported,
      failed: result.failed,
    }, 'WordPress import completed');

    return result;
  },

  // Parse WordPress XML export
  parseWordPressXML(xml: string): WordPressPost[] {
    const posts: WordPressPost[] = [];

    // Simple regex-based parsing (would use proper XML parser in production)
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];

      const getTagContent = (tag: string): string => {
        const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([^<]*)<\\/${tag}>`);
        const m = item.match(regex);
        return m ? (m[1] || m[2] || '').trim() : '';
      };

      const postType = getTagContent('wp:post_type');
      if (postType !== 'post' && postType !== '') continue;

      const status = getTagContent('wp:status');
      if (status === 'trash' || status === 'auto-draft') continue;

      posts.push({
        title: getTagContent('title'),
        content: getTagContent('content:encoded'),
        excerpt: getTagContent('excerpt:encoded'),
        date: getTagContent('wp:post_date'),
        status,
        slug: getTagContent('wp:post_name'),
        categories: [],
        tags: [],
        author: getTagContent('dc:creator'),
      });
    }

    return posts;
  },

  // Create draft from WordPress post
  async createDraftFromWordPress(
    userId: string,
    post: WordPressPost
  ): Promise<string | null> {
    if (!post.title && !post.content) return null;

    const content = this.htmlToEditorJS(post.content);
    const wordCount = this.countWords(post.content);

    const [draft] = await db
      .insert(drafts)
      .values({
        id: generateId(),
        authorId: userId,
        title: post.title || 'Untitled Import',
        content,
        excerpt: post.excerpt || null,
        slug: post.slug || null,
        status: 'draft',
        wordCount,
        readingTime: Math.ceil(wordCount / 200),
        createdAt: new Date(post.date || Date.now()),
        updatedAt: new Date(),
      })
      .returning({ id: drafts.id });

    // Import tags
    if (post.tags.length > 0) {
      await this.importTags(draft.id, post.tags);
    }

    return draft.id;
  },

  // ============ Ghost Import ============

  // Import from Ghost JSON export
  async importFromGhost(
    userId: string,
    data: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      totalItems: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      importedIds: [],
    };

    try {
      const ghostData = JSON.parse(data);
      const posts: GhostPost[] = ghostData.db?.[0]?.data?.posts || ghostData.posts || [];
      result.totalItems = posts.length;

      for (const post of posts) {
        try {
          const draftId = await this.createDraftFromGhost(userId, post);
          if (draftId) {
            result.imported++;
            result.importedIds.push(draftId);
          } else {
            result.skipped++;
          }
        } catch (err) {
          result.failed++;
          result.errors.push({
            item: post.title,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    } catch (err) {
      result.success = false;
      result.errors.push({
        item: 'Ghost import',
        error: err instanceof Error ? err.message : 'Failed to parse Ghost export',
      });
    }

    logger.info({
      source: 'ghost',
      imported: result.imported,
      failed: result.failed,
    }, 'Ghost import completed');

    return result;
  },

  // Create draft from Ghost post
  async createDraftFromGhost(
    userId: string,
    post: GhostPost
  ): Promise<string | null> {
    if (!post.title && !post.html) return null;

    const content = this.htmlToEditorJS(post.html || '');
    const wordCount = this.countWords(post.plaintext || post.html || '');

    const [draft] = await db
      .insert(drafts)
      .values({
        id: generateId(),
        authorId: userId,
        title: post.title || 'Untitled Import',
        content,
        excerpt: post.custom_excerpt || null,
        slug: post.slug || null,
        coverImage: post.feature_image || null,
        status: 'draft',
        wordCount,
        readingTime: Math.ceil(wordCount / 200),
        createdAt: new Date(post.created_at || Date.now()),
        updatedAt: new Date(),
      })
      .returning({ id: drafts.id });

    // Import tags
    if (post.tags?.length > 0) {
      await this.importTags(draft.id, post.tags.map((t) => t.name));
    }

    return draft.id;
  },

  // ============ Medium Import ============

  // Import from Medium export (HTML files)
  async importFromMedium(
    userId: string,
    files: { name: string; content: string }[]
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      totalItems: files.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      importedIds: [],
    };

    for (const file of files) {
      try {
        // Skip non-post files
        if (!file.name.endsWith('.html') || file.name.includes('index')) {
          result.skipped++;
          continue;
        }

        const post = this.parseMediumHTML(file.content);
        const draftId = await this.createDraftFromMedium(userId, post);

        if (draftId) {
          result.imported++;
          result.importedIds.push(draftId);
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.failed++;
        result.errors.push({
          item: file.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    logger.info({
      source: 'medium',
      imported: result.imported,
      failed: result.failed,
    }, 'Medium import completed');

    return result;
  },

  // Parse Medium HTML export
  parseMediumHTML(html: string): MediumPost {
    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Extract body content
    const bodyMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/) ||
                      html.match(/<div class="section-content">([\s\S]*?)<\/div>/);
    const content = bodyMatch ? bodyMatch[1] : html;

    // Extract date
    const dateMatch = html.match(/datetime="([^"]+)"/);
    const createdAt = dateMatch ? dateMatch[1] : new Date().toISOString();

    // Extract tags
    const tagMatches = html.match(/<a[^>]*class="[^"]*p-tag[^"]*"[^>]*>([^<]+)<\/a>/g) || [];
    const tagsList = tagMatches.map((t) => {
      const m = t.match(/>([^<]+)</);
      return m ? m[1].trim() : '';
    }).filter(Boolean);

    return {
      title,
      content,
      createdAt,
      tags: tagsList,
      canonicalUrl: '',
    };
  },

  // Create draft from Medium post
  async createDraftFromMedium(
    userId: string,
    post: MediumPost
  ): Promise<string | null> {
    if (!post.title && !post.content) return null;

    const content = this.htmlToEditorJS(post.content);
    const wordCount = this.countWords(post.content);

    const [draft] = await db
      .insert(drafts)
      .values({
        id: generateId(),
        authorId: userId,
        title: post.title || 'Untitled Import',
        content,
        status: 'draft',
        wordCount,
        readingTime: Math.ceil(wordCount / 200),
        createdAt: new Date(post.createdAt || Date.now()),
        updatedAt: new Date(),
      })
      .returning({ id: drafts.id });

    // Import tags
    if (post.tags.length > 0) {
      await this.importTags(draft.id, post.tags);
    }

    return draft.id;
  },

  // ============ Markdown Import ============

  // Import from Markdown files
  async importFromMarkdown(
    userId: string,
    files: { name: string; content: string }[]
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      totalItems: files.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      importedIds: [],
    };

    for (const file of files) {
      try {
        if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
          result.skipped++;
          continue;
        }

        const post = this.parseMarkdown(file.content);
        const draftId = await this.createDraftFromMarkdown(userId, post);

        if (draftId) {
          result.imported++;
          result.importedIds.push(draftId);
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.failed++;
        result.errors.push({
          item: file.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    logger.info({
      source: 'markdown',
      imported: result.imported,
      failed: result.failed,
    }, 'Markdown import completed');

    return result;
  },

  // Parse Markdown with frontmatter
  parseMarkdown(markdown: string): MarkdownPost {
    let frontmatter: MarkdownPost['frontmatter'] = {};
    let content = markdown;

    // Parse YAML frontmatter
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      content = frontmatterMatch[2];

      // Simple YAML parsing
      const lines = yaml.split('\n');
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        if (key && value) {
          const cleanKey = key.trim().toLowerCase();
          if (cleanKey === 'title') {
            frontmatter.title = value.replace(/^["']|["']$/g, '');
          } else if (cleanKey === 'date') {
            frontmatter.date = value;
          } else if (cleanKey === 'tags') {
            frontmatter.tags = value
              .replace(/^\[|\]$/g, '')
              .split(',')
              .map((t) => t.trim().replace(/^["']|["']$/g, ''));
          } else if (cleanKey === 'excerpt' || cleanKey === 'description') {
            frontmatter.excerpt = value.replace(/^["']|["']$/g, '');
          } else if (cleanKey === 'cover' || cleanKey === 'image' || cleanKey === 'coverimage') {
            frontmatter.coverImage = value.replace(/^["']|["']$/g, '');
          }
        }
      }
    }

    // Extract title from first heading if not in frontmatter
    if (!frontmatter.title) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        frontmatter.title = titleMatch[1];
        content = content.replace(titleMatch[0], '').trim();
      }
    }

    return {
      title: frontmatter.title || 'Untitled',
      content,
      frontmatter,
    };
  },

  // Create draft from Markdown
  async createDraftFromMarkdown(
    userId: string,
    post: MarkdownPost
  ): Promise<string | null> {
    if (!post.title && !post.content) return null;

    const content = this.markdownToEditorJS(post.content);
    const wordCount = this.countWords(post.content);

    const [draft] = await db
      .insert(drafts)
      .values({
        id: generateId(),
        authorId: userId,
        title: post.title || post.frontmatter?.title || 'Untitled Import',
        content,
        excerpt: post.frontmatter?.excerpt || null,
        coverImage: post.frontmatter?.coverImage || null,
        status: 'draft',
        wordCount,
        readingTime: Math.ceil(wordCount / 200),
        createdAt: new Date(post.frontmatter?.date || Date.now()),
        updatedAt: new Date(),
      })
      .returning({ id: drafts.id });

    // Import tags
    if (post.frontmatter?.tags?.length) {
      await this.importTags(draft.id, post.frontmatter.tags);
    }

    return draft.id;
  },

  // ============ Conversion Utilities ============

  // Convert HTML to EditorJS format
  htmlToEditorJS(html: string): EditorJSContent {
    const blocks: EditorJSContent['blocks'] = [];

    // Split into blocks (simplified)
    const tempDiv = html
      .replace(/<\/p>/gi, '</p>\n')
      .replace(/<\/h[1-6]>/gi, (m) => `${m}\n`)
      .replace(/<\/li>/gi, '</li>\n')
      .replace(/<br\s*\/?>/gi, '\n');

    // Process each line/block
    const lines = tempDiv.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const trimmed = line.trim();

      // Headers
      const headerMatch = trimmed.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/i);
      if (headerMatch) {
        blocks.push({
          type: 'header',
          data: {
            text: this.stripHtml(headerMatch[2]),
            level: parseInt(headerMatch[1], 10),
          },
        });
        continue;
      }

      // Lists
      const listMatch = trimmed.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i);
      if (listMatch) {
        const items = listMatch[2].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
        blocks.push({
          type: 'list',
          data: {
            style: listMatch[1].toLowerCase() === 'ol' ? 'ordered' : 'unordered',
            items: items.map((item) => this.stripHtml(item.replace(/<\/?li[^>]*>/gi, ''))),
          },
        });
        continue;
      }

      // Code blocks
      const codeMatch = trimmed.match(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/i);
      if (codeMatch) {
        blocks.push({
          type: 'code',
          data: {
            code: this.decodeHtml(codeMatch[1]),
          },
        });
        continue;
      }

      // Blockquotes
      const quoteMatch = trimmed.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
      if (quoteMatch) {
        blocks.push({
          type: 'quote',
          data: {
            text: this.stripHtml(quoteMatch[1]),
          },
        });
        continue;
      }

      // Images
      const imgMatch = trimmed.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      if (imgMatch) {
        const altMatch = trimmed.match(/alt=["']([^"']*)["']/i);
        blocks.push({
          type: 'image',
          data: {
            file: { url: imgMatch[1] },
            caption: altMatch ? altMatch[1] : '',
          },
        });
        continue;
      }

      // Default: paragraph
      const text = this.stripHtml(trimmed);
      if (text) {
        blocks.push({
          type: 'paragraph',
          data: { text },
        });
      }
    }

    return { time: Date.now(), blocks, version: '2.29.1' };
  },

  // Convert Markdown to EditorJS format
  markdownToEditorJS(markdown: string): EditorJSContent {
    const blocks: EditorJSContent['blocks'] = [];
    const lines = markdown.split('\n');

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        blocks.push({
          type: 'header',
          data: {
            text: headerMatch[2],
            level: headerMatch[1].length,
          },
        });
        i++;
        continue;
      }

      // Code blocks
      if (line.startsWith('```')) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        blocks.push({
          type: 'code',
          data: { code: codeLines.join('\n') },
        });
        i++;
        continue;
      }

      // Lists
      const listMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
      if (listMatch) {
        const items: string[] = [listMatch[2]];
        i++;
        while (i < lines.length && lines[i].match(/^(\s*)[-*+]\s+(.+)$/)) {
          const m = lines[i].match(/^(\s*)[-*+]\s+(.+)$/);
          if (m) items.push(m[2]);
          i++;
        }
        blocks.push({
          type: 'list',
          data: { style: 'unordered', items },
        });
        continue;
      }

      // Numbered lists
      const numberedListMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
      if (numberedListMatch) {
        const items: string[] = [numberedListMatch[2]];
        i++;
        while (i < lines.length && lines[i].match(/^(\s*)\d+\.\s+(.+)$/)) {
          const m = lines[i].match(/^(\s*)\d+\.\s+(.+)$/);
          if (m) items.push(m[2]);
          i++;
        }
        blocks.push({
          type: 'list',
          data: { style: 'ordered', items },
        });
        continue;
      }

      // Blockquotes
      if (line.startsWith('>')) {
        const quoteLines: string[] = [line.replace(/^>\s*/, '')];
        i++;
        while (i < lines.length && lines[i].startsWith('>')) {
          quoteLines.push(lines[i].replace(/^>\s*/, ''));
          i++;
        }
        blocks.push({
          type: 'quote',
          data: { text: quoteLines.join(' ') },
        });
        continue;
      }

      // Images
      const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMatch) {
        blocks.push({
          type: 'image',
          data: {
            file: { url: imgMatch[2] },
            caption: imgMatch[1],
          },
        });
        i++;
        continue;
      }

      // Regular paragraph
      if (line.trim()) {
        blocks.push({
          type: 'paragraph',
          data: { text: line },
        });
      }

      i++;
    }

    return { time: Date.now(), blocks, version: '2.29.1' };
  },

  // ============ Helper Methods ============

  // Import tags for a draft
  async importTags(draftId: string, tagNames: string[]): Promise<void> {
    for (const name of tagNames) {
      if (!name) continue;

      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      // Find or create tag
      let [tag] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.slug, slug));

      if (!tag) {
        [tag] = await db
          .insert(tags)
          .values({
            id: generateId(),
            name,
            slug,
            createdAt: new Date(),
          })
          .returning({ id: tags.id });
      }

      // Link tag to draft
      await db
        .insert(draftTags)
        .values({
          draftId,
          tagId: tag.id,
        })
        .onConflictDoNothing();
    }
  },

  // Strip HTML tags
  stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').trim();
  },

  // Decode HTML entities
  decodeHtml(html: string): string {
    return html
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  },

  // Count words in text
  countWords(text: string): number {
    const clean = this.stripHtml(text);
    return clean.split(/\s+/).filter((w) => w.length > 0).length;
  },

  // ============ Export ============

  // Get supported import sources
  getSupportedSources(): { id: MigrationSource; name: string; description: string }[] {
    return [
      { id: 'wordpress', name: 'WordPress', description: 'Import from WordPress XML export' },
      { id: 'ghost', name: 'Ghost', description: 'Import from Ghost JSON export' },
      { id: 'medium', name: 'Medium', description: 'Import from Medium HTML export' },
      { id: 'markdown', name: 'Markdown', description: 'Import Markdown files' },
      { id: 'html', name: 'HTML', description: 'Import HTML files' },
    ];
  },
};
