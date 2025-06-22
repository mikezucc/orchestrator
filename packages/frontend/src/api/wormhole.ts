import { api } from './client';
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
    getStatus: (publicIp: string) => 
      fetch(`http://${publicIp}:8080/api/status`).then(r => r.json()),
    
    getRepositories: (publicIp: string) => 
      fetch(`http://${publicIp}:8080/api/repositories`).then(r => r.json()),
    
    getPorts: (publicIp: string) => 
      fetch(`http://${publicIp}:8080/api/ports`).then(r => r.json()),
    
    getDaemons: (publicIp: string) => 
      fetch(`http://${publicIp}:8080/api/daemons`).then(r => r.json()),
    
    switchBranch: (publicIp: string, request: WormholeBranchSwitchRequest) => 
      fetch(`http://${publicIp}:8080/api/branch-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      }).then(r => r.json()),
    
    triggerScan: (publicIp: string) => 
      fetch(`http://${publicIp}:8080/api/scan`, { method: 'POST' }).then(r => r.json()),
  },

  // WebSocket connection helper
  connectWebSocket: (vmId: string, publicIp: string): WebSocket => {
    // For now, connect directly to the VM's Wormhole service
    // In production, this might go through a proxy
    const ws = new WebSocket(`ws://${publicIp}:8080`);
    return ws;
  },
};