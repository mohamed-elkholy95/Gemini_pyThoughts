import { beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3002';
process.env.BETTER_AUTH_SECRET = 'test-secret-key-for-testing-min-32-characters';
process.env.BETTER_AUTH_URL = 'http://localhost:3002';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pythoughts_test';
process.env.CORS_ORIGIN = 'http://localhost:3000';

// Global test setup
beforeAll(async () => {
  // Add any global setup here
  console.log('Test suite starting...');
});

afterAll(async () => {
  // Add any global cleanup here
  console.log('Test suite finished');
});

afterEach(async () => {
  // Reset any mocks after each test
});
