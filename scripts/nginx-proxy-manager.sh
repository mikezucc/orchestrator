#!/bin/bash

# Nginx Reverse Proxy Manager
# This script helps manage nginx reverse proxy configurations for different subdomains and protocols

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NGINX_SITES_PATH="/etc/nginx/sites-available"
NGINX_ENABLED_PATH="/etc/nginx/sites-enabled"
CONFIG_DB_FILE="$HOME/.nginx-proxy-configs.json"
DEFAULT_DOMAIN="slopbox.dev"
SSL_CERT_PATH="/etc/letsencrypt/live"

# Initialize config database if it doesn't exist
init_config_db() {
    if [ ! -f "$CONFIG_DB_FILE" ]; then
        echo "[]" > "$CONFIG_DB_FILE"
    fi
}

# Function to show help
show_help() {
    echo "Nginx Reverse Proxy Manager"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  add       Add a new reverse proxy configuration"
    echo "  remove    Remove an existing proxy configuration"
    echo "  list      List all proxy configurations"
    echo "  enable    Enable a proxy configuration"
    echo "  disable   Disable a proxy configuration"
    echo "  test      Test nginx configuration"
    echo "  reload    Reload nginx service"
    echo "  export    Export a configuration"
    echo "  import    Import a configuration"
    echo ""
    echo "Examples:"
    echo "  # Add a standard HTTP proxy"
    echo "  $0 add --subdomain app --port 3000"
    echo ""
    echo "  # Add a WebSocket proxy"
    echo "  $0 add --subdomain ws --port 8080 --type websocket"
    echo ""
    echo "  # Add a proxy with custom domain"
    echo "  $0 add --subdomain api --port 5000 --domain myapp.com"
    echo ""
    echo "  # Remove a proxy"
    echo "  $0 remove --subdomain app"
}

# Function to generate nginx config for standard HTTP proxy
generate_http_proxy_config() {
    local subdomain=$1
    local domain=$2
    local port=$3
    local ssl=$4
    local full_domain="${subdomain}.${domain}"
    
    local config="# HTTP Reverse Proxy for ${full_domain}
server {
    listen 80;
    server_name ${full_domain};
"

    if [ "$ssl" = "yes" ]; then
        config+="
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${full_domain};

    ssl_certificate ${SSL_CERT_PATH}/${domain}/fullchain.pem;
    ssl_certificate_key ${SSL_CERT_PATH}/${domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
"
    fi

    config+="
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}"

    echo "$config"
}

# Function to generate nginx config for WebSocket proxy
generate_websocket_proxy_config() {
    local subdomain=$1
    local domain=$2
    local port=$3
    local ssl=$4
    local full_domain="${subdomain}.${domain}"
    
    local config="# WebSocket Reverse Proxy for ${full_domain}
server {
    listen 80;
    server_name ${full_domain};
"

    if [ "$ssl" = "yes" ]; then
        config+="
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${full_domain};

    ssl_certificate ${SSL_CERT_PATH}/${domain}/fullchain.pem;
    ssl_certificate_key ${SSL_CERT_PATH}/${domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
"
    fi

    config+="
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket specific settings
        proxy_buffering off;
        proxy_request_buffering off;
        
        # Timeouts for long-lived connections
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}"

    echo "$config"
}

# Function to generate nginx config for TCP stream proxy
generate_tcp_proxy_config() {
    local subdomain=$1
    local domain=$2
    local port=$3
    local listen_port=$4
    
    # Note: This requires nginx stream module
    local config="# TCP Stream Proxy for ${subdomain}.${domain}
# Add this to /etc/nginx/nginx.conf in the main context (not http context)
# stream {
#     upstream ${subdomain}_backend {
#         server localhost:${port};
#     }
#     
#     server {
#         listen ${listen_port};
#         proxy_pass ${subdomain}_backend;
#         proxy_connect_timeout 1s;
#     }
# }"

    echo "$config"
}

# Function to add a new proxy configuration
add_proxy() {
    local subdomain=""
    local domain="$DEFAULT_DOMAIN"
    local port=""
    local type="http"
    local ssl="yes"
    local listen_port=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --subdomain)
                subdomain="$2"
                shift 2
                ;;
            --domain)
                domain="$2"
                shift 2
                ;;
            --port)
                port="$2"
                shift 2
                ;;
            --type)
                type="$2"
                shift 2
                ;;
            --no-ssl)
                ssl="no"
                shift
                ;;
            --listen-port)
                listen_port="$2"
                shift 2
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                return 1
                ;;
        esac
    done
    
    # Validate required parameters
    if [ -z "$subdomain" ] || [ -z "$port" ]; then
        echo -e "${RED}Error: --subdomain and --port are required${NC}"
        return 1
    fi
    
    # Generate configuration based on type
    local config=""
    local config_name="proxy-${subdomain}-${domain}"
    
    case $type in
        http)
            config=$(generate_http_proxy_config "$subdomain" "$domain" "$port" "$ssl")
            ;;
        websocket|ws|wss)
            config=$(generate_websocket_proxy_config "$subdomain" "$domain" "$port" "$ssl")
            ;;
        tcp)
            if [ -z "$listen_port" ]; then
                echo -e "${RED}Error: --listen-port is required for TCP proxy${NC}"
                return 1
            fi
            config=$(generate_tcp_proxy_config "$subdomain" "$domain" "$port" "$listen_port")
            echo -e "${YELLOW}Note: TCP proxy requires manual configuration in nginx.conf${NC}"
            ;;
        *)
            echo -e "${RED}Error: Unknown proxy type: $type${NC}"
            echo "Supported types: http, websocket (ws/wss), tcp"
            return 1
            ;;
    esac
    
    # Write configuration
    local config_path="${NGINX_SITES_PATH}/${config_name}"
    
    echo -e "${YELLOW}Creating proxy configuration...${NC}"
    echo "Subdomain: ${subdomain}.${domain}"
    echo "Backend Port: ${port}"
    echo "Type: ${type}"
    echo "SSL: ${ssl}"
    echo ""
    
    # Create backup if file exists
    if [ -f "$config_path" ]; then
        echo "Backing up existing configuration..."
        sudo cp "$config_path" "${config_path}.bak"
    fi
    
    # Write configuration
    echo "$config" | sudo tee "$config_path" > /dev/null
    
    # Create symlink in sites-enabled
    sudo ln -sf "$config_path" "${NGINX_ENABLED_PATH}/${config_name}"
    
    # Save to config database
    local entry="{\"subdomain\":\"$subdomain\",\"domain\":\"$domain\",\"port\":$port,\"type\":\"$type\",\"ssl\":\"$ssl\",\"enabled\":true,\"config_name\":\"$config_name\"}"
    local current_configs=$(cat "$CONFIG_DB_FILE")
    echo "$current_configs" | jq ". += [$entry]" > "$CONFIG_DB_FILE"
    
    echo -e "${GREEN}✓ Proxy configuration created successfully${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Test nginx configuration: $0 test"
    echo "2. Reload nginx: $0 reload"
    
    if [ "$ssl" = "yes" ]; then
        echo "3. Ensure SSL certificates exist for ${domain}"
        echo "   sudo certbot certonly --standalone -d ${subdomain}.${domain}"
    fi
}

# Function to remove a proxy configuration
remove_proxy() {
    local subdomain=""
    local domain="$DEFAULT_DOMAIN"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --subdomain)
                subdomain="$2"
                shift 2
                ;;
            --domain)
                domain="$2"
                shift 2
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                return 1
                ;;
        esac
    done
    
    if [ -z "$subdomain" ]; then
        echo -e "${RED}Error: --subdomain is required${NC}"
        return 1
    fi
    
    local config_name="proxy-${subdomain}-${domain}"
    local config_path="${NGINX_SITES_PATH}/${config_name}"
    local enabled_path="${NGINX_ENABLED_PATH}/${config_name}"
    
    echo -e "${YELLOW}Removing proxy configuration for ${subdomain}.${domain}...${NC}"
    
    # Remove files
    if [ -f "$config_path" ]; then
        sudo rm -f "$config_path"
        echo "✓ Removed configuration file"
    fi
    
    if [ -L "$enabled_path" ]; then
        sudo rm -f "$enabled_path"
        echo "✓ Removed enabled symlink"
    fi
    
    # Update config database
    local updated_configs=$(cat "$CONFIG_DB_FILE" | jq "map(select(.config_name != \"$config_name\"))")
    echo "$updated_configs" > "$CONFIG_DB_FILE"
    
    echo -e "${GREEN}✓ Proxy configuration removed${NC}"
    echo ""
    echo "Remember to reload nginx: $0 reload"
}

# Function to list all proxy configurations
list_proxies() {
    echo -e "${BLUE}=== Nginx Proxy Configurations ===${NC}"
    echo ""
    
    if [ ! -f "$CONFIG_DB_FILE" ] || [ "$(cat "$CONFIG_DB_FILE")" = "[]" ]; then
        echo "No proxy configurations found."
        return
    fi
    
    cat "$CONFIG_DB_FILE" | jq -r '.[] | "\(.subdomain).\(.domain) -> localhost:\(.port) [\(.type)] SSL:\(.ssl) Enabled:\(.enabled)"'
    
    echo ""
    echo -e "${YELLOW}Configuration files:${NC}"
    ls -la "$NGINX_SITES_PATH"/proxy-* 2>/dev/null || echo "No proxy configuration files found."
}

# Function to enable/disable a proxy
toggle_proxy() {
    local action=$1
    local subdomain=""
    local domain="$DEFAULT_DOMAIN"
    
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --subdomain)
                subdomain="$2"
                shift 2
                ;;
            --domain)
                domain="$2"
                shift 2
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                return 1
                ;;
        esac
    done
    
    if [ -z "$subdomain" ]; then
        echo -e "${RED}Error: --subdomain is required${NC}"
        return 1
    fi
    
    local config_name="proxy-${subdomain}-${domain}"
    local config_path="${NGINX_SITES_PATH}/${config_name}"
    local enabled_path="${NGINX_ENABLED_PATH}/${config_name}"
    
    if [ "$action" = "enable" ]; then
        if [ ! -f "$config_path" ]; then
            echo -e "${RED}Error: Configuration file not found${NC}"
            return 1
        fi
        
        sudo ln -sf "$config_path" "$enabled_path"
        
        # Update config database
        local updated_configs=$(cat "$CONFIG_DB_FILE" | jq "map(if .config_name == \"$config_name\" then .enabled = true else . end)")
        echo "$updated_configs" > "$CONFIG_DB_FILE"
        
        echo -e "${GREEN}✓ Proxy enabled${NC}"
    else
        if [ -L "$enabled_path" ]; then
            sudo rm -f "$enabled_path"
        fi
        
        # Update config database
        local updated_configs=$(cat "$CONFIG_DB_FILE" | jq "map(if .config_name == \"$config_name\" then .enabled = false else . end)")
        echo "$updated_configs" > "$CONFIG_DB_FILE"
        
        echo -e "${GREEN}✓ Proxy disabled${NC}"
    fi
}

# Function to test nginx configuration
test_nginx() {
    echo -e "${YELLOW}Testing nginx configuration...${NC}"
    if sudo nginx -t; then
        echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
        return 0
    else
        echo -e "${RED}✗ Nginx configuration test failed${NC}"
        return 1
    fi
}

# Function to reload nginx
reload_nginx() {
    echo -e "${YELLOW}Reloading nginx...${NC}"
    if sudo systemctl reload nginx || sudo service nginx reload; then
        echo -e "${GREEN}✓ Nginx reloaded successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to reload nginx${NC}"
        return 1
    fi
}

# Function to export a configuration
export_config() {
    local subdomain=""
    local domain="$DEFAULT_DOMAIN"
    local output=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --subdomain)
                subdomain="$2"
                shift 2
                ;;
            --domain)
                domain="$2"
                shift 2
                ;;
            --output)
                output="$2"
                shift 2
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                return 1
                ;;
        esac
    done
    
    if [ -z "$subdomain" ]; then
        echo -e "${RED}Error: --subdomain is required${NC}"
        return 1
    fi
    
    local config_name="proxy-${subdomain}-${domain}"
    local config_path="${NGINX_SITES_PATH}/${config_name}"
    
    if [ ! -f "$config_path" ]; then
        echo -e "${RED}Error: Configuration not found${NC}"
        return 1
    fi
    
    if [ -z "$output" ]; then
        output="${config_name}.conf"
    fi
    
    sudo cp "$config_path" "$output"
    sudo chown $(whoami):$(whoami) "$output"
    
    echo -e "${GREEN}✓ Configuration exported to: $output${NC}"
}

# Function to import a configuration
import_config() {
    local input=""
    local subdomain=""
    local domain="$DEFAULT_DOMAIN"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --input)
                input="$2"
                shift 2
                ;;
            --subdomain)
                subdomain="$2"
                shift 2
                ;;
            --domain)
                domain="$2"
                shift 2
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                return 1
                ;;
        esac
    done
    
    if [ -z "$input" ] || [ -z "$subdomain" ]; then
        echo -e "${RED}Error: --input and --subdomain are required${NC}"
        return 1
    fi
    
    if [ ! -f "$input" ]; then
        echo -e "${RED}Error: Input file not found${NC}"
        return 1
    fi
    
    local config_name="proxy-${subdomain}-${domain}"
    local config_path="${NGINX_SITES_PATH}/${config_name}"
    
    echo -e "${YELLOW}Importing configuration...${NC}"
    
    # Copy configuration
    sudo cp "$input" "$config_path"
    
    # Create symlink
    sudo ln -sf "$config_path" "${NGINX_ENABLED_PATH}/${config_name}"
    
    echo -e "${GREEN}✓ Configuration imported${NC}"
    echo "Remember to:"
    echo "1. Update the config database manually if needed"
    echo "2. Test nginx configuration: $0 test"
    echo "3. Reload nginx: $0 reload"
}

# Main command handler
main() {
    # Check if running without arguments
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required but not installed${NC}"
        echo "Install with: sudo apt-get install jq"
        exit 1
    fi
    
    # Initialize config database
    init_config_db
    
    # Process command
    case $1 in
        add)
            shift
            add_proxy "$@"
            ;;
        remove|rm)
            shift
            remove_proxy "$@"
            ;;
        list|ls)
            list_proxies
            ;;
        enable)
            shift
            toggle_proxy "enable" "$@"
            ;;
        disable)
            shift
            toggle_proxy "disable" "$@"
            ;;
        test)
            test_nginx
            ;;
        reload)
            reload_nginx
            ;;
        export)
            shift
            export_config "$@"
            ;;
        import)
            shift
            import_config "$@"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo -e "${RED}Unknown command: $1${NC}"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"