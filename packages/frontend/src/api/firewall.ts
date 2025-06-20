import { api } from './client';
import type { FirewallRule, CreateFirewallRuleRequest, ApiResponse } from '@gce-platform/types';

export const firewallApi = {
  listByVM: async (vmId: string) => {
    const { data } = await api.get<ApiResponse<FirewallRule[]>>(`/firewall/vm/${vmId}`);
    return data;
  },

  create: async (rule: CreateFirewallRuleRequest) => {
    const { data } = await api.post<ApiResponse<FirewallRule>>('/firewall', rule);
    return data;
  },

  delete: async (id: string) => {
    const { data } = await api.delete<ApiResponse<{ message: string }>>(`/firewall/${id}`);
    return data;
  },
};