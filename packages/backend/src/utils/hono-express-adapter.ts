import { Hono } from 'hono';
import type { Router } from 'express';

// Convert Express router to Hono app
export function expressToHono(expressRouter: Router): Hono {
  const honoApp = new Hono();
  
  // This is a simplified adapter - in production you'd want more complete mapping
  const routes = (expressRouter as any).stack || [];
  
  routes.forEach((layer: any) => {
    if (layer.route) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods);
      
      methods.forEach(method => {
        const handlers = layer.route.stack.map((l: any) => l.handle);
        
        honoApp.on(method.toUpperCase() as any, path, async (c) => {
          // Create Express-like request/response objects
          const req: any = {
            body: await c.req.json().catch(() => ({})),
            params: c.req.param(),
            query: c.req.query(),
            headers: Object.fromEntries(c.req.raw.headers.entries()),
            header: (name: string) => c.req.header(name),
            ip: c.env?.remoteAddr || '',
          };
          
          const res: any = {
            status: (code: number) => ({ 
              json: (data: any) => c.json(data, code),
              send: (data: any) => c.text(data, code),
            }),
            json: (data: any) => c.json(data),
            redirect: (url: string) => c.redirect(url),
          };
          
          // Run through handlers
          for (const handler of handlers) {
            try {
              await new Promise((resolve, reject) => {
                const next = (err?: any) => {
                  if (err) reject(err);
                  else resolve(undefined);
                };
                handler(req, res, next);
              });
            } catch (error) {
              return c.json({ success: false, error: String(error) }, 500);
            }
          }
        });
      });
    }
  });
  
  return honoApp;
}