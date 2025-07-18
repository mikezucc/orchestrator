export interface NginxTemplateParams {
  type: "http" | "websocket";
  isAPI?: boolean;
  hostname: string;
  internalPort: string;
  customHeaderNames?: string[];
  certPathPublicKey: string;
  certPathPrivateKey: string;
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
  certPathPrivateKey
}: NginxTemplateParams) => {
  return `server {
    listen 443 ssl http2;
    server_name ${hostname};

    ssl_certificate ${certPathPublicKey};
    ssl_certificate_key ${certPathPrivateKey};

    # SSL configuration
    
    # WebSocket specific settings
    location / {
        proxy_pass http://127.0.0.1:${internalPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout settings
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
}`;
};

export const renderNginxConfigFileContent = (services: NginxTemplateParams[]) => {
  return services.map(renderTemplateSection).join('\n\n');
};
