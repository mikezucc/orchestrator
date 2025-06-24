# SSL Certificate Configuration

## Overview

The application supports HTTPS with self-signed certificates for development and can be configured for production domains like slopbox.dev.

## Certificate Generation

### For localhost only (default)

```bash
# Backend
cd packages/backend && npm run generate-certs

# Frontend  
cd packages/frontend && npm run generate-certs
```

### For multiple domains (including slopbox.dev)

```bash
# Backend - generates certificate for localhost, slopbox.dev, *.slopbox.dev
cd packages/backend && npm run generate-certs:multi

# Frontend - same domains
cd packages/frontend && npm run generate-certs:multi

# Or specify custom domains
npm run generate-certs:multi example.com *.example.com 192.168.1.100

# Force regenerate existing certificates
npm run generate-certs:multi --force
```

## What the Multi-Domain Certificate Includes

The multi-domain certificate script creates a certificate with Subject Alternative Names (SAN) that includes:

- `localhost` - For local development
- `slopbox.dev` - Main domain
- `*.slopbox.dev` - Wildcard for subdomains (www.slopbox.dev, etc.)
- `api.slopbox.dev` - API subdomain (explicitly included for clarity)

You can add additional domains by passing them as arguments:

```bash
npm run generate-certs:multi localhost slopbox.dev *.slopbox.dev myapp.local 192.168.1.100
```

## Certificate Details

The generated certificates:
- Use RSA 4096-bit encryption
- Valid for 365 days
- Include Subject Alternative Names (SAN) for multiple domains
- Are self-signed (will show browser warning)

## Production Considerations

### For slopbox.dev Production

1. **Option 1: Use Let's Encrypt (Recommended)**
   ```bash
   # Install certbot
   sudo apt-get install certbot
   
   # Get certificate for slopbox.dev
   sudo certbot certonly --standalone -d slopbox.dev -d www.slopbox.dev
   ```

2. **Option 2: Use the self-signed certificate**
   - Generate with: `npm run generate-certs:multi`
   - Users will need to accept the certificate warning

### Nginx Configuration for slopbox.dev

```nginx
server {
    listen 443 ssl http2;
    server_name slopbox.dev www.slopbox.dev;

    # For Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/slopbox.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/slopbox.dev/privkey.pem;
    
    # Or for self-signed
    # ssl_certificate /path/to/orchestrator/packages/backend/certs/cert.pem;
    # ssl_certificate_key /path/to/orchestrator/packages/backend/certs/key.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # ... rest of configuration
}
```

## Browser Certificate Acceptance

When using self-signed certificates:

1. **Chrome**: Click "Advanced" → "Proceed to slopbox.dev (unsafe)"
2. **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
3. **Safari**: Click "Show Details" → "visit this website"

## Troubleshooting

### Certificate Not Working for slopbox.dev

1. Ensure the certificate was generated with slopbox.dev in the domains:
   ```bash
   # Check certificate domains
   openssl x509 -in packages/backend/certs/cert.pem -text -noout | grep -A 1 "Subject Alternative Name"
   ```

2. Verify the certificate includes your domain:
   - Should show: `DNS:localhost, DNS:slopbox.dev, DNS:*.slopbox.dev`

### Browser Still Shows Warning

This is expected for self-signed certificates. Options:
1. Accept the certificate exception in your browser
2. Add the certificate to your system's trusted certificates
3. Use Let's Encrypt for a trusted certificate

### Adding Certificate to System Trust (Development)

**macOS**:
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain packages/backend/certs/cert.pem
```

**Ubuntu/Debian**:
```bash
sudo cp packages/backend/certs/cert.pem /usr/local/share/ca-certificates/slopbox-dev.crt
sudo update-ca-certificates
```

**Windows** (PowerShell as Administrator):
```powershell
Import-Certificate -FilePath "packages\backend\certs\cert.pem" -CertStoreLocation Cert:\LocalMachine\Root
```

## Environment Variables

After generating certificates, update your `.env`:

```bash
# Backend
HTTPS_ENABLED=true
SSL_CERT_PATH=./certs/cert.pem
SSL_KEY_PATH=./certs/key.pem

# Frontend
VITE_HTTPS_ENABLED=true
VITE_SSL_CERT_PATH=./certs/cert.pem
VITE_SSL_KEY_PATH=./certs/key.pem
```