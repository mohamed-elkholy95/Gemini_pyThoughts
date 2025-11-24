// Content Analysis Service
// AI-assisted content analysis for quality, readability, and SEO

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drafts, type EditorJSContent } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { cacheService, CACHE_TTL } from './cache.service.js';

// Readability metrics
interface ReadabilityScore {
  fleschKincaid: number;
  fleschReadingEase: number;
  gunningFog: number;
  colemanLiau: number;
  automatedReadabilityIndex: number;
  averageGrade: number;
  readingLevel: 'elementary' | 'middle_school' | 'high_school' | 'college' | 'graduate';
}

// SEO analysis result
interface SEOAnalysis {
  score: number;
  issues: SEOIssue[];
  recommendations: string[];
  keywordAnalysis: {
    primary: string[];
    secondary: string[];
    density: Record<string, number>;
  };
  meta: {
    titleLength: number;
    titleOptimal: boolean;
    excerptLength: number;
    excerptOptimal: boolean;
    hasImage: boolean;
  };
}

interface SEOIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  impact: 'high' | 'medium' | 'low';
}

// Quality analysis result
interface QualityAnalysis {
  overallScore: number;
  categories: {
    structure: number;
    formatting: number;
    depth: number;
    engagement: number;
    originality: number;
  };
  suggestions: string[];
  highlights: {
    strengths: string[];
    improvements: string[];
  };
}

// Plagiarism check result
interface PlagiarismResult {
  isPotentialDuplicate: boolean;
  similarityScore: number;
  matches: {
    source: string;
    similarity: number;
    matchedText: string;
  }[];
}

// Full content analysis
interface ContentAnalysis {
  draftId: string;
  analyzedAt: Date;
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  readingTime: number;
  readability: ReadabilityScore;
  seo: SEOAnalysis;
  quality: QualityAnalysis;
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral';
    score: number;
  };
  topics: string[];
  entities: {
    type: string;
    name: string;
    count: number;
  }[];
}

export const contentAnalysisService = {
  // ============ Full Analysis ============

  // Perform complete content analysis
  async analyzeContent(draftId: string): Promise<ContentAnalysis | null> {
    const cacheKey = `analysis:${draftId}`;
    const cached = await cacheService.get<ContentAnalysis>(cacheKey);
    if (cached) return cached;

    const [draft] = await db
      .select({
        id: drafts.id,
        title: drafts.title,
        content: drafts.content,
        excerpt: drafts.excerpt,
        coverImage: drafts.coverImage,
      })
      .from(drafts)
      .where(eq(drafts.id, draftId));

    if (!draft) return null;

    const content = draft.content as EditorJSContent;
    const text = this.extractText(content);
    const sentences = this.getSentences(text);
    const words = this.getWords(text);
    const paragraphs = this.getParagraphs(content);

    const analysis: ContentAnalysis = {
      draftId,
      analyzedAt: new Date(),
      wordCount: words.length,
      characterCount: text.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      readingTime: Math.ceil(words.length / 200),
      readability: this.calculateReadability(text, words, sentences),
      seo: this.analyzeSEO(draft.title, draft.excerpt || '', text, content, !!draft.coverImage),
      quality: this.analyzeQuality(content, text, words),
      sentiment: this.analyzeSentiment(text),
      topics: this.extractTopics(text),
      entities: this.extractEntities(text),
    };

    await cacheService.set(cacheKey, analysis, CACHE_TTL.ARTICLE);

    logger.info({ draftId, wordCount: analysis.wordCount }, 'Content analyzed');

    return analysis;
  },

  // ============ Readability Analysis ============

  // Calculate readability scores
  calculateReadability(_text: string, words: string[], sentences: string[]): ReadabilityScore {
    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const syllableCount = words.reduce((total, word) => total + this.countSyllables(word), 0);
    const complexWordCount = words.filter((word) => this.countSyllables(word) >= 3).length;
    const charCount = words.join('').length;

    if (wordCount === 0 || sentenceCount === 0) {
      return {
        fleschKincaid: 0,
        fleschReadingEase: 100,
        gunningFog: 0,
        colemanLiau: 0,
        automatedReadabilityIndex: 0,
        averageGrade: 0,
        readingLevel: 'elementary',
      };
    }

    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord = syllableCount / wordCount;
    const avgCharsPerWord = charCount / wordCount;

    // Flesch-Kincaid Grade Level
    const fleschKincaid =
      0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

    // Flesch Reading Ease
    const fleschReadingEase =
      206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    // Gunning Fog Index
    const percentComplexWords = (complexWordCount / wordCount) * 100;
    const gunningFog = 0.4 * (avgWordsPerSentence + percentComplexWords);

    // Coleman-Liau Index
    const L = (charCount / wordCount) * 100;
    const S = (sentenceCount / wordCount) * 100;
    const colemanLiau = 0.0588 * L - 0.296 * S - 15.8;

    // Automated Readability Index
    const automatedReadabilityIndex =
      4.71 * avgCharsPerWord + 0.5 * avgWordsPerSentence - 21.43;

    // Average grade level
    const averageGrade =
      (Math.max(0, fleschKincaid) +
        Math.max(0, gunningFog) +
        Math.max(0, colemanLiau) +
        Math.max(0, automatedReadabilityIndex)) /
      4;

    // Determine reading level
    let readingLevel: ReadabilityScore['readingLevel'];
    if (averageGrade <= 5) {
      readingLevel = 'elementary';
    } else if (averageGrade <= 8) {
      readingLevel = 'middle_school';
    } else if (averageGrade <= 12) {
      readingLevel = 'high_school';
    } else if (averageGrade <= 16) {
      readingLevel = 'college';
    } else {
      readingLevel = 'graduate';
    }

    return {
      fleschKincaid: Math.round(fleschKincaid * 10) / 10,
      fleschReadingEase: Math.round(Math.max(0, Math.min(100, fleschReadingEase)) * 10) / 10,
      gunningFog: Math.round(gunningFog * 10) / 10,
      colemanLiau: Math.round(colemanLiau * 10) / 10,
      automatedReadabilityIndex: Math.round(automatedReadabilityIndex * 10) / 10,
      averageGrade: Math.round(averageGrade * 10) / 10,
      readingLevel,
    };
  },

  // ============ SEO Analysis ============

  // Analyze SEO aspects
  analyzeSEO(
    title: string,
    excerpt: string,
    text: string,
    content: EditorJSContent,
    hasImage: boolean
  ): SEOAnalysis {
    const issues: SEOIssue[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Title analysis
    const titleLength = title.length;
    const titleOptimal = titleLength >= 30 && titleLength <= 60;
    if (!titleOptimal) {
      if (titleLength < 30) {
        issues.push({
          type: 'warning',
          code: 'TITLE_TOO_SHORT',
          message: 'Title is too short. Aim for 30-60 characters.',
          impact: 'medium',
        });
        score -= 10;
      } else if (titleLength > 60) {
        issues.push({
          type: 'warning',
          code: 'TITLE_TOO_LONG',
          message: 'Title is too long. Search engines may truncate it.',
          impact: 'medium',
        });
        score -= 5;
      }
    }

    // Excerpt/description analysis
    const excerptLength = excerpt.length;
    const excerptOptimal = excerptLength >= 120 && excerptLength <= 160;
    if (!excerptOptimal) {
      if (excerptLength < 120) {
        issues.push({
          type: 'warning',
          code: 'EXCERPT_TOO_SHORT',
          message: 'Meta description is too short. Aim for 120-160 characters.',
          impact: 'medium',
        });
        score -= 10;
      } else if (excerptLength > 160) {
        issues.push({
          type: 'info',
          code: 'EXCERPT_TOO_LONG',
          message: 'Meta description is slightly long.',
          impact: 'low',
        });
        score -= 3;
      }
    }

    // Image analysis
    if (!hasImage) {
      issues.push({
        type: 'warning',
        code: 'NO_COVER_IMAGE',
        message: 'No cover image. Articles with images perform better.',
        impact: 'medium',
      });
      score -= 10;
      recommendations.push('Add a relevant cover image to improve engagement');
    }

    // Heading structure
    const headings = (content?.blocks || []).filter((b) => b.type === 'header');
    if (headings.length === 0) {
      issues.push({
        type: 'warning',
        code: 'NO_HEADINGS',
        message: 'No headings found. Use headings to structure your content.',
        impact: 'high',
      });
      score -= 15;
      recommendations.push('Add H2 and H3 headings to structure your content');
    }

    // Content length
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount < 300) {
      issues.push({
        type: 'error',
        code: 'CONTENT_TOO_SHORT',
        message: 'Content is too short. Aim for at least 300 words.',
        impact: 'high',
      });
      score -= 20;
    } else if (wordCount < 1000) {
      issues.push({
        type: 'info',
        code: 'CONTENT_COULD_BE_LONGER',
        message: 'Longer content (1000+ words) often ranks better.',
        impact: 'low',
      });
    }

    // Internal/external links
    const links = (content?.blocks || []).filter(
      (b) => b.type === 'paragraph' && String(b.data?.text || '').includes('<a ')
    );
    if (links.length === 0) {
      issues.push({
        type: 'info',
        code: 'NO_LINKS',
        message: 'No links found. Consider adding relevant internal or external links.',
        impact: 'low',
      });
      score -= 5;
    }

    // Keyword analysis
    const keywordAnalysis = this.analyzeKeywords(title, text);

    return {
      score: Math.max(0, score),
      issues,
      recommendations,
      keywordAnalysis,
      meta: {
        titleLength,
        titleOptimal,
        excerptLength,
        excerptOptimal,
        hasImage,
      },
    };
  },

  // Analyze keywords
  analyzeKeywords(
    title: string,
    text: string
  ): SEOAnalysis['keywordAnalysis'] {
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const titleWords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

    // Word frequency
    const frequency: Record<string, number> = {};
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, '');
      if (clean.length > 3 && !this.isStopWord(clean)) {
        frequency[clean] = (frequency[clean] || 0) + 1;
      }
    }

    // Sort by frequency
    const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);

    // Primary keywords (top 5 that appear in title)
    const primary = sorted
      .filter(([word]) => titleWords.some((tw) => tw.includes(word)))
      .slice(0, 5)
      .map(([word]) => word);

    // Secondary keywords (top 10 not in primary)
    const secondary = sorted
      .filter(([word]) => !primary.includes(word))
      .slice(0, 10)
      .map(([word]) => word);

    // Calculate density
    const density: Record<string, number> = {};
    for (const [word, count] of sorted.slice(0, 15)) {
      density[word] = Math.round((count / words.length) * 100 * 100) / 100;
    }

    return { primary, secondary, density };
  },

  // ============ Quality Analysis ============

  // Analyze content quality
  analyzeQuality(
    content: EditorJSContent,
    text: string,
    words: string[]
  ): QualityAnalysis {
    const blocks = content?.blocks || [];
    const suggestions: string[] = [];
    const strengths: string[] = [];
    const improvements: string[] = [];

    // Structure score (variety of block types)
    const blockTypes = new Set(blocks.map((b) => b.type));
    let structureScore = Math.min(100, blockTypes.size * 20);
    if (blockTypes.has('header')) structureScore += 10;
    if (blockTypes.has('list')) structureScore += 10;
    if (blockTypes.has('image')) structureScore += 10;
    if (blockTypes.has('code')) structureScore += 10;
    structureScore = Math.min(100, structureScore);

    if (structureScore >= 80) {
      strengths.push('Good variety of content blocks');
    } else {
      improvements.push('Consider using more diverse content types (images, lists, code blocks)');
    }

    // Formatting score
    let formattingScore = 70;
    const avgParagraphLength = words.length / Math.max(1, blocks.filter((b) => b.type === 'paragraph').length);
    if (avgParagraphLength < 100) {
      formattingScore += 20;
      strengths.push('Paragraphs are well-sized for readability');
    } else if (avgParagraphLength > 200) {
      formattingScore -= 20;
      improvements.push('Consider breaking long paragraphs into smaller ones');
    }

    // Depth score (based on length and coverage)
    let depthScore = Math.min(100, Math.floor(words.length / 20));
    if (words.length > 1500) {
      strengths.push('Comprehensive coverage of the topic');
    } else if (words.length < 500) {
      improvements.push('Consider expanding on the topic for more depth');
    }

    // Engagement score (questions, calls to action)
    let engagementScore = 50;
    const hasQuestions = text.includes('?');
    if (hasQuestions) {
      engagementScore += 25;
      strengths.push('Uses questions to engage readers');
    }
    const hasActionWords = ['try', 'learn', 'discover', 'explore', 'start'].some((word) =>
      text.toLowerCase().includes(word)
    );
    if (hasActionWords) {
      engagementScore += 25;
    }

    // Originality score (simplified - would use AI in production)
    const originalityScore = 75; // Placeholder

    // Overall score
    const overallScore = Math.round(
      (structureScore + formattingScore + depthScore + engagementScore + originalityScore) / 5
    );

    // Generate suggestions
    if (formattingScore < 70) {
      suggestions.push('Improve paragraph structure for better readability');
    }
    if (depthScore < 50) {
      suggestions.push('Add more detail and examples to strengthen your content');
    }
    if (engagementScore < 60) {
      suggestions.push('Add questions or calls to action to engage readers');
    }
    if (!blockTypes.has('image')) {
      suggestions.push('Add relevant images to illustrate your points');
    }

    return {
      overallScore,
      categories: {
        structure: structureScore,
        formatting: formattingScore,
        depth: depthScore,
        engagement: engagementScore,
        originality: originalityScore,
      },
      suggestions,
      highlights: {
        strengths,
        improvements,
      },
    };
  },

  // ============ Sentiment Analysis ============

  // Analyze sentiment (simplified)
  analyzeSentiment(text: string): { overall: 'positive' | 'negative' | 'neutral'; score: number } {
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
      'love', 'best', 'happy', 'success', 'beautiful', 'awesome',
      'perfect', 'helpful', 'easy', 'simple', 'effective', 'powerful',
    ];
    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'worst', 'hate',
      'difficult', 'hard', 'problem', 'issue', 'fail', 'wrong',
      'poor', 'broken', 'frustrating', 'annoying', 'useless', 'waste',
    ];

    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, '');
      if (positiveWords.includes(clean)) positiveCount++;
      if (negativeWords.includes(clean)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) {
      return { overall: 'neutral', score: 0 };
    }

    const score = (positiveCount - negativeCount) / total;

    let overall: 'positive' | 'negative' | 'neutral';
    if (score > 0.2) {
      overall = 'positive';
    } else if (score < -0.2) {
      overall = 'negative';
    } else {
      overall = 'neutral';
    }

    return { overall, score: Math.round(score * 100) / 100 };
  },

  // ============ Topic & Entity Extraction ============

  // Extract main topics
  extractTopics(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const frequency: Record<string, number> = {};

    // Count word frequencies (excluding stop words)
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, '');
      if (clean.length > 4 && !this.isStopWord(clean)) {
        frequency[clean] = (frequency[clean] || 0) + 1;
      }
    }

    // Get top topics by frequency
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  },

  // Extract named entities (simplified)
  extractEntities(text: string): { type: string; name: string; count: number }[] {
    const entities: { type: string; name: string; count: number }[] = [];

    // Simple patterns for entity extraction
    const patterns: [RegExp, string][] = [
      [/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, 'person_or_org'], // Proper nouns
      [/\b\d{4}\b/g, 'year'], // Years
      [/\bhttps?:\/\/[^\s]+/g, 'url'], // URLs
      [/\b[A-Z]{2,}\b/g, 'acronym'], // Acronyms
    ];

    const counts: Record<string, { type: string; count: number }> = {};

    for (const [pattern, type] of patterns) {
      const matches = text.match(pattern) || [];
      for (const match of matches) {
        const key = match.toLowerCase();
        if (counts[key]) {
          counts[key].count++;
        } else {
          counts[key] = { type, count: 1 };
        }
      }
    }

    for (const [name, data] of Object.entries(counts)) {
      if (data.count >= 2) {
        entities.push({ type: data.type, name, count: data.count });
      }
    }

    return entities.sort((a, b) => b.count - a.count).slice(0, 20);
  },

  // ============ Helper Methods ============

  // Extract plain text from EditorJS content
  extractText(content: EditorJSContent): string {
    const blocks = content?.blocks || [];
    return blocks
      .map((block) => {
        switch (block.type) {
          case 'paragraph':
          case 'header':
          case 'quote':
            return String(block.data?.text || '').replace(/<[^>]+>/g, '');
          case 'list':
            return ((block.data?.items || []) as string[]).join(' ');
          case 'code':
            return String(block.data?.code || '');
          default:
            return '';
        }
      })
      .join(' ');
  },

  // Get sentences from text
  getSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  },

  // Get words from text
  getWords(text: string): string[] {
    return text.split(/\s+/).filter((w) => w.length > 0);
  },

  // Get paragraphs from content
  getParagraphs(content: EditorJSContent): string[] {
    const blocks = content?.blocks || [];
    return blocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => String(b.data?.text || ''));
  },

  // Count syllables in a word
  countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;

    const vowels = 'aeiouy';
    let count = 0;
    let prevWasVowel = false;

    for (const char of word) {
      const isVowel = vowels.includes(char);
      if (isVowel && !prevWasVowel) {
        count++;
      }
      prevWasVowel = isVowel;
    }

    // Adjust for silent e
    if (word.endsWith('e') && count > 1) {
      count--;
    }
    // Ensure at least one syllable
    return Math.max(1, count);
  },

  // Check if word is a stop word
  isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
      'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
      'also', 'now', 'will', 'should', 'would', 'could', 'this', 'that',
      'these', 'those', 'which', 'who', 'whom', 'what', 'have', 'has', 'had',
      'been', 'being', 'was', 'were', 'are', 'can', 'did', 'does', 'done',
    ]);
    return stopWords.has(word);
  },

  // ============ Plagiarism Check ============

  // Check for potential plagiarism (simplified)
  async checkPlagiarism(_draftId: string): Promise<PlagiarismResult> {
    // In production, this would use external plagiarism detection APIs
    // For now, return a placeholder
    return {
      isPotentialDuplicate: false,
      similarityScore: 0,
      matches: [],
    };
  },
};
