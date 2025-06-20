import { pgTable, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').unique().notNull(),
  gcpRefreshToken: text('gcp_refresh_token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const virtualMachines = pgTable('virtual_machines', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  gcpProjectId: text('gcp_project_id').notNull(),
  zone: text('zone').notNull(),
  machineType: text('machine_type').notNull(),
  status: text('status', { enum: ['running', 'stopped', 'suspended', 'terminated', 'pending'] }).notNull(),
  initScript: text('init_script'),
  gcpInstanceId: text('gcp_instance_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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