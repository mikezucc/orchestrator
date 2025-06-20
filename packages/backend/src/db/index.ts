import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/gce_platform';

const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });

export type Database = typeof db;