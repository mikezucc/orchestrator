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
  githubRepository?: {
    id: number;
    name: string;
    full_name: string;
    ssh_url: string;
    private: boolean;
  };
  userBootScript?: string;
}

export interface UpdateVMRequest {
  name?: string;
  initScript?: string;
}

export interface VMCreationProgress {
  vmId?: string;
  stage: 'preparing' | 'creating' | 'configuring' | 'installing' | 'finalizing' | 'complete' | 'error' | 'script-output';
  message: string;
  detail?: string;
  progress: number; // 0-100
  timestamp: number;
  error?: string;
  scriptOutput?: {
    type: 'stdout' | 'stderr';
    data: string;
  };
}

export interface VMCreationStage {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'complete' | 'error';
  message?: string;
}

export interface CreateFirewallRuleRequest {
  vmId: string;
  name: string;
  direction: 'ingress' | 'egress';
  priority: number;
  sourceRanges?: string[];
  allowedPorts: PortRule[];
}

export interface ExecuteScriptRequest {
  script: string;
  timeout?: number; // in seconds
  githubSSHKey?: {
    registerKey?: boolean; // Register ephemeral SSH key with GitHub
    cleanupAfterExecution?: boolean; // Remove key from GitHub after execution
    keyTitle?: string; // Custom title for the SSH key
  };
}

export interface ExecuteScriptResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
  sessionId: string;
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

// Wormhole types
export interface WormholeClient {
  id: string;
  branch: string;
  repoPath: string;
  connected: boolean;
  lastActivity: number;
}

export interface WormholeBranch {
  branch: string;
  clientCount: number;
}

export interface WormholeStatus {
  clients: WormholeClient[];
  branches: WormholeBranch[];
}

export interface WormholeRepository {
  repoPath: string;
  branches: string[];
  activeBranches: string[];
  availableBranches?: WormholeBranchInfo;
  clientCount: number;
  connectedClientCount: number;
  clients: WormholeClient[];
}

export type WormholeRepositories = WormholeRepository[];

export interface WormholeBranchSwitchRequest {
  targetBranch: string;
  repoPath: string;
}

export interface WormholeBranchSwitchResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface WormholeWebSocketMessage {
  type: 'commit' | 'pull' | 'conflict' | 'sync' | 'branch-switch';
  payload: any;
  clientId: string;
  timestamp: number;
}

// Port information types
export interface WormholePort {
  port: number;
  protocol: string;
  state: string;
  address: string;
  service?: string;
}

export interface WormholeProcess {
  processName: string;
  pid: number;
  ports: WormholePort[];
}

export interface WormholePortsInfo {
  totalPorts: number;
  processes: WormholeProcess[];
  raw: Array<WormholePort & {
    pid?: number;
    processName?: string;
  }>;
}

// Branch information types
export interface WormholeBranchInfo {
  local: string[];
  remote: string[];
  all: string[];
}

// Daemon information types
export interface WormholeDaemonRepository {
  path: string;
  name: string;
  branch: string;
  hasOrigin: boolean;
  originUrl?: string;
  branches?: WormholeBranchInfo;
}

export interface WormholeDaemon {
  repository: WormholeDaemonRepository;
  pid: number;
  status: 'running' | 'stopped' | 'error';
  startTime: number;
  uptime: number;
}

export interface WormholeDaemonsInfo {
  count: number;
  runningCount: number;
  daemons: WormholeDaemon[];
}

// Script library types
export interface Script {
  id: string;
  organizationId?: string;
  createdBy: string;
  createdByUser?: { email: string; name?: string }; // populated on fetch
  name: string;
  description?: string;
  scriptContent: string;
  timeout: number;
  isPublic: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScriptRequest {
  name: string;
  description?: string;
  scriptContent: string;
  timeout?: number;
  isPublic?: boolean;
  tags?: string[];
}

export interface UpdateScriptRequest {
  name?: string;
  description?: string;
  scriptContent?: string;
  timeout?: number;
  isPublic?: boolean;
}