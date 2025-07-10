import { Hono } from 'hono';
import { db } from '../db/index.js';
import { vmRepositories } from '../db/schema-vm-repositories.js';
import { virtualMachines } from '../db/schema.js';
import { projectRepositories } from '../db/schema-projects.js';
import { authUsers } from '../db/schema-auth.js';
import { eq, and, isNull } from 'drizzle-orm';
import { daemonSyncService } from '../services/daemon-sync.js';
import type { ApiResponse } from '@gce-platform/types';

export const vmRepositoryRoutes = new Hono();

// Get all repositories for a VM
vmRepositoryRoutes.get('/:vmId/repositories', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');

  try {
    // Verify VM exists and user has access
    const [vm] = await db
      .select()
      .from(virtualMachines)
      .where(eq(virtualMachines.id, vmId))
      .limit(1);

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    // Get all active repositories for this VM
    const repositories = await db
      .select({
        id: vmRepositories.id,
        vmId: vmRepositories.vmId,
        repositoryId: vmRepositories.repositoryId,
        localPath: vmRepositories.localPath,
        status: vmRepositories.status,
        lastSyncedAt: vmRepositories.lastSyncedAt,
        syncError: vmRepositories.syncError,
        addedAt: vmRepositories.addedAt,
        repository: {
          id: projectRepositories.id,
          projectId: projectRepositories.projectId,
          repositoryUrl: projectRepositories.repositoryUrl,
          branch: projectRepositories.branch,
          wormholeDaemonId: projectRepositories.wormholeDaemonId,
        },
        addedBy: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        }
      })
      .from(vmRepositories)
      .innerJoin(
        projectRepositories,
        eq(vmRepositories.repositoryId, projectRepositories.id)
      )
      .innerJoin(
        authUsers,
        eq(vmRepositories.addedBy, authUsers.id)
      )
      .where(
        and(
          eq(vmRepositories.vmId, vmId),
          isNull(vmRepositories.removedAt)
        )
      );

    return c.json<ApiResponse<typeof repositories>>({ 
      success: true, 
      data: repositories 
    });
  } catch (error) {
    console.error('Error fetching VM repositories:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to fetch VM repositories' 
    }, 500);
  }
});

// Manually trigger sync for a specific daemon
vmRepositoryRoutes.post('/sync/:clientId', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const clientId = c.req.param('clientId');

  try {
    const body = await c.req.json<{ branch?: string; repoPath?: string }>();
    
    await daemonSyncService.syncDaemonUpdate(clientId, body.branch, body.repoPath);

    return c.json<ApiResponse<{ message: string }>>({ 
      success: true, 
      data: { message: 'Sync triggered successfully' } 
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to trigger sync' 
    }, 500);
  }
});

// Get repository history for a VM (including removed ones)
vmRepositoryRoutes.get('/:vmId/repositories/history', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');

  try {
    // Verify VM exists
    const [vm] = await db
      .select()
      .from(virtualMachines)
      .where(eq(virtualMachines.id, vmId))
      .limit(1);

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    // Get all repositories (including removed) for this VM
    const repositories = await db
      .select({
        id: vmRepositories.id,
        vmId: vmRepositories.vmId,
        repositoryId: vmRepositories.repositoryId,
        localPath: vmRepositories.localPath,
        status: vmRepositories.status,
        lastSyncedAt: vmRepositories.lastSyncedAt,
        syncError: vmRepositories.syncError,
        addedAt: vmRepositories.addedAt,
        removedAt: vmRepositories.removedAt,
        repository: {
          id: projectRepositories.id,
          projectId: projectRepositories.projectId,
          repositoryUrl: projectRepositories.repositoryUrl,
          branch: projectRepositories.branch,
        },
        addedBy: {
          id: authUsers.id,
          email: authUsers.email,
          name: authUsers.name,
        }
      })
      .from(vmRepositories)
      .innerJoin(
        projectRepositories,
        eq(vmRepositories.repositoryId, projectRepositories.id)
      )
      .innerJoin(
        authUsers,
        eq(vmRepositories.addedBy, authUsers.id)
      )
      .where(eq(vmRepositories.vmId, vmId))
      .orderBy(vmRepositories.addedAt);

    return c.json<ApiResponse<typeof repositories>>({ 
      success: true, 
      data: repositories 
    });
  } catch (error) {
    console.error('Error fetching VM repository history:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to fetch VM repository history' 
    }, 500);
  }
});

export default vmRepositoryRoutes;