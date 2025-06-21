import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';
import { promisify } from 'util';

const compute = google.compute('v1');
const generateKeyPair = promisify(crypto.generateKeyPair);

interface SSHKeyPair {
  publicKey: string;
  privateKey: string;
}

interface AddSSHKeyParams {
  projectId: string;
  zone: string;
  instanceName: string;
  username: string;
  publicKey: string;
  accessToken: string;
}

// Generate SSH key pair
export async function generateSSHKeys(username: string): Promise<SSHKeyPair> {
  const { publicKey, privateKey } = await generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Convert public key to OpenSSH format
  const publicKeyBuffer = Buffer.from(publicKey);
  const sshPublicKey = crypto.createPublicKey(publicKey).export({
    type: 'spki',
    format: 'der'
  });
  
  // Format as OpenSSH public key
  const sshRsaPrefix = Buffer.from([0x00, 0x00, 0x00, 0x07, 0x73, 0x73, 0x68, 0x2d, 0x72, 0x73, 0x61]);
  const openSSHKey = `ssh-rsa ${Buffer.concat([sshRsaPrefix, sshPublicKey]).toString('base64')} ${username}@orchestrator`;

  return {
    publicKey: openSSHKey,
    privateKey
  };
}

// Add SSH key to VM metadata
export async function addSSHKeyToVM({ projectId, zone, instanceName, username, publicKey, accessToken }: AddSSHKeyParams) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  // Get current instance metadata
  const instance = await compute.instances.get({
    project: projectId,
    zone,
    instance: instanceName,
  });

  const metadata = instance.data.metadata || { items: [] };
  const items = metadata.items || [];
  
  // Find or create ssh-keys metadata
  let sshKeysItem = items.find(item => item.key === 'ssh-keys');
  
  if (!sshKeysItem) {
    sshKeysItem = {
      key: 'ssh-keys',
      value: ''
    };
    items.push(sshKeysItem);
  }

  // Parse existing SSH keys
  const existingKeys = sshKeysItem.value ? sshKeysItem.value.split('\n').filter(Boolean) : [];
  
  // Add new key (format: username:ssh-rsa KEY comment)
  const newKey = `${username}:${publicKey}`;
  
  // Check if this user already has a key
  const userKeyIndex = existingKeys.findIndex(key => key.startsWith(`${username}:`));
  
  if (userKeyIndex >= 0) {
    // Replace existing key
    existingKeys[userKeyIndex] = newKey;
  } else {
    // Add new key
    existingKeys.push(newKey);
  }
  
  // Update the value
  sshKeysItem.value = existingKeys.join('\n');

  // Update instance metadata
  await compute.instances.setMetadata({
    project: projectId,
    zone,
    instance: instanceName,
    requestBody: {
      fingerprint: metadata.fingerprint,
      items: items
    }
  });

  return { success: true };
}

// Get SSH connection info
export async function getSSHConnectionInfo(projectId: string, zone: string, instanceName: string, accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  // Get instance details
  const instance = await compute.instances.get({
    project: projectId,
    zone,
    instance: instanceName,
  });

  // Get external IP
  const externalIp = instance.data.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
  
  if (!externalIp) {
    throw new Error('VM does not have an external IP address');
  }

  // Check if OS Login is enabled
  const metadata = instance.data.metadata || { items: [] };
  const enableOsLogin = metadata.items?.find(item => item.key === 'enable-oslogin')?.value === 'TRUE';

  return {
    externalIp,
    enableOsLogin,
    projectId,
    zone,
    instanceName
  };
}

// For IAP tunnel (more secure, but requires additional setup)
export async function createIAPTunnelCommand(projectId: string, zone: string, instanceName: string, username: string) {
  // This would typically use gcloud command or IAP APIs
  // For now, return the gcloud command that would be used
  return {
    command: `gcloud compute ssh ${username}@${instanceName} --project=${projectId} --zone=${zone} --tunnel-through-iap`,
    description: 'Use this command with gcloud CLI for secure SSH through IAP'
  };
}