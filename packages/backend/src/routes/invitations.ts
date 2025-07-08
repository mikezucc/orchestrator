import { Hono } from 'hono';
import { db } from '../db/index.js';
import { teamInvitations, organizations, organizationMembers, authUsers, auditLogs } from '../db/schema-auth.js';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { authenticateToken, requireOrganization, requireRole } from '../middleware/auth.js';
import { emailService } from '../services/email.js';
import { createId } from '@paralleldrive/cuid2';

export const invitationRoutes = new Hono();

// Apply middleware to all routes
invitationRoutes.use('*', authenticateToken, requireOrganization);

// Send invitation (simplified endpoint)
invitationRoutes.post('/', requireRole('owner', 'admin'), async (c) => {
  try {
    const { organizationId, email, role } = await c.req.json();
    
    // Verify organization access
    if (organizationId !== (c as any).organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (!email || !role) {
      return c.json({ success: false, error: 'Email and role are required' }, 400);
    }

    if (!['admin', 'member'].includes(role)) {
      return c.json({ success: false, error: 'Invalid role' }, 400);
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();

    // Check if user exists
    const existingUser = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, normalizedEmail))
      .limit(1);

    let userId: string;
    let isNewUser = false;

    if (existingUser.length > 0) {
      // User exists, check if already a member
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
        return c.json({ success: false, error: 'User is already a member' }, 400);
      }
      
      userId = existingUser[0].id;
    } else {
      // Create new user with unverified status
      const [newUser] = await db.insert(authUsers).values({
        email: normalizedEmail,
        emailVerified: false,
        totpEnabled: false,
      }).returning();
      
      userId = newUser.id;
      isNewUser = true;
    }

    // Check for pending invitation
    const pendingInvite = await db
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.organizationId, organizationId),
          eq(teamInvitations.email, normalizedEmail),
          isNull(teamInvitations.acceptedAt)
        )
      )
      .limit(1);

    if (pendingInvite.length > 0) {
      return c.json({ success: false, error: 'Invitation already sent to this email' }, 400);
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
      email: normalizedEmail,
      role,
      invitedBy: (c as any).user.id,
      token,
      expiresAt,
    }).returning();

    // Add user to organization members
    await db.insert(organizationMembers).values({
      organizationId,
      userId,
      role,
    });

    // Send invitation email
    const invitationUrl = `${process.env.FRONTEND_URL}/login`;
    const emailSubject = isNewUser 
      ? `You've been invited to join ${organization.name}` 
      : `You've been added to ${organization.name}`;
    
    await emailService.sendTeamInvitation(
      normalizedEmail,
      (c as any).user.name || (c as any).user.email,
      organization.name,
      invitationUrl,
      role,
      isNewUser
    );

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'invitation.sent',
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { email: normalizedEmail, role, newUserCreated: isNewUser },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      newUserCreated: isNewUser
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    return c.json({ success: false, error: 'Failed to send invitation' }, 500);
  }
});

// Get invitations by organization
invitationRoutes.get('/organization/:orgId', async (c) => {
  try {
    const organizationId = c.req.param('orgId');
    
    // Verify organization access
    if (organizationId !== (c as any).organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const invitations = await db
      .select({
        id: teamInvitations.id,
        organizationId: teamInvitations.organizationId,
        email: teamInvitations.email,
        role: teamInvitations.role,
        invitedBy: teamInvitations.invitedBy,
        expiresAt: teamInvitations.expiresAt,
        createdAt: teamInvitations.createdAt,
        inviter: {
          name: authUsers.name,
          email: authUsers.email,
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

    return c.json(validInvitations);
  } catch (error) {
    console.error('Get invitations error:', error);
    return c.json({ error: 'Failed to get invitations' }, 500);
  }
});

// Get pending invitations
invitationRoutes.get('/pending', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = (c as any).organizationId;

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

    return c.json({ success: true, data: validInvitations });
  } catch (error) {
    console.error('Get invitations error:', error);
    return c.json({ success: false, error: 'Failed to get invitations' }, 500);
  }
});

// Cancel invitation
invitationRoutes.delete('/:invitationId', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const invitationId = c.req.param('invitationId');

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
      return c.json({ success: false, error: 'Invitation not found' }, 404);
    }

    // Delete invitation
    await db
      .delete(teamInvitations)
      .where(eq(teamInvitations.id, invitationId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'invitation.cancelled',
      resourceType: 'invitation',
      resourceId: invitationId,
      metadata: { email: invitation.email },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, message: 'Invitation cancelled' });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    return c.json({ success: false, error: 'Failed to cancel invitation' }, 500);
  }
});

// Resend invitation
invitationRoutes.post('/:invitationId/resend', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const invitationId = c.req.param('invitationId');

    // Get invitation
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
      return c.json({ error: 'Invitation not found' }, 404);
    }

    // Get organization
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    // Resend invitation email
    const invitationUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${invitation.token}`;
    await emailService.sendTeamInvitation(
      invitation.email,
      (c as any).user.name || (c as any).user.email,
      organization.name,
      invitationUrl,
      invitation.role
    );

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'invitation.resent',
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { email: invitation.email },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ message: 'Invitation resent successfully' });
  } catch (error) {
    console.error('Resend invitation error:', error);
    return c.json({ error: 'Failed to resend invitation' }, 500);
  }
});

// Accept invitation (public endpoint) - Now just marks invitation as accepted since user is already added
invitationRoutes.post('/accept', async (c) => {
  try {
    const { token } = await c.req.json();

    if (!token) {
      return c.json({ 
        success: false, 
        error: 'Invitation token is required' 
      }, 400);
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
      return c.json({ 
        success: false, 
        error: 'Invalid or already used invitation' 
      }, 404);
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      return c.json({ 
        success: false, 
        error: 'Invitation has expired' 
      }, 400);
    }

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

    return c.json({ 
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
    return c.json({ success: false, error: 'Failed to accept invitation' }, 500);
  }
});

// Get invitation details (public endpoint)
invitationRoutes.get('/details/:token', async (c) => {
  try {
    const token = c.req.param('token');

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
      return c.json({ 
        success: false, 
        error: 'Invalid or already used invitation' 
      }, 404);
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      return c.json({ 
        success: false, 
        error: 'Invitation has expired' 
      }, 400);
    }

    return c.json({ success: true, data: invitation });
  } catch (error) {
    console.error('Get invitation details error:', error);
    return c.json({ success: false, error: 'Failed to get invitation details' }, 500);
  }
});