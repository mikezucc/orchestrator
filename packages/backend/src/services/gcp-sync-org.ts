import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
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

export async function syncOrganizationVMsFromProjects(organizationId: string, accessToken: string, projectIds: string[]) {
  console.log(`Starting VM sync for organization ${organizationId} with projects:`, projectIds);
  
  try {
    // Create OAuth client with organization's access token
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

        console.log(`Found instances for project ${projectId}:`, instancesResponse.data.items ? Object.keys(instancesResponse.data.items).length : 0);

        const items = instancesResponse.data.items || {};
        
        // Process instances from each zone
        for (const [zoneUrl, zoneData] of Object.entries(items)) {
          if (zoneData.instances) {
            const zoneMatch = zoneUrl.match(/\/([^\/]+)$/);
            const zoneName = zoneMatch ? zoneMatch[1] : 'unknown';
            
            console.log(`Processing ${zoneData.instances.length} instances in zone ${zoneName}`);
            
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

        // Check if VM already exists by gcpInstanceId and organizationId
        const existingVM = await db.select()
          .from(virtualMachines)
          .where(
            and(
              eq(virtualMachines.gcpInstanceId, instance.id),
              eq(virtualMachines.organizationId, organizationId)
            )
          );

        if (existingVM.length === 0) {
          try {
            // Insert new VM
            await db.insert(virtualMachines).values({
              organizationId,
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
          } catch (insertError: any) {
            // Handle duplicate key violation
            if (insertError.code === '23505') { // PostgreSQL unique violation
              console.log(`VM ${instance.name} already exists, updating instead`);
              // Try to update instead
              await db.update(virtualMachines)
                .set({
                  name: instance.name,
                  status,
                  machineType,
                  initScript,
                  publicIp,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(virtualMachines.gcpInstanceId, instance.id),
                    eq(virtualMachines.organizationId, organizationId)
                  )
                );
              syncedCount++;
            } else {
              throw insertError;
            }
          }
        } else {
          // Update existing VM - use the first one if multiple exist (shouldn't happen with unique constraint)
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

    console.log(`Sync complete for organization ${organizationId}: synced ${syncedCount} VMs, found ${allInstances.length} total instances`);
    
    return { synced: syncedCount, errors };
  } catch (error) {
    console.error('Failed to sync VMs:', error);
    throw error;
  }
}