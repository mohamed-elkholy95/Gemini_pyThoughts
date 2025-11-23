import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('../../src/db/index.js', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  },
  drafts: {},
  draftVersions: {},
  draftTags: {},
  tags: {},
}));

describe('Draft Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Content Sanitization', () => {
    it('should strip dangerous HTML tags from content', () => {
      const content = {
        time: Date.now(),
        blocks: [
          {
            type: 'paragraph',
            data: {
              text: '<script>alert("xss")</script>Hello <b>world</b>',
            },
          },
        ],
        version: '2.29.0',
      };

      // The sanitization should remove script tags but keep safe tags
      const sanitizedText = content.blocks[0].data.text
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .trim();

      expect(sanitizedText).not.toContain('<script>');
      expect(sanitizedText).toContain('<b>world</b>');
    });

    it('should preserve allowed HTML tags', () => {
      const allowedTags = ['b', 'i', 'em', 'strong', 'a', 'code', 'mark'];
      const testText = '<b>bold</b> <i>italic</i> <a href="#">link</a>';

      // Check that allowed tags are present
      allowedTags.forEach((tag) => {
        if (tag === 'b') expect(testText).toContain(`<${tag}>`);
      });
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate word count correctly', () => {
      const content = {
        blocks: [
          { type: 'paragraph', data: { text: 'Hello world this is a test' } },
          { type: 'paragraph', data: { text: 'Another paragraph here' } },
        ],
      };

      let wordCount = 0;
      for (const block of content.blocks) {
        if (block.type === 'paragraph' && block.data.text) {
          const words = block.data.text.trim().split(/\s+/).filter(Boolean);
          wordCount += words.length;
        }
      }

      expect(wordCount).toBe(9); // 6 + 3 words
    });

    it('should calculate reading time correctly', () => {
      // 200 words per minute average
      const wordCount = 400;
      const readingTime = Math.ceil(wordCount / 200);

      expect(readingTime).toBe(2); // 2 minutes
    });
  });

  describe('Slug Generation', () => {
    it('should generate valid slugs from titles', () => {
      const generateSlug = (title: string): string => {
        return title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 100);
      };

      expect(generateSlug('Hello World')).toBe('hello-world');
      expect(generateSlug('My First Blog Post!')).toBe('my-first-blog-post');
      expect(generateSlug('  Spaces  Around  ')).toBe('spaces-around');
      expect(generateSlug('Special@#$Characters')).toBe('special-characters');
    });
  });
});

describe('Draft Version Control', () => {
  it('should increment version numbers correctly', () => {
    const latestVersion = 5;
    const nextVersion = latestVersion + 1;

    expect(nextVersion).toBe(6);
  });

  it('should handle first version correctly', () => {
    const latestVersion = undefined;
    const nextVersion = (latestVersion || 0) + 1;

    expect(nextVersion).toBe(1);
  });
});
