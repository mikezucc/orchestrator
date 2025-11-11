#!/bin/bash

# Exit on any error
set -e

echo "Setting up nginx with self-signed SSL certificates for onfacet.dev"

# Create directory for SSL certificates
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed certificate for onfacet.dev (frontend)
echo "Generating SSL certificate for onfacet.dev..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/onfacet.dev.key \
    -out /etc/nginx/ssl/onfacet.dev.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=onfacet.dev"

# Generate self-signed certificate for api.onfacet.dev (backend)
echo "Generating SSL certificate for api.onfacet.dev..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/api.onfacet.dev.key \
    -out /etc/nginx/ssl/api.onfacet.dev.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=api.onfacet.dev"

# Set proper permissions
sudo chmod 600 /etc/nginx/ssl/*.key
sudo chmod 644 /etc/nginx/ssl/*.crt

# Backup and remove ALL existing nginx configurations
echo "Backing up and removing existing nginx configurations..."
sudo mkdir -p /etc/nginx/backup-$(date +%Y%m%d%H%M%S)
if [ -d /etc/nginx/sites-enabled ]; then
    sudo cp -r /etc/nginx/sites-enabled/* /etc/nginx/backup-$(date +%Y%m%d%H%M%S)/ 2>/dev/null || true
fi
if [ -d /etc/nginx/sites-available ]; then
    sudo cp -r /etc/nginx/sites-available/* /etc/nginx/backup-$(date +%Y%m%d%H%M%S)/ 2>/dev/null || true
fi

# Remove all existing site configurations
sudo rm -f /etc/nginx/sites-enabled/*
sudo rm -f /etc/nginx/sites-available/*

# Create nginx configuration
echo "Creating nginx configuration..."
sudo tee /etc/nginx/sites-available/slopbox > /dev/null << 'EOF'
# Frontend - onfacet.dev
server {
    listen 80;
    server_name onfacet.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name onfacet.dev;

    ssl_certificate /etc/nginx/ssl/onfacet.dev.crt;
    ssl_certificate_key /etc/nginx/ssl/onfacet.dev.key;

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

# Backend API - api.onfacet.dev
server {
    listen 80;
    server_name api.onfacet.dev;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.onfacet.dev;

    ssl_certificate /etc/nginx/ssl/api.onfacet.dev.crt;
    ssl_certificate_key /etc/nginx/ssl/api.onfacet.dev.key;

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

# No need to remove default - already cleared above

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
echo "  - /etc/nginx/ssl/onfacet.dev.crt"
echo "  - /etc/nginx/ssl/api.onfacet.dev.crt"
echo ""
echo "Your services should now be accessible at:"
echo "  - https://onfacet.dev (frontend on port 5173)"
echo "  - https://api.onfacet.dev (backend on port 3000)"
echo ""
echo "Note: Since these are self-signed certificates, browsers will show a security warning."
echo "You can add these domains to /etc/hosts if not already done:"
echo "  127.0.0.1 onfacet.dev"
echo "  127.0.0.1 api.onfacet.dev"