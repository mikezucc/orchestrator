import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db';
import { organizations, auditLogs } from '../db/schema-auth';
import { eq } from 'drizzle-orm';
import { authenticateToken, requireOrganization, requireRole } from '../middleware/auth';
import type { ApiResponse } from '@gce-platform/types';

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const router = Router();

// Initiate Google OAuth for organization
router.get('/google', authenticateToken, requireOrganization, requireRole('owner', 'admin'), (req: any, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/compute', 'https://www.googleapis.com/auth/userinfo.email'],
  });

  // Store organization ID in state parameter
  const state = Buffer.from(JSON.stringify({
    organizationId: req.organizationId,
    userId: req.user.id,
  })).toString('base64');

  const authUrlWithState = `${authUrl}&state=${state}`;
  res.redirect(authUrlWithState);
});

// Handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  
  if (!code || !state) {
    return res.status(400).json({ success: false, error: 'Missing authorization code or state' });
  }

  try {
    // Decode state
    const { organizationId, userId } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return res.status(400).json({ 
        success: false, 
        error: 'No refresh token received. Please revoke access and try again.' 
      });
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
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/settings/google-auth?success=true`);
  } catch (error) {
    console.error('Google auth error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings/google-auth?error=true`);
  }
});

// Disconnect Google auth
router.delete('/google', authenticateToken, requireOrganization, requireRole('owner'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;

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
      userId: req.user.id,
      action: 'google.auth_disconnected',
      resourceType: 'organization',
      resourceId: organizationId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Google authentication disconnected' });
  } catch (error) {
    console.error('Disconnect Google auth error:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect Google auth' });
  }
});

// Update GCP project IDs
router.put('/google/projects', authenticateToken, requireOrganization, requireRole('owner', 'admin'), async (req: any, res) => {
  try {
    const organizationId = req.organizationId;
    const { projectIds } = req.body;

    if (!Array.isArray(projectIds)) {
      return res.status(400).json({ success: false, error: 'Project IDs must be an array' });
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
      userId: req.user.id,
      action: 'google.projects_updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { projectIds },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'GCP projects updated' });
  } catch (error) {
    console.error('Update GCP projects error:', error);
    res.status(500).json({ success: false, error: 'Failed to update GCP projects' });
  }
});

export default router;