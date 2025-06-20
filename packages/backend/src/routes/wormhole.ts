import { Hono } from 'hono';
import axios, { AxiosError } from 'axios';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import type { 
  WormholeStatus, 
  WormholeRepositories, 
  WormholeBranchSwitchRequest,
  WormholeBranchSwitchResponse,
  ApiResponse
} from '@gce-platform/types';

export const wormholeRoutes = new Hono();

// Helper function to get Wormhole server URL for a VM
function getWormholeUrl(publicIp: string): string {
  return `http://${publicIp}:8080`;
}

// Get Wormhole server status
wormholeRoutes.get('/:vmId/status', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');
  
  try {
    // Get VM details to find public IP
    const [vm] = await db.select().from(virtualMachines).where(
      and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.userId, userId)
      )
    );

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    if (!vm.publicIp) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM does not have a public IP' }, 400);
    }

    // Forward request to Wormhole server
    const response = await axios.get<WormholeStatus>(`${getWormholeUrl(vm.publicIp)}/api/status`);
    
    return c.json<ApiResponse<WormholeStatus>>({ success: true, data: response.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        return c.json<ApiResponse<never>>({ 
          success: false, 
          error: 'Could not connect to Wormhole service. Ensure it is running on port 8080.' 
        }, 503);
      }
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: axiosError.response?.data || 'Failed to connect to Wormhole service' 
      }, axiosError.response?.status || 500);
    }
    console.error('Error fetching Wormhole status:', error);
    return c.json<ApiResponse<never>>({ success: false, error: 'Failed to fetch Wormhole status' }, 500);
  }
});

// Get repository information
wormholeRoutes.get('/:vmId/repositories', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');
  
  try {
    // Get VM details to find public IP
    const [vm] = await db.select().from(virtualMachines).where(
      and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.userId, userId)
      )
    );

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    if (!vm.publicIp) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM does not have a public IP' }, 400);
    }

    // Forward request to Wormhole server
    const response = await axios.get<WormholeRepositories>(`${getWormholeUrl(vm.publicIp)}/api/repositories`);
    
    return c.json<ApiResponse<WormholeRepositories>>({ success: true, data: response.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        return c.json<ApiResponse<never>>({ 
          success: false, 
          error: 'Could not connect to Wormhole service. Ensure it is running on port 8080.' 
        }, 503);
      }
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: axiosError.response?.data || 'Failed to connect to Wormhole service' 
      }, axiosError.response?.status || 500);
    }
    console.error('Error fetching repositories:', error);
    return c.json<ApiResponse<never>>({ success: false, error: 'Failed to fetch repositories' }, 500);
  }
});

// Trigger branch switch
wormholeRoutes.post('/:vmId/branch-switch', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');
  
  try {
    // Get VM details to find public IP
    const [vm] = await db.select().from(virtualMachines).where(
      and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.userId, userId)
      )
    );

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    if (!vm.publicIp) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM does not have a public IP' }, 400);
    }

    // Get request body
    const body = await c.req.json<WormholeBranchSwitchRequest>();
    
    if (!body.targetBranch || !body.repoPath) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'targetBranch and repoPath are required' 
      }, 400);
    }

    // Forward request to Wormhole server
    const response = await axios.post<WormholeBranchSwitchResponse>(
      `${getWormholeUrl(vm.publicIp)}/api/branch-switch`,
      body
    );
    
    return c.json<ApiResponse<WormholeBranchSwitchResponse>>({ success: true, data: response.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        return c.json<ApiResponse<never>>({ 
          success: false, 
          error: 'Could not connect to Wormhole service. Ensure it is running on port 8080.' 
        }, 503);
      }
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: axiosError.response?.data || 'Failed to connect to Wormhole service' 
      }, axiosError.response?.status || 500);
    }
    console.error('Error triggering branch switch:', error);
    return c.json<ApiResponse<never>>({ success: false, error: 'Failed to trigger branch switch' }, 500);
  }
});

// WebSocket proxy endpoint - This will be handled separately in the main server
// as Hono doesn't directly support WebSocket proxying

export default wormholeRoutes;