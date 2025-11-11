# HTTPS Setup for Development

This project supports HTTPS for both frontend and backend servers during development. This guide covers the complete setup process.

## Quick Setup (Recommended)

Run this single command from the project root to set up HTTPS for both frontend and backend:

```bash
npm run setup-https
```

This will:
1. Generate self-signed certificates for both services
2. Configure environment files automatically
3. Enable HTTPS for both frontend and backend

After running this command, start your servers normally:
- Backend: `cd packages/backend && npm run dev` → https://localhost:3000
- Frontend: `cd packages/frontend && npm run dev` → https://localhost:5173

## Manual Setup

If you prefer to set up HTTPS manually or for only one service:

### Backend HTTPS Setup

1. Navigate to backend: `cd packages/backend`
2. Generate certificates: `npm run generate-certs`
3. Add to `.env` or `.env.local`:
   ```env
   HTTPS_ENABLED=true
   SSL_CERT_PATH=./certs/cert.pem
   SSL_KEY_PATH=./certs/key.pem
   ```

### Frontend HTTPS Setup

1. Navigate to frontend: `cd packages/frontend`
2. Generate certificates: `npm run generate-certs`
3. Create `.env.local`:
   ```env
   VITE_HTTPS_ENABLED=true
   VITE_SSL_CERT_PATH=./certs/cert.pem
   VITE_SSL_KEY_PATH=./certs/key.pem
   VITE_BACKEND_HTTPS=true  # if backend uses HTTPS
   ```

## Browser Certificate Acceptance

When accessing the HTTPS URLs for the first time, you'll need to accept the self-signed certificates:

1. **Backend API**: Navigate to https://localhost:3000 and accept the certificate
2. **Frontend**: Navigate to https://localhost:5173 and accept the certificate

### Browser-Specific Instructions:
- **Chrome/Edge**: Click "Advanced" → "Proceed to localhost (unsafe)"
- **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
- **Safari**: Click "Show Details" → "visit this website"

## Configuration Details

### Environment Variables

**Backend** (`.env` or `.env.local`):
- `HTTPS_ENABLED`: Enable HTTPS mode (default: `false`)
- `SSL_CERT_PATH`: Path to certificate file (default: `./certs/cert.pem`)
- `SSL_KEY_PATH`: Path to private key file (default: `./certs/key.pem`)

**Frontend** (`.env.local`):
- `VITE_HTTPS_ENABLED`: Enable HTTPS for Vite (default: `false`)
- `VITE_SSL_CERT_PATH`: Path to certificate file (default: `./certs/cert.pem`)
- `VITE_SSL_KEY_PATH`: Path to private key file (default: `./certs/key.pem`)
- `VITE_BACKEND_HTTPS`: Backend uses HTTPS (default: `false`)

### Features

- **Automatic Fallback**: Backend falls back to HTTP if certificates can't be loaded
- **WebSocket Support**: Both ws:// and wss:// protocols supported
- **API Proxy**: Frontend automatically proxies API calls to the correct backend protocol
- **CORS**: Both services accept HTTP and HTTPS origins

## Troubleshooting

### "Certificate Not Trusted" Warnings
This is expected with self-signed certificates. Accept them in your browser as described above.

### API Connection Issues
1. Ensure both services use matching protocols (both HTTP or both HTTPS)
2. Accept certificates for both frontend and backend URLs
3. Check that `VITE_BACKEND_HTTPS` matches your backend configuration

### Missing OpenSSL
- **macOS**: Should be pre-installed
- **Linux**: `sudo apt-get install openssl`
- **Windows**: Download from https://slproweb.com/products/Win32OpenSSL.html

### Port Conflicts
Default ports are 3000 (backend) and 5173 (frontend). Change via:
- Backend: `PORT=3001 npm run dev`
- Frontend: Update `vite.config.ts`

## Production Deployment

For production environments:
1. Use real SSL certificates from a Certificate Authority
2. Configure your reverse proxy (nginx, Apache) or cloud provider
3. Update all environment variables to production values
4. Ensure all API endpoints use HTTPS

## Security Notes

- Self-signed certificates are for **development only**
- Never commit certificates to version control (already in .gitignore)
- In production, use proper SSL certificates and security practices
- The `secure: false` proxy option is only for development with self-signed certs