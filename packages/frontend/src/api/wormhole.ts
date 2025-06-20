import { api } from './client';
import type { 
  ApiResponse, 
  WormholeStatus, 
  WormholeRepositories, 
  WormholeBranchSwitchRequest,
  WormholeBranchSwitchResponse 
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

  switchBranch: async (vmId: string, request: WormholeBranchSwitchRequest) => {
    const { data } = await api.post<ApiResponse<WormholeBranchSwitchResponse>>(
      `/wormhole/${vmId}/branch-switch`, 
      request
    );
    return data;
  },

  // WebSocket connection helper
  connectWebSocket: (vmId: string, publicIp: string): WebSocket => {
    // For now, connect directly to the VM's Wormhole service
    // In production, this might go through a proxy
    const ws = new WebSocket(`ws://${publicIp}:8080`);
    return ws;
  },
};