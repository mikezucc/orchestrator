import { Client as SSHClient } from 'ssh2';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { organizationMembers, organizations } from '../db/schema-auth.js';
import { eq, and } from 'drizzle-orm';
import { generateSSHKeys, addSSHKeyToVM } from '../services/gcp-ssh.js';
import { getOrganizationAccessToken } from '../services/organization-auth.js';
import { verifySessionToken } from '../utils/auth.js';
import type { ExecuteScriptRequest } from '@gce-platform/types';

export function createExecuteStreamWebSocketHandler(upgradeWebSocket: any) {
  return upgradeWebSocket(async (c: any) => {
    // Get query parameters
    const vmId = c.req.param('id');
    const token = c.req.query('token');

    console.log('=== Execute Stream WebSocket connection request ===');
    console.log('vmId:', vmId);
    console.log('token provided:', !!token);

    if (!vmId || !token) {
      return {
        onOpen: (event, ws) => {
          ws.send(JSON.stringify({ type: 'error', data: 'Missing required parameters' }));
          ws.close();
        }
      };
    }

    // Authenticate the user
    const decoded = verifySessionToken(token);
    if (!decoded) {
      return {
        onOpen: (event, ws) => {
          ws.send(JSON.stringify({ type: 'error', data: 'Authentication failed' }));
          ws.close();
        }
      };
    }

    const userId = decoded.userId;
    const organizationId = decoded.organizationId;

    // Verify user has access to the VM's organization
    const [vm] = await db
      .select()
      .from(virtualMachines)
      .where(
        and(
          eq(virtualMachines.id, vmId),
          eq(virtualMachines.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!vm) {
      return {
        onOpen: (event, ws) => {
          ws.send(JSON.stringify({ type: 'error', data: 'VM not found or access denied' }));
          ws.close();
        }
      };
    }

    if (vm.status !== 'running') {
      return {
        onOpen: (event, ws) => {
          ws.send(JSON.stringify({ type: 'error', data: 'VM must be running to execute scripts' }));
          ws.close();
        }
      };
    }

    // Get organization for username
    const [organization] = await db.select().from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!organization || !organization.gcpEmail) {
      return {
        onOpen: (event, ws) => {
          ws.send(JSON.stringify({ type: 'error', data: 'Organization does not have Google Cloud credentials configured' }));
          ws.close();
        }
      };
    }

    const username = organization.gcpEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    let sshClient: SSHClient | null = null;
    let stream: any = null;

    return {
      onOpen: (event, ws) => {
        console.log('Execute Stream WebSocket opened');
      },

      onMessage: async (event, ws) => {
        try {
          const request: ExecuteScriptRequest = JSON.parse(event.data);
          
          if (!request.script) {
            ws.send(JSON.stringify({ type: 'error', data: 'Script is required' }));
            return;
          }

          // Get organization access token
          const accessToken = await getOrganizationAccessToken(organizationId);
          if (!accessToken) {
            ws.send(JSON.stringify({ type: 'error', data: 'Failed to authenticate with Google Cloud' }));
            ws.close();
            return;
          }

          // Generate SSH keys
          const { publicKey, privateKey } = await generateSSHKeys(username);

          // Add SSH key to VM
          await addSSHKeyToVM({
            projectId: vm.gcpProjectId,
            zone: vm.zone,
            instanceName: vm.gcpInstanceId!,
            username,
            publicKey,
            accessToken
          });

          // Create SSH client
          sshClient = new SSHClient();

          sshClient.on('ready', () => {
            console.log('SSH Client ready for script execution');
            
            sshClient.exec(request.script, { pty: true }, (err, sshStream) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', data: `SSH exec error: ${err.message}` }));
                ws.close();
                return;
              }

              stream = sshStream;

              sshStream.on('data', (data: Buffer) => {
                ws.send(JSON.stringify({ type: 'output', data: data.toString('utf8') }));
              });

              sshStream.stderr.on('data', (data: Buffer) => {
                ws.send(JSON.stringify({ type: 'output', data: data.toString('utf8') }));
              });

              sshStream.on('close', (code: number, signal: string) => {
                console.log(`Script execution closed with code ${code}, signal ${signal}`);
                ws.send(JSON.stringify({ 
                  type: 'complete', 
                  data: `Script completed with exit code: ${code}` 
                }));
                ws.close();
              });

              sshStream.on('error', (err: Error) => {
                console.error('Stream error:', err);
                ws.send(JSON.stringify({ type: 'error', data: `Stream error: ${err.message}` }));
                ws.close();
              });
            });
          });

          sshClient.on('error', (err) => {
            console.error('SSH Client error:', err);
            ws.send(JSON.stringify({ type: 'error', data: `SSH connection error: ${err.message}` }));
            ws.close();
          });

          // Connect to SSH
          const maxRetries = 5;
          let retryCount = 0;
          let connected = false;

          const attemptConnection = () => {
            if (retryCount >= maxRetries) {
              ws.send(JSON.stringify({ type: 'error', data: 'Failed to connect after maximum retries' }));
              ws.close();
              return;
            }

            console.log(`SSH connection attempt ${retryCount + 1}/${maxRetries} to ${vm.externalIp}`);

            sshClient.connect({
              host: vm.externalIp!,
              port: 22,
              username,
              privateKey,
              readyTimeout: 30000,
              keepaliveInterval: 5000,
              keepaliveCountMax: 3
            });

            retryCount++;
          };

          sshClient.on('error', (err) => {
            if (!connected && retryCount < maxRetries) {
              console.log(`SSH connection failed, retrying... (${err.message})`);
              setTimeout(attemptConnection, 2000);
            }
          });

          sshClient.on('ready', () => {
            connected = true;
          });

          attemptConnection();

        } catch (error: any) {
          console.error('Error processing message:', error);
          ws.send(JSON.stringify({ type: 'error', data: error.message || 'Failed to process request' }));
          ws.close();
        }
      },

      onClose: (event, ws) => {
        console.log('Execute Stream WebSocket closed');
        
        // Clean up SSH connection
        if (stream) {
          stream.destroy();
        }
        if (sshClient) {
          sshClient.end();
        }
      },

      onError: (event, ws) => {
        console.error('Execute Stream WebSocket error:', event);
        
        // Clean up SSH connection
        if (stream) {
          stream.destroy();
        }
        if (sshClient) {
          sshClient.end();
        }
      }
    };
  });
}