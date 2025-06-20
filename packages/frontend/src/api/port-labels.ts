import { api } from './client';
import type { PortLabel, CreatePortLabelRequest, UpdatePortLabelRequest, ApiResponse } from '@gce-platform/types';

export const portLabelApi = {
  listByVM: async (vmId: string) => {
    const { data } = await api.get<ApiResponse<PortLabel[]>>(`/port-labels/vm/${vmId}`);
    return data;
  },

  create: async (label: CreatePortLabelRequest) => {
    const { data } = await api.post<ApiResponse<PortLabel>>('/port-labels', label);
    return data;
  },

  update: async (id: string, updates: UpdatePortLabelRequest) => {
    const { data } = await api.patch<ApiResponse<PortLabel>>(`/port-labels/${id}`, updates);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await api.delete<ApiResponse<{ message: string }>>(`/port-labels/${id}`);
    return data;
  },
};