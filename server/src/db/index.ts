import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';

// Create postgres connection
const connectionString = env.DATABASE_URL;

// For query purposes
const queryClient = postgres(connectionString);

// Create drizzle database instance
export const db = drizzle(queryClient, { schema });

// Export schema for convenience
export * from './schema.js';

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
