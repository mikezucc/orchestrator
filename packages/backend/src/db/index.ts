import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://orchestrator:orchestrator@localhost:5432/orchestrator';

const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });

export type Database = typeof db;