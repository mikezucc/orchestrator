import { Hono } from 'hono';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { organizations, auditLogs } from '../db/schema-auth.js';
import { eq } from 'drizzle-orm';
import { authenticateToken, requireOrganization, requireRole } from '../middleware/auth.js';

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const googleAuthRoutes = new Hono();

// Apply middleware to all routes
googleAuthRoutes.use('*', authenticateToken, requireOrganization);

// Initiate Google OAuth for organization
googleAuthRoutes.get('/google', requireRole('owner', 'admin'), (c) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/compute', 'https://www.googleapis.com/auth/userinfo.email'],
  });

  // Store organization ID in state parameter
  const state = Buffer.from(JSON.stringify({
    organizationId: (c as any).organizationId,
    userId: (c as any).user.id,
  })).toString('base64');

  const authUrlWithState = `${authUrl}&state=${state}`;
  return c.redirect(authUrlWithState);
});

// Handle Google OAuth callback
googleAuthRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  
  if (!code || !state) {
    return c.redirect(`${process.env.FRONTEND_URL}/settings/google-auth?error=missing_params`);
  }

  try {
    // Decode state
    const { organizationId, userId } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return c.redirect(`${process.env.FRONTEND_URL}/settings/google-auth?error=no_refresh_token`);
    }

    // Update organization with Google credentials
    await db
      .update(organizations)
      .set({
        gcpRefreshToken: tokens.refresh_token,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId,
      action: 'google.auth_connected',
      resourceType: 'organization',
      resourceId: organizationId,
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    // Redirect to frontend success page
    return c.redirect(`${process.env.FRONTEND_URL}/settings/google-auth?success=true`);
  } catch (error) {
    console.error('Google auth error:', error);
    return c.redirect(`${process.env.FRONTEND_URL}/settings/google-auth?error=true`);
  }
});

// Disconnect Google auth
googleAuthRoutes.delete('/google', requireRole('owner'), async (c) => {
  try {
    const organizationId = (c as any).organizationId;

    // Remove Google credentials
    await db
      .update(organizations)
      .set({
        gcpRefreshToken: null,
        gcpProjectIds: [],
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'google.auth_disconnected',
      resourceType: 'organization',
      resourceId: organizationId,
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, message: 'Google authentication disconnected' });
  } catch (error) {
    console.error('Disconnect Google auth error:', error);
    return c.json({ success: false, error: 'Failed to disconnect Google auth' }, 500);
  }
});

// Update GCP project IDs
googleAuthRoutes.put('/google/projects', requireRole('owner', 'admin'), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const { projectIds } = await c.req.json();

    if (!Array.isArray(projectIds)) {
      return c.json({ success: false, error: 'Project IDs must be an array' }, 400);
    }

    // Update organization
    await db
      .update(organizations)
      .set({
        gcpProjectIds: projectIds,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));

    // Log the action
    await db.insert(auditLogs).values({
      organizationId,
      userId: (c as any).user.id,
      action: 'google.projects_updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { projectIds },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, message: 'GCP projects updated' });
  } catch (error) {
    console.error('Update GCP projects error:', error);
    return c.json({ success: false, error: 'Failed to update GCP projects' }, 500);
  }
});