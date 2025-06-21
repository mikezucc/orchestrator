import { Hono } from 'hono';
import { db } from '../db/index.js';
import { virtualMachines, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { ApiResponse } from '@gce-platform/types';
import { generateSSHKeys, addSSHKeyToVM, getSSHConnectionInfo } from '../services/gcp-ssh.js';
import { getValidAccessToken } from '../services/auth.js';

export const sshRoutes = new Hono();

// Generate SSH keys and add to VM
sshRoutes.post('/:vmId/setup', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('vmId');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  try {
    // Get VM and user details
    const [vm] = await db.select().from(virtualMachines)
      .where(and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.userId, userId)
      ));

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    const [user] = await db.select().from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return c.json<ApiResponse<never>>({ success: false, error: 'User not found' }, 404);
    }

    // Generate username from email
    const username = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Get valid access token
    const accessToken = await getValidAccessToken(userId, providedToken);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // Generate SSH keys
    const { publicKey, privateKey } = await generateSSHKeys(username);

    // Add public key to VM metadata
    await addSSHKeyToVM({
      projectId: vm.gcpProjectId,
      zone: vm.zone,
      instanceName: vm.gcpInstanceId!,
      username,
      publicKey,
      accessToken
    });

    // Get connection info
    const connectionInfo = await getSSHConnectionInfo(
      vm.gcpProjectId,
      vm.zone,
      vm.gcpInstanceId!,
      accessToken
    );

    return c.json<ApiResponse<{
      username: string;
      privateKey: string;
      publicKey: string;
      host: string;
      port: number;
    }>>({ 
      success: true, 
      data: {
        username,
        privateKey,
        publicKey,
        host: connectionInfo.externalIp,
        port: 22
      }
    });
  } catch (error: any) {
    console.error('Failed to setup SSH:', error);
    
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure you have the necessary permissions to modify VM metadata.' 
      }, 403);
    }
    
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: error.message || 'Failed to setup SSH connection' 
    }, 500);
  }
});

// Get SSH connection info
sshRoutes.get('/:vmId/info', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('vmId');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  try {
    // Get VM details
    const [vm] = await db.select().from(virtualMachines)
      .where(and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.userId, userId)
      ));

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    if (!vm.publicIp) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM does not have a public IP' }, 400);
    }

    const [user] = await db.select().from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return c.json<ApiResponse<never>>({ success: false, error: 'User not found' }, 404);
    }

    // Generate username from email
    const username = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Get valid access token
    const accessToken = await getValidAccessToken(userId, providedToken);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // Get connection info
    const connectionInfo = await getSSHConnectionInfo(
      vm.gcpProjectId,
      vm.zone,
      vm.gcpInstanceId!,
      accessToken
    );

    return c.json<ApiResponse<{
      username: string;
      host: string;
      port: number;
      projectId: string;
      zone: string;
      instanceName: string;
    }>>({ 
      success: true, 
      data: {
        username,
        host: connectionInfo.externalIp,
        port: 22,
        projectId: connectionInfo.projectId,
        zone: connectionInfo.zone,
        instanceName: connectionInfo.instanceName
      }
    });
  } catch (error: any) {
    console.error('Failed to get SSH info:', error);
    
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: error.message || 'Failed to get SSH connection info' 
    }, 500);
  }
});

export default sshRoutes;