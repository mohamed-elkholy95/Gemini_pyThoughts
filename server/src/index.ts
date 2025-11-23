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
import { serveStatic } from '@hono/node-server/serve-static';

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
      admin: '/api/admin',
    },
    docs: '/api/docs',
  });
});

// Error handling
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Start server
const port = parseInt(env.PORT);

async function start() {
  // Check database connection
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }

  logger.info('Database connected');

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
