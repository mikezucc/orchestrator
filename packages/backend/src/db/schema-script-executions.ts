import { pgTable, serial, text, timestamp, integer, jsonb, varchar, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { virtualMachines } from './schema';
import { scripts } from './schema-scripts';
import { authUsers } from './schema-auth';

export const scriptExecutions = pgTable('script_executions', {
  id: serial('id').primaryKey(),
  
  // Script information
  scriptId: text('script_id').references(() => scripts.id, { onDelete: 'set null' }),
  scriptName: varchar('script_name', { length: 255 }).notNull(),
  scriptContent: text('script_content').notNull(),
  
  // Execution context
  vmId: varchar('vm_id', { length: 255 }).references(() => virtualMachines.id, { onDelete: 'cascade' }),
  executedBy: varchar('executed_by', { length: 255 }).notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  
  // Execution details
  executionType: varchar('execution_type', { length: 50 }).notNull(), // 'manual', 'boot', 'scheduled', etc.
  status: varchar('status', { length: 50 }).notNull().default('running'), // 'running', 'completed', 'failed', 'cancelled'
  exitCode: integer('exit_code'),
  
  // Timing
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  
  // Output storage
  logOutput: text('log_output'), // Full combined stdout/stderr output
  errorOutput: text('error_output'), // Separate error output if needed
  
  // Metadata
  metadata: jsonb('metadata'), // Additional context like environment variables, parameters, etc.
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    vmIdIdx: index('script_executions_vm_id_idx').on(table.vmId),
    scriptIdIdx: index('script_executions_script_id_idx').on(table.scriptId),
    executedByIdx: index('script_executions_executed_by_idx').on(table.executedBy),
    statusIdx: index('script_executions_status_idx').on(table.status),
    startedAtIdx: index('script_executions_started_at_idx').on(table.startedAt),
  };
});

export const scriptExecutionRelations = relations(scriptExecutions, ({ one }) => ({
  script: one(scripts, {
    fields: [scriptExecutions.scriptId],
    references: [scripts.id],
  }),
  virtualMachine: one(virtualMachines, {
    fields: [scriptExecutions.vmId],
    references: [virtualMachines.id],
  }),
  user: one(authUsers, {
    fields: [scriptExecutions.executedBy],
    references: [authUsers.id],
  }),
}));

// Helper type for inserting script executions
export type NewScriptExecution = typeof scriptExecutions.$inferInsert;
export type ScriptExecution = typeof scriptExecutions.$inferSelect;