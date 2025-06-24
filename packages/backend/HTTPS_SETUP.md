# HTTPS Setup Guide

This backend server supports both HTTP and HTTPS modes. By default, it runs in HTTP mode for simplicity during development.

## Quick Start

1. Generate self-signed certificates (for development only):
   ```bash
   npm run generate-certs
   ```

2. Enable HTTPS in your `.env` file:
   ```env
   HTTPS_ENABLED=true
   SSL_CERT_PATH=./certs/cert.pem
   SSL_KEY_PATH=./certs/key.pem
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

The server will now run on `https://localhost:3000`

## Configuration

### Environment Variables

- `HTTPS_ENABLED`: Set to `true` to enable HTTPS mode (default: `false`)
- `SSL_CERT_PATH`: Path to SSL certificate file (default: `./certs/cert.pem`)
- `SSL_KEY_PATH`: Path to SSL private key file (default: `./certs/key.pem`)

### CORS Configuration

The server automatically allows both HTTP and HTTPS origins for localhost development:
- `http://localhost:5173` and `https://localhost:5173` (Vite dev server)
- `http://localhost:3000` and `https://localhost:3000` (Backend server)

## Production Setup

For production, you should:

1. Use proper SSL certificates from a Certificate Authority (CA) instead of self-signed certificates
2. Update the certificate paths in your production environment variables
3. Consider using a reverse proxy (nginx, Apache) or cloud load balancer for SSL termination

## Troubleshooting

### Certificate Errors
If you see certificate errors when accessing the HTTPS server:
1. Accept the self-signed certificate in your browser (for development only)
2. For API clients, you may need to set `NODE_TLS_REJECT_UNAUTHORIZED=0` (development only)

### Missing OpenSSL
If the certificate generation fails:
- **macOS**: OpenSSL should be pre-installed
- **Linux**: Install with `sudo apt-get install openssl` (Ubuntu/Debian) or equivalent
- **Windows**: Install OpenSSL from https://slproweb.com/products/Win32OpenSSL.html

### Fallback to HTTP
If SSL certificates cannot be loaded, the server will automatically fall back to HTTP mode with a warning message.