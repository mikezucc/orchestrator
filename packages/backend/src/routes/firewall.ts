import { Hono } from 'hono';
import { db } from '../db/index.js';
import { firewallRules, virtualMachines } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { CreateFirewallRuleRequest, ApiResponse, FirewallRule } from '@gce-platform/types';
import { createFirewallRule, deleteFirewallRule } from '../services/gcp.js';
import { syncFirewallRulesForVM } from '../services/gcp-firewall-sync.js';
import { getValidAccessToken } from '../services/auth.js';

export const firewallRoutes = new Hono();

firewallRoutes.get('/vm/:vmId', async (c) => {
  const userId = c.req.header('x-user-id');
  const providedToken = c.req.header('authorization')?.replace('Bearer ', '');
  const vmId = c.req.param('vmId');
  const shouldSync = c.req.query('sync') === 'true';
  
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID required' }, 401);
  }

  const [vm] = await db.select().from(virtualMachines)
    .where(eq(virtualMachines.id, vmId));

  if (!vm || vm.userId !== userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  // Sync firewall rules from GCP if requested
  let syncErrors: string[] = [];
  if (shouldSync && providedToken) {
    try {
      const accessToken = await getValidAccessToken(userId, providedToken);
      if (accessToken) {
        const syncResult = await syncFirewallRulesForVM(userId, vmId, accessToken);
        console.log(`Synced ${syncResult.synced} firewall rules for VM ${vmId}`);
        if (syncResult.errors.length > 0) {
          console.warn('Firewall sync errors:', syncResult.errors);
          syncErrors = syncResult.errors;
        }
      }
    } catch (error) {
      console.error('Failed to sync firewall rules:', error);
      syncErrors.push(`Failed to sync firewall rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const rules = await db.select().from(firewallRules)
    .where(eq(firewallRules.vmId, vmId));

  // If there were sync errors, include them in a successful response but with a warning
  if (syncErrors.length > 0) {
    return c.json<ApiResponse<FirewallRule[]>>({ 
      success: true, 
      data: rules as FirewallRule[],
      error: `Firewall sync completed with errors: ${syncErrors.join('; ')}` 
    });
  }

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