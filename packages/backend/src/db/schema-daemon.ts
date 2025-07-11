import { pgTable, uuid, varchar, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const daemonBinaries = pgTable('daemon_binaries', {
  id: uuid('id').primaryKey(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  gcsPath: text('gcs_path').notNull(),
  publicUrl: text('public_url').notNull(),
  version: varchar('version', { length: 50 }).notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull(),
  size: integer('size').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  organizationId: uuid('organization_id').notNull(),
  isLatest: boolean('is_latest').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});