import { api } from './client';
import type { ApiResponse } from '@gce-platform/types';

interface SSHSetupResponse {
  username: string;
  privateKey: string;
  publicKey: string;
  host: string;
  port: number;
}

interface SSHInfoResponse {
  username: string;
  host: string;
  port: number;
  projectId: string;
  zone: string;
  instanceName: string;
}

export const sshApi = {
  setupSSH: async (vmId: string) => {
    const { data } = await api.post<ApiResponse<SSHSetupResponse>>(`/ssh/${vmId}/setup`);
    return data;
  },

  getSSHInfo: async (vmId: string) => {
    const { data } = await api.get<ApiResponse<SSHInfoResponse>>(`/ssh/${vmId}/info`);
    return data;
  },
};