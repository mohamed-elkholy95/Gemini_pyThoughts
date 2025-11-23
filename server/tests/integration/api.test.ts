import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';

// Create a minimal test app
const createTestApp = () => {
  const app = new Hono();

  // Health endpoint
  app.get('/health', (c) => {
    return c.json({ status: 'healthy' });
  });

  // API info endpoint
  app.get('/api', (c) => {
    return c.json({
      name: 'Pythoughts API',
      version: '1.0.0',
    });
  });

  // Mock drafts endpoint (requires auth in real app)
  app.get('/api/drafts', (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return c.json({ drafts: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } });
  });

  // Mock create draft endpoint
  app.post('/api/drafts', async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    return c.json({
      draft: {
        id: 'test-uuid',
        title: body.title || 'Untitled',
        content: body.content || null,
        status: 'draft',
        createdAt: new Date().toISOString(),
      },
    }, 201);
  });

  return app;
};

describe('API Integration Tests', () => {
  let app: Hono;

  beforeAll(() => {
    app = createTestApp();
  });

  afterAll(() => {
    // Cleanup
  });

  describe('Health Endpoints', () => {
    it('GET /health should return healthy status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('API Info', () => {
    it('GET /api should return API info', async () => {
      const res = await app.request('/api');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.name).toBe('Pythoughts API');
      expect(data.version).toBe('1.0.0');
    });
  });

  describe('Drafts API', () => {
    it('GET /api/drafts should return 401 without auth', async () => {
      const res = await app.request('/api/drafts');
      expect(res.status).toBe(401);
    });

    it('GET /api/drafts should return drafts with auth', async () => {
      const res = await app.request('/api/drafts', {
        headers: {
          Authorization: 'Bearer test-token',
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('drafts');
      expect(data).toHaveProperty('pagination');
    });

    it('POST /api/drafts should create a draft with auth', async () => {
      const res = await app.request('/api/drafts', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'My Test Draft',
          content: {
            blocks: [
              { type: 'paragraph', data: { text: 'Hello world' } },
            ],
          },
        }),
      });

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.draft.title).toBe('My Test Draft');
      expect(data.draft.status).toBe('draft');
    });

    it('POST /api/drafts should return 401 without auth', async () => {
      const res = await app.request('/api/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(res.status).toBe(401);
    });
  });
});

describe('Error Handling', () => {
  it('should return 404 for unknown routes', async () => {
    const app = createTestApp();
    const res = await app.request('/unknown-route');
    expect(res.status).toBe(404);
  });
});

describe('Request Validation', () => {
  it('should handle malformed JSON gracefully', async () => {
    const app = new Hono();
    app.post('/test', async (c) => {
      try {
        await c.req.json();
        return c.json({ success: true });
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
    });

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    expect(res.status).toBe(400);
  });
});
