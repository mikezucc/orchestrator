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

  wss.on('connection', async (ws: WebSocket, req) => {
    console.log('New SSH WebSocket connection');
    
    let sshClient: SSHClient | null = null;
    let stream: any = null;

    // Parse auth from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    const vmId = url.searchParams.get('vmId');
    const token = url.searchParams.get('token');

    if (!userId || !vmId) {
      ws.send(JSON.stringify({ type: 'error', data: 'Missing authentication' }));
      ws.close();
      return;
    }

    try {
      // Get VM and user details
      const [vm] = await db.select().from(virtualMachines)
        .where(and(
          eq(virtualMachines.id, vmId),
          eq(virtualMachines.userId, userId)
        ));

      if (!vm || !vm.publicIp) {
        ws.send(JSON.stringify({ type: 'error', data: 'VM not found or has no public IP' }));
        ws.close();
        return;
      }

      const [user] = await db.select().from(users)
        .where(eq(users.id, userId));

      if (!user) {
        ws.send(JSON.stringify({ type: 'error', data: 'User not found' }));
        ws.close();
        return;
      }

      // Generate username from email
      const username = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

      // Get access token
      const accessToken = await getValidAccessToken(userId, token);
      if (!accessToken) {
        ws.send(JSON.stringify({ type: 'error', data: 'Failed to authenticate with Google Cloud' }));
        ws.close();
        return;
      }

      // Generate SSH keys
      ws.send(JSON.stringify({ type: 'status', data: 'Generating SSH keys...' }));
      const { publicKey, privateKey } = await generateSSHKeys(username);

      // Add public key to VM
      ws.send(JSON.stringify({ type: 'status', data: 'Adding SSH key to VM...' }));
      await addSSHKeyToVM({
        projectId: vm.gcpProjectId,
        zone: vm.zone,
        instanceName: vm.gcpInstanceId!,
        username,
        publicKey,
        accessToken
      });

      // Wait a bit for the key to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create SSH connection
      ws.send(JSON.stringify({ type: 'status', data: 'Connecting to VM...' }));
      sshClient = new SSHClient();

      sshClient.on('ready', () => {
        console.log('SSH connection established');
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
        console.error('SSH connection error:', err);
        ws.send(JSON.stringify({ type: 'error', data: `SSH error: ${err.message}` }));
        ws.close();
      });

      sshClient.on('close', () => {
        console.log('SSH connection closed');
        ws.close();
      });

      // Connect to SSH
      sshClient.connect({
        host: vm.publicIp,
        port: 22,
        username,
        privateKey,
        readyTimeout: 30000,
        // Try keyboard-interactive auth if needed
        tryKeyboard: true,
        // Increase keepalive
        keepaliveInterval: 10000,
        keepaliveCountMax: 3
      });

    } catch (error: any) {
      console.error('WebSocket SSH error:', error);
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