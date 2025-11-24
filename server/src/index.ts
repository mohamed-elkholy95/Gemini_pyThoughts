import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';
import { timing } from 'hono/timing';
import { auth } from './config/auth.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { checkDatabaseConnection } from './db/index.js';
import { rateLimit } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { draftsRouter } from './routes/drafts.js';
import { articlesRouter } from './routes/articles.js';
import { usersRouter } from './routes/users.js';
import { commentsRouter } from './routes/comments.js';
import { feedRouter } from './routes/feed.js';
import { notificationsRouter } from './routes/notifications.js';
import { uploadRouter } from './routes/upload.js';
import { docsRouter } from './routes/docs.js';
import { adminRouter } from './routes/admin.js';
import { searchRouter } from './routes/search.js';
import { webhooksRouter } from './routes/webhooks.js';
import { seoRouter } from './routes/seo.js';
import { tagsRouter } from './routes/tags.js';
import { analyticsRouter } from './routes/analytics.js';
import { jobsRouter } from './routes/jobs.js';
import { seriesRouter } from './routes/series.js';
import { readingListsRouter } from './routes/readingLists.js';
import { reportsRouter } from './routes/reports.js';
import { privacyRouter } from './routes/privacy.js';
import { gamificationRouter } from './routes/gamification.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { lifecycleService } from './services/lifecycle.service.js';
import { cacheService } from './services/cache.service.js';
import { schedulerService } from './services/scheduler.service.js';
import { metricsMiddleware, metricsHandler } from './middleware/metrics.js';

const app = new Hono();

// Global middleware
app.use('*', requestId());
app.use('*', timing());
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN.split(','),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);
app.use('*', secureHeaders());

// Metrics middleware (must be before other middleware)
app.use('*', metricsMiddleware());

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  logger.info({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration: `${duration}ms`,
    requestId: c.get('requestId'),
  });
});

// Rate limiting (exclude auth routes which have their own limiter)
app.use('/api/*', rateLimit);

// Health check
app.get('/health', async (c) => {
  const dbHealthy = await checkDatabaseConnection();

  return c.json({
    status: dbHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
    },
  });
});

// Ready check (for k8s)
app.get('/ready', async (c) => {
  const dbHealthy = await checkDatabaseConnection();

  if (!dbHealthy) {
    return c.json({ ready: false }, 503);
  }

  return c.json({ ready: true });
});

// Prometheus metrics endpoint
app.get('/metrics', metricsHandler);

// Better Auth routes
app.on(['GET', 'POST'], '/api/auth/**', (c) => {
  return auth.handler(c.req.raw);
});

// API routes
app.route('/api/drafts', draftsRouter);
app.route('/api/articles', articlesRouter);
app.route('/api/users', usersRouter);
app.route('/api/comments', commentsRouter);
app.route('/api/feed', feedRouter);
app.route('/api/notifications', notificationsRouter);
app.route('/api/upload', uploadRouter);
app.route('/api/docs', docsRouter);
app.route('/api/admin', adminRouter);
app.route('/api/search', searchRouter);
app.route('/api/webhooks', webhooksRouter);
app.route('/api/tags', tagsRouter);
app.route('/api/analytics', analyticsRouter);
app.route('/api/jobs', jobsRouter);
app.route('/api/series', seriesRouter);
app.route('/api/reading-lists', readingListsRouter);
app.route('/api/reports', reportsRouter);
app.route('/api/privacy', privacyRouter);
app.route('/api/gamification', gamificationRouter);

// SEO routes (RSS, Sitemap, robots.txt)
app.route('/', seoRouter);

// Serve uploaded files
app.use('/uploads/*', serveStatic({ root: './' }));

// API info
app.get('/api', (c) => {
  return c.json({
    name: 'Pythoughts API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      drafts: '/api/drafts',
      articles: '/api/articles',
      users: '/api/users',
      comments: '/api/comments',
      feed: '/api/feed',
      notifications: '/api/notifications',
      upload: '/api/upload',
      search: '/api/search',
      webhooks: '/api/webhooks',
      admin: '/api/admin',
      tags: '/api/tags',
      analytics: '/api/analytics',
      series: '/api/series',
      readingLists: '/api/reading-lists',
      reports: '/api/reports',
      privacy: '/api/privacy',
      gamification: '/api/gamification',
    },
    docs: '/api/docs',
    seo: {
      rss: '/rss',
      sitemap: '/sitemap.xml',
      robots: '/robots.txt',
    },
  });
});

// Error handling
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Start server
const port = parseInt(env.PORT);

async function start() {
  // Initialize lifecycle service (signal handlers)
  lifecycleService.init();

  // Check database connection
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }
  logger.info('Database connected');

  // Connect to Redis cache (optional - degrades gracefully)
  const cacheConnected = await cacheService.connect();
  if (cacheConnected) {
    logger.info('Redis cache connected');
  } else {
    logger.warn('Redis cache not available, running without cache');
  }

  // Start scheduled publishing scheduler
  schedulerService.startScheduler(1); // Check every minute
  logger.info('Publication scheduler started');

  // Start HTTP server
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: env.HOST,
    },
    (info) => {
      logger.info(`Server running at http://${info.address}:${info.port}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
    }
  );
}

start().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});

export default app;
