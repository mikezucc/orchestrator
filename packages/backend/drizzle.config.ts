import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default {
  schema: ['./src/db/schema-auth.ts', './src/db/schema-scripts.ts', './src/db/schema.ts', './src/db/schema-script-executions.ts', './src/db/schema-moments.ts'],
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgres://orchestrator:orchestrator@localhost:5432/orchestrator',
  },
} satisfies Config;