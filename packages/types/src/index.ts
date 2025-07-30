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
  streamWriteDelay?: number; // delay in milliseconds between writing lines to stream
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

// Script Library types
export interface ScriptLibraryItem {
  id: string;
  userId: string;
  organizationId: string;
  name: string;
  description?: string;
  script: string;
  language: string;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScriptRequest {
  name: string;
  description?: string;
  script: string;
  language?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface UpdateScriptRequest {
  name?: string;
  description?: string;
  script?: string;
  language?: string;
  tags?: string[];
  isPublic?: boolean;
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
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScriptRequest {
  name: string;
  description?: string;
  scriptContent: string;
  timeout?: number;
  tags?: string[];
}

export interface UpdateScriptRequest {
  name?: string;
  description?: string;
  scriptContent?: string;
  timeout?: number;
}

// Script Execution types
export interface ScriptExecution {
  id: number;
  scriptId?: string | null;
  scriptName: string;
  scriptContent: string;
  vmId?: string | null;
  executedBy: string;
  executedByUser?: { email: string; name?: string | null } | null; // populated on fetch
  executionType: 'manual' | 'boot' | 'scheduled' | 'api';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  exitCode?: number | null;
  startedAt: Date;
  completedAt?: Date | null;
  durationMs?: number | null;
  logOutput?: string | null;
  errorOutput?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScriptExecutionRequest {
  scriptId?: string;
  scriptName: string;
  scriptContent: string;
  vmId?: string;
  executionType: 'manual' | 'boot' | 'scheduled' | 'api';
  metadata?: Record<string, any>;
}

export interface UpdateScriptExecutionRequest {
  status?: 'running' | 'completed' | 'failed' | 'cancelled';
  exitCode?: number;
  completedAt?: Date;
  durationMs?: number;
  logOutput?: string;
  errorOutput?: string;
  metadata?: Record<string, any>;
}

export interface ScriptExecutionFilter {
  vmId?: string;
  scriptId?: string;
  executedBy?: string;
  status?: string;
  executionType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// Moment types
export interface Moment {
  id: string;
  organizationId: string;
  createdBy: string;
  vmId?: string;
  repositoryUrl?: string;
  gitBranch?: string;
  gitCommitHash?: string;
  gitCommitMessage?: string;
  gitAuthor?: string;
  gitAuthorEmail?: string;
  gitCommitDate?: Date;
  gitDiff?: string;
  title: string;
  description?: string;
  tags: string[];
  metadata: Record<string, any>;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MomentAsset {
  id: string;
  momentId: string;
  organizationId: string;
  assetType: 'screenshot' | 'screen_recording' | 'log_file' | 'config_file' | 'other';
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  gcsBucket: string;
  gcsPath: string;
  gcsGeneration?: string;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    encoding?: string;
    thumbnail?: string;
    [key: string]: any;
  };
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processingError?: string;
  uploadedBy: string;
  uploadMethod: 'web_ui' | 'api' | 'vm_agent' | 'cli';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMomentRequest {
  vmId?: string;
  repositoryUrl?: string;
  title: string;
  description?: string;
  tags?: string[];
  gitBranch?: string;
  gitCommitHash?: string;
  gitCommitMessage?: string;
  gitAuthor?: string;
  gitAuthorEmail?: string;
  gitCommitDate?: string;
  gitDiff?: string;
  metadata?: Record<string, any>;
}

export interface UploadAssetRequest {
  assetType: 'screenshot' | 'screen_recording' | 'log_file' | 'config_file' | 'other';
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadMethod: 'web_ui' | 'api' | 'vm_agent' | 'cli';
}

export interface UploadAssetResponse {
  success: boolean;
  assetId: string;
  uploadUrl: string;
  gcsPath: string;
}

export interface ListMomentsRequest {
  vmId?: string;
  gitBranch?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface ListMomentsResponse {
  success: boolean;
  moments: Array<{
    moment: Moment;
    createdByUser: {
      id: string;
      email: string;
      name?: string;
    };
    vm?: {
      id: string;
      name: string;
    };
    assetCount: number;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface MomentDetailResponse {
  success: boolean;
  moment: {
    moment: Moment;
    createdByUser: {
      id: string;
      email: string;
      name?: string;
    };
    vm?: VirtualMachine;
  };
  assets: Array<{
    asset: MomentAsset;
    uploadedByUser: {
      id: string;
      email: string;
      name?: string;
    };
    downloadUrl: string | null;
  }>;
}

// Project types
export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdBy: string;
  tags: any[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWithStats {
  project: Project;
  memberRole?: 'owner' | 'admin' | 'member' | 'viewer';
  memberCount: number;
  repositoryCount: number;
  vmCount: number;
  momentCount?: number;
  favoritePortCount?: number;
  creator: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProjectRepository {
  id: string;
  projectId: string;
  repositoryUrl: string;
  branch?: string;
  wormholeDaemonId?: string;
  addedBy: string;
  addedAt: Date;
  metadata: Record<string, any>;
}

export interface ProjectRepositoryWithUser {
  repository: ProjectRepository;
  addedBy: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface ProjectVirtualMachine {
  id: string;
  projectId: string;
  vmId: string;
  role?: 'development' | 'staging' | 'production' | 'testing';
  addedBy: string;
  addedAt: Date;
  metadata: Record<string, any>;
}

export interface ProjectVirtualMachineWithDetails {
  projectVm: ProjectVirtualMachine;
  vm: VirtualMachine;
  addedBy: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface ProjectMoment {
  id: string;
  projectId: string;
  momentId: string;
  addedBy: string;
  addedAt: Date;
}

export interface ProjectMomentWithDetails {
  projectMoment: ProjectMoment;
  moment: Moment;
  assetCount: number;
  addedBy: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: Record<string, any>;
  addedBy: string;
  addedAt: Date;
}

export interface ProjectMemberWithUser {
  member: ProjectMember;
  user: {
    id: string;
    name?: string;
    email: string;
  };
  addedBy: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface ProjectFavoritePort {
  id: string;
  projectId: string;
  port: string;
  name?: string;
  description?: string;
  addedBy: string;
  addedAt: Date;
  metadata: Record<string, any>;
}

export interface ProjectFavoritePortWithUser {
  port: ProjectFavoritePort;
  addedBy: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface AddProjectRepositoryRequest {
  repositoryUrl: string;
  branch?: string;
  wormholeDaemonId?: string;
  metadata?: Record<string, any>;
}

export interface AddProjectVMRequest {
  vmId: string;
  role?: 'development' | 'staging' | 'production' | 'testing';
  metadata?: Record<string, any>;
}

export interface AddProjectMemberRequest {
  userId: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  permissions?: Record<string, any>;
}

export interface AddProjectFavoritePortRequest {
  port: string | number;
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
}