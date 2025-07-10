import { Hono } from 'hono';
import { db } from '../db/index.js';
import { vmRepositories } from '../db/schema-vm-repositories.js';
import { virtualMachines } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { daemonSyncService } from '../services/daemon-sync.js';
import axios from 'axios';
import type { ApiResponse, WormholeRepository, WormholeClient } from '@gce-platform/types';
import { GitHubAPIService } from '../services/github-api.js';

export const vmRepositoryRoutes = new Hono();
const githubApi = new GitHubAPIService();

// Get all repositories for a VM with wormhole data
vmRepositoryRoutes.get('/:vmId/repositories', async (c) => {
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

    // Get all active repositories for this VM from database
    const dbRepositories = await db
      .select({
        id: vmRepositories.id,
        vmId: vmRepositories.vmId,
        repoFullName: vmRepositories.repoFullName,
        localPath: vmRepositories.localPath,
        lastSyncedAt: vmRepositories.lastSyncedAt,
        syncError: vmRepositories.syncError,
        addedAt: vmRepositories.addedAt,
        metadata: vmRepositories.metadata,
      })
      .from(vmRepositories)
      .where(
        and(
          eq(vmRepositories.vmId, vmId),
          isNull(vmRepositories.removedAt)
        )
      );

    // Try to fetch live wormhole data if VM has public IP
    const wormholeData: {
      status?: any;
      repositories?: WormholeRepository[];
      daemons?: {
        daemons: {
          repository: any;
          status: string;
          uptime: number;
        }[];
      };
    } = {};

    if (vm.publicIp) {
      try {
        // Fetch wormhole status from central server
        const [statusRes, reposRes, daemonsRes] = await Promise.allSettled([
          axios.get(`https://ws.slopbox.dev/api/status`),
          axios.get(`https://ws.slopbox.dev/api/repositories`), 
          axios.get(`https://ws.slopbox.dev/api/daemons`)
        ]);

        if (statusRes.status === 'fulfilled') {
          wormholeData.status = statusRes.value.data;
        }

        console.log('Wormhole Repositories Response:', JSON.stringify(reposRes.value!.data));
        if (reposRes.status === 'fulfilled') {
          wormholeData.repositories = reposRes.value.data;
        }
        if (daemonsRes.status === 'fulfilled') {
          wormholeData.daemons = daemonsRes.value.data;
        }
      } catch (error) {
        // Silently fail - wormhole data is optional enhancement
        console.warn('Failed to fetch wormhole data:', error);
      }
    }

    // Combine database repositories with wormhole data
    const enrichedRepositories = dbRepositories.map(dbRepo => {
      // Find matching wormhole repository by path
      const wormholeRepo = wormholeData.repositories?.find(
        wr => wr.repoPath === dbRepo.repoFullName
      );

      // Find daemon managing this repository
      const daemon = wormholeData.daemons?.daemons.find(
        d => d.repository?.path === dbRepo.repoFullName
      );

      // Extract clients for this repository from status
      const clients = wormholeData.status?.clients?.filter(
        (client: WormholeClient) => client.repoPath === dbRepo.repoFullName
      ) || [];

      return {
        ...dbRepo,
        wormhole: wormholeRepo ? {
          branches: wormholeRepo.branches,
          availableBranches: wormholeRepo.availableBranches,
          activeBranches: wormholeRepo.activeBranches,
          clientCount: wormholeRepo.clientCount,
        } : null,
        daemon: daemon ? {
          pid: daemon.pid,
          status: daemon.status,
          uptime: daemon.uptime,
          branch: daemon.repository?.branch,
          originUrl: daemon.repository?.originUrl,
        } : null,
        clients,
      };
    });

    return c.json<ApiResponse<typeof enrichedRepositories>>({ 
      success: true, 
      data: enrichedRepositories 
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

// Get branches for a repository from GitHub API
vmRepositoryRoutes.get('/:vmId/repositories/:repoId/github-branches', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');
  const repoId = c.req.param('repoId');

  try {
    // Get repository details
    const [repo] = await db
      .select({
        repoFullName: vmRepositories.repoFullName,
      })
      .from(vmRepositories)
      .where(
        and(
          eq(vmRepositories.id, repoId),
          eq(vmRepositories.vmId, vmId),
          isNull(vmRepositories.removedAt)
        )
      )
      .limit(1);

    if (!repo) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Repository not found' }, 404);
    }

    // Fetch branches from GitHub API
    const branches = await githubApi.getRepositoryBranches(userId, repo.repoFullName);

    if (!branches) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Failed to fetch branches from GitHub. Please ensure you have authorized GitHub access.' 
      }, 400);
    }

    return c.json<ApiResponse<typeof branches>>({ 
      success: true, 
      data: branches 
    });
  } catch (error) {
    console.error('Error fetching GitHub branches:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to fetch branches from GitHub' 
    }, 500);
  }
});

export default vmRepositoryRoutes;