import { api } from './client';
import type { Script, CreateScriptRequest, UpdateScriptRequest, ApiResponse } from '@gce-platform/types';

export const scriptsApi = {
  list: async () => {
    const { data } = await api.get<ApiResponse<Script[]>>('/scripts');
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get<ApiResponse<Script>>(`/scripts/${id}`);
    return data;
  },

  create: async (script: CreateScriptRequest) => {
    const { data } = await api.post<ApiResponse<Script>>('/scripts', script);
    return data;
  },

  update: async (id: string, script: UpdateScriptRequest) => {
    const { data } = await api.patch<ApiResponse<Script>>(`/scripts/${id}`, script);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await api.delete<ApiResponse<{ message: string }>>(`/scripts/${id}`);
    return data;
  },

  addTags: async (id: string, tags: string[]) => {
    const { data } = await api.post<ApiResponse<{ message: string }>>(`/scripts/${id}/tags`, { tags });
    return data;
  },

  removeTag: async (id: string, tag: string) => {
    const { data } = await api.delete<ApiResponse<{ message: string }>>(`/scripts/${id}/tags/${tag}`);
    return data;
  },
};