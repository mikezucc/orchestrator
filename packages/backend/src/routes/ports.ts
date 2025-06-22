import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { portDescriptions, virtualMachines } from '../db/schema.js';
import { flexibleAuth, flexibleRequireOrganization } from '../middleware/flexibleAuth.js';

const ports = new Hono();

// Apply flexible auth middleware to all routes
ports.use('*', flexibleAuth, flexibleRequireOrganization);

// Get port descriptions for a VM
ports.get('/:vmId/ports', async (c) => {
  const { vmId } = c.req.param();
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  
  try {
    // Verify VM ownership
    const [vm] = await db.select().from(virtualMachines)
      .where(and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.organizationId, organizationId)
      ));
    
    if (!vm) {
      return c.json({ success: false, error: 'VM not found' }, 404);
    }
    const descriptions = await db
      .select()
      .from(portDescriptions)
      .where(eq(portDescriptions.vmId, vmId));
    
    return c.json({ success: true, data: descriptions });
  } catch (error) {
    console.error('Error fetching port descriptions:', error);
    return c.json({ success: false, error: 'Failed to fetch port descriptions' }, 500);
  }
});

// Create or update port description
ports.put('/:vmId/ports', async (c) => {
  const { vmId } = c.req.param();
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  
  const { port, protocol, name, description, processName, isFavorite } = await c.req.json();
  
  if (!port || !protocol || !name) {
    return c.json({ success: false, error: 'Port, protocol, and name are required' }, 400);
  }
  
  try {
    // Verify VM ownership
    const [vm] = await db.select().from(virtualMachines)
      .where(and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.organizationId, organizationId)
      ));
    
    if (!vm) {
      return c.json({ success: false, error: 'VM not found' }, 404);
    }
    // Check if description already exists
    const existing = await db
      .select()
      .from(portDescriptions)
      .where(
        and(
          eq(portDescriptions.vmId, vmId),
          eq(portDescriptions.port, port),
          eq(portDescriptions.protocol, protocol)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing
      const updated = await db
        .update(portDescriptions)
        .set({
          name,
          description,
          processName,
          isFavorite: isFavorite ?? existing[0].isFavorite,
          updatedAt: new Date(),
        })
        .where(eq(portDescriptions.id, existing[0].id))
        .returning();
      
      return c.json({ success: true, data: updated[0] });
    } else {
      // Create new
      const created = await db
        .insert(portDescriptions)
        .values({
          vmId,
          port,
          protocol,
          name,
          description,
          processName,
          isFavorite: isFavorite ?? false,
          createdBy: userId,
        })
        .returning();
      
      return c.json({ success: true, data: created[0] });
    }
  } catch (error) {
    console.error('Error saving port description:', error);
    return c.json({ success: false, error: 'Failed to save port description' }, 500);
  }
});

// Delete port description
ports.delete('/:vmId/ports/:portId', async (c) => {
  const { vmId, portId } = c.req.param();
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  
  try {
    // Verify VM ownership
    const [vm] = await db.select().from(virtualMachines)
      .where(and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.organizationId, organizationId)
      ));
    
    if (!vm) {
      return c.json({ success: false, error: 'VM not found' }, 404);
    }
    await db
      .delete(portDescriptions)
      .where(
        and(
          eq(portDescriptions.id, portId),
          eq(portDescriptions.vmId, vmId)
        )
      );
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting port description:', error);
    return c.json({ success: false, error: 'Failed to delete port description' }, 500);
  }
});

export default ports;