import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createNodeWebSocket } from '@hono/node-ws';
import * as dotenv from 'dotenv';
import * as https from 'https';
import * as fs from 'fs';
import { vmRoutes } from './routes/vms.js';
import { firewallRoutes } from './routes/firewall.js';
import { authRoutes } from './routes/auth.js';
import authOTP from './routes/auth-otp.js';
import { syncRoutes } from './routes/sync.js';
import { wormholeRoutes } from './routes/wormhole.js';
import { sshRoutes } from './routes/ssh.js';
import { createSSHWebSocketHandler } from './routes/ssh-ws.js';
import { createVMProgressWebSocketHandler } from './routes/vm-progress-ws.js';
import { createExecuteStreamWebSocketHandler } from './routes/execute-stream-ws.js';
import portsRoutes from './routes/ports.js';
import { organizationRoutes } from './routes/organizations.js';
import { invitationRoutes } from './routes/invitations.js';
import { googleAuthRoutes } from './routes/google-auth.js';
import { githubAuthRoutes } from './routes/github-auth.js';
import { userSSHKeysRoutes } from './routes/user-ssh-keys.js';
import scriptsRouter from './routes/scripts.js';
import { momentsRouter } from './routes/moments.js';
import { projectRoutes } from './routes/projects.js';
import { vmRepositoryRoutes } from './routes/vm-repositories.js';
import { adminRoutes } from './routes/admin.js';
import { daemonRoutes } from './routes/daemon.js';

dotenv.config();

const app = new Hono();

// Parse CORS origins from environment variable
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:5173',
      'https://localhost:5173',
      'http://localhost:3000',
      'https://localhost:3000',
      'http://localhost',
      'https://localhost',
      'http://onfacet.dev',
      'https://onfacet.dev',
      'http://www.onfacet.dev',
      'https://www.onfacet.dev'
    ];

console.log('CORS Origins:', corsOrigins);

app.use('/*', cors({
  origin: corsOrigins,
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-organization-id'],
}));

app.get('/', (c) => {
  return c.json({ message: 'Facet Platform API' });
});

app.get('/health', (c) => {
  return c.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/auth/otp', authOTP);
app.route('/api/auth/google', googleAuthRoutes);
app.route('/api/github-auth', githubAuthRoutes);
app.route('/api/user/ssh-keys', userSSHKeysRoutes);
app.route('/api/vms', vmRoutes);
app.route('/api/firewall', firewallRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/wormhole', wormholeRoutes);
app.route('/api/ssh', sshRoutes);
app.route('/api/vms', portsRoutes);
app.route('/api/organizations', organizationRoutes);
app.route('/api/invitations', invitationRoutes);
app.route('/api/scripts', scriptsRouter);
app.route('/api/moments', momentsRouter);
app.route('/api/projects', projectRoutes);
app.route('/api/vms', vmRepositoryRoutes);
app.route('/api/admin', adminRoutes);
app.route('/daemon', daemonRoutes);

// Check required environment variables
const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these in your .env file');
  process.exit(1);
}

const port = parseInt(process.env.PORT || '3000');
const httpsEnabled = process.env.HTTPS_ENABLED === 'true';
const sslCertPath = process.env.SSL_CERT_PATH || './certs/cert.pem';
const sslKeyPath = process.env.SSL_KEY_PATH || './certs/key.pem';

// Create WebSocket upgrade handler
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

// Add WebSocket routes directly to the main app
app.get('/ssh-ws/test',
  upgradeWebSocket((c) => {
    console.log('Test WebSocket upgrade requested');
    return {
      onOpen: (event, ws) => {
        console.log('Test WebSocket opened');
        ws.send('Hello from test WebSocket!');
      },
      onMessage: (event, ws) => {
        console.log('Test message received:', event.data);
        ws.send(`Echo: ${event.data}`);
      },
      onClose: () => {
        console.log('Test WebSocket closed');
      },
      onError: (error) => {
        console.error('Test WebSocket error:', error);
      }
    };
  })
);

// Add the main SSH WebSocket route
const sshWebSocketHandler = createSSHWebSocketHandler(upgradeWebSocket);
app.get('/ssh-ws', sshWebSocketHandler);

// Add VM progress WebSocket route
const vmProgressWebSocketHandler = createVMProgressWebSocketHandler(upgradeWebSocket);
app.get('/vm-progress-ws', vmProgressWebSocketHandler);

// Add Execute Stream WebSocket route
const executeStreamWebSocketHandler = createExecuteStreamWebSocketHandler(upgradeWebSocket);
app.get('/api/vms/:id/execute-stream', executeStreamWebSocketHandler);

// Add a debug route to check if routes are registered
app.get('/debug/routes', (c) => {
  return c.json({
    routes: app.routes.map(r => ({
      method: r.method,
      path: r.path,
    }))
  });
});

// Create and start server
let server;

if (httpsEnabled) {
  try {
    const sslOptions = {
      cert: fs.readFileSync(sslCertPath),
      key: fs.readFileSync(sslKeyPath)
    };
    
    server = serve({
      fetch: app.fetch,
      port,
      createServer: https.createServer.bind(https, sslOptions) as any
    }, (info) => {
      console.log(`Server is running on https://localhost:${info.port}`);
      console.log(`SSH WebSocket available at wss://localhost:${info.port}/ssh-ws`);
      console.log(`Google OAuth redirect URI should be set to: ${process.env.GOOGLE_REDIRECT_URI}`);
    });
  } catch (error) {
    console.error('Failed to load SSL certificates:', error);
    console.error('Running in HTTP mode instead');
    
    server = serve({
      fetch: app.fetch,
      port,
    }, (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
      console.log(`SSH WebSocket available at ws://localhost:${info.port}/ssh-ws`);
      console.log(`Google OAuth redirect URI should be set to: ${process.env.GOOGLE_REDIRECT_URI}`);
    });
  }
} else {
  server = serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
    console.log(`SSH WebSocket available at ws://localhost:${info.port}/ssh-ws`);
    console.log(`Google OAuth redirect URI should be set to: ${process.env.GOOGLE_REDIRECT_URI}`);
  });
}

// Inject WebSocket into the server AFTER it's created
injectWebSocket(server);