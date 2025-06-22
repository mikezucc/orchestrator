import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { generateKeyPairSync } from 'crypto';
import sshpk from 'sshpk';

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
  console.log('=== Generating SSH keys ===');
  console.log('Username:', username);
  
  try {
    // Generate RSA key pair using crypto module
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs1',
        format: 'pem'
      }
    });
    
    console.log('Key pair generated');
    console.log('Private key header:', privateKey.split('\n')[0]);
    
    // Parse the public key using sshpk
    const key = sshpk.parseKey(publicKey, 'pem');
    
    // Convert to OpenSSH format
    const sshPublicKey = key.toString('ssh') + ` ${username}@orchestrator`;
    
    console.log('SSH public key generated:', sshPublicKey.substring(0, 50) + '...');
    console.log('Full public key:', sshPublicKey);
    
    // Validate the key format
    if (!sshPublicKey.startsWith('ssh-rsa ')) {
      throw new Error('Generated key does not have correct format');
    }
    
    return {
      publicKey: sshPublicKey,
      privateKey
    };
  } catch (error) {
    console.error('Error generating SSH keys:', error);
    throw new Error('Failed to generate SSH keys: ' + (error as Error).message);
  }
}

// Add SSH key to VM metadata
export async function addSSHKeyToVM({ projectId, zone, instanceName, username, publicKey, accessToken }: AddSSHKeyParams) {
  console.log('=== Adding SSH key to VM ===');
  console.log('Project:', projectId);
  console.log('Zone:', zone);
  console.log('Instance:', instanceName);
  console.log('Username:', username);
  console.log('Has access token:', !!accessToken);
  
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  google.options({ auth: oauth2Client });

  try {
    // Get current instance metadata
    console.log('Fetching current instance metadata...');
    const instance = await compute.instances.get({
      project: projectId,
      zone,
      instance: instanceName,
    });
    
    console.log('Instance metadata fetched successfully');

    const metadata = instance.data.metadata || { items: [] };
    const items = metadata.items || [];
    
    console.log('Current metadata items:', items.map(item => item.key));
    
    // Find or create ssh-keys metadata
    let sshKeysItem = items.find(item => item.key === 'ssh-keys');
    
    if (!sshKeysItem) {
      console.log('No existing ssh-keys metadata, creating new one');
      sshKeysItem = {
        key: 'ssh-keys',
        value: ''
      };
      items.push(sshKeysItem);
    } else {
      console.log('Found existing ssh-keys metadata');
    }

    // Parse existing SSH keys
    const existingKeys = sshKeysItem.value ? sshKeysItem.value.split('\n').filter(Boolean) : [];
    console.log('Existing SSH keys count:', existingKeys.length);
    
    // Add new key (format: username:ssh-rsa KEY comment)
    const newKey = `${username}:${publicKey}`;
    console.log('New key format:', newKey.substring(0, 100) + '...');
    console.log('Full public key:', publicKey);
    
    // Validate SSH key format
    if (!publicKey.startsWith('ssh-rsa ')) {
      console.error('WARNING: Public key does not start with ssh-rsa');
    }
    
    // Check if this user already has a key
    const userKeyIndex = existingKeys.findIndex(key => key.startsWith(`${username}:`));
    
    if (userKeyIndex >= 0) {
      console.log('Replacing existing key for user:', username);
      existingKeys[userKeyIndex] = newKey;
    } else {
      console.log('Adding new key for user:', username);
      existingKeys.push(newKey);
    }
    
    // Update the value
    sshKeysItem.value = existingKeys.join('\n');
    console.log('Total keys after update:', existingKeys.length);

    // Update instance metadata
    console.log('Updating instance metadata...');
    await compute.instances.setMetadata({
      project: projectId,
      zone,
      instance: instanceName,
      requestBody: {
        fingerprint: metadata.fingerprint,
        items: items
      }
    });

    console.log('SSH key added successfully');
    return { success: true };
  } catch (error: any) {
    console.error('=== Error adding SSH key to VM ===');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', error.errors || error);
    throw error;
  }
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