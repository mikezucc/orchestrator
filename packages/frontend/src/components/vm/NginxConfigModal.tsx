import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Server, Plus, Trash2, Save, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { vmApi } from '../../api/vms';
import { useMutation } from '@tanstack/react-query';
import AnsiToHtml from 'ansi-to-html';
import '../../styles/terminal.css';

interface ProxyRule {
  id: string;
  location: string;
  proxyPass: string;
  headers?: Record<string, string>;
  isAPI?: boolean;
}

interface ServerBlock {
  id: string;
  serverName: string;
  listenPort: string;
  enableSSL: boolean;
  sslDomain: string;
  proxyRules: ProxyRule[];
  isExpanded: boolean;
  customCorsHeaders?: string[];
}

interface NginxConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmId: string;
  vmName: string;
  onSuccess?: () => void;
}

// Parse NGINX config to extract multiple server blocks
const parseNginxConfig = (config: string): ServerBlock[] => {
  const serverBlocks: ServerBlock[] = [];
  
  try {
    // Extract all server blocks
    const extractServerBlocks = (configText: string) => {
      const servers: Array<{ content: string }> = [];
      let pos = 0;
      
      while (pos < configText.length) {
        const serverMatch = configText.substring(pos).match(/server\s*{/);
        if (!serverMatch) break;
        
        const startPos = pos + serverMatch.index!;
        let braceCount = 1;
        let contentStart = startPos + serverMatch[0].length;
        let i = contentStart;
        
        for (; i < configText.length; i++) {
          if (configText[i] === '{') braceCount++;
          else if (configText[i] === '}') {
            braceCount--;
            if (braceCount === 0) break;
          }
        }
        
        if (i < configText.length) {
          const content = configText.substring(contentStart, i);
          servers.push({ content });
        }
        
        pos = i + 1;
      }
      
      return servers;
    };

    const serverContents = extractServerBlocks(config);
    
    serverContents.forEach((server, index) => {
      const serverBlock: ServerBlock = {
        id: `server-${Date.now()}-${index}`,
        serverName: '',
        listenPort: '80',
        enableSSL: false,
        sslDomain: '',
        proxyRules: [],
        isExpanded: index === 0 // Expand first server by default
      };

      // Extract server_name
      const serverNameMatch = server.content.match(/server_name\s+([^;]+);/);
      if (serverNameMatch) {
        serverBlock.serverName = serverNameMatch[1].trim().replace(/_/g, '');
      }

      // Extract listen directives
      const listenMatches = server.content.matchAll(/listen\s+([^;]+);/g);
      for (const match of listenMatches) {
        const listenValue = match[1].trim();
        if (listenValue.includes('ssl')) {
          serverBlock.enableSSL = true;
          const portMatch = listenValue.match(/(\d+)/);
          if (portMatch && portMatch[1] === '443') {
            serverBlock.listenPort = '443';
          }
        } else if (!listenValue.includes('[::]:')) {
          const portMatch = listenValue.match(/(\d+)/);
          if (portMatch) {
            serverBlock.listenPort = portMatch[1];
          }
        }
      }

      // Extract SSL certificate domain
      const sslCertMatch = server.content.match(/ssl_certificate\s+\/etc\/nginx\/ssl\/([^.]+)\.crt;/);
      if (sslCertMatch) {
        serverBlock.sslDomain = sslCertMatch[1];
      }

      // Extract custom CORS headers from Access-Control-Allow-Headers
      const corsHeadersMatch = server.content.match(/add_header\s+'Access-Control-Allow-Headers'\s+'([^']+)'/);
      if (corsHeadersMatch) {
        const headersList = corsHeadersMatch[1].split(',').map(h => h.trim());
        const baseHeaders = ['Authorization', 'Origin', 'X-Requested-With', 'Content-Type', 'Accept'];
        const customHeaders = headersList.filter(h => !baseHeaders.includes(h));
        if (customHeaders.length > 0) {
          serverBlock.customCorsHeaders = customHeaders;
        }
      }

      // Extract location blocks
      const extractLocationBlocks = (configText: string) => {
        const locations: Array<{ location: string; content: string }> = [];
        let pos = 0;
        
        while (pos < configText.length) {
          const locationMatch = configText.substring(pos).match(/location\s+([^\s{]+)\s*{/);
          if (!locationMatch) break;
          
          const startPos = pos + locationMatch.index!;
          const location = locationMatch[1];
          
          let braceCount = 0;
          let contentStart = startPos + locationMatch[0].length;
          let i = contentStart;
          
          for (; i < configText.length; i++) {
            if (configText[i] === '{') braceCount++;
            else if (configText[i] === '}') {
              if (braceCount === 0) break;
              braceCount--;
            }
          }
          
          if (i < configText.length) {
            const content = configText.substring(contentStart, i);
            locations.push({ location, content });
          }
          
          pos = i + 1;
        }
        
        return locations;
      };

      const locationBlocks = extractLocationBlocks(server.content);
      let ruleId = 1;
      
      for (const block of locationBlocks) {
        const proxyPassMatch = block.content.match(/proxy_pass\s+([^;]+);/);
        if (proxyPassMatch) {
          const rule: ProxyRule = {
            id: `rule-${Date.now()}-${ruleId}`,
            location: block.location,
            proxyPass: proxyPassMatch[1].trim(),
            headers: {}
          };

          // Extract custom headers
          const headerRegex = /proxy_set_header\s+([^\s]+)\s+([^;]+);/g;
          let headerMatch;
          while ((headerMatch = headerRegex.exec(block.content)) !== null) {
            const headerName = headerMatch[1];
            const headerValue = headerMatch[2];
            // Skip standard headers
            if (!['Upgrade', 'Connection', 'Host', 'X-Real-IP', 'X-Forwarded-For', 'X-Forwarded-Proto'].includes(headerName)) {
              rule.headers![headerName] = headerValue;
            }
          }

          // Check if this location has CORS configuration (indicating it's an API)
          if (block.content.includes('$request_method = OPTIONS') && 
              block.content.includes('Access-Control-Allow-Origin')) {
            rule.isAPI = true;
          }

          serverBlock.proxyRules.push(rule);
          ruleId++;
        }
      }

      // Add default proxy rule if none found
      if (serverBlock.proxyRules.length === 0) {
        serverBlock.proxyRules.push({ 
          id: `rule-${Date.now()}-1`, 
          location: '/', 
          proxyPass: 'http://localhost:3000' 
        });
      }

      serverBlocks.push(serverBlock);
    });

    // If no server blocks found, create a default one
    if (serverBlocks.length === 0) {
      serverBlocks.push({
        id: `server-${Date.now()}`,
        serverName: '',
        listenPort: '80',
        enableSSL: false,
        sslDomain: '',
        proxyRules: [{ id: `rule-${Date.now()}`, location: '/', proxyPass: 'http://localhost:3000' }],
        isExpanded: true,
        customCorsHeaders: []
      });
    }

  } catch (error) {
    console.error('Error parsing NGINX config:', error);
    // Return default server block on error
    serverBlocks.push({
      id: `server-${Date.now()}`,
      serverName: '',
      listenPort: '80',
      enableSSL: false,
      sslDomain: '',
      proxyRules: [{ id: `rule-${Date.now()}`, location: '/', proxyPass: 'http://localhost:3000' }],
      isExpanded: true,
      customCorsHeaders: []
    });
  }

  return serverBlocks;
};

export function NginxConfigModal({ isOpen, onClose, vmId, vmName, onSuccess }: NginxConfigModalProps) {
  const [serverBlocks, setServerBlocks] = useState<ServerBlock[]>([
    {
      id: `server-${Date.now()}`,
      serverName: '',
      listenPort: '80',
      enableSSL: false,
      sslDomain: '',
      proxyRules: [{ id: `rule-${Date.now()}`, location: '/', proxyPass: 'http://localhost:3000' }],
      isExpanded: true,
      customCorsHeaders: []
    }
  ]);
  const [configPreview, setConfigPreview] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const [estimatedTime, setEstimatedTime] = useState(0);

  // Initialize ANSI to HTML converter
  const ansiConverter = useMemo(() => new AnsiToHtml({
    fg: '#e5e7eb', // gray-200
    bg: '#111827', // gray-900
    newline: true,
    escapeXML: true,
    stream: true
  }), []);

  // Function to clean terminal control sequences
  const cleanTerminalOutput = (text: string): string => {
    if (!text) return '';
    
    // Remove common terminal control sequences that ansi-to-html doesn't handle
    /* eslint-disable no-control-regex */
    return text
      .replace(/\x1b\[\?2004[lh]/g, '') // Remove bracketed paste mode
      .replace(/\x1b\[([0-9]+)?[GK]/g, '') // Remove cursor positioning (G: move to column, K: clear line)
      .replace(/\x1b\[\d*[JH]/g, '') // Remove clear screen and cursor home
      .replace(/\x1b\[[\d;]*[fl]/g, '') // Remove cursor save/restore
      .replace(/\x1b\[\?\d+[hl]/g, '') // Remove DEC private mode set/reset
      .replace(/\x1b\]0;[^\x07]*\x07/g, '') // Remove terminal title sequences
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, (match) => {
        // Preserve color codes but remove other escape sequences
        if (match.match(/\x1b\[[0-9;]*m/)) {
          return match; // Keep color codes
        }
        return ''; // Remove other sequences
      })
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n'); // Handle carriage returns
    /* eslint-enable no-control-regex */
  };

  // Generate nginx config preview and calculate estimated time
  useEffect(() => {
    const config = generateNginxConfig();
    setConfigPreview(config);
    
    // Calculate estimated completion time
    // Count total lines that will be executed
    let totalLines = 0;
    
    // Fixed overhead lines (backups, cleanup, test, reload)
    totalLines += 6; // backup, delete links, clear default, test, reload
    
    // Lines per server block (tee command + ln command)
    totalLines += serverBlocks.length * 40;
    
    // Consolidated config write
    totalLines += 1;
    
    // 300ms per line as specified (but we're using 200ms actual delay)
    const estimatedMs = totalLines * 300;
    setEstimatedTime(estimatedMs);
  }, [serverBlocks]);

  const generateServerBlockConfig = (server: ServerBlock, isFirstServer: boolean = false) => {
    let config = '';
    
    config += `server {\n`;
    config += `    listen ${server.listenPort}${isFirstServer && !server.enableSSL ? ' default_server' : ''};\n`;
    config += `    listen [::]:${server.listenPort}${isFirstServer && !server.enableSSL ? ' default_server' : ''};\n`;
    config += `    server_name ${server.serverName || '_'};\n\n`;

    if (server.enableSSL && server.sslDomain) {
      config += `    listen 443 ssl${isFirstServer ? ' default_server' : ''};\n`;
      config += `    listen [::]:443 ssl${isFirstServer ? ' default_server' : ''};\n`;
      config += `    ssl_certificate /etc/nginx/ssl/${server.sslDomain}.crt;\n`;
      config += `    ssl_certificate_key /etc/nginx/ssl/${server.sslDomain}.key;\n`;
      config += `    ssl_protocols TLSv1.2 TLSv1.3;\n`;
      config += `    ssl_ciphers HIGH:!aNULL:!MD5;\n`;
      config += `    ssl_prefer_server_ciphers on;\n`;
      config += `    if ($scheme != "https") {\n`;
      config += `        return 301 https://$server_name$request_uri;\n`;
      config += `    }\n\n`;
    }

    // Add proxy rules
    server.proxyRules.forEach(rule => {
      config += `    location ${rule.location} {\n`;
      config += `        proxy_pass ${rule.proxyPass};\n`;
      config += `        proxy_http_version 1.1;\n`;
      config += `        proxy_set_header Upgrade $http_upgrade;\n`;
      config += `        proxy_set_header Connection 'upgrade';\n`;
      config += `        proxy_set_header Host $host;\n`;
      config += `        proxy_set_header X-Real-IP $remote_addr;\n`;
      config += `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`;
      config += `        proxy_set_header X-Forwarded-Proto $scheme;\n`;
      config += `        proxy_cache_bypass $http_upgrade;\n`;

      // Add custom headers if any
      if (rule.headers) {
        Object.entries(rule.headers).forEach(([key, value]) => {
          config += `        proxy_set_header ${key} ${value};\n`;
        });
      }

      // Add CORS headers for API endpoints
      if (rule.isAPI) {
        const baseHeaders = ['Authorization', 'Origin', 'X-Requested-With', 'Content-Type', 'Accept'];
        const customHeaders = server.customCorsHeaders?.filter(h => h.trim()) || [];
        const allHeaders = [...baseHeaders, ...customHeaders].join(', ');
        
        config += `\n        # CORS configuration for API\n`;
        config += `        if ($request_method = OPTIONS) {\n`;
        config += `            add_header 'Access-Control-Allow-Origin' '*';\n`;
        config += `            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, HEAD, PUT, DELETE, PATCH';\n`;
        config += `            add_header 'Access-Control-Allow-Headers' '${allHeaders}';\n`;
        config += `            add_header 'Access-Control-Max-Age' 86400;\n`;
        config += `            return 204;\n`;
        config += `        }\n`;
      }

      config += `    }\n`;
    });

    config += `}`;
    
    return config;
  };

  const generateNginxConfig = () => {
    return serverBlocks.map((server, index) => 
      generateServerBlockConfig(server, index === 0)
    ).join('\n\n');
  };

  // Server block management functions
  const addServerBlock = () => {
    const newServer: ServerBlock = {
      id: `server-${Date.now()}`,
      serverName: '',
      listenPort: '80',
      enableSSL: false,
      sslDomain: '',
      proxyRules: [{ id: `rule-${Date.now()}`, location: '/', proxyPass: 'http://localhost:3000' }],
      isExpanded: true,
      customCorsHeaders: []
    };
    setServerBlocks([...serverBlocks, newServer]);
  };

  const removeServerBlock = (id: string) => {
    if (serverBlocks.length > 1) {
      setServerBlocks(serverBlocks.filter(server => server.id !== id));
    } else {
      toast.error('At least one server block is required');
    }
  };

  const updateServerBlock = (id: string, updates: Partial<ServerBlock>) => {
    setServerBlocks(serverBlocks.map(server => 
      server.id === id ? { ...server, ...updates } : server
    ));
  };

  const toggleServerExpanded = (id: string) => {
    setServerBlocks(serverBlocks.map(server => 
      server.id === id ? { ...server, isExpanded: !server.isExpanded } : server
    ));
  };

  // Proxy rule management functions
  const addProxyRule = (serverId: string) => {
    const newRule: ProxyRule = {
      id: `rule-${Date.now()}`,
      location: '/api',
      proxyPass: 'http://localhost:8080'
    };
    
    setServerBlocks(serverBlocks.map(server => 
      server.id === serverId 
        ? { ...server, proxyRules: [...server.proxyRules, newRule] }
        : server
    ));
  };

  const removeProxyRule = (serverId: string, ruleId: string) => {
    setServerBlocks(serverBlocks.map(server => 
      server.id === serverId 
        ? { ...server, proxyRules: server.proxyRules.filter(rule => rule.id !== ruleId) }
        : server
    ));
  };

  const updateProxyRule = (serverId: string, ruleId: string, field: keyof ProxyRule, value: any) => {
    setServerBlocks(serverBlocks.map(server => 
      server.id === serverId 
        ? {
            ...server,
            proxyRules: server.proxyRules.map(rule => 
              rule.id === ruleId ? { ...rule, [field]: value } : rule
            )
          }
        : server
    ));
  };

  const applyConfigurationMutation = useMutation({
    mutationFn: async () => {
      // Validate at least one server has a valid configuration
      const hasValidServer = serverBlocks.some(server => 
        server.serverName || (server.enableSSL && server.sslDomain)
      );
      
      if (!hasValidServer) {
        throw new Error('At least one server block must have a server name or SSL domain configured');
      }

      // Generate the full nginx config for all server blocks
      const fullConfig = generateNginxConfig();
      
      // Generate script to handle multiple server blocks
      let script = `#!/bin/bash
set -e
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
sudo cp -r /etc/nginx/sites-available /etc/nginx/sites-available.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
sudo cp -r /etc/nginx/sites-enabled /etc/nginx/sites-enabled.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
sudo find /etc/nginx/sites-enabled -type l -delete
sudo tee /etc/nginx/sites-available/default > /dev/null << 'EOF'
EOF

`;

      // Create configuration files for each server block
      serverBlocks.forEach((server, index) => {
        const siteName = server.serverName && server.serverName !== '_' 
          ? server.serverName.replace(/\s+/g, '-').toLowerCase() 
          : `site-${index}`;
        
        const serverConfig = generateServerBlockConfig(server, index === 0);
        
        script += `
sudo tee /etc/nginx/sites-available/${siteName} > /dev/null << 'EOF'
${serverConfig}
EOF
sudo ln -sf /etc/nginx/sites-available/${siteName} /etc/nginx/sites-enabled/
`;
      });

      // Also write a consolidated configuration file
      script += `
sudo tee /etc/nginx/sites-available/managed-sites.conf > /dev/null << 'EOF'
${fullConfig}
EOF
sudo nginx -t
sudo systemctl reload nginx
`;

      const response = await vmApi.executeScript(vmId, { 
        script, 
        timeout: 360,
        streamWriteDelay: 200 // 200ms delay between lines for nginx config
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to apply NGINX configuration');
      }
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        // Split output by newlines but filter out empty lines for cleaner display
        const outputLines = data.stdout.split('\n').filter(line => line.trim());
        setOutput(outputLines);
        
        // Auto-scroll to bottom after setting output
        setTimeout(() => {
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        }, 0);
        
        // if (data.exitCode === 0) {
          toast.success('NGINX configuration applied successfully');
          onSuccess?.();
        // } else {
          if (data.stderr) {
            // Also show stderr in output
            setOutput(prev => [...prev, '', '=== ERRORS ===', ...data.stderr.split('\n')]);
          }

          handleClose();
        // }
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to apply NGINX configuration');
    }
  });

  const handleClose = () => {
    if (applyConfigurationMutation.isPending) {
      if (!confirm('Configuration is being applied. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  };

  const formatEstimatedTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) {
      return `~${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `~${minutes}m ${remainingSeconds}s` : `~${minutes}m`;
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
              {/* Server Blocks */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Server Blocks</h3>
                  <button
                    onClick={addServerBlock}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white 
                             rounded hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Server Block
                  </button>
                </div>

                <div className="space-y-4">
                  {serverBlocks.map((server, serverIndex) => (
                    <div key={server.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {/* Server Header */}
                      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleServerExpanded(server.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            {server.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <h4 className="font-medium text-sm">
                            {server.serverName || `Server Block ${serverIndex + 1}`}
                            {server.enableSSL && <span className="ml-2 text-xs text-green-600 dark:text-green-400">(SSL)</span>}
                          </h4>
                        </div>
                        {serverBlocks.length > 1 && (
                          <button
                            onClick={() => removeServerBlock(server.id)}
                            className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 
                                     dark:hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Server Content */}
                      {server.isExpanded && (
                        <div className="p-4 space-y-4">
                          {/* Basic Settings */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Server Name
                              </label>
                              <input
                                type="text"
                                value={server.serverName}
                                onChange={(e) => updateServerBlock(server.id, { serverName: e.target.value })}
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
                                value={server.listenPort}
                                onChange={(e) => updateServerBlock(server.id, { listenPort: e.target.value })}
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
                                checked={server.enableSSL}
                                onChange={(e) => updateServerBlock(server.id, { enableSSL: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Enable SSL (HTTPS)
                              </span>
                            </label>
                            
                            {server.enableSSL && (
                              <div className="ml-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  SSL Domain (must match uploaded certificate)
                                </label>
                                <input
                                  type="text"
                                  value={server.sslDomain}
                                  onChange={(e) => updateServerBlock(server.id, { sslDomain: e.target.value })}
                                  placeholder="example.com"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                           focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 
                                           dark:text-white"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                  Certificate path: /etc/nginx/ssl/{server.sslDomain}.crt
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Custom CORS Headers */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom CORS Headers</h5>
                              <button
                                onClick={() => {
                                  const currentHeaders = server.customCorsHeaders || [];
                                  updateServerBlock(server.id, { 
                                    customCorsHeaders: [...currentHeaders, ''] 
                                  });
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 text-white 
                                         rounded hover:bg-gray-700 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Add Header
                              </button>
                            </div>
                            {server.customCorsHeaders && server.customCorsHeaders.length > 0 && (
                              <div className="space-y-2">
                                {server.customCorsHeaders.map((header, index) => (
                                  <div key={index} className="flex gap-2 items-center">
                                    <input
                                      type="text"
                                      value={header}
                                      onChange={(e) => {
                                        const newHeaders = [...server.customCorsHeaders!];
                                        newHeaders[index] = e.target.value;
                                        updateServerBlock(server.id, { customCorsHeaders: newHeaders });
                                      }}
                                      placeholder="X-Custom-Header"
                                      className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 
                                               rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                               dark:bg-gray-700 dark:text-white"
                                    />
                                    <button
                                      onClick={() => {
                                        const newHeaders = server.customCorsHeaders!.filter((_, i) => i !== index);
                                        updateServerBlock(server.id, { customCorsHeaders: newHeaders });
                                      }}
                                      className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 
                                               dark:hover:text-red-300"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              These headers will be added to Access-Control-Allow-Headers for all API endpoints in this server block
                            </p>
                          </div>

                          {/* Proxy Rules */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Proxy Rules</h5>
                              <button
                                onClick={() => addProxyRule(server.id)}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 text-white 
                                         rounded hover:bg-gray-700 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Add Rule
                              </button>
                            </div>

                            <div className="space-y-2">
                              {server.proxyRules.map((rule) => (
                                <div key={rule.id} className="flex gap-3 items-start p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                  <div className="flex-1 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                          Location
                                        </label>
                                        <input
                                          type="text"
                                          value={rule.location}
                                          onChange={(e) => updateProxyRule(server.id, rule.id, 'location', e.target.value)}
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
                                          onChange={(e) => updateProxyRule(server.id, rule.id, 'proxyPass', e.target.value)}
                                          placeholder="http://localhost:3000"
                                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 
                                                   rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                                   dark:bg-gray-800 dark:text-white"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        id={`api-${rule.id}`}
                                        checked={rule.isAPI || false}
                                        onChange={(e) => updateProxyRule(server.id, rule.id, 'isAPI', e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                      />
                                      <label 
                                        htmlFor={`api-${rule.id}`}
                                        className="text-xs font-medium text-gray-700 dark:text-gray-300"
                                      >
                                        Enable CORS for API endpoints
                                      </label>
                                    </div>
                                  </div>
                                  {server.proxyRules.length > 1 && (
                                    <button
                                      onClick={() => removeProxyRule(server.id, rule.id)}
                                      className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 
                                               dark:hover:text-red-300"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
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
                    <div className="terminal-output text-xs font-mono space-y-0.5">
                      {output.map((line, index) => {
                        const cleanedLine = cleanTerminalOutput(line);
                        const htmlLine = ansiConverter.toHtml(cleanedLine);
                        return (
                          <div 
                            key={index}
                            className="leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: htmlLine || '&nbsp;' }}
                          />
                        );
                      })}
                    </div>
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
                onClick={() => applyConfigurationMutation.mutate()}
                disabled={applyConfigurationMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center gap-2"
              >
                {applyConfigurationMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent 
                                  rounded-full animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Apply Configuration</span>
                    {estimatedTime > 0 && (
                      <span className="text-xs opacity-75">
                        ({formatEstimatedTime(estimatedTime)})
                      </span>
                    )}
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