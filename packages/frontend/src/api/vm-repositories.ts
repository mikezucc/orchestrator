import { api } from './client';
import type { ApiResponse } from '@gce-platform/types';

export interface VMRepository {
  id: string;
  vmId: string;
  repoFullName: string;
  localPath?: string;
  lastSyncedAt?: string;
  syncError?: string;
  addedAt: string;
  metadata?: {
    cloneDepth?: number;
    submodules?: boolean;
    lfs?: boolean;
    [key: string]: any;
  };
  wormhole?: {
    branches: string[];
    availableBranches?: {
      all: string[];
      local: string[];
      remote: string[];
    };
    activeBranches: Record<string, number>;
    clientCount: Record<string, number>;
  } | null;
  daemon?: {
    pid: number;
    status: string;
    uptime: number;
    branch?: string;
    originUrl?: string;
  } | null;
  clients: Array<{
    id: string;
    branch: string;
    repoPath: string;
    connected: boolean;
    lastActivity: number;
  }>;
}

export const vmRepositoriesApi = {
  getRepositories: async (vmId: string): Promise<VMRepository[]> => {
    const response = await api.get<ApiResponse<VMRepository[]>>(`/vms/${vmId}/repositories`);
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error(response.data.error || 'Failed to fetch VM repositories');
  },

  triggerSync: async (clientId: string, data?: { branch?: string; repoPath?: string }): Promise<void> => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/vms/sync/${clientId}`, data || {});
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to trigger sync');
    }
  },
};