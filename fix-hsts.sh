#!/bin/bash

echo "Fixing HSTS issues for slopbox.dev"
echo ""
echo "To clear HSTS in Chrome:"
echo "1. Go to chrome://net-internals/#hsts"
echo "2. In 'Delete domain security policies', enter: slopbox.dev"
echo "3. Click 'Delete'"
echo "4. Also delete: api.slopbox.dev"
echo ""
echo "Alternative: Use a different browser or incognito mode"
echo ""
echo "Updating nginx configuration to avoid HSTS issues..."

# Update nginx configuration without HSTS headers
sudo tee /etc/nginx/sites-available/slopbox > /dev/null << 'EOF'
# Frontend - slopbox.dev
server {
    listen 80;
    server_name slopbox.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name slopbox.dev;

    ssl_certificate /etc/nginx/ssl/slopbox.dev.crt;
    ssl_certificate_key /etc/nginx/ssl/slopbox.dev.key;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Disable HSTS for development
    # add_header Strict-Transport-Security "max-age=0" always;

    # Proxy settings for frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Handle WebSocket connections for Vite HMR
        proxy_read_timeout 86400;
    }
}

# Backend API - api.slopbox.dev
server {
    listen 80;
    server_name api.slopbox.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.slopbox.dev;

    ssl_certificate /etc/nginx/ssl/api.slopbox.dev.crt;
    ssl_certificate_key /etc/nginx/ssl/api.slopbox.dev.key;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Disable HSTS for development
    # add_header Strict-Transport-Security "max-age=0" always;

    # Proxy settings for backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Test and reload nginx
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "Nginx configuration updated!"
echo "Now follow the Chrome instructions above to clear HSTS cache."