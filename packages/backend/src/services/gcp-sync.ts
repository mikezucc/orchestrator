import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { virtualMachines, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const compute = google.compute('v1');

interface GCPInstance {
  id: string;
  name: string;
  zone: string;
  machineType: string;
  status: string;
  networkInterfaces?: Array<{
    accessConfigs?: Array<{
      natIP?: string;
    }>;
  }>;
  metadata?: {
    items?: Array<{
      key: string;
      value: string;
    }>;
  };
}

export async function syncUserVMs(userId: string, accessToken: string) {
  try {
    // Get user from database to get their projects
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    // Create OAuth client with user's access token
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    google.options({ auth: oauth2Client });

    // Get list of projects (for now, we'll need the user to specify project IDs)
    // In a real app, you'd list projects from the Resource Manager API
    const existingVMs = await db.select().from(virtualMachines).where(eq(virtualMachines.userId, userId));
    const projectIds = [...new Set(existingVMs.map(vm => vm.gcpProjectId))];

    if (projectIds.length === 0) {
      // If no projects found, return early
      return { synced: 0, errors: [] };
    }

    const allInstances: Array<{ instance: GCPInstance; projectId: string; zone: string }> = [];
    const errors: string[] = [];

    // Fetch instances from each project
    for (const projectId of projectIds) {
      try {
        // First, get all zones for the project
        const zonesResponse = await compute.zones.list({ project: projectId });
        const zones = zonesResponse.data.items || [];

        // Then get instances from each zone
        for (const zone of zones) {
          if (!zone.name) continue;
          
          try {
            const instancesResponse = await compute.instances.list({
              project: projectId,
              zone: zone.name,
            });

            const instances = instancesResponse.data.items || [];
            instances.forEach(instance => {
              if (instance.name && instance.id) {
                allInstances.push({
                  instance: instance as GCPInstance,
                  projectId,
                  zone: zone.name,
                });
              }
            });
          } catch (zoneError) {
            // Skip zones that return errors (might not have instances)
            console.log(`No instances in zone ${zone.name} for project ${projectId}`);
          }
        }
      } catch (projectError) {
        errors.push(`Failed to sync project ${projectId}: ${projectError}`);
      }
    }

    // Sync instances to database
    let syncedCount = 0;
    for (const { instance, projectId, zone } of allInstances) {
      try {
        // Extract machine type from URL
        const machineTypeMatch = instance.machineType?.match(/\/([^\/]+)$/);
        const machineType = machineTypeMatch ? machineTypeMatch[1] : 'unknown';

        // Extract startup script if exists
        let initScript: string | undefined;
        if (instance.metadata?.items) {
          const startupScriptItem = instance.metadata.items.find(
            item => item.key === 'startup-script'
          );
          initScript = startupScriptItem?.value;
        }

        // Extract public IP if exists
        let publicIp: string | undefined;
        if (instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP) {
          publicIp = instance.networkInterfaces[0].accessConfigs[0].natIP;
        }

        // Map GCP status to our status
        let status: 'running' | 'stopped' | 'suspended' | 'terminated' | 'pending' = 'stopped';
        switch (instance.status?.toUpperCase()) {
          case 'RUNNING':
            status = 'running';
            break;
          case 'SUSPENDED':
            status = 'suspended';
            break;
          case 'TERMINATED':
          case 'STOPPED':
            status = 'stopped';
            break;
          case 'STOPPING':
          case 'PROVISIONING':
          case 'STAGING':
            status = 'pending';
            break;
        }

        // Check if VM already exists
        const existingVM = await db.select()
          .from(virtualMachines)
          .where(
            and(
              eq(virtualMachines.gcpInstanceId, instance.id),
              eq(virtualMachines.userId, userId)
            )
          );

        if (existingVM.length === 0) {
          // Insert new VM
          await db.insert(virtualMachines).values({
            userId,
            name: instance.name,
            gcpProjectId: projectId,
            zone,
            machineType,
            status,
            initScript,
            publicIp,
            gcpInstanceId: instance.id,
          });
          syncedCount++;
        } else {
          // Update existing VM
          await db.update(virtualMachines)
            .set({
              name: instance.name,
              status,
              machineType,
              initScript,
              publicIp,
              updatedAt: new Date(),
            })
            .where(eq(virtualMachines.id, existingVM[0].id));
          syncedCount++;
        }
      } catch (instanceError) {
        errors.push(`Failed to sync instance ${instance.name}: ${instanceError}`);
      }
    }

    // Mark VMs that no longer exist in GCP as terminated
    const gcpInstanceIds = allInstances.map(({ instance }) => instance.id);
    await db.update(virtualMachines)
      .set({ status: 'terminated', updatedAt: new Date() })
      .where(
        and(
          eq(virtualMachines.userId, userId),
          gcpInstanceIds.length > 0
            ? virtualMachines.gcpInstanceId.notInArray(gcpInstanceIds)
            : undefined
        )
      );

    return { synced: syncedCount, errors };
  } catch (error) {
    console.error('Failed to sync VMs:', error);
    throw error;
  }
}

export async function syncUserVMsFromProjects(userId: string, accessToken: string, projectIds: string[]) {
  try {
    // Create OAuth client with user's access token
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    google.options({ auth: oauth2Client });

    const allInstances: Array<{ instance: GCPInstance; projectId: string; zone: string }> = [];
    const errors: string[] = [];

    // Fetch instances from each project
    for (const projectId of projectIds) {
      try {
        // Get aggregated list of instances across all zones
        const instancesResponse = await compute.instances.aggregatedList({
          project: projectId,
        });

        const items = instancesResponse.data.items || {};
        
        // Process instances from each zone
        for (const [zoneUrl, zoneData] of Object.entries(items)) {
          if (zoneData.instances) {
            const zoneMatch = zoneUrl.match(/\/([^\/]+)$/);
            const zoneName = zoneMatch ? zoneMatch[1] : 'unknown';
            
            zoneData.instances.forEach(instance => {
              if (instance.name && instance.id) {
                allInstances.push({
                  instance: instance as GCPInstance,
                  projectId,
                  zone: zoneName,
                });
              }
            });
          }
        }
      } catch (projectError: any) {
        if (projectError.code === 403) {
          errors.push(`No access to project ${projectId}. Please ensure Compute Engine API is enabled.`);
        } else {
          errors.push(`Failed to sync project ${projectId}: ${projectError.message || projectError}`);
        }
      }
    }

    // Sync instances to database
    let syncedCount = 0;
    for (const { instance, projectId, zone } of allInstances) {
      try {
        // Extract machine type from URL
        const machineTypeMatch = instance.machineType?.match(/\/([^\/]+)$/);
        const machineType = machineTypeMatch ? machineTypeMatch[1] : 'unknown';

        // Extract startup script if exists
        let initScript: string | undefined;
        if (instance.metadata?.items) {
          const startupScriptItem = instance.metadata.items.find(
            item => item.key === 'startup-script'
          );
          initScript = startupScriptItem?.value;
        }

        // Extract public IP if exists
        let publicIp: string | undefined;
        if (instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP) {
          publicIp = instance.networkInterfaces[0].accessConfigs[0].natIP;
        }

        // Map GCP status to our status
        let status: 'running' | 'stopped' | 'suspended' | 'terminated' | 'pending' = 'stopped';
        switch (instance.status?.toUpperCase()) {
          case 'RUNNING':
            status = 'running';
            break;
          case 'SUSPENDED':
            status = 'suspended';
            break;
          case 'TERMINATED':
          case 'STOPPED':
            status = 'stopped';
            break;
          case 'STOPPING':
          case 'PROVISIONING':
          case 'STAGING':
            status = 'pending';
            break;
        }

        // Check if VM already exists
        const existingVM = await db.select()
          .from(virtualMachines)
          .where(
            and(
              eq(virtualMachines.gcpInstanceId, instance.id),
              eq(virtualMachines.userId, userId)
            )
          );

        if (existingVM.length === 0) {
          // Insert new VM
          await db.insert(virtualMachines).values({
            userId,
            name: instance.name,
            gcpProjectId: projectId,
            zone,
            machineType,
            status,
            initScript,
            publicIp,
            gcpInstanceId: instance.id,
          });
          syncedCount++;
        } else {
          // Update existing VM
          await db.update(virtualMachines)
            .set({
              name: instance.name,
              status,
              machineType,
              initScript,
              publicIp,
              updatedAt: new Date(),
            })
            .where(eq(virtualMachines.id, existingVM[0].id));
          syncedCount++;
        }
      } catch (instanceError) {
        errors.push(`Failed to sync instance ${instance.name}: ${instanceError}`);
      }
    }

    return { synced: syncedCount, errors };
  } catch (error) {
    console.error('Failed to sync VMs:', error);
    throw error;
  }
}