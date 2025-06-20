import { api } from './client';
import type { VirtualMachine, CreateVMRequest, UpdateVMRequest, ApiResponse } from '@gce-platform/types';

export const vmApi = {
  list: async () => {
    const { data } = await api.get<ApiResponse<VirtualMachine[]>>('/vms');
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<ApiResponse<VirtualMachine>>(`/vms/${id}`);
    return data;
  },

  create: async (vm: CreateVMRequest) => {
    const { data } = await api.post<ApiResponse<VirtualMachine>>('/vms', vm);
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
};