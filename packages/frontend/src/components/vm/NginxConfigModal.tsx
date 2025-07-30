import React, { useState, useEffect, useRef } from 'react';
import { X, Server, Plus, Trash2, Save, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { executeStreamingScript } from '../../api/vms';

interface ProxyRule {
  id: string;
  location: string;
  proxyPass: string;
  headers?: Record<string, string>;
  ssl?: boolean;
}

interface NginxConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmId: string;
  vmName: string;
  onSuccess?: () => void;
}

export function NginxConfigModal({ isOpen, onClose, vmId, vmName, onSuccess }: NginxConfigModalProps) {
  const [serverName, setServerName] = useState('');
  const [listenPort, setListenPort] = useState('80');
  const [enableSSL, setEnableSSL] = useState(false);
  const [sslDomain, setSslDomain] = useState('');
  const [proxyRules, setProxyRules] = useState<ProxyRule[]>([
    { id: '1', location: '/', proxyPass: 'http://localhost:3000' }
  ]);
  const [configPreview, setConfigPreview] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Generate nginx config preview
  useEffect(() => {
    const config = generateNginxConfig();
    setConfigPreview(config);
  }, [serverName, listenPort, enableSSL, sslDomain, proxyRules]);

  const generateNginxConfig = () => {
    let config = `server {
    listen ${listenPort}${enableSSL ? '' : ' default_server'};
    listen [::]:${listenPort}${enableSSL ? '' : ' default_server'};
    server_name ${serverName || '_'};

`;

    if (enableSSL && sslDomain) {
      config += `    # SSL Configuration
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    
    ssl_certificate /etc/nginx/ssl/${sslDomain}.crt;
    ssl_certificate_key /etc/nginx/ssl/${sslDomain}.key;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Redirect HTTP to HTTPS
    if ($scheme != "https") {
        return 301 https://$server_name$request_uri;
    }

`;
    }

    // Add proxy rules
    proxyRules.forEach(rule => {
      config += `    location ${rule.location} {
        proxy_pass ${rule.proxyPass};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
`;

      // Add custom headers if any
      if (rule.headers) {
        Object.entries(rule.headers).forEach(([key, value]) => {
          config += `        proxy_set_header ${key} ${value};\n`;
        });
      }

      config += `    }
`;
    });

    config += `}`;
    return config;
  };

  const addProxyRule = () => {
    const newRule: ProxyRule = {
      id: Date.now().toString(),
      location: '/api',
      proxyPass: 'http://localhost:8080'
    };
    setProxyRules([...proxyRules, newRule]);
  };

  const removeProxyRule = (id: string) => {
    setProxyRules(proxyRules.filter(rule => rule.id !== id));
  };

  const updateProxyRule = (id: string, field: keyof ProxyRule, value: any) => {
    setProxyRules(proxyRules.map(rule => 
      rule.id === id ? { ...rule, [field]: value } : rule
    ));
  };

  const applyConfiguration = async () => {
    if (!serverName && !enableSSL) {
      toast.error('Please provide a server name or enable SSL with a domain');
      return;
    }

    setIsExecuting(true);
    setOutput([]);
    abortControllerRef.current = new AbortController();

    try {
      const config = generateNginxConfig();
      const script = `#!/bin/bash
set -e

echo "Starting NGINX configuration..."

# Backup existing configuration
echo "Backing up existing NGINX configuration..."
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.\$(date +%Y%m%d_%H%M%S)

# Write new configuration
echo "Writing new NGINX configuration..."
sudo tee /etc/nginx/sites-available/${serverName || 'default'} > /dev/null << 'EOF'
${config}
EOF

# Enable the site
echo "Enabling the site..."
sudo ln -sf /etc/nginx/sites-available/${serverName || 'default'} /etc/nginx/sites-enabled/

# Test configuration
echo "Testing NGINX configuration..."
sudo nginx -t

# Reload NGINX
echo "Reloading NGINX..."
sudo systemctl reload nginx

echo "NGINX configuration applied successfully!"
`;

      await executeStreamingScript(
        vmId,
        { script, description: 'Configure NGINX proxy' },
        (data) => {
          if (data.type === 'output') {
            setOutput(prev => [...prev, data.data]);
            // Auto-scroll to bottom
            if (outputRef.current) {
              outputRef.current.scrollTop = outputRef.current.scrollHeight;
            }
          } else if (data.type === 'error') {
            toast.error(data.data);
          } else if (data.type === 'complete') {
            toast.success('NGINX configuration applied successfully');
            onSuccess?.();
          }
        },
        abortControllerRef.current.signal
      );
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast.error(error.message || 'Failed to apply NGINX configuration');
      }
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const handleClose = () => {
    if (isExecuting && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/30" onClick={handleClose} />
        
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <Server className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                NGINX Configuration
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Configure NGINX proxy for <span className="font-semibold">{vmName}</span>
              </p>
            </div>

            <div className="space-y-6">
              {/* Server Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Server Settings</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Server Name
                    </label>
                    <input
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder="example.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                               focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 
                               dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Listen Port
                    </label>
                    <input
                      type="text"
                      value={listenPort}
                      onChange={(e) => setListenPort(e.target.value)}
                      placeholder="80"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                               focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 
                               dark:text-white"
                    />
                  </div>
                </div>

                {/* SSL Settings */}
                <div className="space-y-3">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={enableSSL}
                      onChange={(e) => setEnableSSL(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enable SSL (HTTPS)
                    </span>
                  </label>
                  
                  {enableSSL && (
                    <div className="ml-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        SSL Domain (must match uploaded certificate)
                      </label>
                      <input
                        type="text"
                        value={sslDomain}
                        onChange={(e) => setSslDomain(e.target.value)}
                        placeholder="example.com"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 
                                 dark:text-white"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Certificate path: /etc/nginx/ssl/{sslDomain}.crt
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Proxy Rules */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Proxy Rules</h3>
                  <button
                    onClick={addProxyRule}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white 
                             rounded hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Rule
                  </button>
                </div>

                <div className="space-y-3">
                  {proxyRules.map((rule) => (
                    <div key={rule.id} className="flex gap-3 items-start p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Location
                          </label>
                          <input
                            type="text"
                            value={rule.location}
                            onChange={(e) => updateProxyRule(rule.id, 'location', e.target.value)}
                            placeholder="/api"
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 
                                     rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                     dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Proxy Pass
                          </label>
                          <input
                            type="text"
                            value={rule.proxyPass}
                            onChange={(e) => updateProxyRule(rule.id, 'proxyPass', e.target.value)}
                            placeholder="http://localhost:3000"
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 
                                     rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                     dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                      </div>
                      {proxyRules.length > 1 && (
                        <button
                          onClick={() => removeProxyRule(rule.id)}
                          className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 
                                   dark:hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Configuration Preview */}
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Configuration Preview</h3>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre">
                    {configPreview}
                  </pre>
                </div>
              </div>

              {/* Output */}
              {output.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Output</h3>
                  <div 
                    ref={outputRef}
                    className="bg-gray-900 text-gray-100 p-4 rounded-lg h-48 overflow-y-auto"
                  >
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {output.join('')}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-500">
              <AlertCircle className="w-4 h-4" />
              <span>Configuration will be applied immediately</span>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 
                         dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 
                         transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyConfiguration}
                disabled={isExecuting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center gap-2"
              >
                {isExecuting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent 
                                  rounded-full animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Apply Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}