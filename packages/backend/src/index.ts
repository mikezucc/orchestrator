import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as dotenv from 'dotenv';
import { vmRoutes } from './routes/vms.js';
import { firewallRoutes } from './routes/firewall.js';
import { authRoutes } from './routes/auth.js';

dotenv.config();

const app = new Hono();

app.use('/*', cors());

app.get('/', (c) => {
  return c.json({ message: 'GCE VM Platform API' });
});

app.route('/api/auth', authRoutes);
app.route('/api/vms', vmRoutes);
app.route('/api/firewall', firewallRoutes);

const port = parseInt(process.env.PORT || '3000');

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running on http://localhost:${port}`);