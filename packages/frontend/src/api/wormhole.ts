import { API_BASE_URL, getHeaders } from './base';
import type { 
  ApiResponse, 
  WormholeStatus, 
  WormholeRepositories, 
  WormholeBranchSwitchRequest,
  WormholeBranchSwitchResponse 
} from '@gce-platform/types';

export const wormholeApi = {
  getStatus: async (vmId: string): Promise<ApiResponse<WormholeStatus>> => {
    const response = await fetch(`${API_BASE_URL}/api/wormhole/${vmId}/status`, {
      headers: getHeaders(),
    });
    return response.json();
  },

  getRepositories: async (vmId: string): Promise<ApiResponse<WormholeRepositories>> => {
    const response = await fetch(`${API_BASE_URL}/api/wormhole/${vmId}/repositories`, {
      headers: getHeaders(),
    });
    return response.json();
  },

  switchBranch: async (
    vmId: string, 
    request: WormholeBranchSwitchRequest
  ): Promise<ApiResponse<WormholeBranchSwitchResponse>> => {
    const response = await fetch(`${API_BASE_URL}/api/wormhole/${vmId}/branch-switch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(request),
    });
    return response.json();
  },

  // WebSocket connection helper
  connectWebSocket: (vmId: string, publicIp: string): WebSocket => {
    // For now, connect directly to the VM's Wormhole service
    // In production, this might go through a proxy
    const ws = new WebSocket(`ws://${publicIp}:8080`);
    return ws;
  },
};