// Content Analysis Routes
// AI-assisted content analysis endpoints

import { Hono } from 'hono';
import { requireAuth, type AuthContext } from '../middleware/auth.js';
import { contentAnalysisService } from '../services/contentAnalysis.service.js';

export const contentAnalysisRouter = new Hono<AuthContext>();

// Get full content analysis
contentAnalysisRouter.get('/drafts/:draftId/analyze', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const analysis = await contentAnalysisService.analyzeContent(draftId);

  if (!analysis) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  return c.json({
    success: true,
    analysis: {
      draftId: analysis.draftId,
      analyzedAt: analysis.analyzedAt.toISOString(),
      metrics: {
        wordCount: analysis.wordCount,
        characterCount: analysis.characterCount,
        sentenceCount: analysis.sentenceCount,
        paragraphCount: analysis.paragraphCount,
        readingTime: analysis.readingTime,
      },
      readability: analysis.readability,
      seo: analysis.seo,
      quality: analysis.quality,
      sentiment: analysis.sentiment,
      topics: analysis.topics,
      entities: analysis.entities,
    },
  });
});

// Get readability analysis only
contentAnalysisRouter.get('/drafts/:draftId/readability', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const analysis = await contentAnalysisService.analyzeContent(draftId);

  if (!analysis) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  return c.json({
    success: true,
    readability: {
      ...analysis.readability,
      wordCount: analysis.wordCount,
      sentenceCount: analysis.sentenceCount,
      readingTime: analysis.readingTime,
    },
  });
});

// Get SEO analysis only
contentAnalysisRouter.get('/drafts/:draftId/seo', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const analysis = await contentAnalysisService.analyzeContent(draftId);

  if (!analysis) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  return c.json({
    success: true,
    seo: analysis.seo,
  });
});

// Get quality analysis only
contentAnalysisRouter.get('/drafts/:draftId/quality', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const analysis = await contentAnalysisService.analyzeContent(draftId);

  if (!analysis) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  return c.json({
    success: true,
    quality: analysis.quality,
  });
});

// Get sentiment analysis only
contentAnalysisRouter.get('/drafts/:draftId/sentiment', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const analysis = await contentAnalysisService.analyzeContent(draftId);

  if (!analysis) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  return c.json({
    success: true,
    sentiment: analysis.sentiment,
  });
});

// Get topics and keywords
contentAnalysisRouter.get('/drafts/:draftId/topics', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const analysis = await contentAnalysisService.analyzeContent(draftId);

  if (!analysis) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  return c.json({
    success: true,
    topics: analysis.topics,
    keywords: analysis.seo.keywordAnalysis,
    entities: analysis.entities,
  });
});

// Check for plagiarism
contentAnalysisRouter.get('/drafts/:draftId/plagiarism', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const result = await contentAnalysisService.checkPlagiarism(draftId);

  return c.json({
    success: true,
    plagiarism: result,
  });
});

// Get writing suggestions
contentAnalysisRouter.get('/drafts/:draftId/suggestions', requireAuth, async (c) => {
  const draftId = c.req.param('draftId');
  const analysis = await contentAnalysisService.analyzeContent(draftId);

  if (!analysis) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  // Compile all suggestions
  const suggestions: {
    category: string;
    priority: 'high' | 'medium' | 'low';
    message: string;
  }[] = [];

  // SEO issues
  for (const issue of analysis.seo.issues) {
    suggestions.push({
      category: 'seo',
      priority: issue.impact as 'high' | 'medium' | 'low',
      message: issue.message,
    });
  }

  // SEO recommendations
  for (const rec of analysis.seo.recommendations) {
    suggestions.push({
      category: 'seo',
      priority: 'medium',
      message: rec,
    });
  }

  // Quality suggestions
  for (const sug of analysis.quality.suggestions) {
    suggestions.push({
      category: 'quality',
      priority: 'medium',
      message: sug,
    });
  }

  // Readability suggestions
  if (analysis.readability.fleschReadingEase < 30) {
    suggestions.push({
      category: 'readability',
      priority: 'high',
      message: 'Content is very difficult to read. Consider simplifying sentences.',
    });
  } else if (analysis.readability.fleschReadingEase < 50) {
    suggestions.push({
      category: 'readability',
      priority: 'medium',
      message: 'Content is fairly difficult. Consider breaking up complex sentences.',
    });
  }

  return c.json({
    success: true,
    suggestions: suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    scores: {
      overall: Math.round(
        (analysis.seo.score + analysis.quality.overallScore + analysis.readability.fleschReadingEase) / 3
      ),
      seo: analysis.seo.score,
      quality: analysis.quality.overallScore,
      readability: analysis.readability.fleschReadingEase,
    },
  });
});
