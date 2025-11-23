// API Integration Tests
import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';

// Helper to make requests to the app
async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const { method = 'GET', body, headers = {} } = options;

  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return app.fetch(req);
}

describe('Health Endpoints', () => {
  it('GET /health should return health status', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('services');
  });

  it('GET /metrics should return Prometheus metrics', async () => {
    const res = await request('/metrics');
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('http_requests');
  });
});

describe('API Info', () => {
  it('GET /api should return API information', async () => {
    const res = await request('/api');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe('Pythoughts API');
    expect(data.version).toBe('1.0.0');
    expect(data.endpoints).toHaveProperty('auth');
    expect(data.endpoints).toHaveProperty('drafts');
    expect(data.endpoints).toHaveProperty('articles');
  });
});

describe('Articles API (Public)', () => {
  describe('GET /api/articles', () => {
    it('should return paginated articles', async () => {
      const res = await request('/api/articles');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('articles');
      expect(data).toHaveProperty('pagination');
      expect(Array.isArray(data.articles)).toBe(true);
    });

    it('should support pagination parameters', async () => {
      const res = await request('/api/articles?page=1&limit=5');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/articles/featured', () => {
    it('should return featured articles', async () => {
      const res = await request('/api/articles/featured');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('articles');
      expect(Array.isArray(data.articles)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const res = await request('/api/articles/featured?limit=3');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.articles.length).toBeLessThanOrEqual(3);
    });
  });

  describe('GET /api/articles/recommended', () => {
    it('should return recommended articles', async () => {
      const res = await request('/api/articles/recommended');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('articles');
    });
  });
});

describe('Tags API', () => {
  describe('GET /api/tags', () => {
    it('should return list of tags', async () => {
      const res = await request('/api/tags');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('tags');
      expect(Array.isArray(data.tags)).toBe(true);
    });
  });

  describe('GET /api/tags/popular', () => {
    it('should return popular tags', async () => {
      const res = await request('/api/tags/popular');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('tags');
    });
  });
});

describe('Feed API', () => {
  describe('GET /api/feed', () => {
    it('should return feed articles', async () => {
      const res = await request('/api/feed');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('articles');
      expect(data).toHaveProperty('pagination');
    });
  });
});

describe('Search API', () => {
  describe('GET /api/search', () => {
    it('should require query parameter', async () => {
      const res = await request('/api/search');
      expect(res.status).toBe(400);
    });

    it('should return search results', async () => {
      const res = await request('/api/search?q=test');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('articles');
    });
  });
});

describe('Error Handling', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request('/api/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should return JSON error response', async () => {
    const res = await request('/api/nonexistent');
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });
});
