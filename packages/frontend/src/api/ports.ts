import { api } from './client';

export interface PortDescription {
  id: string;
  vmId: string;
  port: number;
  protocol: string;
  name: string;
  description?: string;
  processName?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavePortDescriptionData {
  port: number;
  protocol: string;
  name: string;
  description?: string;
  processName?: string;
}

export const portsApi = {
  async getPortDescriptions(vmId: string): Promise<PortDescription[]> {
    const response = await api.get(`/vms/${vmId}/ports`);
    return response.data.data;
  },

  async savePortDescription(vmId: string, data: SavePortDescriptionData): Promise<PortDescription> {
    const response = await api.put(`/vms/${vmId}/ports`, data);
    return response.data.data;
  },

  async deletePortDescription(vmId: string, portId: string): Promise<void> {
    await api.delete(`/vms/${vmId}/ports/${portId}`);
  }
};