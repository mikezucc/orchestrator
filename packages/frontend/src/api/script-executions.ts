import { ApiResponse, ScriptExecution, ScriptExecutionFilter } from '@gce-platform/types';
import { api } from './client';

export const scriptExecutionsApi = {
  // Get all script executions with optional filters
  list: async (filter?: ScriptExecutionFilter): Promise<ApiResponse<ScriptExecution[]>> => {
    const params = new URLSearchParams();
    
    if (filter?.vmId) params.append('vmId', filter.vmId);
    if (filter?.scriptId) params.append('scriptId', filter.scriptId);
    if (filter?.executedBy) params.append('executedBy', filter.executedBy);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.executionType) params.append('executionType', filter.executionType);
    if (filter?.startDate) params.append('startDate', filter.startDate.toISOString());
    if (filter?.endDate) params.append('endDate', filter.endDate.toISOString());
    if (filter?.limit) params.append('limit', filter.limit.toString());
    if (filter?.offset) params.append('offset', filter.offset.toString());
    
    const queryString = params.toString();
    const url = `/scripts/executions${queryString ? `?${queryString}` : ''}`;
    
    const response = await api.get(url);
    return response.data;
  },

  // Get executions for a specific script
  listByScript: async (scriptId: string): Promise<ApiResponse<ScriptExecution[]>> => {
    const response = await api.get(`/scripts/${scriptId}/executions`);
    return response.data;
  },

  // Get executions for a specific VM
  listByVM: async (vmId: string): Promise<ApiResponse<ScriptExecution[]>> => {
    const response = await api.get(`/vms/${vmId}/executions`);
    return response.data;
  },

  // Get single execution details
  get: async (executionId: number): Promise<ApiResponse<ScriptExecution>> => {
    const response = await api.get(`/scripts/executions/${executionId}`);
    return response.data;
  },
};