export interface VirtualMachine {
  id: string;
  name: string;
  gcpProjectId: string;
  zone: string;
  machineType: string;
  status: 'running' | 'stopped' | 'suspended' | 'terminated' | 'pending';
  initScript?: string;
  publicIp?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FirewallRule {
  id: string;
  vmId: string;
  name: string;
  direction: 'ingress' | 'egress';
  priority: number;
  sourceRanges?: string[];
  allowedPorts: PortRule[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PortRule {
  protocol: 'tcp' | 'udp' | 'icmp';
  ports?: string[];
}

export interface User {
  id: string;
  email: string;
  gcpRefreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVMRequest {
  name: string;
  gcpProjectId: string;
  zone: string;
  machineType: string;
  initScript?: string;
}

export interface UpdateVMRequest {
  name?: string;
  initScript?: string;
}

export interface CreateFirewallRuleRequest {
  vmId: string;
  name: string;
  direction: 'ingress' | 'egress';
  priority: number;
  sourceRanges?: string[];
  allowedPorts: PortRule[];
}

export interface GCPAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}