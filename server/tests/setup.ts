// Test Setup
import { vi } from 'vitest';

// Mock logger to reduce noise in tests
vi.mock('../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/pythoughts_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
