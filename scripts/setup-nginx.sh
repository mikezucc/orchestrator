#!/bin/bash

# Setup nginx configuration for slopbox.dev and api.slopbox.dev
# This script creates nginx configuration files for the orchestrator

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
DOMAIN="slopbox.dev"
API_SUBDOMAIN="api.slopbox.dev"
FRONTEND_PORT="5173"
BACKEND_PORT="3000"
SSL_CERT_PATH="/etc/letsencrypt/live/slopbox.dev/fullchain.pem"
SSL_KEY_PATH="/etc/letsencrypt/live/slopbox.dev/privkey.pem"
USE_SSL="yes"
NGINX_SITES_PATH="/etc/nginx/sites-available"
NGINX_ENABLED_PATH="/etc/nginx/sites-enabled"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)
      DOMAIN="$2"
      API_SUBDOMAIN="api.$2"
      shift 2
      ;;
    --frontend-port)
      FRONTEND_PORT="$2"
      shift 2
      ;;
    --backend-port)
      BACKEND_PORT="$2"
      shift 2
      ;;
    --no-ssl)
      USE_SSL="no"
      shift
      ;;
    --self-signed)
      SSL_CERT_PATH="$(pwd)/packages/backend/certs/cert.pem"
      SSL_KEY_PATH="$(pwd)/packages/backend/certs/key.pem"
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --domain DOMAIN          Set the main domain (default: slopbox.dev)"
      echo "  --frontend-port PORT     Frontend port (default: 5173)"
      echo "  --backend-port PORT      Backend port (default: 3000)"
      echo "  --no-ssl                 Disable SSL configuration"
      echo "  --self-signed            Use self-signed certificates from the project"
      echo "  --help                   Show this help message"
      echo ""
      echo "Example:"
      echo "  $0 --domain myapp.com --self-signed"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}Setting up nginx configuration for orchestrator${NC}"
echo "Domain: $DOMAIN"
echo "API Subdomain: $API_SUBDOMAIN"
echo "Frontend Port: $FRONTEND_PORT"
echo "Backend Port: $BACKEND_PORT"
echo "SSL Enabled: $USE_SSL"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${YELLOW}Warning: This script should be run as root for nginx configuration${NC}"
   echo "You can run: sudo $0 $@"
   echo ""
fi

# Create frontend configuration
FRONTEND_CONFIG="# Frontend configuration for $DOMAIN
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
"

if [ "$USE_SSL" = "yes" ]; then
    FRONTEND_CONFIG+="
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate $SSL_CERT_PATH;
    ssl_certificate_key $SSL_KEY_PATH;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
"
fi

FRONTEND_CONFIG+="
    # Frontend proxy
    location / {
        proxy_pass http://localhost:$FRONTEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Optional: Redirect /api to api subdomain
    location /api {
        return 301 https://$API_SUBDOMAIN\$request_uri;
    }
}"

# Create API configuration
API_CONFIG="# API configuration for $API_SUBDOMAIN
server {
    listen 80;
    server_name $API_SUBDOMAIN;
"

if [ "$USE_SSL" = "yes" ]; then
    API_CONFIG+="
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $API_SUBDOMAIN;

    ssl_certificate $SSL_CERT_PATH;
    ssl_certificate_key $SSL_KEY_PATH;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
"
fi

API_CONFIG+="
    # API proxy
    location /api {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CORS headers (nginx handles preflight)
        add_header 'Access-Control-Allow-Origin' 'https://$DOMAIN' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, x-user-id, x-organization-id' always;
        
        if (\$request_method = 'OPTIONS') {
            return 204;
        }
    }

    # WebSocket for SSH
    location /ssh-ws {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check
    location / {
        return 200 'API Server Running';
        add_header Content-Type text/plain;
    }
}"

# Function to write config file
write_config() {
    local config_name=$1
    local config_content=$2
    local config_path="${NGINX_SITES_PATH}/${config_name}"
    
    echo -e "${YELLOW}Creating ${config_name} configuration...${NC}"
    
    # Create backup if file exists
    if [ -f "$config_path" ]; then
        echo "Backing up existing configuration to ${config_path}.bak"
        sudo cp "$config_path" "${config_path}.bak"
    fi
    
    # Write configuration
    echo "$config_content" | sudo tee "$config_path" > /dev/null
    
    # Create symlink in sites-enabled
    sudo ln -sf "$config_path" "${NGINX_ENABLED_PATH}/${config_name}"
    
    echo -e "${GREEN}✓ Created ${config_name}${NC}"
}

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}nginx is not installed. Please install nginx first.${NC}"
    echo "On Ubuntu/Debian: sudo apt-get install nginx"
    echo "On CentOS/RHEL: sudo yum install nginx"
    exit 1
fi

# Create nginx sites directories if they don't exist
sudo mkdir -p "$NGINX_SITES_PATH" "$NGINX_ENABLED_PATH"

# Write configurations
write_config "orchestrator-frontend" "$FRONTEND_CONFIG"
write_config "orchestrator-api" "$API_CONFIG"

# Test nginx configuration
echo -e "${YELLOW}Testing nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
    
    # Reload nginx
    echo -e "${YELLOW}Reloading nginx...${NC}"
    if sudo systemctl reload nginx || sudo service nginx reload; then
        echo -e "${GREEN}✓ Nginx reloaded successfully${NC}"
    else
        echo -e "${RED}Failed to reload nginx. You may need to reload manually.${NC}"
    fi
else
    echo -e "${RED}Nginx configuration test failed. Please check the configuration.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Ensure DNS records point to this server:"
echo "   - $DOMAIN → $(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")"
echo "   - $API_SUBDOMAIN → $(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")"
echo ""

if [ "$USE_SSL" = "yes" ] && [[ "$SSL_CERT_PATH" == *"letsencrypt"* ]]; then
    echo "2. Obtain SSL certificates with Let's Encrypt:"
    echo "   sudo certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN -d $API_SUBDOMAIN"
    echo ""
fi

echo "3. Update your .env files:"
echo ""
echo "Backend (.env):"
echo "CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,https://$API_SUBDOMAIN"
echo "FRONTEND_URL=https://$DOMAIN"
echo "GOOGLE_REDIRECT_URI=https://$API_SUBDOMAIN/api/auth/google/callback"
echo "GITHUB_REDIRECT_URI=https://$API_SUBDOMAIN/api/github-auth/callback"
echo ""
echo "Frontend (.env):"
echo "VITE_API_URL=https://$API_SUBDOMAIN/api  # Optional - auto-detection should work"
echo ""
echo "4. Start the services:"
echo "   cd packages/backend && npm run dev"
echo "   cd packages/frontend && npm run dev"
echo ""

# Create a simple config summary file
SUMMARY_FILE="nginx-setup-summary.txt"
cat > "$SUMMARY_FILE" << EOF
Nginx Setup Summary
==================
Date: $(date)
Domain: $DOMAIN
API Subdomain: $API_SUBDOMAIN
Frontend Port: $FRONTEND_PORT
Backend Port: $BACKEND_PORT
SSL Enabled: $USE_SSL

Configuration files created:
- ${NGINX_SITES_PATH}/orchestrator-frontend
- ${NGINX_SITES_PATH}/orchestrator-api

Symlinks created:
- ${NGINX_ENABLED_PATH}/orchestrator-frontend
- ${NGINX_ENABLED_PATH}/orchestrator-api

Environment variables to set:
Backend:
  CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,https://$API_SUBDOMAIN
  FRONTEND_URL=https://$DOMAIN
  GOOGLE_REDIRECT_URI=https://$API_SUBDOMAIN/api/auth/google/callback
  GITHUB_REDIRECT_URI=https://$API_SUBDOMAIN/api/github-auth/callback

Frontend (optional):
  VITE_API_URL=https://$API_SUBDOMAIN/api
EOF

echo "Configuration summary saved to: $SUMMARY_FILE"