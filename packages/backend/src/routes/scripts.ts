import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { db } from '../db';
import { scripts, scriptTags } from '../db/schema-scripts';
import { authUsers } from '../db/schema-auth';
import type { ApiResponse, CreateScriptRequest, UpdateScriptRequest, Script } from '@gce-platform/types/dist/index.js';
import { createId } from '@paralleldrive/cuid2';
import { flexibleAuth } from '../middleware/flexibleAuth.js';

const scriptsRouter = new Hono();

// Apply flexible auth middleware to all routes
scriptsRouter.use('*', flexibleAuth);

// Validation schemas
const createScriptSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  scriptContent: z.string().min(1),
  timeout: z.number().min(1).max(300).optional().default(60),
  isPublic: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional(),
});

const updateScriptSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  scriptContent: z.string().min(1).optional(),
  timeout: z.number().min(1).max(300).optional(),
  isPublic: z.boolean().optional(),
});

// List scripts (personal + org scripts)
scriptsRouter.get('/', async (c) => {
  try {
    const user = (c as any).user;
    const organizationId = (c as any).organizationId;

    // Get scripts that are either:
    // 1. Created by the user (personal)
    // 2. Belong to the organization and are public
    // 3. Belong to the organization and created by the user
    const scriptsList = await db
      .select({
        script: scripts,
        createdByUser: {
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(scripts)
      .leftJoin(authUsers, eq(scripts.createdBy, authUsers.id))
      .where(
        organizationId
          ? or(
              // Personal scripts (user's own)
              and(eq(scripts.createdBy, user.id), eq(scripts.organizationId, null as any)),
              // Organization scripts (public or own)
              and(
                eq(scripts.organizationId, organizationId),
                or(eq(scripts.isPublic, true), eq(scripts.createdBy, user.id))
              )
            )
          : // If no organizationId, only show personal scripts
            and(eq(scripts.createdBy, user.id), eq(scripts.organizationId, null))
      )
      .orderBy(desc(scripts.updatedAt));

    // Get tags for all scripts
    const scriptIds = scriptsList.map(s => s.script.id);
    const tags = scriptIds.length > 0 
      ? await db
          .select()
          .from(scriptTags)
          .where(inArray(scriptTags.scriptId, scriptIds))
      : [];

    // Group tags by script
    const tagsByScript = tags.reduce((acc, tag) => {
      if (!acc[tag.scriptId]) acc[tag.scriptId] = [];
      acc[tag.scriptId].push(tag.tag);
      return acc;
    }, {} as Record<string, string[]>);

    // Format response
    const formattedScripts: Script[] = scriptsList.map(({ script, createdByUser }) => ({
      ...script,
      createdByUser,
      tags: tagsByScript[script.id] || [],
    }));

    return c.json<ApiResponse<Script[]>>({
      success: true,
      data: formattedScripts,
    });
  } catch (error) {
    console.error('Error fetching scripts:', error);
    return c.json<ApiResponse<Script[]>>({
      success: false,
      error: 'Failed to fetch scripts',
    }, 500);
  }
});

// Get single script
scriptsRouter.get('/:id', async (c) => {
  try {
    const user = (c as any).user;
    const organizationId = (c as any).organizationId;
    const scriptId = c.req.param('id');

    const result = await db
      .select({
        script: scripts,
        createdByUser: {
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(scripts)
      .leftJoin(authUsers, eq(scripts.createdBy, authUsers.id))
      .where(eq(scripts.id, scriptId))
      .limit(1);

    if (result.length === 0) {
      return c.json<ApiResponse<Script>>({
        success: false,
        error: 'Script not found',
      }, 404);
    }

    const { script, createdByUser } = result[0];

    // Check access permissions
    const hasAccess = 
      script.createdBy === user.id || // Own script
      (script.organizationId === organizationId && script.isPublic) || // Public org script
      (script.organizationId === organizationId && script.createdBy === user.id); // Own org script

    if (!hasAccess) {
      return c.json<ApiResponse<Script>>({
        success: false,
        error: 'Access denied',
      }, 403);
    }

    // Get tags
    const tags = await db
      .select()
      .from(scriptTags)
      .where(eq(scriptTags.scriptId, scriptId));

    const formattedScript: Script = {
      ...script,
      createdByUser,
      tags: tags.map(t => t.tag),
    };

    return c.json<ApiResponse<Script>>({
      success: true,
      data: formattedScript,
    });
  } catch (error) {
    console.error('Error fetching script:', error);
    return c.json<ApiResponse<Script>>({
      success: false,
      error: 'Failed to fetch script',
    }, 500);
  }
});

// Create new script
scriptsRouter.post('/', zValidator('json', createScriptSchema), async (c) => {
  try {
    const user = (c as any).user;
    const organizationId = (c as any).organizationId;
    const body = c.req.valid('json') as CreateScriptRequest;

    // Create script
    const [newScript] = await db
      .insert(scripts)
      .values({
        id: createId(),
        organizationId: body.isPublic ? organizationId : null, // Only set org ID if public
        createdBy: user.id,
        name: body.name,
        description: body.description,
        scriptContent: body.scriptContent,
        timeout: body.timeout || 60,
        isPublic: body.isPublic || false,
      })
      .returning();

    // Add tags if provided
    if (body.tags && body.tags.length > 0) {
      const tagValues = body.tags.map(tag => ({
        id: createId(),
        scriptId: newScript.id,
        tag,
      }));
      await db.insert(scriptTags).values(tagValues);
    }

    // Get the created script with user info
    const result = await db
      .select({
        script: scripts,
        createdByUser: {
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(scripts)
      .leftJoin(authUsers, eq(scripts.createdBy, authUsers.id))
      .where(eq(scripts.id, newScript.id))
      .limit(1);

    const formattedScript: Script = {
      ...result[0].script,
      createdByUser: result[0].createdByUser,
      tags: body.tags || [],
    };

    return c.json<ApiResponse<Script>>({
      success: true,
      data: formattedScript,
    }, 201);
  } catch (error) {
    console.error('Error creating script:', error);
    return c.json<ApiResponse<Script>>({
      success: false,
      error: 'Failed to create script',
    }, 500);
  }
});

// Update script
scriptsRouter.patch('/:id', zValidator('json', updateScriptSchema), async (c) => {
  try {
    const user = (c as any).user;
    const scriptId = c.req.param('id');
    const body = c.req.valid('json') as UpdateScriptRequest;

    // Check if script exists and user has permission
    const [existingScript] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .limit(1);

    if (!existingScript) {
      return c.json<ApiResponse<Script>>({
        success: false,
        error: 'Script not found',
      }, 404);
    }

    if (existingScript.createdBy !== user.id) {
      return c.json<ApiResponse<Script>>({
        success: false,
        error: 'You can only edit your own scripts',
      }, 403);
    }

    // Update script
    const [updatedScript] = await db
      .update(scripts)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(scripts.id, scriptId))
      .returning();

    // Get updated script with user info and tags
    const result = await db
      .select({
        script: scripts,
        createdByUser: {
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(scripts)
      .leftJoin(authUsers, eq(scripts.createdBy, authUsers.id))
      .where(eq(scripts.id, scriptId))
      .limit(1);

    const tags = await db
      .select()
      .from(scriptTags)
      .where(eq(scriptTags.scriptId, scriptId));

    const formattedScript: Script = {
      ...result[0].script,
      createdByUser: result[0].createdByUser,
      tags: tags.map(t => t.tag),
    };

    return c.json<ApiResponse<Script>>({
      success: true,
      data: formattedScript,
    });
  } catch (error) {
    console.error('Error updating script:', error);
    return c.json<ApiResponse<Script>>({
      success: false,
      error: 'Failed to update script',
    }, 500);
  }
});

// Delete script
scriptsRouter.delete('/:id', async (c) => {
  try {
    const user = (c as any).user;
    const scriptId = c.req.param('id');

    // Check if script exists and user has permission
    const [existingScript] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .limit(1);

    if (!existingScript) {
      return c.json<ApiResponse<{ message: string }>>({
        success: false,
        error: 'Script not found',
      }, 404);
    }

    if (existingScript.createdBy !== user.id) {
      return c.json<ApiResponse<{ message: string }>>({
        success: false,
        error: 'You can only delete your own scripts',
      }, 403);
    }

    // Delete script (tags will be cascade deleted)
    await db.delete(scripts).where(eq(scripts.id, scriptId));

    return c.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: 'Script deleted successfully' },
    });
  } catch (error) {
    console.error('Error deleting script:', error);
    return c.json<ApiResponse<{ message: string }>>({
      success: false,
      error: 'Failed to delete script',
    }, 500);
  }
});

// Add tags to script
scriptsRouter.post('/:id/tags', zValidator('json', z.object({ tags: z.array(z.string()) })), async (c) => {
  try {
    const user = (c as any).user;
    const scriptId = c.req.param('id');
    const { tags } = c.req.valid('json');

    // Check if script exists and user has permission
    const [existingScript] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .limit(1);

    if (!existingScript) {
      return c.json<ApiResponse<{ message: string }>>({
        success: false,
        error: 'Script not found',
      }, 404);
    }

    if (existingScript.createdBy !== user.id) {
      return c.json<ApiResponse<{ message: string }>>({
        success: false,
        error: 'You can only modify tags for your own scripts',
      }, 403);
    }

    // Get existing tags
    const existingTags = await db
      .select()
      .from(scriptTags)
      .where(eq(scriptTags.scriptId, scriptId));

    const existingTagNames = new Set(existingTags.map(t => t.tag));

    // Add only new tags
    const newTags = tags.filter(tag => !existingTagNames.has(tag));
    if (newTags.length > 0) {
      const tagValues = newTags.map(tag => ({
        id: createId(),
        scriptId,
        tag,
      }));
      await db.insert(scriptTags).values(tagValues);
    }

    return c.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: 'Tags added successfully' },
    });
  } catch (error) {
    console.error('Error adding tags:', error);
    return c.json<ApiResponse<{ message: string }>>({
      success: false,
      error: 'Failed to add tags',
    }, 500);
  }
});

// Remove tag from script
scriptsRouter.delete('/:id/tags/:tag', async (c) => {
  try {
    const user = (c as any).user;
    const scriptId = c.req.param('id');
    const tag = c.req.param('tag');

    // Check if script exists and user has permission
    const [existingScript] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .limit(1);

    if (!existingScript) {
      return c.json<ApiResponse<{ message: string }>>({
        success: false,
        error: 'Script not found',
      }, 404);
    }

    if (existingScript.createdBy !== user.id) {
      return c.json<ApiResponse<{ message: string }>>({
        success: false,
        error: 'You can only modify tags for your own scripts',
      }, 403);
    }

    // Delete tag
    await db
      .delete(scriptTags)
      .where(and(eq(scriptTags.scriptId, scriptId), eq(scriptTags.tag, tag)));

    return c.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: 'Tag removed successfully' },
    });
  } catch (error) {
    console.error('Error removing tag:', error);
    return c.json<ApiResponse<{ message: string }>>({
      success: false,
      error: 'Failed to remove tag',
    }, 500);
  }
});

export default scriptsRouter;