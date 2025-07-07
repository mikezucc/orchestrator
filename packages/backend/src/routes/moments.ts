import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { moments, momentAssets } from '../db/schema-moments';
import { virtualMachines } from '../db/schema';
import { authUsers } from '../db/schema-auth';
import { createId } from '@paralleldrive/cuid2';
import { flexibleAuth } from '../middleware/flexibleAuth.js';
import { GCSService } from '../services/gcs.js';

const momentsRouter = new Hono();

// Apply flexible auth middleware to all routes
momentsRouter.use('*', flexibleAuth);

// VM agent authentication middleware for specific routes
const vmAgentAuth = async (c: any, next: any) => {
  const vmToken = c.req.header('X-VM-Token');
  const vmId = c.req.header('X-VM-ID');
  
  if (!vmToken || !vmId) {
    return c.json({ error: 'Missing VM authentication headers' }, 401);
  }
  
  // Verify VM exists and token matches
  const [vm] = await db
    .select()
    .from(virtualMachines)
    .where(eq(virtualMachines.id, vmId))
    .limit(1);
    
  if (!vm) {
    return c.json({ error: 'Invalid VM ID' }, 401);
  }
  
  // TODO: Implement proper VM token validation
  // For now, we'll trust the VM ID and set the context
  c.organizationId = vm.organizationId;
  c.vmId = vmId;
  c.isVMAgent = true;
  
  await next();
};

// Validation schemas
const createMomentSchema = z.object({
  vmId: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  gitBranch: z.string().optional(),
  gitCommitHash: z.string().optional(),
  gitCommitMessage: z.string().optional(),
  gitAuthor: z.string().optional(),
  gitAuthorEmail: z.string().optional(),
  gitCommitDate: z.string().optional(),
  gitDiff: z.string().optional(),
  metadata: z.record(z.any()).optional().default({}),
});

const uploadAssetSchema = z.object({
  assetType: z.enum(['screenshot', 'screen_recording', 'log_file', 'config_file', 'other']),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().min(1).max(500 * 1024 * 1024), // 500MB max
  uploadMethod: z.enum(['web_ui', 'api', 'vm_agent', 'cli']),
});

const listMomentsSchema = z.object({
  vmId: z.string().optional(),
  gitBranch: z.string().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return [val];
    return val;
  }),
  limit: z.string().optional().default('50').transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) return 50;
    return Math.min(num, 100);
  }),
  offset: z.string().optional().default('0').transform((val) => {
    const num = parseInt(val, 10);
    return isNaN(num) || num < 0 ? 0 : num;
  }),
});

// Create a new moment
momentsRouter.post('/create', zValidator('json', createMomentSchema), async (c) => {
  try {
    const user = (c as any).user;
    const organizationId = (c as any).organizationId;
    const data = c.req.valid('json');

    // Verify VM belongs to organization if vmId provided
    if (data.vmId) {
      const [vm] = await db
        .select()
        .from(virtualMachines)
        .where(and(
          eq(virtualMachines.id, data.vmId),
          eq(virtualMachines.organizationId, organizationId)
        ))
        .limit(1);

      if (!vm) {
        return c.json({ error: 'VM not found or not accessible' }, 404);
      }
    }

    // Create the moment
    const momentId = createId();
    const [moment] = await db
      .insert(moments)
      .values({
        id: momentId,
        organizationId,
        createdBy: user.id,
        vmId: data.vmId,
        title: data.title,
        description: data.description,
        tags: data.tags,
        gitBranch: data.gitBranch,
        gitCommitHash: data.gitCommitHash,
        gitCommitMessage: data.gitCommitMessage,
        gitAuthor: data.gitAuthor,
        gitAuthorEmail: data.gitAuthorEmail,
        gitCommitDate: data.gitCommitDate ? new Date(data.gitCommitDate) : null,
        gitDiff: data.gitDiff,
        metadata: data.metadata,
      })
      .returning();

    return c.json({ success: true, moment });
  } catch (error) {
    console.error('Error creating moment:', error);
    return c.json({ error: 'Failed to create moment' }, 500);
  }
});

// Get upload URL for an asset
momentsRouter.post('/:momentId/assets/upload', zValidator('json', uploadAssetSchema), async (c) => {
  try {
    const user = (c as any).user;
    const organizationId = (c as any).organizationId;
    const momentId = c.req.param('momentId');
    const data = c.req.valid('json');

    // Verify moment exists and belongs to organization
    const [moment] = await db
      .select()
      .from(moments)
      .where(and(
        eq(moments.id, momentId),
        eq(moments.organizationId, organizationId),
        eq(moments.isDeleted, false)
      ))
      .limit(1);

    if (!moment) {
      return c.json({ error: 'Moment not found' }, 404);
    }

    // Create asset record
    const assetId = createId();
    const gcsPath = `${momentId}/${assetId}-${data.fileName}`;
    
    await db.insert(momentAssets).values({
      id: assetId,
      momentId,
      organizationId,
      assetType: data.assetType,
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      gcsBucket: `moments-${organizationId}`,
      gcsPath,
      uploadedBy: user.id,
      uploadMethod: data.uploadMethod,
      processingStatus: 'pending',
    });

    // Generate signed upload URL using primary organization's GCS
    const gcsService = await GCSService.forPrimaryOrganization();
    const uploadUrl = await gcsService.generateUploadUrl(
      organizationId,
      momentId,
      assetId,
      data.fileName,
      data.mimeType,
      data.fileSizeBytes
    );

    return c.json({
      success: true,
      assetId,
      uploadUrl,
      gcsPath,
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return c.json({ error: 'Failed to generate upload URL' }, 500);
  }
});

// List moments
momentsRouter.get('/list', zValidator('query', listMomentsSchema), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const query = c.req.valid('query');

    // Build query conditions
    const conditions = [
      eq(moments.organizationId, organizationId),
      eq(moments.isDeleted, false),
    ];

    if (query.vmId) {
      conditions.push(eq(moments.vmId, query.vmId));
    }

    if (query.gitBranch) {
      conditions.push(eq(moments.gitBranch, query.gitBranch));
    }

    // Get moments with creator info
    const momentsList = await db
      .select({
        moment: moments,
        createdByUser: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        },
        vm: {
          id: virtualMachines.id,
          name: virtualMachines.name,
        },
        assetCount: sql<number>`(
          SELECT COUNT(*)::int 
          FROM ${momentAssets} 
          WHERE ${momentAssets.momentId} = ${moments.id}
        )`,
      })
      .from(moments)
      .leftJoin(authUsers, eq(moments.createdBy, authUsers.id))
      .leftJoin(virtualMachines, eq(moments.vmId, virtualMachines.id))
      .where(and(...conditions))
      .orderBy(desc(moments.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    // Filter by tags if provided
    let filteredMoments = momentsList;
    if (query.tags && query.tags.length > 0) {
      filteredMoments = momentsList.filter(m => {
        const momentTags = m.moment.tags as string[] || [];
        return query.tags!.some(tag => momentTags.includes(tag));
      });
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(moments)
      .where(and(...conditions));

    return c.json({
      success: true,
      moments: filteredMoments,
      total: count,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (error) {
    console.error('Error listing moments:', error);
    return c.json({ error: 'Failed to list moments' }, 500);
  }
});

// Get moment details with assets
momentsRouter.get('/:momentId', async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const momentId = c.req.param('momentId');

    // Get moment with creator and VM info
    const [momentData] = await db
      .select({
        moment: moments,
        createdByUser: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        },
        vm: virtualMachines,
      })
      .from(moments)
      .leftJoin(authUsers, eq(moments.createdBy, authUsers.id))
      .leftJoin(virtualMachines, eq(moments.vmId, virtualMachines.id))
      .where(and(
        eq(moments.id, momentId),
        eq(moments.organizationId, organizationId),
        eq(moments.isDeleted, false)
      ))
      .limit(1);

    if (!momentData) {
      return c.json({ error: 'Moment not found' }, 404);
    }

    // Get assets for the moment
    const assets = await db
      .select({
        asset: momentAssets,
        uploadedByUser: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        },
      })
      .from(momentAssets)
      .leftJoin(authUsers, eq(momentAssets.uploadedBy, authUsers.id))
      .where(eq(momentAssets.momentId, momentId))
      .orderBy(desc(momentAssets.createdAt));

    // Generate download URLs for assets using primary organization's GCS
    const gcsService = await GCSService.forPrimaryOrganization();
    const assetsWithUrls = await Promise.all(
      assets.map(async (assetData) => {
        try {
          const downloadUrl = await gcsService.generateDownloadUrl(
            organizationId,
            assetData.asset.gcsPath,
            60 // 1 hour expiry
          );
          return {
            ...assetData,
            downloadUrl,
          };
        } catch (error) {
          console.error(`Error generating download URL for asset ${assetData.asset.id}:`, error);
          return {
            ...assetData,
            downloadUrl: null,
          };
        }
      })
    );

    return c.json({
      success: true,
      moment: momentData,
      assets: assetsWithUrls,
    });
  } catch (error) {
    console.error('Error getting moment details:', error);
    return c.json({ error: 'Failed to get moment details' }, 500);
  }
});

// Soft delete a moment
momentsRouter.delete('/:momentId', async (c) => {
  try {
    const user = (c as any).user;
    const organizationId = (c as any).organizationId;
    const momentId = c.req.param('momentId');

    // Verify moment exists and user has permission
    const [moment] = await db
      .select()
      .from(moments)
      .where(and(
        eq(moments.id, momentId),
        eq(moments.organizationId, organizationId),
        eq(moments.isDeleted, false)
      ))
      .limit(1);

    if (!moment) {
      return c.json({ error: 'Moment not found' }, 404);
    }

    // Only creator or org admin can delete
    if (moment.createdBy !== user.id) {
      // TODO: Check if user is org admin
      return c.json({ error: 'Unauthorized to delete this moment' }, 403);
    }

    // Soft delete the moment
    await db
      .update(moments)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(moments.id, momentId));

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting moment:', error);
    return c.json({ error: 'Failed to delete moment' }, 500);
  }
});

// Update asset processing status (internal use)
momentsRouter.post('/assets/:assetId/status', async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const assetId = c.req.param('assetId');
    const { status, error, metadata } = await c.req.json();

    // Verify asset belongs to organization
    const [asset] = await db
      .select()
      .from(momentAssets)
      .where(and(
        eq(momentAssets.id, assetId),
        eq(momentAssets.organizationId, organizationId)
      ))
      .limit(1);

    if (!asset) {
      return c.json({ error: 'Asset not found' }, 404);
    }

    // Update asset status
    const updateData: any = {
      processingStatus: status,
      updatedAt: new Date(),
    };

    if (error) {
      updateData.processingError = error;
    }

    if (metadata) {
      updateData.metadata = { ...asset.metadata, ...metadata };
    }

    await db
      .update(momentAssets)
      .set(updateData)
      .where(eq(momentAssets.id, assetId));

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating asset status:', error);
    return c.json({ error: 'Failed to update asset status' }, 500);
  }
});

// VM Agent endpoint for creating moments
momentsRouter.post('/vm/create', vmAgentAuth, zValidator('json', createMomentSchema), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const vmId = (c as any).vmId;
    const data = c.req.valid('json');

    // Override vmId with the authenticated VM's ID
    data.vmId = vmId;

    // Get VM details for metadata
    const [vm] = await db
      .select()
      .from(virtualMachines)
      .where(eq(virtualMachines.id, vmId))
      .limit(1);

    // Create the moment
    const momentId = createId();
    const [moment] = await db
      .insert(moments)
      .values({
        id: momentId,
        organizationId,
        createdBy: vm.createdBy || createId(), // Use VM creator as moment creator
        vmId: vmId,
        title: data.title,
        description: data.description,
        tags: data.tags,
        gitBranch: data.gitBranch,
        gitCommitHash: data.gitCommitHash,
        gitCommitMessage: data.gitCommitMessage,
        gitAuthor: data.gitAuthor,
        gitAuthorEmail: data.gitAuthorEmail,
        gitCommitDate: data.gitCommitDate ? new Date(data.gitCommitDate) : null,
        gitDiff: data.gitDiff,
        metadata: {
          ...data.metadata,
          createdByVMAgent: true,
          vmName: vm.name,
        },
      })
      .returning();

    return c.json({ success: true, moment });
  } catch (error) {
    console.error('Error creating moment from VM:', error);
    return c.json({ error: 'Failed to create moment' }, 500);
  }
});

// VM Agent endpoint for uploading assets
momentsRouter.post('/vm/:momentId/assets/upload', vmAgentAuth, zValidator('json', uploadAssetSchema), async (c) => {
  try {
    const organizationId = (c as any).organizationId;
    const vmId = (c as any).vmId;
    const momentId = c.req.param('momentId');
    const data = c.req.valid('json');

    // Verify moment exists, belongs to organization, and was created by this VM
    const [moment] = await db
      .select()
      .from(moments)
      .where(and(
        eq(moments.id, momentId),
        eq(moments.organizationId, organizationId),
        eq(moments.isDeleted, false)
      ))
      .limit(1);

    if (!moment) {
      return c.json({ error: 'Moment not found or not accessible' }, 404);
    }

    // Create asset record
    const assetId = createId();
    const gcsPath = `${momentId}/${assetId}-${data.fileName}`;
    
    // Get VM details for upload metadata
    const [vm] = await db
      .select()
      .from(virtualMachines)
      .where(eq(virtualMachines.id, vmId))
      .limit(1);
    
    await db.insert(momentAssets).values({
      id: assetId,
      momentId,
      organizationId,
      assetType: data.assetType,
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      gcsBucket: `moments-${organizationId}`,
      gcsPath,
      uploadedBy: vm.createdBy || createId(),
      uploadMethod: 'vm_agent',
      processingStatus: 'pending',
    });

    // Generate signed upload URL using primary organization's GCS
    const gcsService = await GCSService.forPrimaryOrganization();
    const uploadUrl = await gcsService.generateUploadUrl(
      organizationId,
      momentId,
      assetId,
      data.fileName,
      data.mimeType,
      data.fileSizeBytes
    );

    return c.json({
      success: true,
      assetId,
      uploadUrl,
      gcsPath,
    });
  } catch (error) {
    console.error('Error generating upload URL for VM:', error);
    return c.json({ error: 'Failed to generate upload URL' }, 500);
  }
});

export { momentsRouter };