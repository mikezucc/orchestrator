import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as dotenv from 'dotenv';
import { createServer } from 'http';
import { vmRoutes } from './routes/vms.js';
import { firewallRoutes } from './routes/firewall.js';
import { authRoutes } from './routes/auth.js';
import { syncRoutes } from './routes/sync.js';
import { portLabelRoutes } from './routes/port-labels.js';
import { wormholeRoutes } from './routes/wormhole.js';
import { sshRoutes } from './routes/ssh.js';
import { setupSSHWebSocketServer } from './services/ssh-websocket.js';

dotenv.config();

const app = new Hono();

app.use('/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({ message: 'GCE VM Platform API' });
});

app.route('/api/auth', authRoutes);
app.route('/api/vms', vmRoutes);
app.route('/api/firewall', firewallRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/port-labels', portLabelRoutes);
app.route('/api/wormhole', wormholeRoutes);
app.route('/api/ssh', sshRoutes);

// Check required environment variables
const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these in your .env file');
  process.exit(1);
}

const port = parseInt(process.env.PORT || '3000');

// Create server with Hono
const server = serve({
  fetch: app.fetch,
  port,
  createServer,
}, (info) => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`SSH WebSocket available at ws://localhost:${port}/ssh-ws`);
  console.log(`Google OAuth redirect URI should be set to: ${process.env.GOOGLE_REDIRECT_URI}`);
  
  // Setup WebSocket server for SSH after server starts
  if (info.server) {
    setupSSHWebSocketServer(info.server);
  }
});