import { Hono } from 'hono';
import { db } from '../db/index.js';
import { authUsers, auditLogs, userSSHKeys } from '../db/schema-auth.js';
import { eq, and } from 'drizzle-orm';
import { flexibleAuth } from '../middleware/flexibleAuth.js';
import { encrypt } from '../utils/auth.js';
import { generateSSHKeys } from '../services/gcp-ssh.js';
import crypto from 'crypto';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/github-auth/callback`;

export const githubAuthRoutes = new Hono();

// Get GitHub OAuth URL
githubAuthRoutes.get('/connect-url', flexibleAuth, async (c) => {
  const userId = (c as any).userId || (c as any).user?.id;
  
  if (!userId) {
    return c.json({ success: false, error: 'User not authenticated' }, 401);
  }

  if (!GITHUB_CLIENT_ID) {
    return c.json({ success: false, error: 'GitHub OAuth not configured' }, 500);
  }

  // Generate state parameter for CSRF protection
  const state = Buffer.from(JSON.stringify({
    userId,
    timestamp: Date.now(),
    returnUrl: c.req.query('returnUrl') || '/profile/ssh-keys',
  })).toString('base64');

  // GitHub OAuth URL with required scopes
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GITHUB_REDIRECT_URI);
  authUrl.searchParams.set('scope', 'read:user user:email read:public_key write:public_key');
  authUrl.searchParams.set('state', state);

  return c.json({ success: true, url: authUrl.toString() });
});

// Legacy connect endpoint (for backward compatibility)
githubAuthRoutes.get('/connect', async (c) => {
  // For direct browser access, redirect to login
  return c.redirect(`${process.env.FRONTEND_URL}/login?redirect=/user/settings`);
});

// Handle GitHub OAuth callback
githubAuthRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  
  if (!code || !state) {
    return c.redirect(`${process.env.FRONTEND_URL}/profile/ssh-keys?error=missing_params`);
  }

  try {
    // Decode and validate state
    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId, returnUrl } = decodedState;

    if (!userId) {
      return c.redirect(`${process.env.FRONTEND_URL}/profile/ssh-keys?error=invalid_state`);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      console.error('GitHub token error:', tokenData);
      return c.redirect(`${process.env.FRONTEND_URL}${returnUrl}?error=token_exchange_failed`);
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userResponse.json();

    // Get primary email if not public
    let githubEmail = githubUser.email;
    if (!githubEmail) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      const emails = await emailsResponse.json();
      const primaryEmail = emails.find((e: any) => e.primary && e.verified);
      githubEmail = primaryEmail?.email;
    }

    // Encrypt the access token
    const encryptedToken = encrypt(tokenData.access_token);

    // Update user with GitHub credentials
    await db
      .update(authUsers)
      .set({
        githubAccessToken: encryptedToken,
        githubUsername: githubUser.login,
        githubUserId: String(githubUser.id),
        githubEmail: githubEmail,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, userId));

    // Generate SSH key pair for this GitHub account
    const keyName = `github-${githubUser.login}`;
    const { publicKey, privateKey } = await generateSSHKeys(githubUser.login);
    
    // Calculate fingerprint
    const fingerprint = crypto
      .createHash('md5')
      .update(Buffer.from(publicKey.split(' ')[1], 'base64'))
      .digest('hex')
      .match(/.{1,2}/g)!
      .join(':');

    // Encrypt private key
    const encryptedPrivateKey = encrypt(privateKey);

    // Check if key already exists
    const existingKey = await db
      .select()
      .from(userSSHKeys)
      .where(and(
        eq(userSSHKeys.userId, userId),
        eq(userSSHKeys.keyName, keyName)
      ))
      .limit(1);

    if (existingKey.length > 0) {
      // Update existing key
      await db
        .update(userSSHKeys)
        .set({
          publicKey,
          privateKeyEncrypted: encryptedPrivateKey,
          fingerprint,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(userSSHKeys.id, existingKey[0].id));
    } else {
      // Create new SSH key entry
      await db.insert(userSSHKeys).values({
        userId,
        keyName,
        publicKey,
        privateKeyEncrypted: encryptedPrivateKey,
        fingerprint,
        keyType: 'ssh-rsa',
        source: 'github',
        isActive: true,
      });
    }

    // Log the action
    await db.insert(auditLogs).values({
      userId,
      action: 'github.auth_connected',
      resourceType: 'user',
      resourceId: userId,
      metadata: { githubUsername: githubUser.login, keyName },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '',
      userAgent: c.req.header('user-agent'),
    });

    // Redirect to frontend success page
    return c.redirect(`${process.env.FRONTEND_URL}/user/settings?githubConnected=true`);
  } catch (error) {
    console.error('GitHub auth error:', error);
    return c.redirect(`${process.env.FRONTEND_URL}/profile/ssh-keys?error=auth_failed`);
  }
});

// Disconnect GitHub account
githubAuthRoutes.delete('/disconnect', flexibleAuth, async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    // Get user's GitHub username for key deletion
    const [user] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);

    // Remove GitHub credentials
    await db
      .update(authUsers)
      .set({
        githubAccessToken: null,
        githubUsername: null,
        githubUserId: null,
        githubEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, userId));

    // Deactivate GitHub SSH keys
    if (user?.githubUsername) {
      await db
        .update(userSSHKeys)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userSSHKeys.userId, userId),
          eq(userSSHKeys.source, 'github')
        ));
    }

    // Log the action
    await db.insert(auditLogs).values({
      userId,
      action: 'github.auth_disconnected',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, message: 'GitHub account disconnected' });
  } catch (error) {
    console.error('Disconnect GitHub auth error:', error);
    return c.json({ success: false, error: 'Failed to disconnect GitHub account' }, 500);
  }
});

// Get GitHub connection status
githubAuthRoutes.get('/status', flexibleAuth, async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    const [user] = await db
      .select({
        githubConnected: authUsers.githubUsername,
        githubUsername: authUsers.githubUsername,
        githubEmail: authUsers.githubEmail,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);

    return c.json({
      success: true,
      connected: !!user?.githubConnected,
      username: user?.githubUsername,
      email: user?.githubEmail,
    });
  } catch (error) {
    console.error('Get GitHub status error:', error);
    return c.json({ success: false, error: 'Failed to get GitHub status' }, 500);
  }
});

export default githubAuthRoutes;