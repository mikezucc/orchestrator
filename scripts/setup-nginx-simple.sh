#!/bin/bash

# Simple nginx configuration for single domain setup (no api subdomain)
# This script creates a single nginx configuration file for the orchestrator

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
DOMAIN="slopbox.dev"
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
      echo "  --domain DOMAIN          Set the domain (default: slopbox.dev)"
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

echo -e "${GREEN}Setting up simple nginx configuration for orchestrator${NC}"
echo "Domain: $DOMAIN"
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

# Create configuration
CONFIG="# Orchestrator configuration for $DOMAIN
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
"

if [ "$USE_SSL" = "yes" ]; then
    CONFIG+="
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

CONFIG+="
    # Frontend
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

    # Backend API
    location /api {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
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
}"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}nginx is not installed. Please install nginx first.${NC}"
    echo "On Ubuntu/Debian: sudo apt-get install nginx"
    echo "On CentOS/RHEL: sudo yum install nginx"
    exit 1
fi

# Create nginx sites directories if they don't exist
sudo mkdir -p "$NGINX_SITES_PATH" "$NGINX_ENABLED_PATH"

# Write configuration
CONFIG_NAME="orchestrator"
CONFIG_PATH="${NGINX_SITES_PATH}/${CONFIG_NAME}"

echo -e "${YELLOW}Creating nginx configuration...${NC}"

# Create backup if file exists
if [ -f "$CONFIG_PATH" ]; then
    echo "Backing up existing configuration to ${CONFIG_PATH}.bak"
    sudo cp "$CONFIG_PATH" "${CONFIG_PATH}.bak"
fi

# Write configuration
echo "$CONFIG" | sudo tee "$CONFIG_PATH" > /dev/null

# Create symlink in sites-enabled
sudo ln -sf "$CONFIG_PATH" "${NGINX_ENABLED_PATH}/${CONFIG_NAME}"

echo -e "${GREEN}✓ Created ${CONFIG_NAME} configuration${NC}"

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
echo "   - www.$DOMAIN → $(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")"
echo ""

if [ "$USE_SSL" = "yes" ] && [[ "$SSL_CERT_PATH" == *"letsencrypt"* ]]; then
    echo "2. Obtain SSL certificates with Let's Encrypt:"
    echo "   sudo certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN"
    echo ""
fi

echo "3. Update your .env files:"
echo ""
echo "Backend (.env):"
echo "CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN"
echo "FRONTEND_URL=https://$DOMAIN"
echo "GOOGLE_REDIRECT_URI=https://$DOMAIN/api/auth/google/callback"
echo "GITHUB_REDIRECT_URI=https://$DOMAIN/api/github-auth/callback"
echo ""
echo "4. Start the services:"
echo "   cd packages/backend && npm run dev"
echo "   cd packages/frontend && npm run dev"