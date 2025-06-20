import { Hono } from 'hono';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { CreateVMRequest, UpdateVMRequest, ApiResponse, VirtualMachine } from '@gce-platform/types';
import { createVM, deleteVM, startVM, stopVM, resumeVM, suspendVM, duplicateVM } from '../services/gcp.js';
import { syncUserVMsFromProjects } from '../services/gcp-sync.js';
import { syncSingleVM } from '../services/gcp-vm-sync.js';
import { getValidAccessToken } from '../services/auth.js';

export const vmRoutes = new Hono();

vmRoutes.get('/', async (c) => {
  const userId = c.req.header('x-user-id');
  const accessToken = c.req.header('authorization')?.replace('Bearer ', '');
  const syncProjects = c.req.query('sync');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  // If sync is requested and we have an access token, sync VMs from GCP
  let syncErrors: string[] = [];
  if (syncProjects && accessToken) {
    try {
      const projectIds = syncProjects.split(',').filter(Boolean);
      if (projectIds.length > 0) {
        const syncResult = await syncUserVMsFromProjects(userId, accessToken, projectIds);
        console.log(`Synced ${syncResult.synced} VMs for user ${userId}`);
        if (syncResult.errors.length > 0) {
          console.warn('Sync errors:', syncResult.errors);
          syncErrors = syncResult.errors;
        }
      }
    } catch (error) {
      console.error('Failed to sync VMs:', error);
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: `Failed to sync VMs: ${error instanceof Error ? error.message : String(error)}` 
      }, 500);
    }
  }

  const vms = await db.select().from(virtualMachines).where(eq(virtualMachines.userId, userId));
  
  // If there were sync errors, include them in a successful response but with a warning
  if (syncErrors.length > 0) {
    return c.json<ApiResponse<VirtualMachine[]>>({ 
      success: true, 
      data: vms as VirtualMachine[],
      error: `Sync completed with errors: ${syncErrors.join('; ')}` 
    });
  }
  
  return c.json<ApiResponse<VirtualMachine[]>>({ success: true, data: vms as VirtualMachine[] });
});

vmRoutes.get('/:id', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('id');
  const shouldSync = c.req.query('sync') === 'true';
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  let [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  // Sync VM data from GCP if requested
  if (shouldSync && providedToken) {
    try {
      const accessToken = await getValidAccessToken(userId, providedToken);
      if (accessToken) {
        await syncSingleVM(userId, vmId, accessToken);
        // Fetch updated VM data
        [vm] = await db.select().from(virtualMachines)
          .where(eq(virtualMachines.id, vmId));
      }
    } catch (error) {
      console.error('Failed to sync VM data:', error);
      // Don't fail the request, just log the error
    }
  }

  return c.json<ApiResponse<VirtualMachine>>({ success: true, data: vm as VirtualMachine });
});

vmRoutes.post('/', async (c) => {
  const userId = c.req.header('x-user-id');
  const accessToken = c.req.header('authorization')?.replace('Bearer ', '');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }
  
  if (!accessToken) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Access token required' }, 401);
  }

  const body = await c.req.json<CreateVMRequest>();
  
  try {
    const gcpInstance = await createVM({
      projectId: body.gcpProjectId,
      zone: body.zone,
      name: body.name,
      machineType: body.machineType,
      initScript: body.initScript,
      accessToken,
    });

    const [vm] = await db.insert(virtualMachines).values({
      userId,
      name: body.name,
      gcpProjectId: body.gcpProjectId,
      zone: body.zone,
      machineType: body.machineType,
      status: 'pending',
      initScript: body.initScript,
      gcpInstanceId: gcpInstance.id,
    }).returning();

    return c.json<ApiResponse<VirtualMachine>>({ success: true, data: vm as VirtualMachine });
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});

vmRoutes.post('/:id/start', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  try {
    // Get a valid access token (either use provided or refresh)
    const accessToken = await getValidAccessToken(userId, providedToken);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // Use appropriate action based on current status
    if (vm.status === 'suspended') {
      await resumeVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    } else {
      await startVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    }
    
    await db.update(virtualMachines)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM started' } });
  } catch (error: any) {
    console.error('Failed to start VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 404) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'VM instance not found in Google Cloud. It may have been deleted outside this platform.' 
      }, 404);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.post('/:id/stop', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  try {
    // Get a valid access token (either use provided or refresh)
    const accessToken = await getValidAccessToken(userId, providedToken);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    await stopVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    await db.update(virtualMachines)
      .set({ status: 'stopped', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM stopped' } });
  } catch (error: any) {
    console.error('Failed to stop VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 404) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'VM instance not found in Google Cloud. It may have been deleted outside this platform.' 
      }, 404);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.post('/:id/suspend', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  if (vm.status !== 'running') {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM must be running to suspend' }, 400);
  }

  try {
    // Get a valid access token (either use provided or refresh)
    const accessToken = await getValidAccessToken(userId, providedToken);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    await suspendVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    await db.update(virtualMachines)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM suspended' } });
  } catch (error: any) {
    console.error('Failed to suspend VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 404) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'VM instance not found in Google Cloud. It may have been deleted outside this platform.' 
      }, 404);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.post('/:id/duplicate', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const body = await c.req.json<{ name: string }>();
  
  if (!body.name) {
    return c.json<ApiResponse<never>>({ success: false, error: 'New VM name is required' }, 400);
  }

  // Check if name already exists
  const existingVm = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.name, body.name));
  
  if (existingVm.length > 0) {
    return c.json<ApiResponse<never>>({ success: false, error: 'A VM with this name already exists' }, 400);
  }

  const [sourceVm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!sourceVm || sourceVm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Source VM not found' }, 404);
  }

  try {
    // Get a valid access token (either use provided or refresh)
    const accessToken = await getValidAccessToken(userId, providedToken);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // Duplicate the VM in GCP
    await duplicateVM({
      sourceProjectId: sourceVm.gcpProjectId,
      sourceZone: sourceVm.zone,
      sourceInstanceName: sourceVm.gcpInstanceId!,
      newName: body.name,
      accessToken,
    });

    // Create new VM record in database
    const [newVm] = await db.insert(virtualMachines).values({
      name: body.name,
      gcpProjectId: sourceVm.gcpProjectId,
      gcpInstanceId: body.name,
      zone: sourceVm.zone,
      machineType: sourceVm.machineType,
      status: 'pending',
      userId,
      initScript: sourceVm.initScript,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    // Get firewall rules for the source VM
    const { firewallRules } = await import('../db/schema.js');
    const sourceFirewallRules = await db.select().from(firewallRules)
      .where(eq(firewallRules.vmId, vmId));

    // Duplicate firewall rules for the new VM
    if (sourceFirewallRules.length > 0) {
      const newFirewallRules = sourceFirewallRules.map(rule => ({
        vmId: newVm.id,
        name: rule.name.replace(sourceVm.name, body.name),
        gcpRuleName: rule.gcpRuleName?.replace(sourceVm.name, body.name),
        direction: rule.direction,
        priority: rule.priority,
        sourceRanges: rule.sourceRanges,
        allowedPorts: rule.allowedPorts,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.insert(firewallRules).values(newFirewallRules);
    }

    // Get port labels for the source VM
    const { portLabels } = await import('../db/schema.js');
    const sourcePortLabels = await db.select().from(portLabels)
      .where(eq(portLabels.vmId, vmId));

    // Duplicate port labels for the new VM
    if (sourcePortLabels.length > 0) {
      const newPortLabels = sourcePortLabels.map(label => ({
        vmId: newVm.id,
        port: label.port,
        protocol: label.protocol,
        label: label.label,
        description: label.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.insert(portLabels).values(newPortLabels);
    }

    return c.json<ApiResponse<VirtualMachine>>({ 
      success: true, 
      data: newVm as VirtualMachine 
    });
  } catch (error: any) {
    console.error('Failed to duplicate VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 409) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'A VM with this name already exists in Google Cloud' 
      }, 409);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.delete('/:id', async (c) => {
  const userId = c.req.header('x-user-id');
  const accessToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }
  
  if (!accessToken) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Access token required' }, 401);
  }

  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  try {
    await deleteVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    await db.delete(virtualMachines).where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM deleted' } });
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});