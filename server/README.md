# Pythoughts Backend

A comprehensive backend system for content management with draft management, version control, and authentication.

## Tech Stack

- **Runtime:** Node.js 22+
- **Framework:** Hono (ultrafast web framework)
- **Database:** PostgreSQL with Drizzle ORM
- **Authentication:** Better Auth
- **Caching:** Redis (optional)
- **Testing:** Vitest

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Redis (optional, for rate limiting)

### Development Setup

1. **Start database services:**
   ```bash
   docker compose -f ../docker-compose.dev.yml up -d
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Run migrations:**
   ```bash
   npm run db:push
   ```

5. **Seed database (optional):**
   ```bash
   npm run db:seed
   ```

6. **Start development server:**
   ```bash
   npm run dev
   ```

Server runs at http://localhost:3001

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run db:generate` | Generate migrations |
| `npm run db:migrate` | Run migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed database with sample data |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type check without emitting |

## Project Structure

```
server/
├── src/
│   ├── config/         # Configuration files
│   │   ├── auth.ts     # Better Auth setup
│   │   ├── env.ts      # Environment validation
│   │   └── logger.ts   # Pino logger setup
│   ├── db/
│   │   ├── index.ts    # Database connection
│   │   ├── schema.ts   # Drizzle schema
│   │   └── seed.ts     # Database seeding
│   ├── middleware/
│   │   ├── auth.ts     # Auth middleware
│   │   ├── errorHandler.ts
│   │   └── rateLimiter.ts
│   ├── routes/
│   │   ├── drafts.ts   # Draft management routes
│   │   └── articles.ts # Public articles routes
│   ├── services/
│   │   └── draft.service.ts
│   └── index.ts        # Server entry point
├── tests/
│   ├── unit/           # Unit tests
│   └── integration/    # API tests
├── migrations/         # Database migrations
├── API.md             # API documentation
└── Dockerfile
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | development | Environment mode |
| `PORT` | No | 3001 | Server port |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | - | Auth secret (min 32 chars) |
| `BETTER_AUTH_URL` | No | http://localhost:3001 | Auth base URL |
| `REDIS_URL` | No | - | Redis connection string |
| `CORS_ORIGIN` | No | http://localhost:3000 | Allowed origins |

## Authentication

Authentication is handled by Better Auth with support for:

- Email/Password authentication
- Google OAuth (configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`)
- GitHub OAuth (configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`)

Sessions are stored in PostgreSQL with automatic cleanup.

## API Documentation

See [API.md](./API.md) for complete API documentation.

### Key Endpoints

- `POST /api/auth/sign-up/email` - Register
- `POST /api/auth/sign-in/email` - Login
- `GET /api/drafts` - List drafts (auth required)
- `POST /api/drafts` - Create draft (auth required)
- `GET /api/articles` - List published articles (public)

## Database Schema

### Core Tables

- **users** - User accounts
- **sessions** - Auth sessions
- **accounts** - OAuth providers
- **drafts** - Content drafts
- **draft_versions** - Version history
- **tags** - Content tags
- **comments** - Article comments
- **bookmarks** - User bookmarks
- **follows** - User follows

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/draft.service.test.ts
```

## Deployment

### Docker

```bash
# Build image
docker build -t pythoughts-api .

# Run container
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e BETTER_AUTH_SECRET=your-secret \
  pythoughts-api
```

### Docker Compose

```bash
# Production
docker compose up -d

# Development (DB only)
docker compose -f docker-compose.dev.yml up -d
```

### Kubernetes

Sample deployment available in `/k8s` directory (if applicable).

## Security

- Input validation with Zod
- Content sanitization with sanitize-html
- Rate limiting (100 req/min general, 10 req/15min auth)
- Secure headers via Hono middleware
- CORS configuration
- SQL injection prevention via Drizzle ORM

## Monitoring

- Health check: `GET /health`
- Readiness: `GET /ready`
- Structured logging with Pino

## License

MIT
