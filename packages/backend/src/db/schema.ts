import { pgTable, text, timestamp, integer, jsonb, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { organizations, authUsers } from './schema-auth';

// Legacy users table - will be migrated to authUsers
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').unique().notNull(),
  gcpRefreshToken: text('gcp_refresh_token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const virtualMachines = pgTable('virtual_machines', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => users.id), // Keep for backward compatibility
  organizationId: text('organization_id').references(() => organizations.id), // New field
  createdBy: text('created_by').references(() => authUsers.id), // Track who created it
  name: text('name').notNull(),
  gcpProjectId: text('gcp_project_id').notNull(),
  zone: text('zone').notNull(),
  machineType: text('machine_type').notNull(),
  status: text('status', { enum: ['running', 'stopped', 'suspended', 'terminated', 'pending'] }).notNull(),
  initScript: text('init_script'),
  gcpInstanceId: text('gcp_instance_id'),
  publicIp: text('public_ip'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    gcpInstanceOrgUnique: uniqueIndex('virtual_machines_gcp_instance_org_unique')
      .on(table.gcpInstanceId, table.organizationId)
      .where('gcp_instance_id IS NOT NULL AND organization_id IS NOT NULL'),
    gcpInstanceUserUnique: uniqueIndex('virtual_machines_gcp_instance_user_unique')
      .on(table.gcpInstanceId, table.userId)
      .where('gcp_instance_id IS NOT NULL AND user_id IS NOT NULL'),
  };
});

export const firewallRules = pgTable('firewall_rules', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  vmId: text('vm_id').references(() => virtualMachines.id).notNull(),
  name: text('name').notNull(),
  direction: text('direction', { enum: ['ingress', 'egress'] }).notNull(),
  priority: integer('priority').notNull(),
  sourceRanges: jsonb('source_ranges').$type<string[]>(),
  allowedPorts: jsonb('allowed_ports').$type<Array<{
    protocol: 'tcp' | 'udp' | 'icmp';
    ports?: string[];
  }>>().notNull(),
  gcpRuleId: text('gcp_rule_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const portDescriptions = pgTable('port_descriptions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  vmId: text('vm_id').references(() => virtualMachines.id).notNull(),
  port: integer('port').notNull(),
  protocol: text('protocol', { enum: ['tcp', 'udp', 'icmp'] }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  processName: text('process_name'),
  isFavorite: boolean('is_favorite').default(false).notNull(),
  createdBy: text('created_by').references(() => authUsers.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    vmPortProtocolUnique: uniqueIndex('port_descriptions_vm_port_protocol_unique')
      .on(table.vmId, table.port, table.protocol),
  };
});

export const scriptLibrary = pgTable('script_library', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => authUsers.id).notNull(),
  organizationId: text('organization_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  script: text('script').notNull(),
  language: text('language').default('bash').notNull(),
  tags: jsonb('tags').$type<string[]>().default([]),
  isPublic: boolean('is_public').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userNameUnique: uniqueIndex('script_library_user_name_unique')
      .on(table.userId, table.name),
  };
});