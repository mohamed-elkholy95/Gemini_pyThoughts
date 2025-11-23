// Enhanced Request Validation Middleware
// Provides comprehensive request validation with sanitization and error handling

import { Context, MiddlewareHandler, Next } from 'hono';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '../config/logger.js';

export interface ValidationConfig {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  path: (string | number)[];
}

export interface ValidationResult {
  success: boolean;
  errors?: ValidationError[];
  data?: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
    headers?: unknown;
  };
}

// Format Zod errors into friendly format
function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map((e) => ({
    field: e.path.join('.') || 'root',
    message: e.message,
    code: e.code,
    path: e.path,
  }));
}

// Sanitize string input
function sanitizeString(value: string): string {
  return value
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

// Recursively sanitize object values
function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized as T;
  }

  return obj;
}

// Main validation middleware
export function validate(config: ValidationConfig): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const errors: ValidationError[] = [];
    const validatedData: Record<string, unknown> = {};

    // Validate body
    if (config.body) {
      try {
        const rawBody = await c.req.json().catch(() => ({}));
        const sanitizedBody = sanitizeObject(rawBody);
        const result = config.body.parse(sanitizedBody);
        validatedData.body = result;
        c.set('validatedBody', result);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push(...formatZodErrors(error).map((e) => ({ ...e, field: `body.${e.field}` })));
        } else {
          errors.push({
            field: 'body',
            message: 'Invalid request body',
            code: 'invalid_body',
            path: ['body'],
          });
        }
      }
    }

    // Validate query parameters
    if (config.query) {
      try {
        const query = Object.fromEntries(
          Object.entries(c.req.query()).map(([k, v]) => [k, sanitizeObject(v)])
        );
        const result = config.query.parse(query);
        validatedData.query = result;
        c.set('validatedQuery', result);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push(...formatZodErrors(error).map((e) => ({ ...e, field: `query.${e.field}` })));
        }
      }
    }

    // Validate path parameters
    if (config.params) {
      try {
        const params = sanitizeObject(c.req.param());
        const result = config.params.parse(params);
        validatedData.params = result;
        c.set('validatedParams', result);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push(...formatZodErrors(error).map((e) => ({ ...e, field: `params.${e.field}` })));
        }
      }
    }

    // Validate headers
    if (config.headers) {
      try {
        const headers: Record<string, string> = {};
        c.req.raw.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        const result = config.headers.parse(headers);
        validatedData.headers = result;
        c.set('validatedHeaders', result);
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push(
            ...formatZodErrors(error).map((e) => ({ ...e, field: `headers.${e.field}` }))
          );
        }
      }
    }

    // Return errors if validation failed
    if (errors.length > 0) {
      logger.debug({ errors, path: c.req.path }, 'Validation failed');

      return c.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors,
        },
        400
      );
    }

    return next();
  };
}

// Helper to get validated data from context
export function getValidatedBody<T>(c: Context): T {
  return c.get('validatedBody') as T;
}

export function getValidatedQuery<T>(c: Context): T {
  return c.get('validatedQuery') as T;
}

export function getValidatedParams<T>(c: Context): T {
  return c.get('validatedParams') as T;
}

// Common validation schemas
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // ID parameter
  id: z.object({
    id: z.string().uuid(),
  }),

  // Slug parameter
  slug: z.object({
    slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  }),

  // Username parameter
  username: z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  }),

  // Search query
  search: z.object({
    q: z.string().min(1).max(100),
    type: z.enum(['articles', 'users', 'tags', 'all']).optional().default('all'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),

  // Date range
  dateRange: z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),

  // Email
  email: z.string().email().max(255),

  // Password
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),

  // URL
  url: z.string().url().max(2000),

  // Tags array
  tags: z.array(z.string().min(1).max(50)).max(10),
};

// Content validation schemas
export const contentSchemas = {
  // Article
  article: z.object({
    title: z.string().min(3).max(200),
    content: z.string().min(100).max(100000),
    excerpt: z.string().max(500).optional(),
    tags: commonSchemas.tags.optional(),
    featured: z.boolean().optional(),
    canonicalUrl: z.string().url().max(2000).optional(),
  }),

  // Comment
  comment: z.object({
    content: z.string().min(1).max(10000),
    parentId: z.string().uuid().optional(),
  }),

  // User profile update
  profileUpdate: z.object({
    name: z.string().min(2).max(100).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    website: z.string().url().max(200).optional(),
    githubUsername: z.string().max(50).optional(),
    twitterUsername: z.string().max(50).optional(),
  }),

  // Draft
  draft: z.object({
    title: z.string().max(200).optional(),
    content: z.string().max(100000).optional(),
    excerpt: z.string().max(500).optional(),
    tags: commonSchemas.tags.optional(),
  }),
};

// Request rate limiting schemas
export const rateLimitSchemas = {
  // API key header
  apiKey: z.object({
    'x-api-key': z.string().min(32).max(64),
  }),

  // Auth token
  authToken: z.object({
    authorization: z.string().regex(/^Bearer .+$/),
  }),
};

// Validation decorator factory
export function validated(config: ValidationConfig) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (c: Context, ...args: unknown[]) {
      // Run validation
      const middleware = validate(config);
      let validationPassed = false;

      await middleware(c, async () => {
        validationPassed = true;
      });

      if (!validationPassed) {
        return; // Validation already sent error response
      }

      return originalMethod.call(this, c, ...args);
    };

    return descriptor;
  };
}
