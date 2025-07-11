import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import * as authSchema from './schema-auth.js';
import * as scriptSchema from './schema-scripts.js';
import * as scriptExecutionSchema from './schema-script-executions.js';
import * as momentsSchema from './schema-moments.js';
import * as projectSchema from './schema-projects.js';
import * as vmRepositorySchema from './schema-vm-repositories.js';
import * as daemonSchema from './schema-daemon.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://orchestrator:orchestrator@localhost:5432/orchestrator';

const sql = postgres(connectionString);
export const db = drizzle(sql, { 
  schema: { 
    ...schema, 
    ...authSchema, 
    ...scriptSchema,
    ...scriptExecutionSchema,
    ...momentsSchema,
    ...projectSchema,
    ...vmRepositorySchema,
    ...daemonSchema 
  } 
});

export type Database = typeof db;