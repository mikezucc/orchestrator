import {
  pgTable,
  text,
  timestamp,
  varchar,
  index,
  jsonb,
  primaryKey,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from '@paralleldrive/cuid2';
import { organizations, authUsers } from "./schema-auth";
import { virtualMachines } from "./schema";
import { moments } from "./schema-moments";

export const projectRoleEnum = pgEnum("project_role", ["owner", "admin", "member", "viewer"]);
export const projectResourceTypeEnum = pgEnum("project_resource_type", ["development", "staging", "production", "testing"]);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdBy: text("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "set null" }),
    tags: jsonb("tags").default([]),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("projects_organization_idx").on(table.organizationId),
    nameIdx: index("projects_name_idx").on(table.name),
    createdByIdx: index("projects_created_by_idx").on(table.createdBy),
  })
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  creator: one(authUsers, {
    fields: [projects.createdBy],
    references: [authUsers.id],
  }),
  repositories: many(projectRepositories),
  virtualMachines: many(projectVirtualMachines),
  moments: many(projectMoments),
  members: many(projectMembers),
  favoritePorts: many(projectFavoritePorts),
}));

export const projectRepositories = pgTable(
  "project_repositories",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repositoryUrl: varchar("repository_url", { length: 512 }).notNull(),
    branch: varchar("branch", { length: 255 }).default("main"),
    wormholeDaemonId: varchar("wormhole_daemon_id", { length: 255 }),
    addedBy: text("added_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    projectIdx: index("project_repositories_project_idx").on(table.projectId),
    repoIdx: index("project_repositories_repo_idx").on(table.repositoryUrl),
    daemonIdx: index("project_repositories_daemon_idx").on(table.wormholeDaemonId),
  })
);

export const projectRepositoriesRelations = relations(projectRepositories, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectRepositories.projectId],
    references: [projects.id],
  }),
  addedByUser: one(authUsers, {
    fields: [projectRepositories.addedBy],
    references: [authUsers.id],
  }),
}));

export const projectVirtualMachines = pgTable(
  "project_virtual_machines",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    vmId: text("vm_id")
      .notNull()
      .references(() => virtualMachines.id, { onDelete: "cascade" }),
    role: projectResourceTypeEnum("role").default("development"),
    addedBy: text("added_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    projectIdx: index("project_vms_project_idx").on(table.projectId),
    vmIdx: index("project_vms_vm_idx").on(table.vmId),
    uniqueProjectVm: index("project_vms_unique_idx").on(table.projectId, table.vmId),
  })
);

export const projectVirtualMachinesRelations = relations(projectVirtualMachines, ({ one }) => ({
  project: one(projects, {
    fields: [projectVirtualMachines.projectId],
    references: [projects.id],
  }),
  virtualMachine: one(virtualMachines, {
    fields: [projectVirtualMachines.vmId],
    references: [virtualMachines.id],
  }),
  addedByUser: one(authUsers, {
    fields: [projectVirtualMachines.addedBy],
    references: [authUsers.id],
  }),
}));

export const projectMoments = pgTable(
  "project_moments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    momentId: text("moment_id")
      .notNull()
      .references(() => moments.id, { onDelete: "cascade" }),
    addedBy: text("added_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("project_moments_project_idx").on(table.projectId),
    momentIdx: index("project_moments_moment_idx").on(table.momentId),
    uniqueProjectMoment: index("project_moments_unique_idx").on(table.projectId, table.momentId),
  })
);

export const projectMomentsRelations = relations(projectMoments, ({ one }) => ({
  project: one(projects, {
    fields: [projectMoments.projectId],
    references: [projects.id],
  }),
  moment: one(moments, {
    fields: [projectMoments.momentId],
    references: [moments.id],
  }),
  addedByUser: one(authUsers, {
    fields: [projectMoments.addedBy],
    references: [authUsers.id],
  }),
}));

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: projectRoleEnum("role").notNull().default("member"),
    permissions: jsonb("permissions").default({}),
    addedBy: text("added_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
    projectIdx: index("project_members_project_idx").on(table.projectId),
    userIdx: index("project_members_user_idx").on(table.userId),
  })
);

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(authUsers, {
    fields: [projectMembers.userId],
    references: [authUsers.id],
  }),
  addedByUser: one(authUsers, {
    fields: [projectMembers.addedBy],
    references: [authUsers.id],
  }),
}));

export const projectFavoritePorts = pgTable(
  "project_favorite_ports",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    port: varchar("port", { length: 10 }).notNull(),
    name: varchar("name", { length: 255 }),
    description: text("description"),
    addedBy: text("added_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    projectIdx: index("project_favorite_ports_project_idx").on(table.projectId),
    uniqueProjectPort: index("project_favorite_ports_unique_idx").on(table.projectId, table.port),
  })
);

export const projectFavoritePortsRelations = relations(projectFavoritePorts, ({ one }) => ({
  project: one(projects, {
    fields: [projectFavoritePorts.projectId],
    references: [projects.id],
  }),
  addedByUser: one(authUsers, {
    fields: [projectFavoritePorts.addedBy],
    references: [authUsers.id],
  }),
}));

// Types for TypeScript
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectRepository = typeof projectRepositories.$inferSelect;
export type NewProjectRepository = typeof projectRepositories.$inferInsert;
export type ProjectVirtualMachine = typeof projectVirtualMachines.$inferSelect;
export type NewProjectVirtualMachine = typeof projectVirtualMachines.$inferInsert;
export type ProjectMoment = typeof projectMoments.$inferSelect;
export type NewProjectMoment = typeof projectMoments.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ProjectFavoritePort = typeof projectFavoritePorts.$inferSelect;
export type NewProjectFavoritePort = typeof projectFavoritePorts.$inferInsert;