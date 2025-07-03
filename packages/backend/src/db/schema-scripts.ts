import { pgTable, text, timestamp, integer, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { organizations, authUsers } from './schema-auth';

// Scripts table for storing reusable scripts
export const scripts = pgTable('scripts', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id), // Nullable for personal scripts
  createdBy: text('created_by').references(() => authUsers.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  scriptContent: text('script_content').notNull(),
  timeout: integer('timeout').default(60).notNull(), // Default timeout in seconds
  isPublic: boolean('is_public').default(false).notNull(), // Whether visible to all org members
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Script tags for categorization
export const scriptTags = pgTable('script_tags', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  scriptId: text('script_id').references(() => scripts.id, { onDelete: 'cascade' }).notNull(),
  tag: text('tag').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    scriptTagUnique: uniqueIndex('script_tags_script_tag_unique')
      .on(table.scriptId, table.tag),
  };
});