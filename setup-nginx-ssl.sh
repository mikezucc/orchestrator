#!/bin/bash

# Exit on any error
set -e

echo "Setting up nginx with self-signed SSL certificates for slopbox.dev"

# Create directory for SSL certificates
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed certificate for slopbox.dev (frontend)
echo "Generating SSL certificate for slopbox.dev..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/slopbox.dev.key \
    -out /etc/nginx/ssl/slopbox.dev.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=slopbox.dev"

# Generate self-signed certificate for api.slopbox.dev (backend)
echo "Generating SSL certificate for api.slopbox.dev..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/api.slopbox.dev.key \
    -out /etc/nginx/ssl/api.slopbox.dev.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=api.slopbox.dev"

# Set proper permissions
sudo chmod 600 /etc/nginx/ssl/*.key
sudo chmod 644 /etc/nginx/ssl/*.crt

# Backup existing nginx configuration
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.backup.$(date +%Y%m%d%H%M%S)
fi

# Create nginx configuration
echo "Creating nginx configuration..."
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

# Remove default nginx site if exists
sudo rm -f /etc/nginx/sites-enabled/default

# Enable the new configuration
sudo ln -sf /etc/nginx/sites-available/slopbox /etc/nginx/sites-enabled/

# Test nginx configuration
echo "Testing nginx configuration..."
sudo nginx -t

# Reload nginx
echo "Reloading nginx..."
sudo systemctl reload nginx

echo "Setup complete!"
echo ""
echo "SSL certificates created:"
echo "  - /etc/nginx/ssl/slopbox.dev.crt"
echo "  - /etc/nginx/ssl/api.slopbox.dev.crt"
echo ""
echo "Your services should now be accessible at:"
echo "  - https://slopbox.dev (frontend on port 5173)"
echo "  - https://api.slopbox.dev (backend on port 3000)"
echo ""
echo "Note: Since these are self-signed certificates, browsers will show a security warning."
echo "You can add these domains to /etc/hosts if not already done:"
echo "  127.0.0.1 slopbox.dev"
echo "  127.0.0.1 api.slopbox.dev"