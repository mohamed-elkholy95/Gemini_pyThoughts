// Mention Service
// Handles @mentions in comments and articles, triggers notifications

import { eq, like, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, drafts, type EditorJSContent } from '../db/schema.js';
import { notificationService } from './notification.service.js';
import { logger } from '../config/logger.js';

// Regex to match @username mentions
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

interface MentionResult {
  username: string;
  userId: string;
  found: boolean;
}

interface ProcessedMentions {
  mentions: MentionResult[];
  notified: string[];
  notFound: string[];
}

export const mentionService = {
  // Extract usernames from text
  extractMentions(text: string): string[] {
    const mentions: string[] = [];
    let match;

    while ((match = MENTION_REGEX.exec(text)) !== null) {
      const username = match[1];
      if (!mentions.includes(username)) {
        mentions.push(username);
      }
    }

    return mentions;
  },

  // Extract mentions from EditorJS content
  extractMentionsFromContent(content: EditorJSContent): string[] {
    const allText: string[] = [];

    for (const block of content.blocks) {
      // Handle text-based blocks
      if (block.data.text && typeof block.data.text === 'string') {
        allText.push(block.data.text);
      }

      // Handle list blocks
      if (block.data.items && Array.isArray(block.data.items)) {
        for (const item of block.data.items) {
          if (typeof item === 'string') {
            allText.push(item);
          } else if (item && typeof item.content === 'string') {
            allText.push(item.content);
          }
        }
      }

      // Handle quote blocks
      if (block.data.caption && typeof block.data.caption === 'string') {
        allText.push(block.data.caption);
      }
    }

    return this.extractMentions(allText.join(' '));
  },

  // Look up users by usernames
  async resolveUsernames(usernames: string[]): Promise<Map<string, string>> {
    if (usernames.length === 0) {
      return new Map();
    }

    // Find users by name (case-insensitive matching)
    const foundUsers = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        sql`lower(${users.name}) IN (${sql.join(usernames.map(u => sql`lower(${u})`), sql`, `)})`
      );

    const userMap = new Map<string, string>();
    for (const user of foundUsers) {
      userMap.set(user.name.toLowerCase(), user.id);
    }

    return userMap;
  },

  // Process mentions in a comment and send notifications
  async processCommentMentions(
    commentId: string,
    commentContent: string,
    authorId: string,
    articleId: string
  ): Promise<ProcessedMentions> {
    const usernames = this.extractMentions(commentContent);

    if (usernames.length === 0) {
      return { mentions: [], notified: [], notFound: [] };
    }

    const userMap = await this.resolveUsernames(usernames);
    const notified: string[] = [];
    const notFound: string[] = [];
    const mentions: MentionResult[] = [];

    // Get article details for notification
    const [article] = await db
      .select({ title: drafts.title, slug: drafts.slug })
      .from(drafts)
      .where(eq(drafts.id, articleId));

    // Get author name
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, authorId));

    for (const username of usernames) {
      const userId = userMap.get(username.toLowerCase());

      if (userId) {
        // Don't notify yourself
        if (userId !== authorId) {
          await notificationService.create({
            userId,
            type: 'mention',
            title: 'You were mentioned',
            message: `${author?.name || 'Someone'} mentioned you in a comment on "${article?.title || 'an article'}"`,
            link: article?.slug ? `/articles/${article.slug}#comment-${commentId}` : undefined,
            actorId: authorId,
            entityType: 'comment',
            entityId: commentId,
          });
          notified.push(username);
        }
        mentions.push({ username, userId, found: true });
      } else {
        notFound.push(username);
        mentions.push({ username, userId: '', found: false });
      }
    }

    logger.info(
      { commentId, mentionsFound: notified.length, notFound: notFound.length },
      'Processed comment mentions'
    );

    return { mentions, notified, notFound };
  },

  // Process mentions in an article and send notifications
  async processArticleMentions(
    articleId: string,
    content: EditorJSContent,
    authorId: string
  ): Promise<ProcessedMentions> {
    const usernames = this.extractMentionsFromContent(content);

    if (usernames.length === 0) {
      return { mentions: [], notified: [], notFound: [] };
    }

    const userMap = await this.resolveUsernames(usernames);
    const notified: string[] = [];
    const notFound: string[] = [];
    const mentions: MentionResult[] = [];

    // Get article details
    const [article] = await db
      .select({ title: drafts.title, slug: drafts.slug })
      .from(drafts)
      .where(eq(drafts.id, articleId));

    // Get author name
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, authorId));

    for (const username of usernames) {
      const userId = userMap.get(username.toLowerCase());

      if (userId) {
        // Don't notify yourself
        if (userId !== authorId) {
          await notificationService.create({
            userId,
            type: 'mention',
            title: 'You were mentioned',
            message: `${author?.name || 'Someone'} mentioned you in their article "${article?.title || 'Untitled'}"`,
            link: article?.slug ? `/articles/${article.slug}` : undefined,
            actorId: authorId,
            entityType: 'article',
            entityId: articleId,
          });
          notified.push(username);
        }
        mentions.push({ username, userId, found: true });
      } else {
        notFound.push(username);
        mentions.push({ username, userId: '', found: false });
      }
    }

    logger.info(
      { articleId, mentionsFound: notified.length, notFound: notFound.length },
      'Processed article mentions'
    );

    return { mentions, notified, notFound };
  },

  // Search users for mention autocomplete
  async searchUsers(query: string, limit = 10): Promise<Array<{ id: string; name: string; image: string | null }>> {
    if (!query || query.length < 1) {
      return [];
    }

    const results = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(like(users.name, `${query}%`))
      .limit(limit);

    return results;
  },

  // Convert mentions to links in content (for rendering)
  async enrichContentWithMentionLinks(content: string): Promise<string> {
    const usernames = this.extractMentions(content);

    if (usernames.length === 0) {
      return content;
    }

    const userMap = await this.resolveUsernames(usernames);

    let enrichedContent = content;
    for (const [username, userId] of userMap.entries()) {
      // Find the original case username in the content
      const regex = new RegExp(`@(${username})`, 'gi');
      enrichedContent = enrichedContent.replace(regex, (_match, capturedUsername) => {
        return `<a href="/profile/${userId}" class="mention">@${capturedUsername}</a>`;
      });
    }

    return enrichedContent;
  },

  // Get all users mentioned in a comment (for display)
  async getMentionedUsers(content: string): Promise<Array<{ id: string; name: string }>> {
    const usernames = this.extractMentions(content);

    if (usernames.length === 0) {
      return [];
    }

    const userMap = await this.resolveUsernames(usernames);
    const result: Array<{ id: string; name: string }> = [];

    for (const username of usernames) {
      const userId = userMap.get(username.toLowerCase());
      if (userId) {
        result.push({ id: userId, name: username });
      }
    }

    return result;
  },
};
