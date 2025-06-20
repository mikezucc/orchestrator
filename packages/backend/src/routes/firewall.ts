import { Hono } from 'hono';
import { db } from '../db/index.js';
import { firewallRules, virtualMachines } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { CreateFirewallRuleRequest, ApiResponse, FirewallRule } from '@gce-platform/types';
import { createFirewallRule, deleteFirewallRule } from '../services/gcp.js';

export const firewallRoutes = new Hono();

firewallRoutes.get('/vm/:vmId', async (c) => {
  const userId = c.req.header('x-user-id');
  const vmId = c.req.param('vmId');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  const rules = await db.select().from(firewallRules)
    .where(eq(firewallRules.vmId, vmId));

  return c.json<ApiResponse<FirewallRule[]>>({ success: true, data: rules as FirewallRule[] });
});

firewallRoutes.post('/', async (c) => {
  const userId = c.req.header('x-user-id');
  const accessToken = c.req.header('authorization')?.replace('Bearer ', '');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }
  
  if (!accessToken) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Access token required' }, 401);
  }

  const body = await c.req.json<CreateFirewallRuleRequest>();

  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, body.vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  try {
    const gcpRule = await createFirewallRule({
      projectId: vm.gcpProjectId,
      name: body.name,
      direction: body.direction,
      priority: body.priority,
      sourceRanges: body.sourceRanges,
      allowedPorts: body.allowedPorts,
      targetTags: [`vm-${vm.gcpInstanceId}`],
      accessToken,
    });

    const [rule] = await db.insert(firewallRules).values({
      vmId: body.vmId,
      name: body.name,
      direction: body.direction,
      priority: body.priority,
      sourceRanges: body.sourceRanges,
      allowedPorts: body.allowedPorts,
      gcpRuleId: gcpRule.id,
    }).returning();

    return c.json<ApiResponse<FirewallRule>>({ success: true, data: rule as FirewallRule });
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});

firewallRoutes.delete('/:id', async (c) => {
  const userId = c.req.header('x-user-id');
  const accessToken = c.req.header('authorization')?.replace('Bearer ', '');
  const ruleId = c.req.param('id');
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }
  
  if (!accessToken) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Access token required' }, 401);
  }

  const [rule] = await db.select()
    .from(firewallRules)
    .innerJoin(virtualMachines, eq(firewallRules.vmId, virtualMachines.id))
    .where(eq(firewallRules.id, ruleId));

  if (!rule || rule.virtual_machines.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Firewall rule not found' }, 404);
  }

  try {
    await deleteFirewallRule(rule.virtual_machines.gcpProjectId, rule.firewall_rules.gcpRuleId!, accessToken);
    await db.delete(firewallRules).where(eq(firewallRules.id, ruleId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Firewall rule deleted' } });
  } catch (error) {
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});