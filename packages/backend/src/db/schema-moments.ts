import { pgTable, text, timestamp, jsonb, boolean, uniqueIndex, integer } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { organizations, authUsers } from './schema-auth';
import { virtualMachines } from './schema';

export const moments = pgTable('moments', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id).notNull(),
  createdBy: text('created_by').references(() => authUsers.id).notNull(),
  vmId: text('vm_id').references(() => virtualMachines.id),
  
  // Git information
  gitBranch: text('git_branch'),
  gitCommitHash: text('git_commit_hash'),
  gitCommitMessage: text('git_commit_message'),
  gitAuthor: text('git_author'),
  gitAuthorEmail: text('git_author_email'),
  gitCommitDate: timestamp('git_commit_date'),
  gitDiff: text('git_diff'), // Store the actual diff for reference
  
  // Moment metadata
  title: text('title').notNull(),
  description: text('description'),
  tags: jsonb('tags').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  
  // Status
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deletedAt: timestamp('deleted_at'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    // Index for quick lookups by organization and git commit
    orgCommitIndex: uniqueIndex('moments_org_commit_unique')
      .on(table.organizationId, table.gitCommitHash)
      .where('git_commit_hash IS NOT NULL'),
    // Index for filtering by branch
    gitBranchIndex: uniqueIndex('moments_git_branch_idx')
      .on(table.organizationId, table.gitBranch),
    // Index for soft deletes
    notDeletedIndex: uniqueIndex('moments_not_deleted_idx')
      .on(table.organizationId, table.isDeleted),
  };
});

export const momentAssets = pgTable('moment_assets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  momentId: text('moment_id').references(() => moments.id, { onDelete: 'cascade' }).notNull(),
  organizationId: text('organization_id').references(() => organizations.id).notNull(),
  
  // Asset information
  assetType: text('asset_type', { 
    enum: ['screenshot', 'screen_recording', 'log_file', 'config_file', 'other'] 
  }).notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  
  // GCS storage information
  gcsBucket: text('gcs_bucket').notNull(),
  gcsPath: text('gcs_path').notNull(),
  gcsGeneration: text('gcs_generation'), // For versioning support
  
  // Asset metadata
  metadata: jsonb('metadata').$type<{
    width?: number;
    height?: number;
    duration?: number; // For videos in seconds
    encoding?: string;
    thumbnail?: string; // GCS path to thumbnail for videos
    [key: string]: any;
  }>().default({}),
  
  // Processing status
  processingStatus: text('processing_status', {
    enum: ['pending', 'processing', 'completed', 'failed']
  }).default('pending').notNull(),
  processingError: text('processing_error'),
  
  // Upload information
  uploadedBy: text('uploaded_by').references(() => authUsers.id).notNull(),
  uploadMethod: text('upload_method', {
    enum: ['web_ui', 'api', 'vm_agent', 'cli']
  }).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    // Index for quick lookups by moment
    momentIdIndex: uniqueIndex('moment_assets_moment_id_idx')
      .on(table.momentId),
    // Index for finding assets by type
    assetTypeIndex: uniqueIndex('moment_assets_type_idx')
      .on(table.momentId, table.assetType),
  };
});

// Types for TypeScript
export type Moment = typeof moments.$inferSelect;
export type NewMoment = typeof moments.$inferInsert;
export type MomentAsset = typeof momentAssets.$inferSelect;
export type NewMomentAsset = typeof momentAssets.$inferInsert;