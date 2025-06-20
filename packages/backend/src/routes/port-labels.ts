import { Hono } from 'hono';
import { db } from '../db/index.js';
import { portLabels, virtualMachines } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { CreatePortLabelRequest, UpdatePortLabelRequest, ApiResponse, PortLabel } from '@gce-platform/types';

export const portLabelRoutes = new Hono();

// Get all port labels for a VM
portLabelRoutes.get('/vm/:vmId', async (c) => {
  const userId = c.req.header('x-user-id');
  const vmId = c.req.param('vmId');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  // Verify user owns the VM
  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  const labels = await db.select().from(portLabels)
    .where(eq(portLabels.vmId, vmId));

  return c.json<ApiResponse<PortLabel[]>>({ success: true, data: labels as PortLabel[] });
});

// Create a new port label
portLabelRoutes.post('/', async (c) => {
  const userId = c.req.header('x-user-id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const body = await c.req.json<CreatePortLabelRequest>();

  // Verify user owns the VM
  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, body.vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  // Check if label already exists for this port/protocol on this VM
  const existing = await db.select().from(portLabels)
    .where(and(
      eq(portLabels.vmId, body.vmId),
      eq(portLabels.port, body.port),
      eq(portLabels.protocol, body.protocol)
    ));

  if (existing.length > 0) {
    // Update existing label
    const [updated] = await db.update(portLabels)
      .set({
        label: body.label,
        description: body.description,
        updatedAt: new Date(),
      })
      .where(eq(portLabels.id, existing[0].id))
      .returning();

    return c.json<ApiResponse<PortLabel>>({ success: true, data: updated as PortLabel });
  }

  // Create new label
  const [label] = await db.insert(portLabels).values({
    vmId: body.vmId,
    port: body.port,
    protocol: body.protocol,
    label: body.label,
    description: body.description,
  }).returning();

  return c.json<ApiResponse<PortLabel>>({ success: true, data: label as PortLabel });
});

// Update a port label
portLabelRoutes.patch('/:id', async (c) => {
  const userId = c.req.header('x-user-id');
  const labelId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const body = await c.req.json<UpdatePortLabelRequest>();

  // Get the label and verify ownership
  const [labelWithVm] = await db.select()
    .from(portLabels)
    .innerJoin(virtualMachines, eq(portLabels.vmId, virtualMachines.id))
    .where(eq(portLabels.id, labelId));

  if (!labelWithVm || labelWithVm.virtual_machines.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Port label not found' }, 404);
  }

  const [updated] = await db.update(portLabels)
    .set({
      label: body.label || labelWithVm.port_labels.label,
      description: body.description !== undefined ? body.description : labelWithVm.port_labels.description,
      updatedAt: new Date(),
    })
    .where(eq(portLabels.id, labelId))
    .returning();

  return c.json<ApiResponse<PortLabel>>({ success: true, data: updated as PortLabel });
});

// Delete a port label
portLabelRoutes.delete('/:id', async (c) => {
  const userId = c.req.header('x-user-id');
  const labelId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  // Get the label and verify ownership
  const [labelWithVm] = await db.select()
    .from(portLabels)
    .innerJoin(virtualMachines, eq(portLabels.vmId, virtualMachines.id))
    .where(eq(portLabels.id, labelId));

  if (!labelWithVm || labelWithVm.virtual_machines.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Port label not found' }, 404);
  }

  await db.delete(portLabels).where(eq(portLabels.id, labelId));

  return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Port label deleted' } });
});