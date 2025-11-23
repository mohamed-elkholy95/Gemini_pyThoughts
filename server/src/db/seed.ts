import { db, users, drafts, tags, draftTags } from './index.js';
import { logger } from '../config/logger.js';

async function seed() {
  logger.info('Starting database seed...');

  try {
    // Create demo user
    const [demoUser] = await db
      .insert(users)
      .values({
        id: 'demo-user-id',
        name: 'Demo User',
        email: 'demo@pythoughts.com',
        emailVerified: true,
        bio: 'A passionate writer exploring ideas through words.',
      })
      .onConflictDoNothing()
      .returning();

    if (demoUser) {
      logger.info({ userId: demoUser.id }, 'Demo user created');
    }

    // Create sample tags
    const tagData = [
      { name: 'Technology', slug: 'technology', description: 'Tech-related articles' },
      { name: 'Programming', slug: 'programming', description: 'Coding and development' },
      { name: 'Design', slug: 'design', description: 'UI/UX and visual design' },
      { name: 'Productivity', slug: 'productivity', description: 'Tips for getting things done' },
      { name: 'Life', slug: 'life', description: 'Personal stories and experiences' },
    ];

    const createdTags = await db
      .insert(tags)
      .values(tagData)
      .onConflictDoNothing()
      .returning();

    logger.info({ count: createdTags.length }, 'Tags created');

    // Create sample drafts
    const draftData = [
      {
        title: 'Getting Started with Editor.js',
        content: {
          time: Date.now(),
          blocks: [
            {
              type: 'header',
              data: { text: 'Introduction to Editor.js', level: 2 },
            },
            {
              type: 'paragraph',
              data: {
                text: 'Editor.js is a powerful block-styled editor that provides a clean editing experience. Unlike traditional WYSIWYG editors, it saves data in JSON format, making it perfect for modern web applications.',
              },
            },
            {
              type: 'header',
              data: { text: 'Key Features', level: 3 },
            },
            {
              type: 'list',
              data: {
                style: 'unordered',
                items: [
                  'Block-based architecture',
                  'Clean JSON output',
                  'Extensible with plugins',
                  'Great API for customization',
                ],
              },
            },
          ],
          version: '2.29.0',
        },
        excerpt: 'Learn how to use Editor.js for creating rich content experiences.',
        status: 'published' as const,
        authorId: 'demo-user-id',
        publishedAt: new Date(),
        wordCount: 45,
        readingTime: 1,
        slug: 'getting-started-with-editorjs-' + Date.now().toString(36),
      },
      {
        title: 'Building Scalable APIs with Hono',
        content: {
          time: Date.now(),
          blocks: [
            {
              type: 'paragraph',
              data: {
                text: 'Hono is a small, simple, and ultrafast web framework for the Edges. It works on any JavaScript runtime: Cloudflare Workers, Fastly Compute@Edge, Deno, Bun, Vercel, Netlify, AWS Lambda, Lambda@Edge, and Node.js.',
              },
            },
          ],
          version: '2.29.0',
        },
        excerpt: 'Explore Hono for building fast and scalable APIs.',
        status: 'draft' as const,
        authorId: 'demo-user-id',
        wordCount: 35,
        readingTime: 1,
      },
    ];

    for (const draft of draftData) {
      const [createdDraft] = await db
        .insert(drafts)
        .values(draft)
        .returning();

      // Add tags to published drafts
      if (createdDraft && draft.status === 'published' && createdTags.length > 0) {
        await db.insert(draftTags).values([
          { draftId: createdDraft.id, tagId: createdTags[0].id },
          { draftId: createdDraft.id, tagId: createdTags[1].id },
        ]).onConflictDoNothing();
      }

      logger.info({ draftId: createdDraft?.id, title: draft.title }, 'Draft created');
    }

    logger.info('Database seed completed successfully');
  } catch (error) {
    logger.error({ error }, 'Database seed failed');
    throw error;
  }
}

// Run seed
seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
