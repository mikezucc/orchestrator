import { api } from './client';
import type { ApiResponse, Script, CreateScriptRequest, UpdateScriptRequest } from '@gce-platform/types';

export const scriptsApi = {
  // List all scripts
  async list(): Promise<ApiResponse<Script[]>> {
    const response = await api.get<ApiResponse<Script[]>>('/scripts');
    return response.data;
  },

  // Get a single script
  async get(id: string): Promise<Script> {
    const response = await api.get<ApiResponse<Script>>(`/scripts/${id}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to fetch script');
    }
    return response.data.data;
  },

  // Create a new script
  async create(data: CreateScriptRequest): Promise<Script> {
    const response = await api.post<ApiResponse<Script>>('/scripts', data);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to create script');
    }
    return response.data.data;
  },

  // Update a script
  async update(id: string, data: UpdateScriptRequest): Promise<Script> {
    const response = await api.patch<ApiResponse<Script>>(`/scripts/${id}`, data);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to update script');
    }
    return response.data.data;
  },

  // Delete a script
  async delete(id: string): Promise<void> {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/scripts/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete script');
    }
  },

  // Add tags to a script
  async addTags(id: string, tags: string[]): Promise<void> {
    const response = await api.post<ApiResponse<{ message: string }>>(`/scripts/${id}/tags`, { tags });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to add tags');
    }
  },

  // Remove a tag from a script
  async removeTag(id: string, tag: string): Promise<void> {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/scripts/${id}/tags/${encodeURIComponent(tag)}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to remove tag');
    }
  },
};