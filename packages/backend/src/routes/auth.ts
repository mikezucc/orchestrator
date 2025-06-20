import { Hono } from 'hono';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ApiResponse, GCPAuthResponse } from '@gce-platform/types';

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const authRoutes = new Hono();

authRoutes.get('/google', (c) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/compute', 'https://www.googleapis.com/auth/userinfo.email'],
  });

  return c.redirect(authUrl);
});

authRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  
  if (!code) {
    return c.json<ApiResponse<never>>({ success: false, error: 'No authorization code provided' }, 400);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });

    const payload = ticket.getPayload();
    const email = payload?.email;

    if (!email) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Could not get user email' }, 400);
    }

    const existingUser = await db.select().from(users).where(eq(users.email, email));
    
    let userId;
    if (existingUser.length === 0) {
      const [newUser] = await db.insert(users).values({
        email,
        gcpRefreshToken: tokens.refresh_token || undefined,
      }).returning();
      userId = newUser.id;
    } else {
      await db.update(users)
        .set({ gcpRefreshToken: tokens.refresh_token || undefined })
        .where(eq(users.email, email));
      userId = existingUser[0].id;
    }

    // Redirect to frontend with auth data
    const params = new URLSearchParams({
      userId,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresIn: String(tokens.expiry_date ? (tokens.expiry_date - Date.now()) / 1000 : 3600),
    });

    return c.redirect(`http://localhost:5173/auth/callback?${params.toString()}`);
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});