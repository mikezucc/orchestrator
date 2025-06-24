# Frontend HTTPS Setup Guide

This frontend supports both HTTP and HTTPS modes for the Vite development server. By default, it runs in HTTP mode.

## Quick Start

1. Generate self-signed certificates (for development only):
   ```bash
   npm run generate-certs
   ```

2. Create a `.env.local` file in the frontend directory:
   ```env
   VITE_HTTPS_ENABLED=true
   ```

3. If your backend is also running on HTTPS, add:
   ```env
   VITE_BACKEND_HTTPS=true
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

The frontend will now run on `https://localhost:5173`

## Configuration Options

### Environment Variables

Create a `.env.local` file (which is gitignored) with these options:

- `VITE_HTTPS_ENABLED`: Enable HTTPS for Vite dev server (default: `false`)
- `VITE_SSL_CERT_PATH`: Path to SSL certificate (default: `./certs/cert.pem`)
- `VITE_SSL_KEY_PATH`: Path to SSL private key (default: `./certs/key.pem`)
- `VITE_BACKEND_HTTPS`: Set to `true` if backend runs on HTTPS (default: `false`)

### Full HTTPS Setup (Frontend + Backend)

For a complete HTTPS setup:

1. Enable HTTPS in backend (see backend/HTTPS_SETUP.md)
2. Enable HTTPS in frontend with backend HTTPS:
   ```env
   VITE_HTTPS_ENABLED=true
   VITE_BACKEND_HTTPS=true
   ```

## Browser Configuration

When using self-signed certificates in development:

1. **Chrome/Edge**: Navigate to https://localhost:5173 and click "Advanced" → "Proceed to localhost"
2. **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
3. **Safari**: Click "Show Details" → "visit this website"

## API Proxy

The Vite dev server proxies `/api` requests to the backend:
- When `VITE_BACKEND_HTTPS=false`: Proxies to `http://localhost:3000`
- When `VITE_BACKEND_HTTPS=true`: Proxies to `https://localhost:3000`

The proxy is configured to accept self-signed certificates in development (`secure: false`).

## Production Deployment

For production:
1. Use proper SSL certificates from a Certificate Authority
2. Configure your web server (nginx, Apache) or CDN for HTTPS
3. Update API endpoints to use HTTPS URLs
4. Ensure all assets are loaded over HTTPS to avoid mixed content warnings

## Troubleshooting

### Certificate Not Trusted
- This is normal for self-signed certificates in development
- Accept the certificate in your browser as described above

### ENOENT Error
- Run `npm run generate-certs` to create certificates
- Check that the certificate paths in `.env.local` are correct

### WebSocket Connection Issues
- Ensure both frontend and backend use the same protocol (both HTTP or both HTTPS)
- Check browser console for mixed content warnings