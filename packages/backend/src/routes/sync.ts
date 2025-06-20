import { Hono } from 'hono';
import type { ApiResponse } from '@gce-platform/types';
import { syncUserVMsFromProjects } from '../services/gcp-sync.js';

export const syncRoutes = new Hono();

syncRoutes.post('/vms', async (c) => {
  const userId = c.req.header('x-user-id');
  const accessToken = c.req.header('authorization')?.replace('Bearer ', '');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  if (!accessToken) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Access token required' }, 401);
  }

  try {
    const body = await c.req.json<{ projectIds: string[] }>();
    
    if (!body.projectIds || body.projectIds.length === 0) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Project IDs required' }, 400);
    }

    const result = await syncUserVMsFromProjects(userId, accessToken, body.projectIds);
    
    return c.json<ApiResponse<{ synced: number; errors: string[] }>>({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.error('Sync error:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to sync VMs' 
    }, 500);
  }
});