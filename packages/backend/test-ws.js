import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get('/', (c) => c.text('Hello'));

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    console.log('WebSocket upgrade requested');
    return {
      onOpen: (event, ws) => {
        console.log('WebSocket opened!');
        ws.send('Hello from WebSocket!');
      },
      onMessage: (event, ws) => {
        console.log('Message:', event.data);
        ws.send(`Echo: ${event.data}`);
      },
      onClose: () => {
        console.log('WebSocket closed');
      },
      onError: (error) => {
        console.error('WebSocket error:', error);
      }
    };
  })
);

const server = serve({ 
  fetch: app.fetch, 
  port: 3001 
});

injectWebSocket(server);

console.log('Test server running on http://localhost:3001');
console.log('WebSocket endpoint: ws://localhost:3001/ws');