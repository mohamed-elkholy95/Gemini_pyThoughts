import { Hono } from 'hono';

const docsRouter = new Hono();

// OpenAPI specification
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Pythoughts API',
    description: 'Backend API for Pythoughts - A modern blogging platform',
    version: '1.0.0',
    contact: {
      name: 'API Support',
    },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Development' },
    { url: 'https://api.pythoughts.com', description: 'Production' },
  ],
  tags: [
    { name: 'Auth', description: 'Authentication endpoints' },
    { name: 'Drafts', description: 'Draft management' },
    { name: 'Articles', description: 'Published articles (public)' },
    { name: 'Users', description: 'User profiles and social features' },
    { name: 'Comments', description: 'Article comments' },
    { name: 'Feed', description: 'Content discovery and feed' },
    { name: 'Notifications', description: 'User notifications' },
    { name: 'Upload', description: 'File uploads' },
    { name: 'Admin', description: 'Admin operations' },
  ],
  paths: {
    '/api/auth/sign-up/email': {
      post: {
        tags: ['Auth'],
        summary: 'Register with email',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'User registered successfully' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/api/auth/sign-in/email': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/drafts': {
      get: {
        tags: ['Drafts'],
        summary: 'List user drafts',
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'archived'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: 'List of drafts' },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Drafts'],
        summary: 'Create a new draft',
        security: [{ cookieAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateDraft' },
            },
          },
        },
        responses: {
          '201': { description: 'Draft created' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/drafts/{id}': {
      get: {
        tags: ['Drafts'],
        summary: 'Get draft by ID',
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Draft details' },
          '404': { description: 'Draft not found' },
        },
      },
      patch: {
        tags: ['Drafts'],
        summary: 'Update draft',
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateDraft' },
            },
          },
        },
        responses: {
          '200': { description: 'Draft updated' },
          '404': { description: 'Draft not found' },
        },
      },
      delete: {
        tags: ['Drafts'],
        summary: 'Delete draft (soft delete)',
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Draft deleted' },
          '404': { description: 'Draft not found' },
        },
      },
    },
    '/api/feed': {
      get: {
        tags: ['Feed'],
        summary: 'Get personalized feed',
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['following', 'trending', 'latest', 'personalized'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: 'Feed articles' },
        },
      },
    },
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notifications',
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'unread', in: 'query', schema: { type: 'boolean', default: false } },
        ],
        responses: {
          '200': { description: 'List of notifications' },
        },
      },
    },
    '/api/upload/image': {
      post: {
        tags: ['Upload'],
        summary: 'Upload image',
        security: [{ cookieAuth: [] }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  folder: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'File uploaded' },
          '400': { description: 'Upload failed' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
      },
    },
    schemas: {
      CreateDraft: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 500 },
          content: { $ref: '#/components/schemas/EditorJSContent' },
          excerpt: { type: 'string', maxLength: 1000 },
          coverImage: { type: 'string', format: 'uri' },
        },
      },
      UpdateDraft: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 500 },
          content: { $ref: '#/components/schemas/EditorJSContent' },
          excerpt: { type: 'string', maxLength: 1000 },
          coverImage: { type: 'string', format: 'uri' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          tagIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        },
      },
      EditorJSContent: {
        type: 'object',
        properties: {
          time: { type: 'integer' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                data: { type: 'object' },
              },
            },
          },
          version: { type: 'string' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          image: { type: 'string', format: 'uri' },
          bio: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          pages: { type: 'integer' },
        },
      },
    },
  },
};

// Get OpenAPI spec as JSON
docsRouter.get('/openapi.json', (c) => {
  return c.json(openApiSpec);
});

// Simple API docs viewer
docsRouter.get('/', (c) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Pythoughts API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
      });
    };
  </script>
</body>
</html>
  `.trim();

  return c.html(html);
});

export { docsRouter };
