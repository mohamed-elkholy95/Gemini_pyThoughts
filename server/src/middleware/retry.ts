// Retry Middleware
// Provides automatic retry logic with exponential backoff for failed operations

import { logger } from '../config/logger.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: (string | RegExp)[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// Common retryable error patterns
const DEFAULT_RETRYABLE_ERRORS = [
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ENETUNREACH/,
  /connection.*refused/i,
  /timeout/i,
  /too many requests/i,
  /rate limit/i,
  /429/,
  /503/,
  /504/,
];

function isRetryableError(error: Error, patterns: (string | RegExp)[]): boolean {
  const message = error.message || '';
  const name = error.name || '';
  const combined = `${name}: ${message}`;

  return patterns.some((pattern) => {
    if (typeof pattern === 'string') {
      return combined.includes(pattern);
    }
    return pattern.test(combined);
  });
}

function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  // Exponential backoff with jitter
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Up to 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

// Retry a function with exponential backoff
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const options: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const retryableErrors = options.retryableErrors || DEFAULT_RETRYABLE_ERRORS;

  let lastError: Error;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const shouldRetry =
        attempt < options.maxAttempts && isRetryableError(lastError, retryableErrors);

      if (!shouldRetry) {
        throw lastError;
      }

      const delayMs = calculateDelay(
        attempt,
        options.initialDelayMs,
        options.maxDelayMs,
        options.backoffMultiplier
      );

      logger.debug(
        {
          attempt,
          maxAttempts: options.maxAttempts,
          delayMs,
          error: lastError.message,
        },
        'Retrying after error'
      );

      if (options.onRetry) {
        options.onRetry(attempt, lastError, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError!;
}

// Retry with circuit breaker integration
export async function retryWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreaker: { execute: <R>(fn: () => Promise<R>) => Promise<R> },
  config: Partial<RetryConfig> = {}
): Promise<T> {
  return retry(() => circuitBreaker.execute(fn), config);
}

// Create a retryable version of any async function
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: unknown[]) => {
    return retry(() => fn(...args), config);
  }) as T;
}

// Decorator for making methods retryable
export function retryable(config: Partial<RetryConfig> = {}) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      return retry(() => originalMethod.apply(this, args), config);
    } as T;

    return descriptor;
  };
}

// Batch retry for multiple operations
export async function retryBatch<T>(
  operations: (() => Promise<T>)[],
  config: Partial<RetryConfig> = {},
  options: {
    concurrency?: number;
    stopOnFirstError?: boolean;
  } = {}
): Promise<{ results: T[]; errors: Error[] }> {
  const { concurrency = 5, stopOnFirstError = false } = options;
  const results: T[] = [];
  const errors: Error[] = [];

  // Process in batches
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);

    const batchPromises = batch.map(async (op, index) => {
      try {
        const result = await retry(op, config);
        return { index: i + index, result, error: null };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return { index: i + index, result: null, error: err };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const { result, error } of batchResults) {
      if (error) {
        errors.push(error);
        if (stopOnFirstError) {
          return { results, errors };
        }
      } else {
        results.push(result as T);
      }
    }
  }

  return { results, errors };
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff iterator
export function* exponentialBackoff(
  initialDelay: number,
  maxDelay: number,
  multiplier: number = 2
): Generator<number> {
  let delay = initialDelay;
  while (true) {
    yield delay;
    delay = Math.min(delay * multiplier, maxDelay);
  }
}

// Rate-limited retry (respects rate limits)
export async function rateLimitedRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> & {
    rateLimitHeader?: string;
    defaultRateLimitDelay?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 5,
    defaultRateLimitDelay = 60000, // 1 minute default
  } = config;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for rate limit errors
      const isRateLimited =
        lastError.message.includes('429') ||
        lastError.message.toLowerCase().includes('rate limit');

      if (!isRateLimited || attempt === maxAttempts) {
        throw lastError;
      }

      // Extract retry-after if available, otherwise use default
      const retryAfterMatch = lastError.message.match(/retry.?after[:\s]+(\d+)/i);
      const delayMs = retryAfterMatch
        ? parseInt(retryAfterMatch[1]) * 1000
        : defaultRateLimitDelay;

      logger.warn(
        {
          attempt,
          delayMs,
        },
        'Rate limited, waiting before retry'
      );

      await sleep(delayMs);
    }
  }

  throw lastError!;
}
