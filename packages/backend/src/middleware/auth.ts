import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { sessions, authUsers, organizationMembers } from '../db/schema-auth';
import { eq, and } from 'drizzle-orm';
import { verifySessionToken } from '../utils/auth';

interface AuthRequest extends Request {
  user?: any;
  organizationId?: string;
  memberRole?: string;
}

// Verify authentication token
export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'No authentication token provided' });
    }

    // Verify JWT token
    const decoded = verifySessionToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Check session in database
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);

    if (!session || new Date() > session.expiresAt) {
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    // Get user
    const [user] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, decoded.userId))
      .limit(1);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Update session activity
    await db
      .update(sessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(sessions.id, session.id));

    // Attach user and organization to request
    req.user = user;
    req.organizationId = decoded.organizationId;

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
        req.memberRole = membership.role;
      }
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}

// Require specific organization role
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.memberRole || !roles.includes(req.memberRole)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    next();
  };
}

// Optional authentication - doesn't fail if no token
export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next();
    }

    // Verify JWT token
    const decoded = verifySessionToken(token);
    if (!decoded) {
      return next();
    }

    // Check session in database
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);

    if (!session || new Date() > session.expiresAt) {
      return next();
    }

    // Get user
    const [user] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, decoded.userId))
      .limit(1);

    if (user) {
      req.user = user;
      req.organizationId = decoded.organizationId;

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
          req.memberRole = membership.role;
        }
      }
    }

    next();
  } catch (error) {
    // Silent fail for optional auth
    next();
  }
}

// Ensure user has selected an organization
export function requireOrganization(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.organizationId) {
    return res.status(400).json({ 
      success: false, 
      error: 'No organization selected' 
    });
  }
  next();
}