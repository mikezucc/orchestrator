import { Hono } from 'hono';
import { db } from '../db/index.js';
import { authUsers, organizations, organizationMembers, sessions, auditLogs } from '../db/schema-auth.js';
import { eq, and } from 'drizzle-orm';
import { 
  generateTOTPSecret, 
  generateQRCode, 
  verifyTOTP, 
  generateSessionToken,
  generateEmailToken,
  encryptTOTPSecret,
  decryptTOTPSecret
} from '../utils/auth.js';
import { emailService } from '../services/email.js';
import { createId } from '@paralleldrive/cuid2';

export const authRoutes = new Hono();

// Sign up - Step 1: Email registration
authRoutes.post('/signup', async (c) => {
  try {
    const { email, name, organizationName } = await c.req.json();

    if (!email || !organizationName) {
      return c.json({ 
        success: false, 
        error: 'Email and organization name are required' 
      }, 400);
    }

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return c.json({ 
        success: false, 
        error: 'User with this email already exists' 
      }, 400);
    }

    // Create user with unverified email
    const verificationToken = generateEmailToken();
    const verificationExpires = new Date();
    verificationExpires.setHours(verificationExpires.getHours() + 24);

    const [user] = await db.insert(authUsers).values({
      email,
      name,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    }).returning();

    // Create organization
    const orgSlug = organizationName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const [organization] = await db.insert(organizations).values({
      name: organizationName,
      slug: orgSlug,
    }).returning();

    // Add user as owner of organization
    await db.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
    });

    // Log the signup
    await db.insert(auditLogs).values({
      organizationId: organization.id,
      userId: user.id,
      action: 'user.signup',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email, organizationName },
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await emailService.sendVerificationEmail(email, verificationUrl);

    return c.json({ 
      success: true, 
      message: 'Verification email sent. Please check your inbox.',
      userId: user.id,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ success: false, error: 'Failed to create account' }, 500);
  }
});

// Verify email
authRoutes.post('/verify-email', async (c) => {
  try {
    const { token } = await c.req.json();

    if (!token) {
      return c.json({ 
        success: false, 
        error: 'Verification token is required' 
      }, 400);
    }

    // Find user with valid token
    const [user] = await db
      .select()
      .from(authUsers)
      .where(
        and(
          eq(authUsers.emailVerificationToken, token),
          eq(authUsers.emailVerified, false)
        )
      )
      .limit(1);

    if (!user || !user.emailVerificationExpires) {
      return c.json({ 
        success: false, 
        error: 'Invalid or expired verification token' 
      }, 400);
    }

    // Check if token is expired
    if (new Date() > user.emailVerificationExpires) {
      return c.json({ 
        success: false, 
        error: 'Verification token has expired' 
      }, 400);
    }

    // Mark email as verified
    await db
      .update(authUsers)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, user.id));

    return c.json({ 
      success: true, 
      message: 'Email verified successfully. Please set up two-factor authentication.',
      userId: user.id,
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return c.json({ success: false, error: 'Failed to verify email' }, 500);
  }
});

// Setup TOTP - Step 2: After email verification
authRoutes.post('/setup-totp', async (c) => {
  try {
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json({ 
        success: false, 
        error: 'User ID is required' 
      }, 400);
    }

    // Get user
    const [user] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);

    if (!user || !user.emailVerified) {
      return c.json({ 
        success: false, 
        error: 'User not found or email not verified' 
      }, 400);
    }

    if (user.totpEnabled) {
      return c.json({ 
        success: false, 
        error: 'Two-factor authentication is already enabled' 
      }, 400);
    }

    // Generate TOTP secret
    const { secret, url } = generateTOTPSecret(user.email);
    const qrCode = await generateQRCode(url);

    // Store encrypted secret temporarily (will be confirmed when user verifies)
    const encryptedSecret = encryptTOTPSecret(secret);
    
    return c.json({ 
      success: true,
      qrCode,
      secret, // User should save this as backup
      setupToken: Buffer.from(JSON.stringify({ userId, secret: encryptedSecret })).toString('base64'),
    });
  } catch (error) {
    console.error('TOTP setup error:', error);
    return c.json({ success: false, error: 'Failed to setup two-factor authentication' }, 500);
  }
});

// Confirm TOTP setup
authRoutes.post('/confirm-totp', async (c) => {
  try {
    const { setupToken, totpCode } = await c.req.json();

    if (!setupToken || !totpCode) {
      return c.json({ 
        success: false, 
        error: 'Setup token and TOTP code are required' 
      }, 400);
    }

    // Decode setup token
    const { userId, secret: encryptedSecret } = JSON.parse(
      Buffer.from(setupToken, 'base64').toString()
    );

    // Decrypt and verify TOTP code
    const secret = decryptTOTPSecret(encryptedSecret);
    const isValid = verifyTOTP(totpCode, secret);

    if (!isValid) {
      return c.json({ 
        success: false, 
        error: 'Invalid authentication code' 
      }, 400);
    }

    // Enable TOTP for user
    await db
      .update(authUsers)
      .set({
        totpSecret: encryptedSecret,
        totpEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, userId));

    // Get user's organization
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
      .limit(1);

    // Create session
    const sessionToken = generateSessionToken(userId, membership?.organizationId);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [session] = await db.insert(sessions).values({
      userId,
      token: sessionToken,
      expiresAt,
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    }).returning();

    // Send confirmation email
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);
    await emailService.sendTOTPSetupComplete(user.email);

    // Log the action
    await db.insert(auditLogs).values({
      organizationId: membership?.organizationId,
      userId,
      action: 'auth.totp_enabled',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ 
      success: true,
      message: 'Two-factor authentication enabled successfully',
      token: sessionToken,
      organizationId: membership?.organizationId,
    });
  } catch (error) {
    console.error('TOTP confirmation error:', error);
    return c.json({ success: false, error: 'Failed to confirm two-factor authentication' }, 500);
  }
});

// Login
authRoutes.post('/login', async (c) => {
  try {
    const { email, totpCode } = await c.req.json();

    if (!email || !totpCode) {
      return c.json({ 
        success: false, 
        error: 'Email and authentication code are required' 
      }, 400);
    }

    // Get user
    const [user] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);

    if (!user || !user.totpEnabled || !user.totpSecret) {
      return c.json({ 
        success: false, 
        error: 'Invalid credentials' 
      }, 401);
    }

    // Verify TOTP
    const secret = decryptTOTPSecret(user.totpSecret);
    const isValid = verifyTOTP(totpCode, secret);

    if (!isValid) {
      return c.json({ 
        success: false, 
        error: 'Invalid authentication code' 
      }, 401);
    }

    // Get user's organizations
    const memberships = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, user.id));

    // Use first organization as default
    const defaultOrg = memberships[0];

    // Create session
    const sessionToken = generateSessionToken(user.id, defaultOrg?.organizationId);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.insert(sessions).values({
      userId: user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    // Log the login
    await db.insert(auditLogs).values({
      organizationId: defaultOrg?.organizationId,
      userId: user.id,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: c.env?.remoteAddr || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ 
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organizations: memberships,
      currentOrganization: defaultOrg,
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ success: false, error: 'Failed to login' }, 500);
  }
});

// Logout
authRoutes.post('/logout', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      // Delete session
      await db.delete(sessions).where(eq(sessions.token, token));
    }

    return c.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ success: false, error: 'Failed to logout' }, 500);
  }
});

// Get current user
authRoutes.get('/me', async (c) => {
  try {
    const user = (c as any).user;
    const organizationId = (c as any).organizationId;

    if (!user) {
      return c.json({ success: false, error: 'Not authenticated' }, 401);
    }

    // Get user's organizations
    const memberships = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, user.id));

    const currentOrg = memberships.find(m => m.organizationId === organizationId) || memberships[0];

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organizations: memberships,
      currentOrganization: currentOrg,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return c.json({ success: false, error: 'Failed to get user data' }, 500);
  }
});

// Switch organization
authRoutes.post('/switch-organization', async (c) => {
  try {
    const user = (c as any).user;
    const { organizationId } = await c.req.json();

    if (!user) {
      return c.json({ success: false, error: 'Not authenticated' }, 401);
    }

    // Verify user has access to organization
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!membership) {
      return c.json({ success: false, error: 'Access denied' }, 403);
    }

    // Create new session token with organization
    const sessionToken = generateSessionToken(user.id, organizationId);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update session
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      await db
        .update(sessions)
        .set({
          token: sessionToken,
          expiresAt,
          lastActivityAt: new Date(),
        })
        .where(eq(sessions.token, token));
    }

    return c.json({ 
      success: true,
      token: sessionToken,
      organizationId,
    });
  } catch (error) {
    console.error('Switch organization error:', error);
    return c.json({ success: false, error: 'Failed to switch organization' }, 500);
  }
});