import { pgTable, text, timestamp, boolean, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// Organizations table
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  // Google Cloud credentials for the organization
  gcpRefreshToken: text('gcp_refresh_token'),
  gcpProjectIds: jsonb('gcp_project_ids').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Update users table to include TOTP secret and organization membership
export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').unique().notNull(),
  name: text('name'),
  totpSecret: text('totp_secret'), // Encrypted TOTP secret
  totpEnabled: boolean('totp_enabled').default(false).notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  emailVerificationToken: text('email_verification_token'),
  emailVerificationExpires: timestamp('email_verification_expires'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Organization members table
export const organizationMembers = pgTable('organization_members', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id).notNull(),
  userId: text('user_id').references(() => authUsers.id).notNull(),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    orgUserUnique: uniqueIndex('organization_members_org_user_unique')
      .on(table.organizationId, table.userId),
  };
});

// Team invitations table
export const teamInvitations = pgTable('team_invitations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id).notNull(),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  invitedBy: text('invited_by').references(() => authUsers.id).notNull(),
  token: text('token').unique().notNull().$defaultFn(() => createId()),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    orgEmailUnique: uniqueIndex('team_invitations_org_email_unique')
      .on(table.organizationId, table.email)
      .where('accepted_at IS NULL'),
  };
});

// Sessions table for managing user sessions
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => authUsers.id).notNull(),
  token: text('token').unique().notNull().$defaultFn(() => createId()),
  expiresAt: timestamp('expires_at').notNull(),
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Audit log for tracking important actions
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id),
  userId: text('user_id').references(() => authUsers.id).notNull(),
  action: text('action').notNull(), // e.g., 'member.invited', 'member.removed', 'vm.created', etc.
  resourceType: text('resource_type'), // e.g., 'user', 'vm', 'organization'
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});