import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const httpsEnabled = env.VITE_HTTPS_ENABLED === 'true';
  const backendHttpsEnabled = env.VITE_BACKEND_HTTPS === 'true';
  
  const httpsConfig = httpsEnabled ? {
    https: {
      cert: fs.readFileSync(env.VITE_SSL_CERT_PATH || './certs/cert.pem'),
      key: fs.readFileSync(env.VITE_SSL_KEY_PATH || './certs/key.pem'),
    }
  } : {};

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      ...httpsConfig,
      host: true, // Listen on all addresses
      allowedHosts: ['onfacet.dev', 'localhost', '127.0.0.1'],
      proxy: {
        '/api': {
          target: backendHttpsEnabled ? 'https://localhost:3000' : 'http://localhost:3000',
          changeOrigin: true,
          secure: false, // Accept self-signed certificates in development
        },
      },
    },
  };
});