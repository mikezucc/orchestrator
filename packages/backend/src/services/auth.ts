import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function getValidAccessToken(userId: string, currentAccessToken?: string): Promise<string | null> {
  try {
    // First, try to use the provided access token
    if (currentAccessToken) {
      // Test if the token is still valid by making a simple API call
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: currentAccessToken });
      
      try {
        // Try to get token info to check if it's valid
        await oauth2Client.getTokenInfo(currentAccessToken);
        return currentAccessToken;
      } catch (error) {
        // Token is invalid or expired, continue to refresh
        console.log('Access token expired, attempting to refresh...');
      }
    }

    // Get user's refresh token from database
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || !user.gcpRefreshToken) {
      console.error('No refresh token found for user');
      return null;
    }

    // Use refresh token to get a new access token
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: user.gcpRefreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (credentials.access_token) {
      // Update refresh token if a new one was provided
      if (credentials.refresh_token && credentials.refresh_token !== user.gcpRefreshToken) {
        await db.update(users)
          .set({ gcpRefreshToken: credentials.refresh_token })
          .where(eq(users.id, userId));
      }
      
      return credentials.access_token;
    }

    return null;
  } catch (error) {
    console.error('Failed to get valid access token:', error);
    return null;
  }
}