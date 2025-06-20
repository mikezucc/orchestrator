import { api } from './client';
import type { ApiResponse } from '@gce-platform/types';

export const syncApi = {
  syncVMs: async (projectIds: string[]) => {
    const { data } = await api.post<ApiResponse<{ synced: number; errors: string[] }>>('/sync/vms', {
      projectIds,
    });
    return data;
  },
};