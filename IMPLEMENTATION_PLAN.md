# Pythoughts: Mockup to Production Implementation Plan

## Executive Summary

This document outlines the comprehensive plan to transition Pythoughts from a mockup-based frontend to a fully production-ready application with real backend integration.

---

## Phase 1: UI Audit & Component Mapping

### 1.1 Frontend Pages Requiring Backend Integration

| Page | Current State | Backend Requirements | Priority |
|------|---------------|---------------------|----------|
| **Feed** | Mock articles from constants.tsx | Feed API (personalized, trending) | HIGH |
| **Article** | Mock article with hardcoded content | Articles API, Comments API | HIGH |
| **Editor** | EditorJS integrated, API ready | Drafts API (CRUD, auto-save) | HIGH |
| **Drafts** | Mock MOCK_DRAFTS array | Drafts API (list, status filter) | HIGH |
| **Profile** | Hardcoded user data | Users API (getMe, bookmarks) | HIGH |
| **Person Profile** | Hardcoded profile data | Users API (getProfile, follow) | MEDIUM |
| **Storage** | Static bookmarks list | Users API (getBookmarks) | MEDIUM |
| **Stats** | Static monthly stats | Analytics API (user stats) | MEDIUM |
| **Following** | Mock MOCK_FOLLOWING_FEED | Users API (getFollowing), Feed API | MEDIUM |
| **Settings** | Static settings form | Users API (updateMe) | LOW |
| **Landing** | No data needed | None (static) | DONE |

### 1.2 UI Components Requiring Data Integration

| Component | Mock Data Location | Real Data Source |
|-----------|-------------------|------------------|
| ArticleCard | MOCK_ARTICLES | GET /api/feed or /api/articles |
| SidebarRight | STAFF_PICKS, TOPICS | GET /api/feed?type=trending, GET /api/tags |
| SidebarLeft | Following list hardcoded | GET /api/users/:id/following |
| Notifications | Hardcoded in App.tsx | GET /api/notifications |
| UserAvatar | Hardcoded "Felix" | GET /api/auth/session |
| DraftsPage | MOCK_DRAFTS | GET /api/drafts |
| FollowingPage | MOCK_FOLLOWING_FEED | GET /api/feed?type=following |
| PersonProfilePage | Hardcoded profile | GET /api/users/:id |
| StatsPage | Static numbers | GET /api/analytics/user/:id |

### 1.3 Mock Data Files to Remove

```
1. constants.tsx - MOCK_ARTICLES, STAFF_PICKS, TOPICS
2. components/DraftsPage.tsx - MOCK_DRAFTS array
3. components/FollowingPage.tsx - MOCK_FOLLOWING_FEED
4. components/PersonProfilePage.tsx - Hardcoded profile data
5. components/SidebarLeft.tsx - Hardcoded following list
6. components/SidebarRightProfile.tsx - Hardcoded following list
7. App.tsx - Hardcoded notifications, user "Felix"
```

---

## Phase 2: Backend Feature Gap Analysis

### 2.1 Existing Backend Endpoints ✅

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/auth/**` | GET/POST | Authentication | ✅ Ready |
| `/api/drafts` | GET/POST/PATCH/DELETE | Draft CRUD | ✅ Ready |
| `/api/articles` | GET | Published articles | ✅ Ready |
| `/api/users` | GET/PATCH | User management | ✅ Ready |
| `/api/comments` | GET/POST/DELETE | Comments | ✅ Ready |
| `/api/feed` | GET | Feed types | ✅ Ready |
| `/api/notifications` | GET/PATCH | Notifications | ✅ Ready |
| `/api/search` | GET | Full-text search | ✅ Ready |
| `/api/upload` | POST | File uploads | ✅ Ready |
| `/api/webhooks` | GET/POST | Webhooks | ✅ Ready |
| `/api/admin` | GET | Admin stats | ✅ Ready |

### 2.2 Missing/Incomplete Backend Features

| Feature | Current State | Required Action |
|---------|---------------|-----------------|
| Staff Picks | Not implemented | Add featured articles endpoint |
| Topics/Tags | Schema exists | Add tags listing endpoint |
| User Analytics | Service exists | Expose via API endpoint |
| Reading Lists | Not implemented | Add lists table and endpoints |
| Highlights | Not implemented | Add highlights feature |
| Publication Following | Not implemented | Extend follows system |

### 2.3 New Endpoints Required

```typescript
// Tags/Topics
GET /api/tags                    // List all tags
GET /api/tags/popular            // Popular tags

// User Analytics (expose existing service)
GET /api/analytics/me            // Current user analytics
GET /api/analytics/articles/:id  // Article analytics

// Featured Content
GET /api/articles/featured       // Staff picks/featured articles
GET /api/articles/recommended    // Personalized recommendations

// Reading Lists
GET /api/lists                   // User's reading lists
POST /api/lists                  // Create list
GET /api/lists/:id               // Get list with items
POST /api/lists/:id/items        // Add to list
DELETE /api/lists/:id/items/:itemId  // Remove from list
```

---

## Phase 3: Implementation Tasks

### 3.1 Backend Additions (Priority Order)

#### HIGH Priority - Core Functionality

**Task B1: Tags API Endpoint**
```
File: server/src/routes/tags.ts
- GET / - List all tags with article counts
- GET /popular - Most used tags
```

**Task B2: User Analytics API**
```
File: server/src/routes/analytics.ts
- GET /me - Current user's article stats
- GET /articles/:id - Specific article analytics
```

**Task B3: Featured Articles Endpoint**
```
File: server/src/routes/articles.ts (extend)
- GET /featured - Staff picks/featured articles
- Add 'isFeatured' field to drafts schema
```

#### MEDIUM Priority - Enhanced Features

**Task B4: Reading Lists Feature**
```
New files:
- server/src/db/schema.ts (add lists, listItems tables)
- server/src/services/lists.service.ts
- server/src/routes/lists.ts
```

**Task B5: Highlights Feature**
```
New files:
- server/src/db/schema.ts (add highlights table)
- server/src/services/highlights.service.ts
- server/src/routes/highlights.ts
```

### 3.2 Frontend Integration (Priority Order)

#### HIGH Priority - Core Pages

**Task F1: Feed Page Integration**
```typescript
// Replace MOCK_ARTICLES with real API call
// File: App.tsx or create FeedPage.tsx

import { feedApi, articlesApi } from './lib/api';

useEffect(() => {
  const loadFeed = async () => {
    const response = await feedApi.getFeed({ type: 'personalized', page: 1 });
    setArticles(response.data?.articles || []);
  };
  loadFeed();
}, []);
```

**Task F2: Article Page Integration**
```typescript
// File: components/ArticlePage.tsx
// Replace selectedArticle with API fetch

const loadArticle = async (articleId: string) => {
  const response = await articlesApi.get(articleId);
  setArticle(response.data);
};
```

**Task F3: Drafts Page Integration**
```typescript
// File: components/DraftsPage.tsx
// Remove MOCK_DRAFTS, use useDrafts hook

const { drafts, isLoading, fetchDrafts } = useDrafts();
useEffect(() => {
  fetchDrafts({ status: activeTab });
}, [activeTab]);
```

**Task F4: Authentication Integration**
```typescript
// File: App.tsx
// Wrap app with AuthProvider, use useAuth

const { user, isAuthenticated, isLoading } = useAuth();
// Replace hardcoded "Felix" with user.name
// Replace mo********@gmail.com with user.email
```

#### MEDIUM Priority - Secondary Pages

**Task F5: Profile Page Integration**
```typescript
// File: components/ProfilePage.tsx
const loadProfile = async () => {
  const [profile, bookmarks] = await Promise.all([
    usersApi.getMe(),
    usersApi.getBookmarks({ page: 1 })
  ]);
};
```

**Task F6: Sidebar Integration**
```typescript
// File: components/SidebarRight.tsx
// Replace STAFF_PICKS, TOPICS with API calls

const loadSidebarData = async () => {
  const [featured, topics] = await Promise.all([
    articlesApi.getFeatured(),
    tagsApi.getPopular()
  ]);
};
```

**Task F7: Notifications Integration**
```typescript
// File: App.tsx
// Replace hardcoded notifications

const loadNotifications = async () => {
  const response = await notificationsApi.list({ page: 1, limit: 10 });
  setNotifications(response.data?.notifications || []);
};
```

### 3.3 Mockup Removal Checklist

```markdown
[ ] Remove MOCK_ARTICLES from constants.tsx
[ ] Remove STAFF_PICKS from constants.tsx
[ ] Remove TOPICS from constants.tsx
[ ] Remove MOCK_DRAFTS from DraftsPage.tsx
[ ] Remove MOCK_FOLLOWING_FEED from FollowingPage.tsx
[ ] Remove hardcoded profile from PersonProfilePage.tsx
[ ] Remove hardcoded following from SidebarLeft.tsx
[ ] Remove hardcoded following from SidebarRightProfile.tsx
[ ] Remove hardcoded notifications from App.tsx
[ ] Remove hardcoded user "Felix" from App.tsx
[ ] Remove placeholder email from App.tsx
[ ] Remove DiceBear avatar URLs (use real uploaded images)
[ ] Remove Picsum photo URLs (use real cover images)
```

---

## Phase 4: Testing Strategy

### 4.1 Backend Unit Tests

```typescript
// tests/unit/
- feed.service.test.ts
- drafts.service.test.ts
- comments.service.test.ts
- notifications.service.test.ts
- analytics.service.test.ts
- tags.service.test.ts
```

### 4.2 API Integration Tests

```typescript
// tests/integration/
- auth.api.test.ts
- drafts.api.test.ts
- articles.api.test.ts
- users.api.test.ts
- feed.api.test.ts
- comments.api.test.ts
- notifications.api.test.ts
```

### 4.3 Frontend Component Tests

```typescript
// src/__tests__/
- ArticleCard.test.tsx
- DraftsPage.test.tsx
- EditorPage.test.tsx
- FeedPage.test.tsx
- ProfilePage.test.tsx
```

### 4.4 E2E Tests

```typescript
// e2e/
- auth.flow.test.ts (signup, signin, signout)
- draft.flow.test.ts (create, edit, publish)
- article.flow.test.ts (read, comment, like)
- profile.flow.test.ts (view, follow, bookmark)
```

---

## Phase 5: Production Configuration

### 5.1 Environment Variables

```env
# Frontend (.env.production)
VITE_API_URL=https://api.pythoughts.com
VITE_APP_URL=https://pythoughts.com

# Backend (.env.production)
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SMTP_HOST=smtp.sendgrid.net
S3_BUCKET=pythoughts-uploads
```

### 5.2 Security Checklist

```markdown
[ ] HTTPS enforcement
[ ] CORS configuration for production domains
[ ] Rate limiting configured
[ ] SQL injection prevention (Drizzle ORM handles)
[ ] XSS prevention (sanitize-html configured)
[ ] CSRF protection
[ ] Secure session cookies
[ ] Environment variables secured
[ ] API authentication required
[ ] Input validation on all endpoints
```

### 5.3 Performance Optimization

```markdown
[ ] Redis caching enabled
[ ] Database connection pooling
[ ] Image optimization (Sharp configured)
[ ] CDN for static assets
[ ] Gzip compression
[ ] Code splitting (Vite handles)
[ ] Lazy loading for images
[ ] Database indexes verified
```

### 5.4 Monitoring & Logging

```markdown
[ ] Pino logging configured
[ ] Request tracing enabled
[ ] Health check endpoints working
[ ] Error tracking (audit logs)
[ ] Performance metrics (analytics service)
[ ] Graceful shutdown configured
```

---

## Phase 6: Implementation Timeline

### Sprint 1: Core Integration (Week 1-2)
- [ ] B1: Tags API endpoint
- [ ] B2: User Analytics API
- [ ] B3: Featured articles endpoint
- [ ] F1: Feed page API integration
- [ ] F2: Article page API integration
- [ ] F3: Drafts page API integration
- [ ] F4: Authentication integration

### Sprint 2: Secondary Features (Week 3)
- [ ] F5: Profile page integration
- [ ] F6: Sidebar integration
- [ ] F7: Notifications integration
- [ ] Remove all mock data
- [ ] Backend unit tests

### Sprint 3: Testing & Polish (Week 4)
- [ ] API integration tests
- [ ] Frontend component tests
- [ ] E2E tests
- [ ] Performance optimization
- [ ] Security audit

### Sprint 4: Production Deployment (Week 5)
- [ ] Production environment setup
- [ ] CI/CD pipeline configuration
- [ ] Monitoring setup
- [ ] Documentation finalization
- [ ] Launch

---

## Appendix A: File Change Summary

### New Backend Files
```
server/src/routes/tags.ts
server/src/routes/analytics.ts
server/src/routes/lists.ts
server/src/services/lists.service.ts
server/src/services/highlights.service.ts
```

### Modified Backend Files
```
server/src/index.ts (add new routes)
server/src/db/schema.ts (add lists, highlights tables)
server/src/routes/articles.ts (add featured endpoint)
```

### Modified Frontend Files
```
App.tsx (auth integration, remove hardcoded data)
components/ArticlePage.tsx (API integration)
components/DraftsPage.tsx (remove mock, use hook)
components/ProfilePage.tsx (API integration)
components/FollowingPage.tsx (remove mock)
components/PersonProfilePage.tsx (remove hardcoded)
components/SidebarLeft.tsx (API integration)
components/SidebarRight.tsx (API integration)
components/SidebarRightProfile.tsx (remove hardcoded)
constants.tsx (remove or delete entirely)
```

### New Frontend Files
```
lib/api.ts (add missing API methods)
lib/hooks/useFeed.ts
lib/hooks/useNotifications.ts
lib/hooks/useTags.ts
```

---

## Appendix B: API Contract Updates

### New API Endpoints Specification

```typescript
// Tags
GET /api/tags
Response: { tags: Array<{ id, name, slug, description, articleCount }> }

GET /api/tags/popular?limit=10
Response: { tags: Array<{ id, name, slug, articleCount }> }

// Analytics
GET /api/analytics/me
Response: {
  totalArticles, totalViews, totalLikes, totalComments,
  totalFollowers, totalFollowing, engagementRate
}

GET /api/analytics/articles/:id
Response: {
  views, uniqueViews, likes, comments, readTime,
  engagementRate, viewsTimeline: Array<{ date, views }>
}

// Featured
GET /api/articles/featured?limit=5
Response: { articles: Array<Article> }
```

---

*Document Version: 1.0*
*Last Updated: 2025-11-23*
