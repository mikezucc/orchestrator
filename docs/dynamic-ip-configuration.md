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

### Examples

```bash
# Local development only
CORS_ORIGINS=http://localhost:5173,https://localhost:5173

# Local network access
CORS_ORIGINS=http://localhost:5173,http://192.168.1.100:5173,http://192.168.1.100:3000

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

## Troubleshooting

1. **CORS Errors**: 
   - Check that your access URL is in `CORS_ORIGINS`
   - Restart the backend after updating `.env`

2. **API Connection Failed**:
   - Verify the backend is running and accessible
   - Check firewall settings
   - Ensure the correct port (3000) is open

3. **WebSocket Connection Failed**:
   - Check that WebSocket protocol matches (ws/wss)
   - Verify CORS configuration includes your origin

4. **OAuth Redirect Errors**:
   - Update OAuth app redirect URLs
   - Ensure `FRONTEND_URL` matches your access URL