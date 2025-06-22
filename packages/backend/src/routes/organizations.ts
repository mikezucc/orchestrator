import { Hono } from 'hono';
import { db } from '../db/index.js';
import { organizations, organizationMembers, authUsers, auditLogs } from '../db/schema-auth.js';
import { virtualMachines } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { flexibleAuth, flexibleRequireOrganization } from '../middleware/flexibleAuth.js';
import { requireRole } from '../middleware/auth.js';

export const organizationRoutes = new Hono();

// Apply middleware to all routes except user memberships
organizationRoutes.use('*', flexibleAuth);

// Create new organization
organizationRoutes.post('/create', flexibleAuth, async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;
    
    if (!userId) {
      return c.json({ error: 'User not found' }, 401);
    }

    const { name } = await c.req.json();

    if (!name) {
      return c.json({ error: 'Organization name is required' }, 400);
    }

    // Create organization
    const orgSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const [organization] = await db.insert(organizations).values({
      name,
      slug: orgSlug,
    }).returning();

    // Add user as owner of organization
    await db.insert(organizationMembers).values({
      organizationId: organization.id,
      userId,
      role: 'owner',
    });

    // Log the action
    await db.insert(auditLogs).values({
      organizationId: organization.id,
      userId,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: organization.id,
      metadata: { name },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      gcpRefreshToken: organization.gcpRefreshToken,
      gcpProjectIds: organization.gcpProjectIds,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    return c.json({ error: 'Failed to create organization' }, 500);
  }
});

// Get user's organization memberships (doesn't require organization)
organizationRoutes.get('/user/memberships', async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;
    
    if (!userId) {
      return c.json({ error: 'User not found' }, 401);
    }

    const memberships = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
        organization: {
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          gcpRefreshToken: organizations.gcpRefreshToken,
          gcpProjectIds: organizations.gcpProjectIds,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        },
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId));

    return c.json(memberships);
  } catch (error) {
    console.error('Error fetching user memberships:', error);
    return c.json({ error: 'Failed to fetch memberships' }, 500);
  }
});

// Apply organization requirement to remaining routes
organizationRoutes.use('*', flexibleRequireOrganization);

// Get my organization (simplified endpoint for frontend)
organizationRoutes.get('/my-organization', async (c) => {
  try {
    const organizationId = (c as any).organizationId;

    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    return c.json(organization);
  } catch (error) {
    console.error('Error fetching organization:', error);
    return c.json({ error: 'Failed to fetch organization' }, 500);
  }
});

// Get current organization details
organizationRoutes.get('/current', async (c) => {
  try {
    const organizationId = (c as any).organizationId;

    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return c.json({ success: false, error: 'Organization not found' }, 404);
    }

    // Get member count
    const members = await db
      .select({ count: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));

    // Get VM count
    const vms = await db
      .select({ count: virtualMachines.id })
      .from(virtualMachines)
      .where(eq(virtualMachines.organizationId, organizationId));

    return c.json({
      success: true,
      data: {
        ...organization,
        memberCount: members.length,
        vmCount: vms.length,
        userRole: (c as any).memberRole,
      },
    });
  } catch (error) {
    console.error('Get organization error:', error);
    return c.json({ success: false, error: 'Failed to get organization' }, 500);
  }
});

// Update organization
organizationRoutes.put('/current', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const { name } = await c.req.json();

    if (!name) {
      return c.json({ success: false, error: 'Organization name is required' }, 400);
    }

    const [updated] = await db
      .update(organizations)
      .set({
        name,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { name },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update organization error:', error);
    return c.json({ success: false, error: 'Failed to update organization' }, 500);
  }
});

// Update organization by ID (for frontend compatibility)
organizationRoutes.put('/:orgId', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = c.req.param('orgId');
    
    // Verify organization access
    if (organizationId !== (c as any).organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    
    const updates = await c.req.json();
    
    const [updated] = await db
      .update(organizations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: updates,
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json(updated);
  } catch (error) {
    console.error('Update organization error:', error);
    return c.json({ error: 'Failed to update organization' }, 500);
  }
});

// Configure Google Cloud OAuth for organization
organizationRoutes.post('/:orgId/configure-google', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = c.req.param('orgId');
    
    // Verify organization access
    if (organizationId !== (c as any).organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Generate Google OAuth URL for organization-level access
    const authUrl = `${process.env.GOOGLE_AUTH_URL || 'http://localhost:3000'}/api/auth/google/organization/${organizationId}`;
    
    return c.json({ authUrl });
  } catch (error) {
    console.error('Configure Google error:', error);
    return c.json({ error: 'Failed to configure Google authentication' }, 500);
  }
});

// Get organization members
organizationRoutes.get('/:orgId/members', async (c) => {
  try {
    const organizationId = c.req.param('orgId');
    
    // Verify organization access
    if (organizationId !== (c as any).organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const members = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
        user: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(organizationMembers)
      .innerJoin(authUsers, eq(authUsers.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(desc(organizationMembers.joinedAt));

    return c.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    return c.json({ success: false, error: 'Failed to get members' }, 500);
  }
});

// Update member role
organizationRoutes.put('/:orgId/members/:userId', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = c.req.param('orgId');
    const userId = c.req.param('userId');
    
    // Verify organization access
    if (organizationId !== (c as any).organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    const { role } = await c.req.json();

    if (!role || !['admin', 'member'].includes(role)) {
      return c.json({ success: false, error: 'Invalid role' }, 400);
    }

    // Check if member exists
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!member) {
      return c.json({ success: false, error: 'Member not found' }, 404);
    }

    // Can't change owner role
    if (member.role === 'owner') {
      return c.json({ success: false, error: 'Cannot change owner role' }, 400);
    }

    // Update role
    await db
      .update(organizationMembers)
      .set({
        role,
        updatedAt: new Date(),
      })
      .where(eq(organizationMembers.id, member.id));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'member.role_updated',
      resourceType: 'user',
      resourceId: member.userId,
      metadata: { oldRole: member.role, newRole: role },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, message: 'Member role updated' });
  } catch (error) {
    console.error('Update member role error:', error);
    return c.json({ success: false, error: 'Failed to update member role' }, 500);
  }
});

// Remove member
organizationRoutes.delete('/:orgId/members/:userId', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = c.req.param('orgId');
    const userId = c.req.param('userId');
    
    // Verify organization access
    if (organizationId !== (c as any).organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Check if member exists
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!member) {
      return c.json({ success: false, error: 'Member not found' }, 404);
    }

    // Can't remove owner
    if (member.role === 'owner') {
      return c.json({ success: false, error: 'Cannot remove organization owner' }, 400);
    }

    // Can't remove yourself
    if (member.userId === (c as any).user.id) {
      return c.json({ success: false, error: 'Cannot remove yourself' }, 400);
    }

    // Remove member
    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, member.id));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'member.removed',
      resourceType: 'user',
      resourceId: member.userId,
      metadata: { role: member.role },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    return c.json({ success: false, error: 'Failed to remove member' }, 500);
  }
});

// Get audit logs
organizationRoutes.get('/audit-logs', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        user: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(auditLogs)
      .innerJoin(authUsers, eq(authUsers.id, auditLogs.userId))
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({ success: true, data: logs });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return c.json({ success: false, error: 'Failed to get audit logs' }, 500);
  }
});