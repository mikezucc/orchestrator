import { api } from './client';
import { FetchClient } from './fetchClient';
import type { 
  ApiResponse, 
  WormholeStatus, 
  WormholeRepositories, 
  WormholeBranchSwitchRequest,
  WormholeBranchSwitchResponse,
  WormholePortsInfo,
  WormholeDaemonsInfo
} from '@gce-platform/types';

export const wormholeApi = {
  getStatus: async (vmId: string) => {
    const { data } = await api.get<ApiResponse<WormholeStatus>>(`/wormhole/${vmId}/status`);
    return data;
  },

  getRepositories: async (vmId: string) => {
    const { data } = await api.get<ApiResponse<WormholeRepositories>>(`/wormhole/${vmId}/repositories`);
    return data;
  },

  getPorts: async (vmId: string) => {
    const { data } = await api.get<ApiResponse<WormholePortsInfo>>(`/wormhole/${vmId}/ports`);
    return data;
  },

  getDaemons: async (vmId: string) => {
    const { data } = await api.get<ApiResponse<WormholeDaemonsInfo>>(`/wormhole/${vmId}/daemons`);
    return data;
  },

  switchBranch: async (vmId: string, request: WormholeBranchSwitchRequest) => {
    const { data } = await api.post<ApiResponse<WormholeBranchSwitchResponse>>(
      `/wormhole/${vmId}/branch-switch`, 
      request
    );
    return data;
  },

  triggerScan: async (vmId: string) => {
    const { data } = await api.post<ApiResponse<{ success: boolean; message: string }>>(`/wormhole/${vmId}/scan`);
    return data;
  },

  // Direct API calls to the Wormhole server
  directApi: {
    getStatus: async (publicIp: string) => {
      const client = new FetchClient(`http://${publicIp}:8080/api`);
      return client.get('/status', { skipAuth: true });
    },
    
    getRepositories: async (publicIp: string) => {
      const client = new FetchClient(`http://${publicIp}:8080/api`);
      return client.get('/repositories', { skipAuth: true });
    },
    
    getPorts: async (publicIp: string) => {
      const client = new FetchClient(`http://${publicIp}:8080/api`);
      return client.get('/ports', { skipAuth: true });
    },
    
    getDaemons: async (publicIp: string) => {
      const client = new FetchClient(`http://${publicIp}:8080/api`);
      return client.get('/daemons', { skipAuth: true });
    },
    
    switchBranch: async (publicIp: string, request: WormholeBranchSwitchRequest) => {
      const client = new FetchClient(`http://${publicIp}:8080/api`);
      return client.post('/branch-switch', request, { skipAuth: true });
    },
    
    triggerScan: async (publicIp: string) => {
      const client = new FetchClient(`http://${publicIp}:8080/api`);
      return client.post('/scan', undefined, { skipAuth: true });
    },
  },

  // WebSocket connection helper
  connectWebSocket: (vmId: string, publicIp: string): WebSocket => {
    // Connect to the hardcoded wormhole server
    const ws = new WebSocket('wss://ws.slopbox.dev/');
    return ws;
  },
};