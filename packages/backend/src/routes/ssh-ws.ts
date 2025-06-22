import { Client as SSHClient } from 'ssh2';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { authUsers, organizationMembers, organizations } from '../db/schema-auth.js';
import { eq, and } from 'drizzle-orm';
import { generateSSHKeys, addSSHKeyToVM } from '../services/gcp-ssh.js';
import { getOrganizationAccessToken } from '../services/organization-auth.js';
import { verifySessionToken } from '../utils/auth.js';

// Store active SSH connections
const activeConnections = new Map<any, { sshClient: SSHClient | null; stream: any }>();

export function createSSHWebSocketHandler(upgradeWebSocket: any) {
  return upgradeWebSocket(async (c: any) => {
    // Get query parameters
    const vmId = c.req.query('vmId');
    const token = c.req.query('token');
    const organizationId = c.req.query('organizationId');

    console.log('=== SSH WebSocket connection request ===');
    console.log('vmId:', vmId);
    console.log('token provided:', !!token);
    console.log('organizationId:', organizationId);

    if (!vmId || !token) {
      return {
        onOpen: (event, ws) => {
          ws.send(JSON.stringify({ type: 'error', data: 'Missing required parameters' }));
          ws.close();
        }
      };
    }

    // Authenticate the user
    let userId: string | null = null;
    
    // Try to decode the token as JWT first
    const decoded = verifySessionToken(token);
    if (decoded) {
      userId = decoded.userId;
    } else {
      // If not a valid JWT, it might be a Google OAuth token
      // In this case, we need the userId to be passed as a query parameter
      userId = c.req.query('userId');
    }

    if (!userId) {
      return {
        onOpen: (event, ws) => {
          ws.send(JSON.stringify({ type: 'error', data: 'Authentication failed' }));
          ws.close();
        }
      };
    }

    // Verify user has access to the organization
    if (organizationId) {
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!membership) {
        return {
          onOpen: (event, ws) => {
            ws.send(JSON.stringify({ type: 'error', data: 'Access denied to organization' }));
            ws.close();
          }
        };
      }
    }

    let sshClient: SSHClient | null = null;
    let stream: any = null;

    return {
      onOpen: (event, ws) => {
        console.log('WebSocket opened');

        // Initialize connection state
        activeConnections.set(ws, { sshClient: null, stream: null });

        // Handle SSH setup asynchronously
        (async () => {
          try {
          // Get VM and user details
          console.log('Fetching VM from database:', { vmId, organizationId });
          
          const vmQuery = organizationId 
            ? and(
                eq(virtualMachines.id, vmId),
                eq(virtualMachines.organizationId, organizationId)
              )
            : eq(virtualMachines.id, vmId);
            
          const [vm] = await db.select().from(virtualMachines)
            .where(vmQuery);

          console.log('VM lookup result:', vm ? { id: vm.id, name: vm.name, publicIp: vm.publicIp, status: vm.status } : 'not found');

          if (!vm || !vm.publicIp) {
            console.error('VM validation failed:', { found: !!vm, hasPublicIp: vm?.publicIp });
            ws.send(JSON.stringify({ type: 'error', data: 'VM not found or has no public IP' }));
            ws.close();
            return;
          }

          // Get organization to get GCP email
          console.log('Fetching organization from database:', vm.organizationId);
          const [organization] = await db.select().from(organizations)
            .where(eq(organizations.id, vm.organizationId!));

          console.log('Organization lookup result:', organization ? { id: organization.id, gcpEmail: organization.gcpEmail } : 'not found');

          if (!organization || !organization.gcpEmail) {
            console.error('Organization does not have Google Cloud credentials configured');
            ws.send(JSON.stringify({ type: 'error', data: 'Organization does not have Google Cloud credentials configured' }));
            ws.close();
            return;
          }

          // Generate username from organization's Google Cloud email
          const username = organization.gcpEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
          console.log('Generated SSH username from GCP email:', username);

          // Get organization access token
          console.log('Getting organization access token:', vm.organizationId);
          const accessToken = await getOrganizationAccessToken(vm.organizationId!);
          console.log('Access token result:', accessToken ? 'obtained' : 'failed');
          
          if (!accessToken) {
            console.error('Failed to get organization access token');
            ws.send(JSON.stringify({ type: 'error', data: 'Failed to authenticate with Google Cloud' }));
            ws.close();
            return;
          }

          // Generate SSH keys
          console.log('Generating SSH keys for username:', username);
          ws.send(JSON.stringify({ type: 'status', data: 'Generating SSH keys...' }));
          const { publicKey, privateKey } = await generateSSHKeys(username);
          console.log('SSH keys generated successfully');

          // Add public key to VM
          console.log('Adding SSH key to VM:', { projectId: vm.gcpProjectId, zone: vm.zone, instanceName: vm.gcpInstanceId });
          ws.send(JSON.stringify({ type: 'status', data: 'Adding SSH key to VM...' }));
          await addSSHKeyToVM({
            projectId: vm.gcpProjectId,
            zone: vm.zone,
            instanceName: vm.gcpInstanceId!,
            username,
            publicKey,
            accessToken
          });
          console.log('SSH key added to VM successfully');

          // Wait a bit for the key to propagate
          console.log('Waiting 2s for SSH key to propagate...');
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Create SSH connection
          console.log('Creating SSH connection to:', { host: vm.publicIp, port: 22, username });
          ws.send(JSON.stringify({ type: 'status', data: 'Connecting to VM...' }));
          
          sshClient = new SSHClient();
          const connState = activeConnections.get(ws);
          if (connState) {
            connState.sshClient = sshClient;
          }

          sshClient.on('ready', () => {
            console.log('=== SSH connection established ===');
            console.log('Connected to VM:', vm.name);
            ws.send(JSON.stringify({ type: 'connected', data: `Connected to ${vm.name}` }));

            // Start interactive shell
            sshClient.shell((err: any, shellStream: any) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', data: `Shell error: ${err.message}` }));
                ws.close();
                return;
              }

              stream = shellStream;
              const connState = activeConnections.get(ws);
              if (connState) {
                connState.stream = stream;
              }

              // Handle data from SSH to WebSocket
              stream.on('data', (data: Buffer) => {
                if (ws.readyState === 1) { // OPEN
                  ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }));
                }
              });

              stream.on('close', () => {
                console.log('SSH stream closed');
                ws.close();
              });

              stream.on('error', (err: Error) => {
                console.error('SSH stream error:', err);
                ws.send(JSON.stringify({ type: 'error', data: `Stream error: ${err.message}` }));
                ws.close();
              });

              // Don't set initial size here, wait for client to send it
            });
          });

          sshClient.on('error', (err: any) => {
            console.error('=== SSH connection error ===');
            console.error('Error:', err.message);
            console.error('Error code:', err.code);
            console.error('Error stack:', err.stack);
            ws.send(JSON.stringify({ type: 'error', data: `SSH error: ${err.message}` }));
            ws.close();
          });

          sshClient.on('close', () => {
            console.log('SSH connection closed');
            ws.close();
          });

          // Connect to SSH
          const sshConfig: any = {
            host: vm.publicIp,
            port: 22,
            username,
            privateKey,
            readyTimeout: 30000,
            // Try keyboard-interactive auth if needed
            tryKeyboard: true,
            // Increase keepalive
            keepaliveInterval: 10000,
            keepaliveCountMax: 3,
            debug: (info: string) => console.log('SSH2 Debug:', info)
          };
          
          console.log('Attempting SSH connection with config:', { 
            host: sshConfig.host, 
            port: sshConfig.port, 
            username: sshConfig.username,
            hasPrivateKey: !!sshConfig.privateKey 
          });
          
          sshClient.connect(sshConfig);

          } catch (error: any) {
            console.error('=== WebSocket SSH setup error ===');
            console.error('Error:', error.message);
            console.error('Error stack:', error.stack);
            ws.send(JSON.stringify({ type: 'error', data: error.message || 'Connection failed' }));
            ws.close();
          }
        })(); // Execute the async function
      },
      
      onMessage: async (event: any, ws: any) => {
        try {
          const msg = JSON.parse(event.data.toString());
          const connState = activeConnections.get(ws);
          
          if (!connState || !connState.stream) {
            return;
          }
          
          switch (msg.type) {
            case 'data':
              // Send data to SSH stream
              if (connState.stream && connState.stream.writable) {
                const data = Buffer.from(msg.data, 'base64');
                connState.stream.write(data);
              }
              break;
              
            case 'resize':
              // Handle terminal resize
              if (connState.stream && msg.cols && msg.rows) {
                console.log('Setting terminal window size:', { rows: msg.rows, cols: msg.cols });
                connState.stream.setWindow(msg.rows, msg.cols);
              }
              break;
              
            case 'ping':
              // Respond to ping
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      },
      
      onClose: (event: any, ws: any) => {
        console.log('WebSocket connection closed');
        const connState = activeConnections.get(ws);
        
        if (connState) {
          if (connState.stream) {
            connState.stream.destroy();
          }
          if (connState.sshClient) {
            connState.sshClient.end();
          }
          activeConnections.delete(ws);
        }
      },
      
      onError: (event: any, ws: any) => {
        console.error('WebSocket error event:', event);
        console.error('Error type:', typeof event);
        console.error('Error details:', JSON.stringify(event, null, 2));
        
        const connState = activeConnections.get(ws);
        
        if (connState) {
          if (connState.stream) {
            connState.stream.destroy();
          }
          if (connState.sshClient) {
            connState.sshClient.end();
          }
          activeConnections.delete(ws);
        }
      }
    };
  });
}