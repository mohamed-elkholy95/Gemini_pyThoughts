// Real-time SSE Routes
// Provides Server-Sent Events endpoints for notifications and feed updates

import { Hono } from 'hono';
import { requireAuth, getCurrentUser, type AuthContext } from '../middleware/auth.js';
import { realtimeService, generateClientId } from '../services/realtime.service.js';
import { logger } from '../config/logger.js';

const realtimeRouter = new Hono<AuthContext>();

// All realtime routes require authentication
realtimeRouter.use('/*', requireAuth);

// SSE stream for notifications
realtimeRouter.get('/notifications/stream', async (c) => {
  const user = getCurrentUser(c);
  const clientId = generateClientId();

  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const stream = new ReadableStream({
    start(controller) {
      // Register client
      realtimeService.registerClient(clientId, user!.id, controller);

      // Send initial connection event
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId, userId: user!.id })}\n\n`)
      );

      logger.debug({ clientId, userId: user!.id }, 'SSE connection established');
    },
    cancel() {
      // Client disconnected
      realtimeService.unregisterClient(clientId);
      logger.debug({ clientId }, 'SSE connection closed');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

// SSE stream for feed updates
realtimeRouter.get('/feed/stream', async (c) => {
  const user = getCurrentUser(c);
  const clientId = generateClientId();

  const stream = new ReadableStream({
    start(controller) {
      realtimeService.registerClient(clientId, user!.id, controller);

      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId, stream: 'feed' })}\n\n`)
      );
    },
    cancel() {
      realtimeService.unregisterClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Get connection stats (for debugging/admin)
realtimeRouter.get('/stats', async (c) => {
  const stats = realtimeService.getStats();
  return c.json(stats);
});

// Check if a user is online
realtimeRouter.get('/presence/:userId', async (c) => {
  const userId = c.req.param('userId');
  const isOnline = realtimeService.isUserOnline(userId);
  return c.json({ userId, isOnline });
});

export { realtimeRouter };
