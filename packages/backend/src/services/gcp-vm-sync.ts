import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const compute = google.compute('v1');

export async function syncSingleVM(userId: string, vmId: string, accessToken: string) {
  try {
    // Get VM from database - just by ID since we're already authenticated
    const [vm] = await db.select().from(virtualMachines)
      .where(eq(virtualMachines.id, vmId));

    if (!vm || !vm.gcpInstanceId) {
      throw new Error('VM not found or missing GCP instance ID');
    }

    // Create OAuth client
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    google.options({ auth: oauth2Client });

    // Get instance details from GCP
    const response = await compute.instances.get({
      project: vm.gcpProjectId,
      zone: vm.zone,
      instance: vm.gcpInstanceId,
    });

    const instance = response.data;
    if (!instance) {
      throw new Error('Instance not found in GCP');
    }

    // Extract machine type from URL
    const machineTypeMatch = instance.machineType?.match(/\/([^\/]+)$/);
    const machineType = machineTypeMatch ? machineTypeMatch[1] : vm.machineType;

    // Extract startup script if exists
    let initScript: string | undefined;
    if (instance.metadata?.items) {
      const startupScriptItem = instance.metadata.items.find(
        (item: any) => item.key === 'startup-script'
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

    // Update VM in database
    await db.update(virtualMachines)
      .set({
        name: instance.name || vm.name,
        status,
        machineType,
        initScript: initScript || vm.initScript,
        publicIp,
        updatedAt: new Date(),
      })
      .where(eq(virtualMachines.id, vmId));

    console.log(`Synced VM ${vm.name} - Status: ${status}, Public IP: ${publicIp || 'none'}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to sync single VM:', error);
    throw error;
  }
}