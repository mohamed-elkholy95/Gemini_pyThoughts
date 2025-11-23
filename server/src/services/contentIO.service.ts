import { eq, and } from 'drizzle-orm';
import { db, drafts, users, tags, draftTags } from '../db/index.js';
import { logger } from '../config/logger.js';
import sanitizeHtml from 'sanitize-html';

interface EditorJSBlock {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

interface EditorJSContent {
  time?: number;
  blocks: EditorJSBlock[];
  version?: string;
}

interface MarkdownExport {
  title: string;
  content: string;
  frontmatter: {
    author: string;
    date: string;
    tags: string[];
    excerpt?: string;
  };
}

interface ImportResult {
  success: boolean;
  draftId?: string;
  errors?: string[];
}

export const contentIOService = {
  // Convert Editor.js content to Markdown
  editorJsToMarkdown(content: EditorJSContent): string {
    if (!content?.blocks) return '';

    return content.blocks
      .map((block) => {
        switch (block.type) {
          case 'header':
            const level = (block.data.level as number) || 2;
            return `${'#'.repeat(level)} ${block.data.text}`;

          case 'paragraph':
            return this.htmlToMarkdown(block.data.text as string);

          case 'list':
            const items = block.data.items as string[];
            const style = block.data.style === 'ordered' ? '1.' : '-';
            return items.map((item) => `${style} ${this.htmlToMarkdown(item)}`).join('\n');

          case 'quote':
            return `> ${block.data.text}\n${block.data.caption ? `> — ${block.data.caption}` : ''}`;

          case 'code':
            return `\`\`\`${block.data.language || ''}\n${block.data.code}\n\`\`\``;

          case 'image':
            const alt = block.data.caption || 'image';
            const imageFile = block.data.file as { url?: string } | undefined;
            return `![${alt}](${imageFile?.url || block.data.url})`;

          case 'delimiter':
            return '---';

          case 'table':
            const rows = block.data.content as string[][];
            if (!rows || rows.length === 0) return '';

            const header = rows[0].map((cell) => this.htmlToMarkdown(cell)).join(' | ');
            const separator = rows[0].map(() => '---').join(' | ');
            const body = rows
              .slice(1)
              .map((row) => row.map((cell) => this.htmlToMarkdown(cell)).join(' | '))
              .join('\n');

            return `| ${header} |\n| ${separator} |\n${body ? `| ${body.split('\n').join(' |\n| ')} |` : ''}`;

          case 'embed':
            return `[Embed: ${block.data.service}](${block.data.source})`;

          case 'raw':
            return block.data.html as string;

          default:
            logger.warn({ blockType: block.type }, 'Unknown Editor.js block type');
            return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');
  },

  // Convert basic HTML to Markdown
  htmlToMarkdown(html: string): string {
    if (!html) return '';

    return html
      .replace(/<b>|<strong>/gi, '**')
      .replace(/<\/b>|<\/strong>/gi, '**')
      .replace(/<i>|<em>/gi, '*')
      .replace(/<\/i>|<\/em>/gi, '*')
      .replace(/<u>/gi, '__')
      .replace(/<\/u>/gi, '__')
      .replace(/<code>/gi, '`')
      .replace(/<\/code>/gi, '`')
      .replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''); // Remove remaining HTML tags
  },

  // Convert Markdown to Editor.js content
  markdownToEditorJs(markdown: string): EditorJSContent {
    const lines = markdown.split('\n');
    const blocks: EditorJSBlock[] = [];
    let currentParagraph: string[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeLanguage = '';

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const text = currentParagraph.join('\n').trim();
        if (text) {
          blocks.push({
            type: 'paragraph',
            data: { text: this.markdownInlineToHtml(text) },
          });
        }
        currentParagraph = [];
      }
    };

    for (const line of lines) {
      // Code block handling
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          flushParagraph();
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
          codeBlockContent = [];
        } else {
          blocks.push({
            type: 'code',
            data: {
              code: codeBlockContent.join('\n'),
              language: codeLanguage,
            },
          });
          inCodeBlock = false;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Empty line
      if (!line.trim()) {
        flushParagraph();
        continue;
      }

      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        flushParagraph();
        blocks.push({
          type: 'header',
          data: {
            text: headerMatch[2],
            level: headerMatch[1].length,
          },
        });
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
        flushParagraph();
        blocks.push({ type: 'delimiter', data: {} });
        continue;
      }

      // Blockquote
      if (line.startsWith('>')) {
        flushParagraph();
        const quoteText = line.replace(/^>\s*/, '');
        blocks.push({
          type: 'quote',
          data: { text: this.markdownInlineToHtml(quoteText) },
        });
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(line)) {
        flushParagraph();
        const items: string[] = [line.replace(/^[-*+]\s+/, '')];
        blocks.push({
          type: 'list',
          data: {
            style: 'unordered',
            items: items.map((item) => this.markdownInlineToHtml(item)),
          },
        });
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(line)) {
        flushParagraph();
        const items: string[] = [line.replace(/^\d+\.\s+/, '')];
        blocks.push({
          type: 'list',
          data: {
            style: 'ordered',
            items: items.map((item) => this.markdownInlineToHtml(item)),
          },
        });
        continue;
      }

      // Image
      const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imageMatch) {
        flushParagraph();
        blocks.push({
          type: 'image',
          data: {
            url: imageMatch[2],
            caption: imageMatch[1],
          },
        });
        continue;
      }

      // Regular paragraph line
      currentParagraph.push(line);
    }

    flushParagraph();

    return {
      time: Date.now(),
      blocks,
      version: '2.28.0',
    };
  },

  // Convert inline Markdown to HTML
  markdownInlineToHtml(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/__([^_]+)__/g, '<u>$1</u>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  },

  // Export article to Markdown
  async exportToMarkdown(draftId: string, userId: string): Promise<MarkdownExport | null> {
    const [draft] = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        content: drafts.content,
        excerpt: drafts.excerpt,
        publishedAt: drafts.publishedAt,
        authorId: drafts.authorId,
        authorName: users.name,
      })
      .from(drafts)
      .innerJoin(users, eq(drafts.authorId, users.id))
      .where(and(eq(drafts.id, draftId), eq(drafts.authorId, userId)));

    if (!draft) return null;

    // Get tags
    const articleTags = await db
      .select({ name: tags.name })
      .from(draftTags)
      .innerJoin(tags, eq(draftTags.tagId, tags.id))
      .where(eq(draftTags.draftId, draftId));

    const markdownContent = this.editorJsToMarkdown(draft.content as EditorJSContent);

    return {
      title: draft.title,
      content: markdownContent,
      frontmatter: {
        author: draft.authorName || 'Unknown',
        date: (draft.publishedAt || new Date()).toISOString(),
        tags: articleTags.map((t) => t.name),
        excerpt: draft.excerpt || undefined,
      },
    };
  },

  // Generate full Markdown file with frontmatter
  async exportToMarkdownFile(draftId: string, userId: string): Promise<string | null> {
    const exported = await this.exportToMarkdown(draftId, userId);
    if (!exported) return null;

    const frontmatter = [
      '---',
      `title: "${exported.title.replace(/"/g, '\\"')}"`,
      `author: "${exported.frontmatter.author}"`,
      `date: ${exported.frontmatter.date}`,
      `tags: [${exported.frontmatter.tags.map((t) => `"${t}"`).join(', ')}]`,
      exported.frontmatter.excerpt ? `excerpt: "${exported.frontmatter.excerpt.replace(/"/g, '\\"')}"` : null,
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    return `${frontmatter}\n\n# ${exported.title}\n\n${exported.content}`;
  },

  // Import from Markdown
  async importFromMarkdown(
    markdown: string,
    userId: string,
    options: { publish?: boolean } = {}
  ): Promise<ImportResult> {
    try {
      // Parse frontmatter
      const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
      let title = 'Imported Article';
      let contentMarkdown = markdown;
      let extractedTags: string[] = [];
      let excerpt: string | undefined;

      if (frontmatterMatch) {
        const frontmatterStr = frontmatterMatch[1];
        contentMarkdown = markdown.slice(frontmatterMatch[0].length);

        // Parse frontmatter
        const titleMatch = frontmatterStr.match(/title:\s*"?([^"\n]+)"?/);
        if (titleMatch) title = titleMatch[1];

        const tagsMatch = frontmatterStr.match(/tags:\s*\[([^\]]+)\]/);
        if (tagsMatch) {
          extractedTags = tagsMatch[1]
            .split(',')
            .map((t) => t.trim().replace(/^"|"$/g, ''));
        }

        const excerptMatch = frontmatterStr.match(/excerpt:\s*"?([^"\n]+)"?/);
        if (excerptMatch) excerpt = excerptMatch[1];
      }

      // Remove title from content if it starts with # Title
      const titleLineMatch = contentMarkdown.match(/^#\s+(.+)\n/);
      if (titleLineMatch && !frontmatterMatch) {
        title = titleLineMatch[1];
        contentMarkdown = contentMarkdown.slice(titleLineMatch[0].length);
      }

      // Convert to Editor.js
      const content = this.markdownToEditorJs(contentMarkdown);

      // Generate excerpt if not provided
      if (!excerpt && content.blocks.length > 0) {
        const firstParagraph = content.blocks.find((b) => b.type === 'paragraph');
        if (firstParagraph) {
          excerpt = sanitizeHtml(firstParagraph.data.text as string, { allowedTags: [] }).slice(0, 200);
        }
      }

      // Create draft
      const [draft] = await db
        .insert(drafts)
        .values({
          title,
          content,
          excerpt,
          authorId: userId,
          status: options.publish ? 'published' : 'draft',
          publishedAt: options.publish ? new Date() : null,
        })
        .returning();

      // Add tags
      if (extractedTags.length > 0) {
        for (const tagName of extractedTags) {
          const slug = tagName.toLowerCase().replace(/\s+/g, '-');
          let [tag] = await db.select().from(tags).where(eq(tags.slug, slug));

          if (!tag) {
            [tag] = await db.insert(tags).values({ name: tagName, slug }).returning();
          }

          await db.insert(draftTags).values({ draftId: draft.id, tagId: tag.id });
        }
      }

      logger.info({ draftId: draft.id, userId }, 'Markdown imported');

      return { success: true, draftId: draft.id };
    } catch (error) {
      logger.error({ error, userId }, 'Markdown import failed');
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Import failed'],
      };
    }
  },

  // Parse Medium export (HTML format)
  parseMediumExport(html: string): { title: string; content: EditorJSContent; publishedAt?: Date } {
    // Medium exports are HTML files
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1] : 'Imported from Medium';

    // Extract date
    const dateMatch = html.match(/data-timestamp="(\d+)"/);
    const publishedAt = dateMatch ? new Date(parseInt(dateMatch[1])) : undefined;

    // Extract article body
    const bodyMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    // Convert HTML to blocks
    const blocks: EditorJSBlock[] = [];

    // Simple HTML to blocks conversion
    const sanitized = sanitizeHtml(bodyHtml, {
      allowedTags: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'img', 'a', 'b', 'i', 'em', 'strong', 'code', 'pre', 'br'],
      allowedAttributes: {
        a: ['href'],
        img: ['src', 'alt'],
      },
    });

    // Parse HTML elements
    const elements = sanitized.match(/<[^>]+>[^<]*<\/[^>]+>|<[^>]+\/>/g) || [];

    for (const element of elements) {
      const tagMatch = element.match(/^<(\w+)/);
      if (!tagMatch) continue;

      const tag = tagMatch[1].toLowerCase();

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        const level = parseInt(tag[1]);
        const text = element.replace(/<[^>]+>/g, '');
        if (text.trim()) {
          blocks.push({ type: 'header', data: { text, level } });
        }
      } else if (tag === 'p') {
        const text = element.replace(/<\/?p>/g, '');
        if (text.trim()) {
          blocks.push({ type: 'paragraph', data: { text } });
        }
      } else if (tag === 'blockquote') {
        const text = element.replace(/<[^>]+>/g, '');
        if (text.trim()) {
          blocks.push({ type: 'quote', data: { text } });
        }
      } else if (tag === 'img') {
        const srcMatch = element.match(/src="([^"]+)"/);
        const altMatch = element.match(/alt="([^"]+)"/);
        if (srcMatch) {
          blocks.push({
            type: 'image',
            data: { url: srcMatch[1], caption: altMatch?.[1] || '' },
          });
        }
      }
    }

    return {
      title,
      content: { time: Date.now(), blocks, version: '2.28.0' },
      publishedAt,
    };
  },

  // Import from Medium HTML export
  async importFromMedium(
    html: string,
    userId: string,
    options: { publish?: boolean } = {}
  ): Promise<ImportResult> {
    try {
      const { title, content, publishedAt } = this.parseMediumExport(html);

      // Generate excerpt
      const firstParagraph = content.blocks.find((b) => b.type === 'paragraph');
      const excerpt = firstParagraph
        ? sanitizeHtml(firstParagraph.data.text as string, { allowedTags: [] }).slice(0, 200)
        : undefined;

      const [draft] = await db
        .insert(drafts)
        .values({
          title,
          content,
          excerpt,
          authorId: userId,
          status: options.publish ? 'published' : 'draft',
          publishedAt: options.publish ? (publishedAt || new Date()) : null,
        })
        .returning();

      logger.info({ draftId: draft.id, userId }, 'Medium article imported');

      return { success: true, draftId: draft.id };
    } catch (error) {
      logger.error({ error, userId }, 'Medium import failed');
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Import failed'],
      };
    }
  },

  // Export all user's articles
  async exportAllArticles(userId: string, format: 'markdown' | 'json' = 'markdown'): Promise<string> {
    const userDrafts = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.authorId, userId), eq(drafts.isDeleted, false)));

    if (format === 'json') {
      return JSON.stringify(userDrafts, null, 2);
    }

    // Export as markdown
    const exports: string[] = [];

    for (const draft of userDrafts) {
      const md = await this.exportToMarkdownFile(draft.id, userId);
      if (md) {
        exports.push(`<!-- ${draft.title} -->\n${md}`);
      }
    }

    return exports.join('\n\n---\n\n');
  },
};
