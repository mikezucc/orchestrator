import { Hono } from 'hono';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { CreateVMRequest, UpdateVMRequest, ApiResponse, VirtualMachine } from '@gce-platform/types';
import { createVM, deleteVM, startVM, stopVM } from '../services/gcp.js';
import { syncUserVMsFromProjects } from '../services/gcp-sync.js';

export const vmRoutes = new Hono();

vmRoutes.get('/', async (c) => {
  const userId = c.req.header('x-user-id');
  const accessToken = c.req.header('authorization')?.replace('Bearer ', '');
  const syncProjects = c.req.query('sync');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  // If sync is requested and we have an access token, sync VMs from GCP
  if (syncProjects && accessToken) {
    try {
      const projectIds = syncProjects.split(',').filter(Boolean);
      if (projectIds.length > 0) {
        const syncResult = await syncUserVMsFromProjects(userId, accessToken, projectIds);
        console.log(`Synced ${syncResult.synced} VMs for user ${userId}`);
        if (syncResult.errors.length > 0) {
          console.warn('Sync errors:', syncResult.errors);
        }
      }
    } catch (error) {
      console.error('Failed to sync VMs:', error);
      // Don't fail the request, just log the error
    }
  }

  const vms = await db.select().from(virtualMachines).where(eq(virtualMachines.userId, userId));
  return c.json<ApiResponse<VirtualMachine[]>>({ success: true, data: vms as VirtualMachine[] });
});

vmRoutes.post('/', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const body = await c.req.json<CreateVMRequest>();
  
  try {
    const gcpInstance = await createVM({
      projectId: body.gcpProjectId,
      zone: body.zone,
      name: body.name,
      machineType: body.machineType,
      initScript: body.initScript,
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
    await startVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!);
    await db.update(virtualMachines)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM started' } });
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});

vmRoutes.post('/:id/stop', async (c) => {
  const userId = c.req.header('x-user-id');
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
    await stopVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!);
    await db.update(virtualMachines)
      .set({ status: 'stopped', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM stopped' } });
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});

vmRoutes.delete('/:id', async (c) => {
  const userId = c.req.header('x-user-id');
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
    await deleteVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!);
    await db.delete(virtualMachines).where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM deleted' } });
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});