// OpenAPI Documentation Generator
// Generates OpenAPI 3.0 specification for the API

import { Context } from 'hono';

export interface OpenAPIInfo {
  title: string;
  description: string;
  version: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenAPIServer {
  url: string;
  description?: string;
}

export interface OpenAPITag {
  name: string;
  description?: string;
}

export interface OpenAPISpec {
  openapi: string;
  info: OpenAPIInfo;
  servers: OpenAPIServer[];
  tags: OpenAPITag[];
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
  security?: unknown[];
}

// API Info
const info: OpenAPIInfo = {
  title: 'Pythoughts API',
  description: `
# Pythoughts API Documentation

A modern blogging platform API with support for articles, comments, user profiles, and real-time notifications.

## Authentication

Most endpoints require authentication using Bearer tokens. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <your-token>
\`\`\`

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Anonymous**: 100 requests per minute
- **Authenticated**: 300 requests per minute

Rate limit headers are included in all responses:
- \`X-RateLimit-Limit\`: Request limit
- \`X-RateLimit-Remaining\`: Remaining requests
- \`X-RateLimit-Reset\`: Reset timestamp

## Pagination

List endpoints support pagination with the following query parameters:
- \`page\`: Page number (default: 1)
- \`limit\`: Items per page (default: 20, max: 100)

Pagination info is included in response headers:
- \`X-Total-Count\`: Total number of items
- \`X-Page\`: Current page
- \`X-Limit\`: Items per page
- \`X-Total-Pages\`: Total pages

## Versioning

The API supports versioning via headers or URL:
- Header: \`X-API-Version: v1\`
- URL: \`/api/v1/...\`

Current stable version: **v1**
  `.trim(),
  version: '1.0.0',
  contact: {
    name: 'Pythoughts Support',
    email: 'support@pythoughts.example.com',
  },
  license: {
    name: 'MIT',
    url: 'https://opensource.org/licenses/MIT',
  },
};

// Servers
const servers: OpenAPIServer[] = [
  {
    url: 'http://localhost:3000',
    description: 'Development server',
  },
  {
    url: 'https://api.pythoughts.example.com',
    description: 'Production server',
  },
];

// Tags
const tags: OpenAPITag[] = [
  { name: 'Auth', description: 'Authentication endpoints' },
  { name: 'Users', description: 'User management and profiles' },
  { name: 'Articles', description: 'Article CRUD operations' },
  { name: 'Drafts', description: 'Draft management' },
  { name: 'Comments', description: 'Comment operations' },
  { name: 'Tags', description: 'Tag management' },
  { name: 'Feed', description: 'Content feed endpoints' },
  { name: 'Notifications', description: 'User notifications' },
  { name: 'Search', description: 'Search functionality' },
  { name: 'Analytics', description: 'Analytics and statistics' },
  { name: 'Health', description: 'Health check endpoints' },
];

// Common schemas
const schemas: Record<string, unknown> = {
  Error: {
    type: 'object',
    properties: {
      error: { type: 'string' },
      code: { type: 'string' },
      message: { type: 'string' },
      details: { type: 'array', items: { type: 'object' } },
    },
    required: ['error'],
  },
  Pagination: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  },
  User: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      username: { type: 'string' },
      email: { type: 'string', format: 'email' },
      image: { type: 'string', format: 'uri', nullable: true },
      bio: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Article: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      slug: { type: 'string' },
      content: { type: 'string' },
      excerpt: { type: 'string', nullable: true },
      author: { $ref: '#/components/schemas/User' },
      tags: { type: 'array', items: { type: 'string' } },
      viewCount: { type: 'integer' },
      likeCount: { type: 'integer' },
      commentCount: { type: 'integer' },
      featured: { type: 'boolean' },
      publishedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  ArticleInput: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 200 },
      content: { type: 'string', minLength: 100 },
      excerpt: { type: 'string', maxLength: 500 },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      featured: { type: 'boolean' },
      canonicalUrl: { type: 'string', format: 'uri' },
    },
    required: ['title', 'content'],
  },
  Comment: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      content: { type: 'string' },
      author: { $ref: '#/components/schemas/User' },
      articleId: { type: 'string', format: 'uuid' },
      parentId: { type: 'string', format: 'uuid', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Draft: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', nullable: true },
      content: { type: 'string', nullable: true },
      excerpt: { type: 'string', nullable: true },
      tags: { type: 'array', items: { type: 'string' } },
      authorId: { type: 'string', format: 'uuid' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Notification: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['like', 'comment', 'follow', 'mention', 'system'] },
      message: { type: 'string' },
      link: { type: 'string', nullable: true },
      read: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Tag: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'integer' },
    },
  },
  HealthCheck: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
      timestamp: { type: 'string', format: 'date-time' },
      uptime: { type: 'integer' },
      services: {
        type: 'object',
        properties: {
          database: { type: 'object' },
          cache: { type: 'object' },
          queue: { type: 'object' },
        },
      },
    },
  },
};

// Security schemes
const securitySchemes = {
  BearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'JWT authentication token',
  },
  ApiKeyAuth: {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
    description: 'API key for service-to-service communication',
  },
};

// API Paths
const paths: Record<string, unknown> = {
  // Health endpoints
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Health check',
      description: 'Returns the health status of the API and its dependencies',
      responses: {
        200: {
          description: 'Service is healthy',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HealthCheck' },
            },
          },
        },
        503: { description: 'Service is unhealthy' },
      },
    },
  },
  '/health/ready': {
    get: {
      tags: ['Health'],
      summary: 'Readiness check',
      description: 'Returns whether the service is ready to accept traffic',
      responses: {
        200: { description: 'Service is ready' },
        503: { description: 'Service is not ready' },
      },
    },
  },
  '/health/live': {
    get: {
      tags: ['Health'],
      summary: 'Liveness check',
      description: 'Returns whether the service is alive',
      responses: {
        200: { description: 'Service is alive' },
      },
    },
  },

  // Articles
  '/api/articles': {
    get: {
      tags: ['Articles'],
      summary: 'List articles',
      description: 'Returns a paginated list of published articles',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'tag', in: 'query', schema: { type: 'string' } },
        { name: 'author', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'List of articles',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  articles: { type: 'array', items: { $ref: '#/components/schemas/Article' } },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
      },
    },
    post: {
      tags: ['Articles'],
      summary: 'Create article',
      description: 'Creates a new article (requires authentication)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ArticleInput' },
          },
        },
      },
      responses: {
        201: {
          description: 'Article created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Article' },
            },
          },
        },
        400: { description: 'Validation error' },
        401: { description: 'Unauthorized' },
      },
    },
  },
  '/api/articles/{slug}': {
    get: {
      tags: ['Articles'],
      summary: 'Get article by slug',
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Article details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Article' },
            },
          },
        },
        404: { description: 'Article not found' },
      },
    },
    put: {
      tags: ['Articles'],
      summary: 'Update article',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ArticleInput' },
          },
        },
      },
      responses: {
        200: { description: 'Article updated' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' },
        404: { description: 'Article not found' },
      },
    },
    delete: {
      tags: ['Articles'],
      summary: 'Delete article',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        204: { description: 'Article deleted' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' },
        404: { description: 'Article not found' },
      },
    },
  },

  // Users
  '/api/users/{username}': {
    get: {
      tags: ['Users'],
      summary: 'Get user profile',
      parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'User profile',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
            },
          },
        },
        404: { description: 'User not found' },
      },
    },
  },

  // Search
  '/api/search': {
    get: {
      tags: ['Search'],
      summary: 'Search content',
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'type', in: 'query', schema: { type: 'string', enum: ['articles', 'users', 'tags', 'all'] } },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: {
        200: { description: 'Search results' },
      },
    },
  },

  // Feed
  '/api/feed': {
    get: {
      tags: ['Feed'],
      summary: 'Get public feed',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: {
        200: { description: 'Feed articles' },
      },
    },
  },

  // Tags
  '/api/tags/trending': {
    get: {
      tags: ['Tags'],
      summary: 'Get trending tags',
      responses: {
        200: {
          description: 'List of trending tags',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/Tag' },
              },
            },
          },
        },
      },
    },
  },
};

// Generate complete OpenAPI spec
export function generateOpenAPISpec(): OpenAPISpec {
  return {
    openapi: '3.0.3',
    info,
    servers,
    tags,
    paths,
    components: {
      schemas,
      securitySchemes,
    },
    security: [{ BearerAuth: [] }],
  };
}

// Handler for serving OpenAPI spec
export function openAPIHandler(c: Context) {
  const spec = generateOpenAPISpec();
  return c.json(spec);
}

// Handler for Swagger UI HTML
export function swaggerUIHandler(c: Context) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pythoughts API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        deepLinking: true,
        showExtensions: true,
        showCommonExtensions: true
      });
    };
  </script>
</body>
</html>
  `.trim();

  return c.html(html);
}
