import { Router } from 'express';
import { db } from '../db';
import { teamInvitations, organizations, organizationMembers, authUsers, auditLogs } from '../db/schema-auth';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { authenticateToken, requireOrganization, requireRole } from '../middleware/auth';
import { emailService } from '../services/email';
import { createId } from '@paralleldrive/cuid2';

const router = Router();

// Send invitation
router.post('/send', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ success: false, error: 'Email and role are required' });
    }

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Check if user is already a member
    const existingUser = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      const existingMember = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, existingUser[0].id),
            eq(organizationMembers.organizationId, organizationId)
          )
        )
        .limit(1);

      if (existingMember.length > 0) {
        return res.status(400).json({ success: false, error: 'User is already a member' });
      }
    }

    // Check for pending invitation
    const pendingInvite = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.organizationId, organizationId),
          eq(teamInvitations.email, email),
          isNull(teamInvitations.acceptedAt)
        )
      )
      .limit(1);

    if (pendingInvite.length > 0) {
      return res.status(400).json({ success: false, error: 'Invitation already sent to this email' });
    }

    // Get organization details
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    // Create invitation
    const token = createId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const [invitation] = await db.insert(teamInvitations).values({
      organizationId,
      email,
      role,
      invitedBy: req.user.id,
      token,
      expiresAt,
    }).returning();

    // Send invitation email
    const invitationUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`;
    await emailService.sendTeamInvitation(
      email,
      req.user.name || req.user.email,
      organization.name,
      invitationUrl,
      role
    );

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: req.user.id,
      action: 'invitation.sent',
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { email, role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ 
      success: true, 
      message: 'Invitation sent',
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      }
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({ success: false, error: 'Failed to send invitation' });
  }
});

// Get pending invitations
router.get('/pending', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;

    const invitations = await db
      .select({
        id: teamInvitations.id,
        email: teamInvitations.email,
        role: teamInvitations.role,
        expiresAt: teamInvitations.expiresAt,
        createdAt: teamInvitations.createdAt,
        invitedBy: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(teamInvitations)
      .innerJoin(authUsers, eq(authUsers.id, teamInvitations.invitedBy))
      .where(
        and(
          eq(teamInvitations.organizationId, organizationId),
          isNull(teamInvitations.acceptedAt)
        )
      )
      .orderBy(desc(teamInvitations.createdAt));

    // Filter out expired invitations
    const validInvitations = invitations.filter(inv => new Date() < inv.expiresAt);

    res.json({ success: true, data: validInvitations });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ success: false, error: 'Failed to get invitations' });
  }
});

// Cancel invitation
router.delete('/:invitationId', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;
    const { invitationId } = req.params;

    // Check if invitation exists
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.id, invitationId),
          eq(teamInvitations.organizationId, organizationId),
          isNull(teamInvitations.acceptedAt)
        )
      )
      .limit(1);

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    // Delete invitation
    await db
      .delete(teamInvitations)
      .where(eq(teamInvitations.id, invitationId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: req.user.id,
      action: 'invitation.cancelled',
      resourceType: 'invitation',
      resourceId: invitationId,
      metadata: { email: invitation.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Invitation cancelled' });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel invitation' });
  }
});

// Accept invitation (public endpoint)
router.post('/accept', async (req, res) => {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invitation token and user ID are required' 
      });
    }

    // Get invitation
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.token, token),
          isNull(teamInvitations.acceptedAt)
        )
      )
      .limit(1);

    if (!invitation) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid or already used invitation' 
      });
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invitation has expired' 
      });
    }

    // Get user
    const [user] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);

    if (!user || user.email !== invitation.email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid user or email mismatch' 
      });
    }

    // Check if already a member
    const existingMember = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, invitation.organizationId)
        )
      )
      .limit(1);

    if (existingMember.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'You are already a member of this organization' 
      });
    }

    // Add user to organization
    await db.insert(organizationMembers).values({
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
    });

    // Mark invitation as accepted
    await db
      .update(teamInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(teamInvitations.id, invitation.id));

    // Get organization details
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, invitation.organizationId))
      .limit(1);

    // Log the action
    await db.insert(auditLogs).values({
      organizationId: invitation.organizationId,
      userId,
      action: 'invitation.accepted',
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { role: invitation.role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ 
      success: true, 
      message: 'Invitation accepted',
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      }
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ success: false, error: 'Failed to accept invitation' });
  }
});

// Get invitation details (public endpoint)
router.get('/details/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const [invitation] = await db
      .select({
        id: teamInvitations.id,
        email: teamInvitations.email,
        role: teamInvitations.role,
        expiresAt: teamInvitations.expiresAt,
        organization: {
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        },
        invitedBy: {
          name: authUsers.name,
          email: authUsers.email,
        },
      })
      .from(teamInvitations)
      .innerJoin(organizations, eq(organizations.id, teamInvitations.organizationId))
      .innerJoin(authUsers, eq(authUsers.id, teamInvitations.invitedBy))
      .where(
        and(
          eq(teamInvitations.token, token),
          isNull(teamInvitations.acceptedAt)
        )
      )
      .limit(1);

    if (!invitation) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid or already used invitation' 
      });
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invitation has expired' 
      });
    }

    res.json({ success: true, data: invitation });
  } catch (error) {
    console.error('Get invitation details error:', error);
    res.status(500).json({ success: false, error: 'Failed to get invitation details' });
  }
});

export default router;