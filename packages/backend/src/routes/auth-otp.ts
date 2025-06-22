import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authUsers, sessions, organizationMembers } from '../db/schema-auth.js';
import { generateOTP, storeOTP, verifyOTP } from '../services/otp.js';
import { emailService } from '../services/email.js';
import { createId } from '@paralleldrive/cuid2';
import jwt from 'jsonwebtoken';
import { generateSessionToken } from '../utils/auth.js';

const authOTP = new Hono();

// Request OTP for login/signup
authOTP.post('/request-otp', async (c) => {
  try {
    const { email } = await c.req.json();
    
    if (!email || !email.includes('@')) {
      return c.json({ error: 'Invalid email address' }, 400);
    }

    // Generate and store OTP
    const otp = generateOTP();
    storeOTP(email, otp);
    
    // Send OTP email
    await emailService.sendOTPEmail(email, otp);
    
    return c.json({ 
      message: 'OTP sent to your email', 
      email 
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return c.json({ error: 'Failed to send OTP' }, 500);
  }
});

// Verify OTP and login/signup
authOTP.post('/verify-otp', async (c) => {
  try {
    const { email, otp } = await c.req.json();
    
    if (!email || !otp) {
      return c.json({ error: 'Email and OTP are required' }, 400);
    }
    
    // Verify OTP
    if (!verifyOTP(email, otp)) {
      return c.json({ error: 'Invalid or expired OTP' }, 401);
    }
    
    // Check if user exists or create new user
    let user = await db.query.authUsers.findFirst({
      where: eq(authUsers.email, email)
    });
    
    if (!user) {
      // Create new user
      const [newUser] = await db.insert(authUsers).values({
        email,
        emailVerified: true // Since they verified via OTP
      }).returning();
      user = newUser;
    }
    
    // Create session
    const sessionToken = createId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await db.insert(sessions).values({
      userId: user.id,
      token: sessionToken,
      expiresAt,
      userAgent: c.req.header('user-agent'),
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    });
    
    // Get user's first organization (if any)
    const membership = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, user.id)
    });
    
    // Use generateSessionToken from auth utils
    const jwtToken = generateSessionToken(user.id, membership?.organizationId);
    
    // Also store the JWT token in the session for consistency
    await db.update(sessions)
      .set({ token: jwtToken })
      .where(eq(sessions.token, sessionToken));
    
    return c.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return c.json({ error: 'Failed to verify OTP' }, 500);
  }
});

// Logout
authOTP.post('/logout', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const token = authHeader.substring(7);
    
    // Delete session by token
    await db.delete(sessions).where(eq(sessions.token, token));
    
    return c.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    return c.json({ error: 'Failed to logout' }, 500);
  }
});

// Get current user
authOTP.get('/me', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const token = authHeader.substring(7);
    
    // Verify session exists and is valid
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.token, token)
    });
    
    if (!session || new Date() > session.expiresAt) {
      return c.json({ error: 'Session expired' }, 401);
    }
    
    // Get user
    const user = await db.query.authUsers.findFirst({
      where: eq(authUsers.id, session.userId)
    });
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified
    });
  } catch (error) {
    console.error('Error getting user:', error);
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

export default authOTP;