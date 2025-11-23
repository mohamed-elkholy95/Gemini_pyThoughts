import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, c: Context) {
  const requestId = c.req.header('x-request-id') || 'unknown';

  // Log the error
  logger.error({
    requestId,
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  }, 'Request error');

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return c.json(
      {
        error: 'Validation Error',
        message: 'Invalid request data',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
      400
    );
  }

  // Handle custom app errors
  if (err instanceof AppError) {
    return c.json(
      {
        error: err.code || 'Error',
        message: err.message,
      },
      err.statusCode as 400 | 401 | 403 | 404 | 500
    );
  }

  // Handle Hono HTTP exceptions
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: 'HTTP Error',
        message: err.message,
      },
      err.status
    );
  }

  // Handle unknown errors
  const isDev = env.NODE_ENV === 'development';
  return c.json(
    {
      error: 'Internal Server Error',
      message: isDev ? err.message : 'An unexpected error occurred',
      ...(isDev && { stack: err.stack }),
    },
    500
  );
}

// Not found handler
export function notFoundHandler(c: Context) {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
}
