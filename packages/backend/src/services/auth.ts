import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function getValidAccessToken(userId: string, currentAccessToken?: string): Promise<string | null> {
  console.log('=== getValidAccessToken called ===');
  console.log('userId:', userId);
  console.log('currentAccessToken provided:', !!currentAccessToken);
  
  try {
    // First, try to use the provided access token
    if (currentAccessToken) {
      console.log('Testing provided access token...');
      // Test if the token is still valid by making a simple API call
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: currentAccessToken });
      
      try {
        // Try to get token info to check if it's valid
        await oauth2Client.getTokenInfo(currentAccessToken);
        console.log('Access token is still valid');
        return currentAccessToken;
      } catch (error: any) {
        // Token is invalid or expired, continue to refresh
        console.log('Access token expired or invalid:', error.message);
        console.log('Will attempt to refresh...');
      }
    }

    // Get user's refresh token from database
    console.log('Fetching user refresh token from database...');
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    console.log('User found:', !!user, 'Has refresh token:', !!user?.gcpRefreshToken);
    
    if (!user || !user.gcpRefreshToken) {
      console.error('No refresh token found for user:', userId);
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

    console.log('Attempting to refresh access token...');
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    console.log('Refresh result:', { 
      hasAccessToken: !!credentials.access_token,
      hasRefreshToken: !!credentials.refresh_token,
      expiryDate: credentials.expiry_date
    });
    
    if (credentials.access_token) {
      // Update refresh token if a new one was provided
      if (credentials.refresh_token && credentials.refresh_token !== user.gcpRefreshToken) {
        console.log('Updating refresh token in database...');
        await db.update(users)
          .set({ gcpRefreshToken: credentials.refresh_token })
          .where(eq(users.id, userId));
      }
      
      console.log('Successfully obtained new access token');
      return credentials.access_token;
    }

    console.error('No access token in credentials after refresh');
    return null;
  } catch (error: any) {
    console.error('Failed to get valid access token:', error.message);
    console.error('Error details:', error);
    return null;
  }
}