import { api } from './client';
import { getWebSocketBaseURL } from '../utils/api-config';
import type { VirtualMachine, CreateVMRequest, UpdateVMRequest, ApiResponse, ExecuteScriptRequest, ExecuteScriptResponse } from '@gce-platform/types';

export const vmApi = {
  list: async (syncProjects?: string[]) => {
    const params = syncProjects?.length ? { sync: 'true' } : {};
    const { data } = await api.get<ApiResponse<VirtualMachine[]>>('/vms', { params });
    return data;
  },

  get: async (id: string, sync: boolean = false) => {
    const params = sync ? { sync: 'true' } : {};
    const { data } = await api.get<ApiResponse<VirtualMachine>>(`/vms/${id}`, { params });
    return data;
  },

  create: async (vm: CreateVMRequest & { trackingId?: string }) => {
    const { data } = await api.post<ApiResponse<VirtualMachine & { trackingId: string }>>('/vms', vm);
    return data;
  },

  update: async (id: string, vm: UpdateVMRequest) => {
    const { data } = await api.patch<ApiResponse<VirtualMachine>>(`/vms/${id}`, vm);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await api.delete<ApiResponse<{ message: string }>>(`/vms/${id}`);
    return data;
  },

  start: async (id: string) => {
    const { data } = await api.post<ApiResponse<{ message: string }>>(`/vms/${id}/start`);
    return data;
  },

  stop: async (id: string) => {
    const { data } = await api.post<ApiResponse<{ message: string }>>(`/vms/${id}/stop`);
    return data;
  },

  suspend: async (id: string) => {
    const { data } = await api.post<ApiResponse<{ message: string }>>(`/vms/${id}/suspend`);
    return data;
  },

  duplicate: async (id: string, name: string, startupScript?: string) => {
    const { data } = await api.post<ApiResponse<VirtualMachine>>(`/vms/${id}/duplicate`, { 
      name,
      startupScript 
    });
    return data;
  },

  executeScript: async (id: string, request: ExecuteScriptRequest) => {
    const { data } = await api.post<ApiResponse<ExecuteScriptResponse>>(`/vms/${id}/execute`, request);
    return data;
  },

  abortExecution: async (id: string, sessionId: string) => {
    const { data } = await api.post<ApiResponse<{ aborted: boolean }>>(`/vms/${id}/execute/abort`, { sessionId });
    return data;
  },
};

export async function fetchNginxConfig(
  vmId: string
): Promise<{ config: string; error?: string }> {
  try {
    // Use the regular execute script endpoint to fetch nginx config
    const response = await vmApi.executeScript(vmId, {
      script: `#!/bin/bash
# Try to find nginx config files
if [ -f /etc/nginx/sites-available/default ]; then
  echo "===DEFAULT_SITE_CONFIG==="
  cat /etc/nginx/sites-available/default
elif [ -f /etc/nginx/conf.d/default.conf ]; then
  echo "===DEFAULT_SITE_CONFIG==="
  cat /etc/nginx/conf.d/default.conf
else
  # Try to find any server config
  for conf in /etc/nginx/sites-available/* /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    if [ -f "$conf" ] && grep -q "server {" "$conf" 2>/dev/null; then
      echo "===DEFAULT_SITE_CONFIG==="
      cat "$conf"
      break
    fi
  done
fi`,
      timeout: 10
    });

    if (response.success && response.data) {
      const output = response.data.stdout;
      if (output.includes('===DEFAULT_SITE_CONFIG===')) {
        const configStart = output.indexOf('===DEFAULT_SITE_CONFIG===') + '===DEFAULT_SITE_CONFIG==='.length;
        const config = output.substring(configStart).trim();
        return { config };
      }
      return { config: '', error: 'No NGINX configuration found' };
    }
    
    return { config: '', error: response.error || 'Failed to fetch NGINX config' };
  } catch (error: any) {
    return { config: '', error: error.message || 'Failed to fetch NGINX config' };
  }
}

export async function executeStreamingScript(
  vmId: string,
  request: ExecuteScriptRequest,
  onMessage: (data: { type: 'output' | 'error' | 'complete'; data: string }) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Authentication required');
  }

  // Get WebSocket URL
  const wsBaseUrl = getWebSocketBaseURL();
  const wsUrl = `${wsBaseUrl}/api/vms/${vmId}/execute-stream?token=${encodeURIComponent(token)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let hasCompleted = false;

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        ws.close();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }

    ws.onopen = () => {
      // Send the script execution request
      ws.send(JSON.stringify(request));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'error') {
          onMessage({ type: 'error', data: message.data });
          hasCompleted = true;
          ws.close();
          reject(new Error(message.data));
        } else if (message.type === 'complete') {
          onMessage({ type: 'complete', data: message.data });
          hasCompleted = true;
          ws.close();
          resolve();
        } else if (message.type === 'output') {
          onMessage({ type: 'output', data: message.data });
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      if (!hasCompleted) {
        reject(new Error('WebSocket connection error'));
      }
    };

    ws.onclose = () => {
      if (!hasCompleted) {
        reject(new Error('WebSocket connection closed unexpectedly'));
      }
    };
  });
}

export async function uploadSSLCertificates(
  vmId: string,
  files: {
    domain: string;
    certificate: File;
    privateKey: File;
  }
): Promise<ApiResponse<{ message: string; certificatePath: string; privateKeyPath: string }>> {
  const formData = new FormData();
  formData.append('domain', files.domain);
  formData.append('certificate', files.certificate);
  formData.append('privateKey', files.privateKey);

  const { data } = await api.post<ApiResponse<{ 
    message: string; 
    certificatePath: string; 
    privateKeyPath: string 
  }>>(`/vms/${vmId}/ssl-certificates`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return data;
}