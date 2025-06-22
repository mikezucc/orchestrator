import { MiddlewareHandler } from 'hono';
import { db } from '../db/index.js';
import { sessions, authUsers, organizationMembers } from '../db/schema-auth.js';
import { eq, and } from 'drizzle-orm';
import { verifySessionToken } from '../utils/auth.js';
import { getValidAccessToken } from '../services/auth.js';

// Flexible authentication that supports both OTP/JWT and Google OAuth
export const flexibleAuth: MiddlewareHandler = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const userId = c.req.header('x-user-id');

    if (!token) {
      return c.json({ success: false, error: 'No authentication token provided' }, 401);
    }

    // First, try OTP/JWT authentication
    const decoded = verifySessionToken(token);
    if (decoded) {
      // Valid JWT token - handle OTP auth
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token))
        .limit(1);

      if (!session || new Date() > session.expiresAt) {
        return c.json({ success: false, error: 'Session expired' }, 401);
      }

      // Get user
      const [user] = await db
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, decoded.userId))
        .limit(1);

      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 401);
      }

      // Update session activity
      await db
        .update(sessions)
        .set({ lastActivityAt: new Date() })
        .where(eq(sessions.id, session.id));

      // Attach user and organization to context
      (c as any).user = user;
      (c as any).userId = user.id;
      (c as any).organizationId = decoded.organizationId;
      (c as any).authType = 'otp';

      // Get member role if organization is set
      if ((c as any).organizationId) {
        const [membership] = await db
          .select()
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.userId, user.id),
              eq(organizationMembers.organizationId, (c as any).organizationId)
            )
          )
          .limit(1);

        if (membership) {
          (c as any).memberRole = membership.role;
        }
      }
    } else if (userId) {
      // No valid JWT, but we have x-user-id header - try Google OAuth
      try {
        const validToken = await getValidAccessToken(token);
        if (validToken) {
          // Get user by ID
          const [user] = await db
            .select()
            .from(authUsers)
            .where(eq(authUsers.id, userId))
            .limit(1);

          if (!user) {
            return c.json({ success: false, error: 'User not found' }, 401);
          }

          // Attach user info to context
          (c as any).user = user;
          (c as any).userId = user.id;
          (c as any).organizationId = null; // Will be set by flexibleRequireOrganization
          (c as any).authType = 'google';

          // Get member role if organization is set
          if ((c as any).organizationId) {
            const [membership] = await db
              .select()
              .from(organizationMembers)
              .where(
                and(
                  eq(organizationMembers.userId, user.id),
                  eq(organizationMembers.organizationId, (c as any).organizationId)
                )
              )
              .limit(1);

            if (membership) {
              (c as any).memberRole = membership.role;
            }
          }
        } else {
          return c.json({ success: false, error: 'Invalid Google token' }, 401);
        }
      } catch (error) {
        console.error('Google auth validation error:', error);
        return c.json({ success: false, error: 'Invalid token' }, 401);
      }
    } else {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    await next();
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ success: false, error: 'Authentication failed' }, 500);
  }
};

// Flexible organization requirement
export const flexibleRequireOrganization: MiddlewareHandler = async (c, next) => {
  const organizationId = (c as any).organizationId;
  
  // For Google auth users without an organization, try to get their default org
  if (!organizationId && (c as any).authType === 'google') {
    const userId = (c as any).userId;
    if (userId) {
      // Find the user's first organization membership
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, userId))
        .limit(1);
      
      if (membership) {
        (c as any).organizationId = membership.organizationId;
        (c as any).memberRole = membership.role;
      }
    }
  }
  
  if (!(c as any).organizationId) {
    return c.json({ 
      success: false, 
      error: 'No organization selected' 
    }, 400);
  }
  
  await next();
};