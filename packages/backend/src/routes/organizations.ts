import { Router } from 'express';
import { db } from '../db';
import { organizations, organizationMembers, authUsers, auditLogs } from '../db/schema-auth';
import { virtualMachines } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateToken, requireOrganization, requireRole } from '../middleware/auth';

const router = Router();

// Get current organization details
router.get('/current', authenticateToken, requireOrganization, async (req: any, res) => {
  try {
    const organizationId = req.organizationId;

    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
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

    res.json({
      success: true,
      data: {
        ...organization,
        memberCount: members.length,
        vmCount: vms.length,
        userRole: req.memberRole,
      },
    });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ success: false, error: 'Failed to get organization' });
  }
});

// Update organization
router.put('/current', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Organization name is required' });
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
      userId: req.user.id,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ success: false, error: 'Failed to update organization' });
  }
});

// Get organization members
router.get('/members', authenticateToken, requireOrganization, async (req: any, res) => {
  try {
    const organizationId = req.organizationId;

    const members = await db
      .select({
        id: organizationMembers.id,
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

    res.json({ success: true, data: members });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ success: false, error: 'Failed to get members' });
  }
});

// Update member role
router.put('/members/:memberId', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;
    const { memberId } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Check if member exists
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // Can't change owner role
    if (member.role === 'owner') {
      return res.status(400).json({ success: false, error: 'Cannot change owner role' });
    }

    // Update role
    await db
      .update(organizationMembers)
      .set({
        role,
        updatedAt: new Date(),
      })
      .where(eq(organizationMembers.id, memberId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: req.user.id,
      action: 'member.role_updated',
      resourceType: 'user',
      resourceId: member.userId,
      metadata: { oldRole: member.role, newRole: role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Member role updated' });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ success: false, error: 'Failed to update member role' });
  }
});

// Remove member
router.delete('/members/:memberId', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;
    const { memberId } = req.params;

    // Check if member exists
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // Can't remove owner
    if (member.role === 'owner') {
      return res.status(400).json({ success: false, error: 'Cannot remove organization owner' });
    }

    // Can't remove yourself
    if (member.userId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot remove yourself' });
    }

    // Remove member
    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, memberId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: req.user.id,
      action: 'member.removed',
      resourceType: 'user',
      resourceId: member.userId,
      metadata: { role: member.role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

// Get audit logs
router.get('/audit-logs', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

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

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to get audit logs' });
  }
});

export default router;