import { MiddlewareHandler } from 'hono';
import { db } from '../db/index.js';
import { sessions, authUsers, organizationMembers } from '../db/schema-auth.js';
import { eq, and } from 'drizzle-orm';
import { verifySessionToken } from '../utils/auth.js';

// Verify authentication token
export const authenticateToken: MiddlewareHandler = async (c, next) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return c.json({ success: false, error: 'No authentication token provided' }, 401);
    }

    // Verify JWT token
    const decoded = verifySessionToken(token);
    if (!decoded) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    // Check session in database
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
    (c as any).organizationId = decoded.organizationId;

    // Get member role if organization is set
    if (decoded.organizationId) {
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, user.id),
            eq(organizationMembers.organizationId, decoded.organizationId)
          )
        )
        .limit(1);

      if (membership) {
        (c as any).memberRole = membership.role;
      }
    }

    await next();
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ success: false, error: 'Authentication failed' }, 500);
  }
};

// Require specific organization role
export function requireRole(...roles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const memberRole = (c as any).memberRole;
    if (!memberRole || !roles.includes(memberRole)) {
      return c.json({ 
        success: false, 
        error: 'Insufficient permissions' 
      }, 403);
    }
    await next();
  };
}

// Ensure user has selected an organization
export const requireOrganization: MiddlewareHandler = async (c, next) => {
  const organizationId = (c as any).organizationId;
  if (!organizationId) {
    return c.json({ 
      success: false, 
      error: 'No organization selected' 
    }, 400);
  }
  await next();
};