// API Versioning Middleware
// Supports header-based and URL-based API versioning

import { Context, MiddlewareHandler, Next } from 'hono';
import { logger } from '../config/logger.js';

export type ApiVersion = 'v1' | 'v2';

export interface VersionConfig {
  defaultVersion: ApiVersion;
  supportedVersions: ApiVersion[];
  deprecatedVersions?: ApiVersion[];
  sunsetVersions?: { version: ApiVersion; sunsetDate: Date }[];
  headerName?: string;
}

const DEFAULT_CONFIG: VersionConfig = {
  defaultVersion: 'v1',
  supportedVersions: ['v1', 'v2'],
  deprecatedVersions: [],
  sunsetVersions: [],
  headerName: 'X-API-Version',
};

// Extract version from request
function extractVersion(c: Context, config: VersionConfig): ApiVersion {
  // 1. Check URL path for version (e.g., /api/v2/users)
  const pathMatch = c.req.path.match(/^\/api\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1] as ApiVersion;
  }

  // 2. Check header
  const headerVersion = c.req.header(config.headerName || 'X-API-Version');
  if (headerVersion && config.supportedVersions.includes(headerVersion as ApiVersion)) {
    return headerVersion as ApiVersion;
  }

  // 3. Check Accept header for versioning (e.g., application/vnd.pythoughts.v2+json)
  const accept = c.req.header('Accept') || '';
  const acceptMatch = accept.match(/application\/vnd\.pythoughts\.(v\d+)\+json/);
  if (acceptMatch && config.supportedVersions.includes(acceptMatch[1] as ApiVersion)) {
    return acceptMatch[1] as ApiVersion;
  }

  // 4. Check query parameter
  const queryVersion = c.req.query('api_version') as ApiVersion;
  if (queryVersion && config.supportedVersions.includes(queryVersion)) {
    return queryVersion;
  }

  // 5. Return default
  return config.defaultVersion;
}

// Check if version is deprecated
function isDeprecated(version: ApiVersion, config: VersionConfig): boolean {
  return config.deprecatedVersions?.includes(version) || false;
}

// Get sunset info for a version
function getSunsetInfo(
  version: ApiVersion,
  config: VersionConfig
): { sunsetDate: Date } | null {
  const sunset = config.sunsetVersions?.find((s) => s.version === version);
  return sunset ? { sunsetDate: sunset.sunsetDate } : null;
}

// Main versioning middleware
export function versioningMiddleware(
  config: Partial<VersionConfig> = {}
): MiddlewareHandler {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context, next: Next) => {
    const version = extractVersion(c, finalConfig);

    // Check if version is supported
    if (!finalConfig.supportedVersions.includes(version)) {
      return c.json(
        {
          error: 'Unsupported API version',
          message: `Version '${version}' is not supported. Supported versions: ${finalConfig.supportedVersions.join(', ')}`,
          supportedVersions: finalConfig.supportedVersions,
        },
        400
      );
    }

    // Set version in context for handlers
    c.set('apiVersion', version);

    // Add version to response headers
    c.header('X-API-Version', version);
    c.header('X-API-Supported-Versions', finalConfig.supportedVersions.join(', '));

    // Add deprecation warning if needed
    if (isDeprecated(version, finalConfig)) {
      c.header('Deprecation', 'true');
      c.header('X-API-Deprecation-Warning', `API version ${version} is deprecated`);

      const sunset = getSunsetInfo(version, finalConfig);
      if (sunset) {
        c.header('Sunset', sunset.sunsetDate.toUTCString());
      }

      logger.warn({ version, path: c.req.path }, 'Deprecated API version used');
    }

    return next();
  };
}

// Helper to get current API version in handlers
export function getApiVersion(c: Context): ApiVersion {
  return (c.get('apiVersion') as ApiVersion) || 'v1';
}

// Version-specific route handling
export function forVersion<T>(
  c: Context,
  handlers: Partial<Record<ApiVersion, () => T>>,
  defaultHandler?: () => T
): T {
  const version = getApiVersion(c);
  const handler = handlers[version] || defaultHandler;

  if (!handler) {
    throw new Error(`No handler for API version ${version}`);
  }

  return handler();
}

// Decorator for version-specific methods
export function apiVersion(version: ApiVersion | ApiVersion[]) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const versions = Array.isArray(version) ? version : [version];

    descriptor.value = function (c: Context, ...args: unknown[]) {
      const currentVersion = getApiVersion(c);

      if (!versions.includes(currentVersion)) {
        return c.json(
          {
            error: 'Not available',
            message: `This endpoint is not available in API version ${currentVersion}`,
            availableVersions: versions,
          },
          404
        );
      }

      return originalMethod.call(this, c, ...args);
    };

    return descriptor;
  };
}

// Response transformer for different API versions
export interface ResponseTransformer<T, R> {
  (data: T, version: ApiVersion): R;
}

export function transformResponse<T, R>(
  c: Context,
  data: T,
  transformers: Partial<Record<ApiVersion, (data: T) => R>>
): R | T {
  const version = getApiVersion(c);
  const transformer = transformers[version];

  if (transformer) {
    return transformer(data);
  }

  return data;
}

// Example transformers for common entities
export const articleTransformers = {
  v1: (article: Record<string, unknown>) => ({
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: article.content,
    excerpt: article.excerpt,
    author: article.author,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    tags: article.tags,
    viewCount: article.viewCount,
    likeCount: article.likeCount,
  }),
  v2: (article: Record<string, unknown>) => ({
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: article.content,
    summary: article.excerpt, // renamed field
    author: {
      id: (article.author as Record<string, unknown>)?.id,
      name: (article.author as Record<string, unknown>)?.name,
      username: (article.author as Record<string, unknown>)?.username,
      avatar: (article.author as Record<string, unknown>)?.image,
    },
    metadata: {
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      publishedAt: article.publishedAt,
    },
    tags: article.tags,
    stats: {
      views: article.viewCount,
      likes: article.likeCount,
      comments: article.commentCount,
    },
    // V2 includes additional fields
    readingTime: article.readingTime,
    featured: article.featured,
    canonicalUrl: article.canonicalUrl,
  }),
};

export const userTransformers = {
  v1: (user: Record<string, unknown>) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    image: user.image,
    bio: user.bio,
    createdAt: user.createdAt,
  }),
  v2: (user: Record<string, unknown>) => ({
    id: user.id,
    profile: {
      name: user.name,
      username: user.username,
      avatar: user.image,
      bio: user.bio,
      location: user.location,
      website: user.website,
    },
    contact: {
      email: user.email,
      emailVerified: user.emailVerified,
    },
    social: {
      github: user.githubUsername,
      twitter: user.twitterUsername,
    },
    stats: {
      followers: user.followerCount,
      following: user.followingCount,
      articles: user.articleCount,
    },
    metadata: {
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastActiveAt: user.lastActiveAt,
    },
  }),
};

// Version changelog
export const API_CHANGELOG = {
  v1: {
    releaseDate: '2024-01-01',
    status: 'stable',
    description: 'Initial API version',
  },
  v2: {
    releaseDate: '2024-06-01',
    status: 'stable',
    description: 'Improved response structure with nested objects',
    changes: [
      'Renamed excerpt to summary in articles',
      'Nested author information in articles',
      'Added metadata object for timestamps',
      'Added stats object for counts',
      'Added social links to user profiles',
      'Improved error response format',
    ],
  },
};
