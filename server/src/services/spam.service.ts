// Spam Detection Service
// Multi-signal spam detection with pattern matching and rate limiting

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../config/logger.js';
import { cacheService } from './cache.service.js';
import { trustService } from './trust.service.js';

// Spam detection weights
const SPAM_WEIGHTS = {
  linkDensity: 0.3,
  repetition: 0.2,
  velocity: 0.25,
  patternMatch: 0.25,
} as const;

// Spam patterns (regex)
const SPAM_PATTERNS = [
  // URL patterns
  /(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl|goo\.gl|t\.co|rebrand\.ly)/gi,
  // Common spam phrases
  /(?:buy now|click here|free money|earn \$|make money fast|limited time offer)/gi,
  // Excessive caps
  /(?:[A-Z]{5,}\s*){3,}/g,
  // Repeated characters
  /(.)\1{4,}/g,
  // Excessive punctuation
  /[!?]{3,}/g,
  // Cryptocurrency spam
  /(?:bitcoin|crypto|nft|blockchain).*(?:invest|buy|profit|earn)/gi,
  // Adult content markers
  /(?:18\+|xxx|adult|nsfw).*(?:content|site|video)/gi,
] as const;

// Suspicious link domains
const SUSPICIOUS_DOMAINS = [
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'rebrand.ly',
  'shorturl.at',
  'cutt.ly',
];

interface SpamAnalysis {
  isSpam: boolean;
  score: number;
  signals: {
    linkDensity: number;
    repetitionScore: number;
    velocityScore: number;
    patternScore: number;
  };
  matchedPatterns: string[];
  recommendation: 'allow' | 'review' | 'block';
}

interface ContentInput {
  text: string;
  userId: string;
  contentType: 'article' | 'comment';
  ipAddress?: string;
}

export const spamService = {
  // Analyze content for spam
  async analyzeContent(input: ContentInput): Promise<SpamAnalysis> {
    const { text, userId, contentType, ipAddress } = input;

    // Calculate individual signals
    const linkDensity = this.calculateLinkDensity(text);
    const repetitionScore = this.calculateRepetitionScore(text);
    const velocityScore = await this.calculateVelocityScore(userId, contentType);
    const { patternScore, matchedPatterns } = this.calculatePatternScore(text);

    // Weighted total score
    const totalScore =
      linkDensity * SPAM_WEIGHTS.linkDensity +
      repetitionScore * SPAM_WEIGHTS.repetition +
      velocityScore * SPAM_WEIGHTS.velocity +
      patternScore * SPAM_WEIGHTS.patternMatch;

    // Adjust based on trust score
    const trustScore = await trustService.calculateTrustScore(userId);
    const adjustedScore = totalScore * (1 - trustScore.score * 0.5);

    // Determine action
    let recommendation: 'allow' | 'review' | 'block';
    if (adjustedScore >= 0.8) {
      recommendation = 'block';
    } else if (adjustedScore >= 0.5) {
      recommendation = 'review';
    } else {
      recommendation = 'allow';
    }

    const analysis: SpamAnalysis = {
      isSpam: adjustedScore >= 0.7,
      score: adjustedScore,
      signals: {
        linkDensity,
        repetitionScore,
        velocityScore,
        patternScore,
      },
      matchedPatterns,
      recommendation,
    };

    // Log spam detection
    if (analysis.isSpam || analysis.recommendation === 'review') {
      logger.warn(
        { userId, contentType, score: adjustedScore, recommendation, ipAddress },
        'Potential spam detected'
      );

      // Track spam attempts for rate limiting
      await this.recordSpamAttempt(userId, ipAddress);
    }

    return analysis;
  },

  // Calculate link density (ratio of links to text)
  calculateLinkDensity(text: string): number {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = text.match(urlRegex) || [];
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    if (words.length === 0) return 0;

    // Check for suspicious shortened URLs
    const suspiciousUrls = urls.filter((url) =>
      SUSPICIOUS_DOMAINS.some((domain) => url.toLowerCase().includes(domain))
    );

    const linkRatio = urls.length / words.length;
    const suspiciousRatio = suspiciousUrls.length > 0 ? 0.3 : 0;

    return Math.min(linkRatio * 5 + suspiciousRatio, 1);
  },

  // Calculate repetition score (repeated words/phrases)
  calculateRepetitionScore(text: string): number {
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length < 5) return 0;

    // Count word frequencies
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Calculate repetition ratio
    let repetitionCount = 0;
    for (const count of wordCounts.values()) {
      if (count > 3) {
        repetitionCount += count - 3;
      }
    }

    const repetitionRatio = repetitionCount / words.length;

    // Check for repeated phrases (n-grams)
    const ngrams = this.getNgrams(words, 3);
    const ngramCounts = new Map<string, number>();
    for (const ngram of ngrams) {
      ngramCounts.set(ngram, (ngramCounts.get(ngram) || 0) + 1);
    }

    let phraseRepetition = 0;
    for (const count of ngramCounts.values()) {
      if (count > 2) {
        phraseRepetition += count - 2;
      }
    }

    const phraseRatio = ngrams.length > 0 ? phraseRepetition / ngrams.length : 0;

    return Math.min((repetitionRatio + phraseRatio) * 2, 1);
  },

  // Get n-grams from words
  getNgrams(words: string[], n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  },

  // Calculate velocity score (posting frequency)
  async calculateVelocityScore(userId: string, contentType: string): Promise<number> {
    const timeWindows = [
      { minutes: 5, threshold: 3 },
      { minutes: 60, threshold: 10 },
      { minutes: 1440, threshold: 50 }, // 24 hours
    ];

    let maxScore = 0;

    for (const window of timeWindows) {
      const windowStart = new Date(Date.now() - window.minutes * 60 * 1000);

      const tableName = contentType === 'article' ? 'drafts' : 'comments';
      const authorColumn = contentType === 'article' ? 'author_id' : 'author_id';

      const [result] = await db.execute(sql`
        SELECT COUNT(*) as count FROM ${sql.raw(tableName)}
        WHERE ${sql.raw(authorColumn)} = ${userId}
          AND created_at > ${windowStart}
      `);

      const count = Number((result as unknown as { count: number }).count);
      const velocityRatio = count / window.threshold;

      if (velocityRatio > maxScore) {
        maxScore = velocityRatio;
      }
    }

    return Math.min(maxScore, 1);
  },

  // Calculate pattern match score
  calculatePatternScore(text: string): { patternScore: number; matchedPatterns: string[] } {
    const matchedPatterns: string[] = [];

    for (const pattern of SPAM_PATTERNS) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        matchedPatterns.push(pattern.source);
      }
    }

    // Score based on number of matched patterns
    const patternScore = Math.min(matchedPatterns.length / 3, 1);

    return { patternScore, matchedPatterns };
  },

  // Record spam attempt for tracking
  async recordSpamAttempt(userId: string, ipAddress?: string): Promise<void> {
    const key = `spam:attempts:${userId}`;
    const current = (await cacheService.get<number>(key)) || 0;
    await cacheService.set(key, current + 1, 3600); // 1 hour TTL

    if (ipAddress) {
      const ipKey = `spam:ip:${ipAddress}`;
      const ipCurrent = (await cacheService.get<number>(ipKey)) || 0;
      await cacheService.set(ipKey, ipCurrent + 1, 3600);
    }
  },

  // Check if user is blocked for spam
  async isBlocked(userId: string, ipAddress?: string): Promise<{ blocked: boolean; reason?: string }> {
    // Check user spam attempts
    const userKey = `spam:attempts:${userId}`;
    const userAttempts = (await cacheService.get<number>(userKey)) || 0;

    if (userAttempts >= 5) {
      return { blocked: true, reason: 'Too many spam attempts' };
    }

    // Check IP spam attempts
    if (ipAddress) {
      const ipKey = `spam:ip:${ipAddress}`;
      const ipAttempts = (await cacheService.get<number>(ipKey)) || 0;

      if (ipAttempts >= 10) {
        return { blocked: true, reason: 'IP address blocked for spam' };
      }
    }

    // Check permanent block list
    const blockKey = `spam:blocked:${userId}`;
    const isPermBlocked = await cacheService.get<boolean>(blockKey);

    if (isPermBlocked) {
      return { blocked: true, reason: 'Account blocked for spam' };
    }

    return { blocked: false };
  },

  // Permanently block user for spam
  async blockUser(userId: string, reason: string): Promise<void> {
    const blockKey = `spam:blocked:${userId}`;
    await cacheService.set(blockKey, true, 86400 * 30); // 30 days

    logger.warn({ userId, reason }, 'User blocked for spam');
  },

  // Unblock user
  async unblockUser(userId: string): Promise<void> {
    await cacheService.delete(`spam:blocked:${userId}`);
    await cacheService.delete(`spam:attempts:${userId}`);

    logger.info({ userId }, 'User unblocked from spam list');
  },

  // Quick spam check (lightweight, for middleware)
  async quickCheck(userId: string, ipAddress?: string): Promise<boolean> {
    const { blocked } = await this.isBlocked(userId, ipAddress);
    return blocked;
  },

  // Sanitize content (remove potentially harmful content)
  sanitizeContent(text: string): string {
    // Remove excessive whitespace
    let sanitized = text.replace(/\s+/g, ' ').trim();

    // Remove zero-width characters
    sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Limit consecutive punctuation
    sanitized = sanitized.replace(/([!?.]){3,}/g, '$1$1');

    // Limit consecutive uppercase
    sanitized = sanitized.replace(/([A-Z]{10,})/g, (match) =>
      match.charAt(0) + match.slice(1).toLowerCase()
    );

    return sanitized;
  },

  // Get spam statistics for admin
  async getSpamStats(): Promise<{
    blockedUsers: number;
    recentAttempts: number;
    topPatterns: string[];
  }> {
    // This would typically query a database table
    // For now, return placeholder stats
    return {
      blockedUsers: 0,
      recentAttempts: 0,
      topPatterns: [],
    };
  },
};
