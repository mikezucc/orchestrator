import { pgTable, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { virtualMachines } from './schema';

export const vmRepositories = pgTable('vm_repositories', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  vmId: text('vm_id').references(() => virtualMachines.id, { onDelete: 'cascade' }).notNull(),
  repoFullName: text('repo_full_name').notNull(), // Path within the repository to use as the project root
  localPath: text('local_path'), // Where the repository is cloned on the VM
  lastSyncedAt: timestamp('last_synced_at'),
  syncError: text('sync_error'),
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
      .on(table.vmId, table.repoFullName)
  };
});

export const vmRepositoriesRelations = relations(vmRepositories, ({ one }) => ({
  virtualMachine: one(virtualMachines, {
    fields: [vmRepositories.vmId],
    references: [virtualMachines.id],
  })
}));