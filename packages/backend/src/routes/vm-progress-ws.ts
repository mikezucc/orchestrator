import { verifySessionToken } from '../utils/auth.js';
import { vmCreationProgress } from '../services/vm-creation-progress.js';
import type { VMCreationProgress } from '@gce-platform/types';

export function createVMProgressWebSocketHandler(upgradeWebSocket: any) {
  return upgradeWebSocket(async (c: any) => {
    // Get query parameters
    const trackingId = c.req.query('trackingId');
    const token = c.req.query('token');

    console.log('=== VM Progress WebSocket connection request ===');
    console.log('trackingId:', trackingId);
    console.log('token provided:', !!token);

    if (!trackingId || !token) {
      return {
        onOpen: (event: any, ws: any) => {
          ws.send(JSON.stringify({ type: 'error', data: 'Missing required parameters' }));
          ws.close();
        }
      };
    }

    // Authenticate the user
    const decoded = verifySessionToken(token);
    if (!decoded) {
      return {
        onOpen: (event: any, ws: any) => {
          ws.send(JSON.stringify({ type: 'error', data: 'Authentication failed' }));
          ws.close();
        }
      };
    }

    return {
      onOpen(event: any, ws: any) {
        console.log(`VM Progress WebSocket opened for tracking ID: ${trackingId}`);
        
        // Send initial connection success
        ws.send(JSON.stringify({ type: 'connected', trackingId }));

        // Send any existing progress
        const existingProgress = vmCreationProgress.getProgress(trackingId);
        if (existingProgress.length > 0) {
          existingProgress.forEach(progress => {
            ws.send(JSON.stringify({ type: 'progress', data: progress }));
          });
        }

        // Subscribe to progress updates
        const progressHandler = (progress: VMCreationProgress) => {
          try {
            ws.send(JSON.stringify({ type: 'progress', data: progress }));
          } catch (error) {
            console.error('Error sending progress update:', error);
          }
        };

        vmCreationProgress.on(`progress:${trackingId}`, progressHandler);
        vmCreationProgress.subscribeClient(trackingId, ws);

        // Store the handler for cleanup
        (ws as any)._progressHandler = progressHandler;
        (ws as any)._trackingId = trackingId;
      },

      onMessage(event: any, ws: any) {
        try {
          const message = JSON.parse(event.data.toString());
          
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (error) {
          console.error('Error handling message:', error);
        }
      },

      onClose(event: any, ws: any) {
        console.log(`VM Progress WebSocket closed for tracking ID: ${(ws as any)._trackingId}`);
        
        // Cleanup
        if ((ws as any)._progressHandler && (ws as any)._trackingId) {
          vmCreationProgress.off(`progress:${(ws as any)._trackingId}`, (ws as any)._progressHandler);
          vmCreationProgress.unsubscribeClient((ws as any)._trackingId, ws);
        }
      },

      onError(event: any, ws: any) {
        console.error('VM Progress WebSocket error:', event);
      }
    };
  });
}