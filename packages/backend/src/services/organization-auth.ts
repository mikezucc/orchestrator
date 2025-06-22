import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { organizations } from '../db/schema-auth.js';
import { eq } from 'drizzle-orm';

export async function getOrganizationAccessToken(organizationId: string): Promise<string | null> {
  try {
    // Get organization's refresh token from database
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    
    if (!organization || !organization.gcpRefreshToken) {
      console.error('No refresh token found for organization:', organizationId);
      return null;
    }

    // Use refresh token to get a new access token
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: organization.gcpRefreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (credentials.access_token) {
      // Update refresh token if a new one was provided
      if (credentials.refresh_token && credentials.refresh_token !== organization.gcpRefreshToken) {
        await db.update(organizations)
          .set({ 
            gcpRefreshToken: credentials.refresh_token,
            updatedAt: new Date()
          })
          .where(eq(organizations.id, organizationId));
      }
      
      return credentials.access_token;
    }

    return null;
  } catch (error: any) {
    console.error('Failed to get organization access token:', error.message);
    return null;
  }
}