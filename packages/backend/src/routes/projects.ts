import { Hono } from 'hono';
import { db } from '../db/index.js';
import { 
  projects, 
  projectMembers, 
  projectRepositories, 
  projectVirtualMachines,
  projectMoments,
  projectFavoritePorts,
  type NewProject,
  type NewProjectRepository,
  type NewProjectVirtualMachine,
  type NewProjectMoment,
  type NewProjectMember,
  type NewProjectFavoritePort
} from '../db/schema-projects.js';
import { authUsers, auditLogs } from '../db/schema-auth.js';
import { virtualMachines } from '../db/schema.js';
import { moments, momentAssets } from '../db/schema-moments.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { flexibleAuth, flexibleRequireOrganization } from '../middleware/flexibleAuth.js';

export const projectRoutes = new Hono();

// Apply middleware to all routes
projectRoutes.use('*', flexibleAuth);
projectRoutes.use('*', flexibleRequireOrganization);

// Helper function to check project access
async function checkProjectAccess(projectId: string, userId: string, organizationId: string, requiredRole?: string[]) {
  // First check if project exists and belongs to organization
  const [project] = await db
    .select()
    .from(projects)
    .where(and(
      eq(projects.id, projectId),
      eq(projects.organizationId, organizationId)
    ))
    .limit(1);

  if (!project) {
    return { hasAccess: false, error: 'Project not found' };
  }

  // Check if user is a member of the project
  const [member] = await db
    .select()
    .from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId)
    ))
    .limit(1);

  // If user is not a member but created the project, they have access
  const isCreator = project.createdBy === userId;
  
  if (!member && !isCreator) {
    return { hasAccess: false, error: 'Access denied' };
  }

  // Check role requirements if specified
  if (requiredRole && member && !requiredRole.includes(member.role)) {
    return { hasAccess: false, error: 'Insufficient permissions' };
  }

  return { hasAccess: true, project, member };
}

// List all projects in organization
projectRoutes.get('/', async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    // Get all projects where user is a member or creator
    const userProjects = await db
      .select({
        project: projects,
        memberRole: projectMembers.role,
        memberCount: sql<number>`COUNT(DISTINCT ${projectMembers.userId})`,
        repositoryCount: sql<number>`COUNT(DISTINCT ${projectRepositories.id})`,
        vmCount: sql<number>`COUNT(DISTINCT ${projectVirtualMachines.id})`,
        creator: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        }
      })
      .from(projects)
      .leftJoin(projectMembers, eq(projects.id, projectMembers.projectId))
      .leftJoin(projectRepositories, eq(projects.id, projectRepositories.projectId))
      .leftJoin(projectVirtualMachines, eq(projects.id, projectVirtualMachines.projectId))
      .innerJoin(authUsers, eq(projects.createdBy, authUsers.id))
      .where(and(
        eq(projects.organizationId, organizationId),
        sql`(${projectMembers.userId} = ${userId} OR ${projects.createdBy} = ${userId})`
      ))
      .groupBy(projects.id, projectMembers.role, authUsers.id, authUsers.name, authUsers.email)
      .orderBy(desc(projects.createdAt));

    return c.json(userProjects);
  } catch (error) {
    console.error('Error listing projects:', error);
    return c.json({ error: 'Failed to list projects' }, 500);
  }
});

// Create new project
projectRoutes.post('/', async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;
    
    const { name, description, tags, metadata } = await c.req.json();

    if (!name) {
      return c.json({ error: 'Project name is required' }, 400);
    }

    // Create project
    const [project] = await db.insert(projects).values({
      organizationId,
      name,
      description,
      createdBy: userId,
      tags: tags || [],
      metadata: metadata || {},
    } as NewProject).returning();

    // Add creator as owner
    await db.insert(projectMembers).values({
      projectId: project.id,
      userId,
      role: 'owner',
      permissions: {},
      addedBy: userId,
    } as NewProjectMember);

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action: 'project.created',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { name, description },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

// Get project details
projectRoutes.get('/:projectId', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 404);
    }

    // Get project with all related data
    const projectData = await db
      .select({
        project: projects,
        creator: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        },
        memberCount: sql<number>`COUNT(DISTINCT ${projectMembers.userId})`,
        repositoryCount: sql<number>`COUNT(DISTINCT ${projectRepositories.id})`,
        vmCount: sql<number>`COUNT(DISTINCT ${projectVirtualMachines.id})`,
        momentCount: sql<number>`COUNT(DISTINCT ${projectMoments.id})`,
        favoritePortCount: sql<number>`COUNT(DISTINCT ${projectFavoritePorts.id})`,
      })
      .from(projects)
      .leftJoin(projectMembers, eq(projects.id, projectMembers.projectId))
      .leftJoin(projectRepositories, eq(projects.id, projectRepositories.projectId))
      .leftJoin(projectVirtualMachines, eq(projects.id, projectVirtualMachines.projectId))
      .leftJoin(projectMoments, eq(projects.id, projectMoments.projectId))
      .leftJoin(projectFavoritePorts, eq(projects.id, projectFavoritePorts.projectId))
      .innerJoin(authUsers, eq(projects.createdBy, authUsers.id))
      .where(eq(projects.id, projectId))
      .groupBy(projects.id, authUsers.id, authUsers.name, authUsers.email);

    if (!projectData || projectData.length === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json(projectData[0]);
  } catch (error) {
    console.error('Error getting project:', error);
    return c.json({ error: 'Failed to get project' }, 500);
  }
});

// Update project
projectRoutes.put('/:projectId', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId, ['owner', 'admin']);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 403);
    }

    const { name, description, tags, metadata } = await c.req.json();

    const [updated] = await db
      .update(projects)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(tags && { tags }),
        ...(metadata && { metadata }),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action: 'project.updated',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { name, description, tags, metadata },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json(updated);
  } catch (error) {
    console.error('Error updating project:', error);
    return c.json({ error: 'Failed to update project' }, 500);
  }
});

// Delete project
projectRoutes.delete('/:projectId', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId, ['owner']);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 403);
    }

    await db.delete(projects).where(eq(projects.id, projectId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action: 'project.deleted',
      resourceType: 'project',
      resourceId: projectId,
      metadata: {},
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return c.json({ error: 'Failed to delete project' }, 500);
  }
});

// Get project repositories
projectRoutes.get('/:projectId/repositories', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 404);
    }

    const repositories = await db
      .select({
        repository: projectRepositories,
        addedBy: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        }
      })
      .from(projectRepositories)
      .innerJoin(authUsers, eq(projectRepositories.addedBy, authUsers.id))
      .where(eq(projectRepositories.projectId, projectId))
      .orderBy(desc(projectRepositories.addedAt));

    return c.json(repositories);
  } catch (error) {
    console.error('Error getting project repositories:', error);
    return c.json({ error: 'Failed to get repositories' }, 500);
  }
});

// Add repository to project
projectRoutes.post('/:projectId/repositories', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId, ['owner', 'admin', 'member']);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 403);
    }

    const { repositoryUrl, branch, wormholeDaemonId, metadata } = await c.req.json();

    if (!repositoryUrl) {
      return c.json({ error: 'Repository URL is required' }, 400);
    }

    const [repository] = await db.insert(projectRepositories).values({
      projectId,
      repositoryUrl,
      branch: branch || 'main',
      wormholeDaemonId,
      addedBy: userId,
      metadata: metadata || {},
    } as NewProjectRepository).returning();

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action: 'project.repository_added',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { repositoryUrl, branch },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json(repository);
  } catch (error) {
    console.error('Error adding repository:', error);
    return c.json({ error: 'Failed to add repository' }, 500);
  }
});

// Remove repository from project
projectRoutes.delete('/:projectId/repositories/:repositoryId', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const repositoryId = c.req.param('repositoryId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId, ['owner', 'admin']);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 403);
    }

    await db.delete(projectRepositories)
      .where(and(
        eq(projectRepositories.id, repositoryId),
        eq(projectRepositories.projectId, projectId)
      ));

    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing repository:', error);
    return c.json({ error: 'Failed to remove repository' }, 500);
  }
});

// Get project VMs
projectRoutes.get('/:projectId/vms', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 404);
    }

    const vms = await db
      .select({
        projectVm: projectVirtualMachines,
        vm: virtualMachines,
        addedBy: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        }
      })
      .from(projectVirtualMachines)
      .innerJoin(virtualMachines, eq(projectVirtualMachines.vmId, virtualMachines.id))
      .innerJoin(authUsers, eq(projectVirtualMachines.addedBy, authUsers.id))
      .where(eq(projectVirtualMachines.projectId, projectId))
      .orderBy(desc(projectVirtualMachines.addedAt));

    return c.json(vms);
  } catch (error) {
    console.error('Error getting project VMs:', error);
    return c.json({ error: 'Failed to get VMs' }, 500);
  }
});

// Add VM to project
projectRoutes.post('/:projectId/vms', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId, ['owner', 'admin', 'member']);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 403);
    }

    const { vmId, role, metadata } = await c.req.json();

    if (!vmId) {
      return c.json({ error: 'VM ID is required' }, 400);
    }

    // Verify VM belongs to organization
    const [vm] = await db
      .select()
      .from(virtualMachines)
      .where(and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.organizationId, organizationId)
      ))
      .limit(1);

    if (!vm) {
      return c.json({ error: 'VM not found' }, 404);
    }

    const [projectVm] = await db.insert(projectVirtualMachines).values({
      projectId,
      vmId,
      role: role || 'development',
      addedBy: userId,
      metadata: metadata || {},
    } as NewProjectVirtualMachine).returning();

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action: 'project.vm_added',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { vmId, role },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json(projectVm);
  } catch (error) {
    console.error('Error adding VM:', error);
    return c.json({ error: 'Failed to add VM' }, 500);
  }
});

// Get project moments
projectRoutes.get('/:projectId/moments', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 404);
    }

    const projectMomentsData = await db
      .select({
        projectMoment: projectMoments,
        moment: moments,
        assetCount: sql<number>`COUNT(DISTINCT ${momentAssets.id})`,
        addedBy: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        }
      })
      .from(projectMoments)
      .innerJoin(moments, eq(projectMoments.momentId, moments.id))
      .leftJoin(momentAssets, eq(moments.id, momentAssets.momentId))
      .innerJoin(authUsers, eq(projectMoments.addedBy, authUsers.id))
      .where(eq(projectMoments.projectId, projectId))
      .groupBy(
        projectMoments.id, 
        projectMoments.projectId,
        projectMoments.momentId,
        projectMoments.addedBy,
        projectMoments.addedAt,
        moments.id,
        authUsers.id, 
        authUsers.name, 
        authUsers.email
      )
      .orderBy(desc(moments.createdAt));

    return c.json(projectMomentsData);
  } catch (error) {
    console.error('Error getting project moments:', error);
    return c.json({ error: 'Failed to get moments' }, 500);
  }
});

// Get project members
projectRoutes.get('/:projectId/members', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 404);
    }

    const members = await db
      .select({
        member: projectMembers,
        user: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        },
        addedBy: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        }
      })
      .from(projectMembers)
      .innerJoin(authUsers, eq(projectMembers.userId, authUsers.id))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(desc(projectMembers.addedAt));

    return c.json(members);
  } catch (error) {
    console.error('Error getting project members:', error);
    return c.json({ error: 'Failed to get members' }, 500);
  }
});

// Add member to project
projectRoutes.post('/:projectId/members', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId, ['owner', 'admin']);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 403);
    }

    const { userId: newMemberId, role, permissions } = await c.req.json();

    if (!newMemberId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // Check if user already exists
    const existing = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, newMemberId)
      ))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: 'User is already a member' }, 400);
    }

    await db.insert(projectMembers).values({
      projectId,
      userId: newMemberId,
      role: role || 'member',
      permissions: permissions || {},
      addedBy: userId,
    } as NewProjectMember);

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action: 'project.member_added',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { memberId: newMemberId, role },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Error adding member:', error);
    return c.json({ error: 'Failed to add member' }, 500);
  }
});

// Get project favorite ports
projectRoutes.get('/:projectId/favorite-ports', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 404);
    }

    const favoritePorts = await db
      .select({
        port: projectFavoritePorts,
        addedBy: {
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
        }
      })
      .from(projectFavoritePorts)
      .innerJoin(authUsers, eq(projectFavoritePorts.addedBy, authUsers.id))
      .where(eq(projectFavoritePorts.projectId, projectId))
      .orderBy(desc(projectFavoritePorts.addedAt));

    return c.json(favoritePorts);
  } catch (error) {
    console.error('Error getting favorite ports:', error);
    return c.json({ error: 'Failed to get favorite ports' }, 500);
  }
});

// Add favorite port to project
projectRoutes.post('/:projectId/favorite-ports', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const organizationId = (c as any).organizationId;
    const userId = (c as any).userId || (c as any).user?.id;

    const access = await checkProjectAccess(projectId, userId, organizationId, ['owner', 'admin', 'member']);
    if (!access.hasAccess) {
      return c.json({ error: access.error }, 403);
    }

    const { port, name, description, metadata } = await c.req.json();

    if (!port) {
      return c.json({ error: 'Port is required' }, 400);
    }

    const [favoritePort] = await db.insert(projectFavoritePorts).values({
      projectId,
      port: port.toString(),
      name,
      description,
      addedBy: userId,
      metadata: metadata || {},
    } as NewProjectFavoritePort).returning();

    return c.json(favoritePort);
  } catch (error) {
    console.error('Error adding favorite port:', error);
    return c.json({ error: 'Failed to add favorite port' }, 500);
  }
});