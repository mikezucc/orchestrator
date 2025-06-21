import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { PortRule } from '@gce-platform/types';

const compute = google.compute('v1');

// Helper function to wait for zone operations to complete
async function waitForZoneOperation(projectId: string, zone: string, operationName: string, accessToken: string, maxWaitTime = 300000) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const operation = await compute.zoneOperations.get({
      project: projectId,
      zone,
      operation: operationName,
    });
    
    if (operation.data.status === 'DONE') {
      if (operation.data.error) {
        throw new Error(`Operation failed: ${JSON.stringify(operation.data.error)}`);
      }
      return;
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Operation timed out');
}

interface CreateVMParams {
  projectId: string;
  zone: string;
  name: string;
  machineType: string;
  initScript?: string;
  accessToken: string;
}

export async function createVM({ projectId, zone, name, machineType, initScript, accessToken }: CreateVMParams) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  const startupScript = initScript ? `#!/bin/bash\n${initScript}` : undefined;

  const requestBody = {
    name,
    machineType: `zones/${zone}/machineTypes/${machineType}`,
    disks: [{
      boot: true,
      autoDelete: true,
      initializeParams: {
        sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
        diskSizeGb: '10',
      },
    }],
    networkInterfaces: [{
      network: 'global/networks/default',
      accessConfigs: [{
        type: 'ONE_TO_ONE_NAT',
        name: 'External NAT',
      }],
    }],
    metadata: startupScript ? {
      items: [{
        key: 'startup-script',
        value: startupScript,
      }],
    } : undefined,
    tags: {
      items: [`vm-${name}`],
    },
  };

  const res = await compute.instances.insert({
    project: projectId,
    zone,
    requestBody,
  });

  return { id: name };
}

export async function deleteVM(projectId: string, zone: string, instanceName: string, accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  await compute.instances.delete({
    project: projectId,
    zone,
    instance: instanceName,
  });
}

export async function startVM(projectId: string, zone: string, instanceName: string, accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  await compute.instances.start({
    project: projectId,
    zone,
    instance: instanceName,
  });
}

export async function stopVM(projectId: string, zone: string, instanceName: string, accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  await compute.instances.stop({
    project: projectId,
    zone,
    instance: instanceName,
  });
}

interface CreateFirewallRuleParams {
  projectId: string;
  name: string;
  direction: 'ingress' | 'egress';
  priority: number;
  sourceRanges?: string[];
  allowedPorts: PortRule[];
  targetTags: string[];
  accessToken: string;
}

export async function createFirewallRule(params: CreateFirewallRuleParams) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: params.accessToken });
  google.options({ auth: oauth2Client });

  const requestBody: any = {
    name: params.name,
    priority: params.priority,
    targetTags: params.targetTags,
  };

  if (params.direction === 'ingress') {
    requestBody.sourceRanges = params.sourceRanges || ['0.0.0.0/0'];
    requestBody.allowed = params.allowedPorts.map(rule => ({
      IPProtocol: rule.protocol,
      ports: rule.ports,
    }));
  } else {
    requestBody.destinationRanges = params.sourceRanges || ['0.0.0.0/0'];
    requestBody.denied = params.allowedPorts.map(rule => ({
      IPProtocol: rule.protocol,
      ports: rule.ports,
    }));
  }

  const res = await compute.firewalls.insert({
    project: params.projectId,
    requestBody,
  });

  return { id: params.name };
}

export async function deleteFirewallRule(projectId: string, firewallName: string, accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  await compute.firewalls.delete({
    project: projectId,
    firewall: firewallName,
  });
}

export async function resumeVM(projectId: string, zone: string, instanceName: string, accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  await compute.instances.resume({
    project: projectId,
    zone,
    instance: instanceName,
  });
}

export async function suspendVM(projectId: string, zone: string, instanceName: string, accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  await compute.instances.suspend({
    project: projectId,
    zone,
    instance: instanceName,
  });
}

interface DuplicateVMParams {
  sourceProjectId: string;
  sourceZone: string;
  sourceInstanceName: string;
  newName: string;
  accessToken: string;
}

export async function duplicateVM({ sourceProjectId, sourceZone, sourceInstanceName, newName, accessToken }: DuplicateVMParams) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  // Get the source instance details
  const sourceResponse = await compute.instances.get({
    project: sourceProjectId,
    zone: sourceZone,
    instance: sourceInstanceName,
  });

  const sourceInstance = sourceResponse.data;
  if (!sourceInstance) {
    throw new Error('Source instance not found');
  }

  // Extract disk information
  const sourceDisk = sourceInstance.disks?.[0];
  if (!sourceDisk || !sourceDisk.source) {
    throw new Error('Source instance has no boot disk');
  }

  // Create snapshot of the source disk for duplication
  const snapshotName = `snapshot-${newName}-${Date.now()}`;
  const diskName = sourceDisk.source.split('/').pop();
  
  const snapshotOperation = await compute.disks.createSnapshot({
    project: sourceProjectId,
    zone: sourceZone,
    disk: diskName,
    requestBody: {
      name: snapshotName,
    },
  });

  // Wait for snapshot operation to complete
  const operationName = snapshotOperation.data.name;
  if (operationName) {
    await waitForZoneOperation(sourceProjectId, sourceZone, operationName, accessToken);
  }
  
  // Additional wait to ensure snapshot is fully ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create new instance with same configuration but without specific IP
  const requestBody = {
    name: newName,
    machineType: sourceInstance.machineType,
    disks: [{
      boot: true,
      autoDelete: true,
      initializeParams: {
        sourceSnapshot: `projects/${sourceProjectId}/global/snapshots/${snapshotName}`,
        diskSizeGb: sourceDisk.diskSizeGb,
      },
    }],
    networkInterfaces: sourceInstance.networkInterfaces?.map((ni: any) => ({
      network: ni.network,
      subnetwork: ni.subnetwork,
      // Create access configs without specific natIP to get automatic IP assignment
      accessConfigs: ni.accessConfigs?.map((ac: any) => ({
        type: ac.type || 'ONE_TO_ONE_NAT',
        name: ac.name || 'External NAT',
        // Explicitly exclude natIP to let GCP assign a new one
      })),
    })),
    metadata: sourceInstance.metadata,
    tags: {
      items: [`vm-${newName}`],
    },
    serviceAccounts: sourceInstance.serviceAccounts,
    scheduling: sourceInstance.scheduling,
  };

  // Create the new instance
  const createOperation = await compute.instances.insert({
    project: sourceProjectId,
    zone: sourceZone,
    requestBody,
  });

  // Wait for instance creation to complete
  const createOperationName = createOperation.data.name;
  if (createOperationName) {
    await waitForZoneOperation(sourceProjectId, sourceZone, createOperationName, accessToken);
  }

  // Clean up snapshot after instance creation
  // We can delete it immediately since the instance creation has completed
  try {
    await compute.snapshots.delete({
      project: sourceProjectId,
      snapshot: snapshotName,
    });
  } catch (error) {
    // Log but don't fail if snapshot deletion fails
    console.error('Failed to delete snapshot:', error);
  }

  return { id: newName };
}