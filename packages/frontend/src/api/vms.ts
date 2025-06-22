import { api } from './client';
import type { VirtualMachine, CreateVMRequest, UpdateVMRequest, ApiResponse } from '@gce-platform/types';

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
};