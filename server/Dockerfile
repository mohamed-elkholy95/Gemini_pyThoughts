# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 pythoughts

# Copy built application
COPY --from=builder --chown=pythoughts:nodejs /app/dist ./dist
COPY --from=builder --chown=pythoughts:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=pythoughts:nodejs /app/package.json ./

# Copy migrations for production migrations
COPY --from=builder --chown=pythoughts:nodejs /app/migrations ./migrations
COPY --from=builder --chown=pythoughts:nodejs /app/drizzle.config.ts ./

USER pythoughts

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
