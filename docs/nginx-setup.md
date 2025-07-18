# Nginx Configuration Setup

This guide provides scripts and instructions for setting up nginx to serve the DevBox Orchestrator application.

## Quick Setup

We provide two nginx setup scripts:

1. **API Subdomain Setup** (`setup-nginx.sh`) - Serves API from api.onfacet.dev
2. **Simple Setup** (`setup-nginx-simple.sh`) - Serves everything from one domain

### Option 1: API Subdomain Configuration (Recommended)

This setup serves:
- Frontend from `onfacet.dev` 
- API from `api.onfacet.dev`

```bash
# Basic setup
sudo ./scripts/setup-nginx.sh

# With custom domain
sudo ./scripts/setup-nginx.sh --domain myapp.com

# With self-signed certificates
sudo ./scripts/setup-nginx.sh --self-signed

# Custom ports
sudo ./scripts/setup-nginx.sh --frontend-port 8080 --backend-port 3001
```

### Option 2: Simple Single Domain Configuration

This setup serves both frontend and API from the same domain:

```bash
# Basic setup
sudo ./scripts/setup-nginx-simple.sh

# With custom domain
sudo ./scripts/setup-nginx-simple.sh --domain myapp.com

# Without SSL
sudo ./scripts/setup-nginx-simple.sh --no-ssl
```

## Script Options

Both scripts support these options:

- `--domain DOMAIN` - Set the main domain (default: onfacet.dev)
- `--frontend-port PORT` - Frontend port (default: 5173)
- `--backend-port PORT` - Backend port (default: 3000)
- `--no-ssl` - Disable SSL configuration
- `--self-signed` - Use self-signed certificates from the project
- `--help` - Show help message

## Prerequisites

1. **Install nginx**:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install nginx

   # CentOS/RHEL
   sudo yum install nginx
   ```

2. **SSL Certificates**:
   - For production: Use Let's Encrypt (see below)
   - For development: Generate self-signed certificates with `npm run generate-certs:multi`

## SSL Certificate Setup

### Option 1: Let's Encrypt (Production)

```bash
# Install certbot
sudo apt-get install certbot

# For API subdomain setup
sudo certbot certonly --standalone -d onfacet.dev -d www.onfacet.dev -d api.onfacet.dev

# For simple setup
sudo certbot certonly --standalone -d onfacet.dev -d www.onfacet.dev
```

### Option 2: Self-Signed Certificates (Development)

```bash
# Generate certificates including all domains
cd packages/backend
npm run generate-certs:multi

# Then use --self-signed flag with setup script
sudo ./scripts/setup-nginx.sh --self-signed
```

## DNS Configuration

### For API Subdomain Setup
Create these DNS records:
- `A` record: `onfacet.dev` → Your server IP
- `A` record: `www.onfacet.dev` → Your server IP  
- `A` record: `api.onfacet.dev` → Your server IP

### For Simple Setup
Create these DNS records:
- `A` record: `onfacet.dev` → Your server IP
- `A` record: `www.onfacet.dev` → Your server IP

## Environment Variables

After running the setup script, update your `.env` files:

### Backend (.env)

For API subdomain setup:
```bash
CORS_ORIGINS=https://onfacet.dev,https://www.onfacet.dev
FRONTEND_URL=https://onfacet.dev
GOOGLE_REDIRECT_URI=https://api.onfacet.dev/api/auth/google/callback
GITHUB_REDIRECT_URI=https://api.onfacet.dev/api/github-auth/callback
```

For simple setup:
```bash
CORS_ORIGINS=https://onfacet.dev,https://www.onfacet.dev
FRONTEND_URL=https://onfacet.dev
GOOGLE_REDIRECT_URI=https://onfacet.dev/api/auth/google/callback
GITHUB_REDIRECT_URI=https://onfacet.dev/api/github-auth/callback
```

### Frontend (.env) - Optional

Only needed if automatic API detection isn't working:
```bash
# For API subdomain
VITE_API_URL=https://api.onfacet.dev/api

# For simple setup - leave empty (uses relative /api)
VITE_API_URL=
```

## Manual Configuration

If you prefer to configure nginx manually, the scripts create these files:

### API Subdomain Setup
- `/etc/nginx/sites-available/orchestrator-frontend` - Frontend server
- `/etc/nginx/sites-available/orchestrator-api` - API server

### Simple Setup
- `/etc/nginx/sites-available/orchestrator` - Combined configuration

## Troubleshooting

### Check nginx status
```bash
sudo systemctl status nginx
sudo nginx -t  # Test configuration
```

### View nginx logs
```bash
# Error logs
sudo tail -f /var/log/nginx/error.log

# Access logs
sudo tail -f /var/log/nginx/access.log
```

### Common Issues

1. **Port already in use**:
   - Check what's using the port: `sudo lsof -i :80`
   - Stop conflicting service or use different ports

2. **Permission denied**:
   - Run the setup script with sudo
   - Ensure nginx user can access certificate files

3. **502 Bad Gateway**:
   - Ensure backend is running on correct port
   - Check backend logs
   - Verify CORS configuration

4. **Certificate errors**:
   - Ensure certificate includes all domains
   - Check certificate paths in nginx config
   - For self-signed, accept certificate in browser

## Security Considerations

1. **Firewall**: Only open necessary ports (80, 443)
2. **SSL**: Always use HTTPS in production
3. **Headers**: The scripts include security headers
4. **CORS**: Only allow trusted origins

## Removing Configuration

To remove the nginx configuration:

```bash
# Remove configurations
sudo rm /etc/nginx/sites-enabled/orchestrator*
sudo rm /etc/nginx/sites-available/orchestrator*

# Reload nginx
sudo systemctl reload nginx
```