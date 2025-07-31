export interface NginxTemplateParams {
  type: "http" | "websocket";
  isAPI?: boolean;
  hostname: string;
  internalPort: string;
  customHeaderNames?: string[];
  certPathPublicKey?: string;
  certPathPrivateKey?: string;
  enableSSL?: boolean;
  forceSSL?: boolean;
}

// Example cert path names:
// ssl_certificate /etc/nginx/ssl/slopbox.dev.cert.key.pem;
// ssl_certificate_key /etc/nginx/ssl/slopbox.dev.private.key.pem;

const renderTemplateSection = ({
  type,
  isAPI,
  hostname,
  customHeaderNames = [],
  internalPort,
  certPathPublicKey,
  certPathPrivateKey,
  enableSSL = false,
  forceSSL = false
}: NginxTemplateParams) => {
  const configs = [];

  // HTTP server (port 80)
  if (!enableSSL || forceSSL) {
    configs.push(`server {
    listen 80;
    server_name ${hostname};
${forceSSL && enableSSL ? `
    # Redirect all HTTP traffic to HTTPS
    return 301 https://$server_name$request_uri;` : `
    location / {
        proxy_pass http://127.0.0.1:${internalPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings
        proxy_read_timeout 360s;
        proxy_send_timeout 360s;
        proxy_connect_timeout 360s;
        
        # Disable buffering for WebSocket
        ${type === 'websocket' ? 'proxy_buffering off;' : ''}

        ${isAPI ? `
        if ($request_method = OPTIONS ) {
            add_header 'Access-Control-Allow-Origin'  'https://${hostname}';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, HEAD, PUT';
            add_header 'Access-Control-Allow-Headers' 'Authorization, Origin, X-Requested-With, Content-Type, Accept${customHeaderNames.length > 0 ? ', ' : ''}${customHeaderNames.join(', ')}';
            return 200;
        }` : ''}
    }`}
}`);
  }

  // HTTPS server (port 443)
  if (enableSSL && certPathPublicKey && certPathPrivateKey) {
    configs.push(`server {
    listen 443 ssl http2;
    server_name ${hostname};

    ssl_certificate ${certPathPublicKey};
    ssl_certificate_key ${certPathPrivateKey};

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    location / {
        proxy_pass http://127.0.0.1:${internalPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings
        proxy_read_timeout 360s;
        proxy_send_timeout 360s;
        proxy_connect_timeout 360s;
        
        # Disable buffering for WebSocket
        ${type === 'websocket' ? 'proxy_buffering off;' : ''}

        ${isAPI ? `
        if ($request_method = OPTIONS ) {
            add_header 'Access-Control-Allow-Origin'  'https://${hostname}';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, HEAD, PUT';
            add_header 'Access-Control-Allow-Headers' 'Authorization, Origin, X-Requested-With, Content-Type, Accept${customHeaderNames.length > 0 ? ', ' : ''}${customHeaderNames.join(', ')}';
            return 200;
        }` : ''}
    }
}`);
  }

  return configs.join('\n\n');
};

export const renderNginxConfigFileContent = (services: NginxTemplateParams[]) => {
  return services.map(renderTemplateSection).join('\n\n');
};
