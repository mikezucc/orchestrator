import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { firewallRules, virtualMachines } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import type { PortRule } from '@gce-platform/types';

const compute = google.compute('v1');

interface GCPFirewallRule {
  id: string;
  name: string;
  direction: 'INGRESS' | 'EGRESS';
  priority: number;
  sourceRanges?: string[];
  destinationRanges?: string[];
  allowed?: Array<{
    IPProtocol: string;
    ports?: string[];
  }>;
  denied?: Array<{
    IPProtocol: string;
    ports?: string[];
  }>;
  targetTags?: string[];
}

export async function syncFirewallRulesForVM(userId: string, vmId: string, accessToken: string) {
  try {
    // Get VM details
    const [vm] = await db.select().from(virtualMachines)
      .where(and(
        eq(virtualMachines.id, vmId),
        eq(virtualMachines.userId, userId)
      ));

    if (!vm || !vm.gcpInstanceId) {
      throw new Error('VM not found or missing GCP instance ID');
    }

    // Create OAuth client
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    google.options({ auth: oauth2Client });

    // Get instance details to find network tags
    const instanceResponse = await compute.instances.get({
      project: vm.gcpProjectId,
      zone: vm.zone,
      instance: vm.gcpInstanceId,
    });

    const instanceTags = instanceResponse.data.tags?.items || [];
    const vmTag = `vm-${vm.gcpInstanceId}`;

    // Get all firewall rules for the project
    const firewallsResponse = await compute.firewalls.list({
      project: vm.gcpProjectId,
    });

    const gcpFirewalls = firewallsResponse.data.items || [];
    
    // Filter firewall rules that apply to this VM (either by tag or apply to all)
    const relevantFirewalls = gcpFirewalls.filter((rule: GCPFirewallRule) => {
      // Check if rule targets this VM's tags
      if (rule.targetTags && rule.targetTags.length > 0) {
        return rule.targetTags.some(tag => 
          instanceTags.includes(tag) || tag === vmTag
        );
      }
      // If no target tags, rule applies to all instances
      return true;
    });

    // Get existing firewall rules for this VM from our database
    const existingRules = await db.select().from(firewallRules)
      .where(eq(firewallRules.vmId, vmId));

    const existingRulesByGcpId = new Map(
      existingRules.map(rule => [rule.gcpRuleId, rule])
    );

    const syncedRuleIds: string[] = [];
    const errors: string[] = [];

    // Sync each relevant firewall rule
    for (const gcpRule of relevantFirewalls) {
      try {
        // Map GCP rule to our format
        const direction = gcpRule.direction === 'INGRESS' ? 'ingress' : 'egress';
        const sourceRanges = gcpRule.direction === 'INGRESS' 
          ? gcpRule.sourceRanges 
          : gcpRule.destinationRanges;

        // Map allowed/denied ports
        const allowedPorts: PortRule[] = [];
        
        // For both ingress and egress, we use 'allowed' field
        // 'denied' is used for deny rules which we'll skip for now
        const portData = gcpRule.allowed;
        
        if (portData) {
          for (const rule of portData) {
            const protocol = rule.IPProtocol.toLowerCase() as 'tcp' | 'udp' | 'icmp';
            allowedPorts.push({
              protocol,
              ports: rule.ports,
            });
          }
        }

        const existingRule = existingRulesByGcpId.get(gcpRule.id);

        if (existingRule) {
          // Update existing rule
          await db.update(firewallRules)
            .set({
              name: gcpRule.name,
              direction,
              priority: gcpRule.priority || 1000,
              sourceRanges,
              allowedPorts,
              updatedAt: new Date(),
            })
            .where(eq(firewallRules.id, existingRule.id));
        } else {
          // Insert new rule
          await db.insert(firewallRules).values({
            vmId,
            name: gcpRule.name,
            direction,
            priority: gcpRule.priority || 1000,
            sourceRanges,
            allowedPorts,
            gcpRuleId: gcpRule.id,
          });
        }

        syncedRuleIds.push(gcpRule.id);
      } catch (error) {
        errors.push(`Failed to sync rule ${gcpRule.name}: ${error}`);
      }
    }

    // Remove rules that no longer exist in GCP
    const rulesToDelete = existingRules.filter(
      rule => rule.gcpRuleId && !syncedRuleIds.includes(rule.gcpRuleId)
    );

    if (rulesToDelete.length > 0) {
      await db.delete(firewallRules)
        .where(inArray(
          firewallRules.id,
          rulesToDelete.map(r => r.id)
        ));
    }

    return {
      synced: syncedRuleIds.length,
      deleted: rulesToDelete.length,
      errors,
    };
  } catch (error) {
    console.error('Failed to sync firewall rules:', error);
    throw error;
  }
}