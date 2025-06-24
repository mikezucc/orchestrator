# Dynamic IP Configuration

This application supports dynamic IP/domain configuration, allowing it to work seamlessly when accessed from different network addresses without requiring code changes.

## Backend CORS Configuration

The backend dynamically reads allowed CORS origins from the `CORS_ORIGINS` environment variable.

### Configuration

Add the following to your `.env` file:

```bash
# Comma-separated list of allowed origins
CORS_ORIGINS=http://localhost:5173,https://localhost:5173,http://192.168.1.100:5173,http://myserver.local:5173
```

### Default Behavior

If `CORS_ORIGINS` is not set, the backend defaults to:
- `http://localhost:5173`
- `https://localhost:5173`
- `http://localhost:3000`
- `https://localhost:3000`
- `http://localhost` (port 80)
- `https://localhost` (port 443)

### Examples

```bash
# Local development only
CORS_ORIGINS=http://localhost:5173,https://localhost:5173

# Local network access
CORS_ORIGINS=http://localhost:5173,http://192.168.1.100:5173,http://192.168.1.100:3000

# Production domain (e.g., slopbox.dev)
CORS_ORIGINS=http://slopbox.dev,https://slopbox.dev,http://localhost:5173

# Multiple environments
CORS_ORIGINS=http://localhost:5173,https://app.example.com,http://staging.example.com
```

## Frontend Dynamic API URL

The frontend automatically detects the current hostname and configures the API URL accordingly.

### How it Works

1. **Production Mode**: Uses relative path `/api` (proxied by the web server)
2. **Development Mode**:
   - If accessed via `localhost` or `127.0.0.1`: Uses `http://localhost:3000/api`
   - If accessed via IP or hostname: Uses `http://<same-host>:3000/api`

### Examples

- Accessing `http://localhost:5173` → API: `http://localhost:3000/api`
- Accessing `http://192.168.1.100:5173` → API: `http://192.168.1.100:3000/api`
- Accessing `http://myserver.local:5173` → API: `http://myserver.local:3000/api`
- Accessing `https://app.example.com` (production) → API: `/api` (relative)

## WebSocket Connections

WebSocket connections (SSH terminal) also use dynamic host detection:

- Development: Connects to `ws://<hostname>:3000/ssh-ws`
- Production: Connects to `ws://<same-host>/ssh-ws`

## OAuth Redirect URLs

When using OAuth (Google, GitHub), make sure to update the redirect URLs in your OAuth app settings to match your access URL:

```bash
# Update these in your .env based on your access method
GOOGLE_REDIRECT_URI=http://192.168.1.100:3000/api/auth/google/callback
GITHUB_REDIRECT_URI=http://192.168.1.100:3000/api/github-auth/callback
FRONTEND_URL=http://192.168.1.100:5173
```

## Network Access Setup

To access the application from other devices on your network:

1. **Find your local IP address**:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Windows
   ipconfig | findstr /i "ipv4"
   ```

2. **Update your .env file**:
   ```bash
   # Add your IP to CORS origins
   CORS_ORIGINS=http://localhost:5173,http://YOUR_IP:5173
   
   # Update OAuth redirects if needed
   FRONTEND_URL=http://YOUR_IP:5173
   ```

3. **Start the services**:
   ```bash
   # Backend (will listen on all interfaces by default)
   cd packages/backend && npm run dev
   
   # Frontend (specify host to listen on all interfaces)
   cd packages/frontend && npm run dev -- --host 0.0.0.0
   ```

4. **Access from other devices**:
   - Open `http://YOUR_IP:5173` in a browser on another device

## Security Considerations

1. **CORS Origins**: Only add trusted origins to prevent unauthorized access
2. **HTTPS**: Use HTTPS in production environments
3. **Firewall**: Ensure your firewall rules allow access only from trusted networks
4. **OAuth**: Update OAuth app settings to include all valid redirect URLs

## Production Deployment with Custom Domain

When deploying to production with a custom domain (e.g., slopbox.dev):

### 1. Update Environment Variables

```bash
# CORS configuration for production domain
CORS_ORIGINS=http://slopbox.dev,https://slopbox.dev,http://www.slopbox.dev,https://www.slopbox.dev

# OAuth configuration
FRONTEND_URL=https://slopbox.dev
GOOGLE_REDIRECT_URI=https://api.slopbox.dev/api/auth/google/callback
GITHUB_REDIRECT_URI=https://api.slopbox.dev/api/github-auth/callback

# Frontend (optional - only if not using automatic detection)
VITE_API_URL=https://api.slopbox.dev/api
```

### API Subdomain Configuration

The application supports serving the API from a subdomain (e.g., api.slopbox.dev):

1. **Automatic Detection**: The frontend automatically detects when accessed from slopbox.dev and routes API calls to api.slopbox.dev

2. **Manual Configuration**: You can override this by setting `VITE_API_URL` in the frontend's .env file

3. **Certificate Requirements**: Ensure your SSL certificate includes api.slopbox.dev (the default multi-domain script includes this)

### 2. Web Server Configuration (Nginx example)

#### Frontend Server (slopbox.dev)
```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name slopbox.dev www.slopbox.dev;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;  # or serve static files in production
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Redirect API calls to api.slopbox.dev (optional if using subdomain)
    location /api {
        return 301 https://api.slopbox.dev$request_uri;
    }
}
```

#### API Server (api.slopbox.dev)
```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name api.slopbox.dev;

    ssl_certificate /path/to/cert.pem;  # Same cert that includes api.slopbox.dev
    ssl_certificate_key /path/to/key.pem;

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket for SSH
    location /ssh-ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check endpoint
    location / {
        return 200 'API Server Running';
        add_header Content-Type text/plain;
    }
}
```

#### Alternative: Single Server Configuration
If you prefer to run everything on one domain without the api subdomain:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name slopbox.dev www.slopbox.dev;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
    }

    # WebSocket for SSH
    location /ssh-ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 3. Update OAuth Applications

For Google OAuth:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Add authorized redirect URIs:
   - `https://api.slopbox.dev/api/auth/google/callback` (if using api subdomain)
   - `https://slopbox.dev/api/auth/google/callback` (if using single domain)
   - `http://api.slopbox.dev/api/auth/google/callback` (if supporting HTTP)

For GitHub OAuth:
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Update Authorization callback URL:
   - `https://api.slopbox.dev/api/github-auth/callback` (if using api subdomain)
   - `https://slopbox.dev/api/github-auth/callback` (if using single domain)

## Troubleshooting

1. **CORS Errors**: 
   - Check that your access URL is in `CORS_ORIGINS`
   - Restart the backend after updating `.env`
   - Ensure the protocol (http/https) matches exactly

2. **API Connection Failed**:
   - Verify the backend is running and accessible
   - Check firewall settings
   - Ensure the correct port (3000) is open
   - Check nginx/web server logs

3. **WebSocket Connection Failed**:
   - Check that WebSocket protocol matches (ws/wss)
   - Verify CORS configuration includes your origin
   - Ensure nginx properly proxies WebSocket connections

4. **OAuth Redirect Errors**:
   - Update OAuth app redirect URLs
   - Ensure `FRONTEND_URL` matches your access URL
   - Check that all redirect URLs use the correct protocol (http/https)