import { pgTable, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { virtualMachines } from './schema';
import { projectRepositories } from './schema-projects';
import { authUsers } from './schema-auth';

export const vmRepositories = pgTable('vm_repositories', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  vmId: text('vm_id').references(() => virtualMachines.id, { onDelete: 'cascade' }).notNull(),
  repositoryId: text('repository_id').references(() => projectRepositories.id, { onDelete: 'cascade' }).notNull(),
  localPath: text('local_path'), // Where the repository is cloned on the VM
  status: text('status', { 
    enum: ['cloning', 'active', 'updating', 'error', 'removed'] 
  }).default('cloning').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
  syncError: text('sync_error'),
  addedBy: text('added_by').references(() => authUsers.id).notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
  removedAt: timestamp('removed_at'), // Soft delete
  metadata: jsonb('metadata').$type<{
    cloneDepth?: number;
    submodules?: boolean;
    lfs?: boolean;
    [key: string]: any;
  }>(),
}, (table) => {
  return {
    vmRepositoryUnique: uniqueIndex('vm_repositories_vm_repository_unique')
      .on(table.vmId, table.repositoryId)
      .where('removed_at IS NULL'), // Only enforce uniqueness for active relationships
  };
});

export const vmRepositoriesRelations = relations(vmRepositories, ({ one }) => ({
  virtualMachine: one(virtualMachines, {
    fields: [vmRepositories.vmId],
    references: [virtualMachines.id],
  }),
  repository: one(projectRepositories, {
    fields: [vmRepositories.repositoryId],
    references: [projectRepositories.id],
  }),
  addedByUser: one(authUsers, {
    fields: [vmRepositories.addedBy],
    references: [authUsers.id],
  }),
}));