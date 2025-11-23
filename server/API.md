# Pythoughts API Documentation

## Base URL

```
Development: http://localhost:3001/api
Production: https://api.pythoughts.com/api
```

## Authentication

The API uses session-based authentication powered by Better Auth. Include credentials in requests:

```javascript
fetch('/api/drafts', {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Auth Endpoints

#### Register
```http
POST /api/auth/sign-up/email
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

#### Login
```http
POST /api/auth/sign-in/email
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

#### Get Session
```http
GET /api/auth/get-session
```

#### Logout
```http
POST /api/auth/sign-out
```

---

## Drafts API

All draft endpoints require authentication.

### List Drafts
```http
GET /api/drafts?status=draft&page=1&limit=20&search=keyword
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | - | Filter by status: draft, published, archived |
| search | string | - | Search in title and excerpt |
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |

**Response:**
```json
{
  "drafts": [
    {
      "id": "uuid",
      "title": "My Draft",
      "excerpt": "...",
      "status": "draft",
      "wordCount": 500,
      "readingTime": 3,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

### Create Draft
```http
POST /api/drafts
Content-Type: application/json

{
  "title": "My New Draft",
  "content": {
    "time": 1234567890,
    "blocks": [
      {
        "type": "paragraph",
        "data": { "text": "Hello world" }
      }
    ],
    "version": "2.29.0"
  },
  "excerpt": "A brief description",
  "coverImage": "https://example.com/image.jpg"
}
```

**Response:** `201 Created`
```json
{
  "draft": {
    "id": "uuid",
    "title": "My New Draft",
    "content": {...},
    "status": "draft",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### Get Draft
```http
GET /api/drafts/:id
```

### Update Draft
```http
PATCH /api/drafts/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "content": {...},
  "status": "draft",
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

### Auto-Save (No Version)
```http
PUT /api/drafts/:id/autosave
Content-Type: application/json

{
  "content": {
    "blocks": [...]
  }
}
```

**Response:**
```json
{
  "draft": {...},
  "savedAt": "2024-01-01T00:00:00Z"
}
```

### Publish Draft
```http
POST /api/drafts/:id/publish
```

### Unpublish Draft
```http
POST /api/drafts/:id/unpublish
```

### Delete Draft (Soft Delete)
```http
DELETE /api/drafts/:id
```

### Restore Deleted Draft
```http
POST /api/drafts/:id/restore
```

### Permanent Delete
```http
DELETE /api/drafts/:id/permanent
```

---

## Version Control

### Get Draft Versions
```http
GET /api/drafts/:id/versions
```

**Response:**
```json
{
  "versions": [
    {
      "id": "version-uuid",
      "draftId": "draft-uuid",
      "version": 3,
      "title": "Previous Title",
      "content": {...},
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Restore Version
```http
POST /api/drafts/:id/versions/:versionId/restore
```

---

## Tags

### List Tags
```http
GET /api/drafts/tags/all
```

### Create Tag
```http
POST /api/drafts/tags
Content-Type: application/json

{
  "name": "Technology",
  "description": "Tech-related articles"
}
```

---

## Public Articles API

These endpoints don't require authentication.

### List Published Articles
```http
GET /api/articles?page=1&limit=20&author=user-id&search=keyword
```

### Get Article by ID
```http
GET /api/articles/:id
```

### Get Article by Slug
```http
GET /api/articles/slug/:slug
```

---

## Health Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "connected"
  }
}
```

### Readiness Check
```http
GET /ready
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable message",
  "details": [...] // Optional, for validation errors
}
```

### Common HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Rate Limiting

API requests are rate-limited:

- **General endpoints:** 100 requests per minute
- **Auth endpoints:** 10 requests per 15 minutes

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-01T00:00:00Z
```

When rate limited:
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 60
}
```

---

## Editor.js Content Format

The `content` field follows the Editor.js output format:

```json
{
  "time": 1234567890,
  "blocks": [
    {
      "id": "block-id",
      "type": "header",
      "data": {
        "text": "My Header",
        "level": 2
      }
    },
    {
      "id": "block-id-2",
      "type": "paragraph",
      "data": {
        "text": "Paragraph with <b>bold</b> and <i>italic</i> text."
      }
    },
    {
      "id": "block-id-3",
      "type": "list",
      "data": {
        "style": "unordered",
        "items": ["Item 1", "Item 2", "Item 3"]
      }
    }
  ],
  "version": "2.29.0"
}
```

Supported block types:
- `header` - Headings (levels 1-6)
- `paragraph` - Text paragraphs
- `list` - Ordered/unordered lists
- `quote` - Block quotes
- `image` - Images
- `embed` - Embedded content
