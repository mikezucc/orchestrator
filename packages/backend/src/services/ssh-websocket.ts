import { WebSocketServer, WebSocket } from 'ws';
import { Client as SSHClient } from 'ssh2';
import { Server } from 'http';
import { db } from '../db/index.js';
import { virtualMachines, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateSSHKeys, addSSHKeyToVM } from './gcp-ssh.js';
import { getValidAccessToken } from './auth.js';

interface WebSocketAuth {
  userId: string;
  vmId: string;
  token?: string;
}

export function setupSSHWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ssh-ws'
  });

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  wss.on('connection', async (ws: WebSocket, req) => {
    console.log('=== New SSH WebSocket connection ===');
    console.log('Origin:', req.headers.origin);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    let sshClient: SSHClient | null = null;
    let stream: any = null;

    // Handle WebSocket errors early
    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      console.error('Error stack:', error.stack);
    });

    try {
      // Parse auth from query string
      if (!req.url) {
        ws.send(JSON.stringify({ type: 'error', data: 'Invalid request URL' }));
        ws.close();
        return;
      }
      
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const userId = url.searchParams.get('userId');
      const vmId = url.searchParams.get('vmId');
      const token = url.searchParams.get('token');

      console.log('Parsed params:', { userId, vmId, token: token ? 'present' : 'missing' });

      if (!userId || !vmId) {
        console.error('Missing required params:', { userId, vmId });
        ws.send(JSON.stringify({ type: 'error', data: 'Missing authentication' }));
        ws.close();
        return;
      }

      // Get VM and user details
      console.log('Fetching VM from database:', { vmId, userId });
      const [vm] = await db.select().from(virtualMachines)
        .where(and(
          eq(virtualMachines.id, vmId),
          eq(virtualMachines.userId, userId)
        ));

      console.log('VM lookup result:', vm ? { id: vm.id, name: vm.name, publicIp: vm.publicIp, status: vm.status } : 'not found');

      if (!vm || !vm.publicIp) {
        console.error('VM validation failed:', { found: !!vm, hasPublicIp: vm?.publicIp });
        ws.send(JSON.stringify({ type: 'error', data: 'VM not found or has no public IP' }));
        ws.close();
        return;
      }

      console.log('Fetching user from database:', userId);
      const [user] = await db.select().from(users)
        .where(eq(users.id, userId));

      console.log('User lookup result:', user ? { id: user.id, email: user.email } : 'not found');

      if (!user) {
        console.error('User not found:', userId);
        ws.send(JSON.stringify({ type: 'error', data: 'User not found' }));
        ws.close();
        return;
      }

      // Generate username from email
      const username = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      console.log('Generated SSH username:', username);

      // Get access token
      console.log('Getting valid access token for user:', userId);
      const accessToken = await getValidAccessToken(userId, token);
      console.log('Access token result:', accessToken ? 'obtained' : 'failed');
      
      if (!accessToken) {
        console.error('Failed to get valid access token');
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

      sshClient.on('ready', () => {
        console.log('=== SSH connection established ===');
        console.log('Connected to VM:', vm.name);
        ws.send(JSON.stringify({ type: 'connected', data: `Connected to ${vm.name}` }));

        // Start interactive shell
        sshClient.shell((err, shellStream) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'error', data: `Shell error: ${err.message}` }));
            ws.close();
            return;
          }

          stream = shellStream;

          // Handle data from SSH to WebSocket
          stream.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
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

          // Send initial terminal size
          stream.setWindow(80, 24);
        });
      });

      sshClient.on('error', (err) => {
        console.error('=== SSH connection error ===');
        console.error('Error:', err.message);
        console.error('Error code:', (err as any).code);
        console.error('Error stack:', err.stack);
        ws.send(JSON.stringify({ type: 'error', data: `SSH error: ${err.message}` }));
        ws.close();
      });

      sshClient.on('close', () => {
        console.log('SSH connection closed');
        ws.close();
      });

      // Connect to SSH
      const sshConfig = {
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

    // Handle WebSocket messages
    ws.on('message', (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString());
        
        switch (msg.type) {
          case 'data':
            // Send data to SSH stream
            if (stream && stream.writable) {
              const data = Buffer.from(msg.data, 'base64');
              stream.write(data);
            }
            break;
            
          case 'resize':
            // Handle terminal resize
            if (stream && msg.cols && msg.rows) {
              stream.setWindow(msg.rows, msg.cols);
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
    });

    // Handle WebSocket close
    ws.on('close', () => {
      console.log('WebSocket closed');
      if (stream) {
        stream.destroy();
      }
      if (sshClient) {
        sshClient.end();
      }
    });

    // Handle WebSocket error
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (stream) {
        stream.destroy();
      }
      if (sshClient) {
        sshClient.end();
      }
    });
  });

  console.log('SSH WebSocket server initialized');
}