import { google } from 'googleapis';
import type { PortRule } from '@gce-platform/types';

const compute = google.compute('v1');

interface CreateVMParams {
  projectId: string;
  zone: string;
  name: string;
  machineType: string;
  initScript?: string;
}

export async function createVM({ projectId, zone, name, machineType, initScript }: CreateVMParams) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/compute'],
  });

  const authClient = await auth.getClient();
  google.options({ auth: authClient });

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

export async function deleteVM(projectId: string, zone: string, instanceName: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/compute'],
  });

  const authClient = await auth.getClient();
  google.options({ auth: authClient });

  await compute.instances.delete({
    project: projectId,
    zone,
    instance: instanceName,
  });
}

export async function startVM(projectId: string, zone: string, instanceName: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/compute'],
  });

  const authClient = await auth.getClient();
  google.options({ auth: authClient });

  await compute.instances.start({
    project: projectId,
    zone,
    instance: instanceName,
  });
}

export async function stopVM(projectId: string, zone: string, instanceName: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/compute'],
  });

  const authClient = await auth.getClient();
  google.options({ auth: authClient });

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
}

export async function createFirewallRule(params: CreateFirewallRuleParams) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/compute'],
  });

  const authClient = await auth.getClient();
  google.options({ auth: authClient });

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

export async function deleteFirewallRule(projectId: string, firewallName: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/compute'],
  });

  const authClient = await auth.getClient();
  google.options({ auth: authClient });

  await compute.firewalls.delete({
    project: projectId,
    firewall: firewallName,
  });
}