import { api } from './client';
import type { 
  ProjectWithStats, 
  CreateProjectRequest, 
  UpdateProjectRequest,
  Project,
  ProjectRepositoryWithUser,
  AddProjectRepositoryRequest,
  ProjectVirtualMachineWithDetails,
  AddProjectVMRequest,
  ProjectMomentWithDetails,
  ProjectMemberWithUser,
  AddProjectMemberRequest,
  ProjectFavoritePortWithUser,
  AddProjectFavoritePortRequest
} from '@gce-platform/types';

export const projectsApi = {
  list: async (): Promise<ProjectWithStats[]> => {
    const response = await api.get('/projects');
    return response.data;
  },

  get: async (projectId: string): Promise<ProjectWithStats> => {
    const response = await api.get(`/projects/${projectId}`);
    return response.data;
  },

  create: async (data: CreateProjectRequest): Promise<Project> => {
    const response = await api.post('/projects', data);
    return response.data;
  },

  update: async (projectId: string, data: UpdateProjectRequest): Promise<Project> => {
    const response = await api.put(`/projects/${projectId}`, data);
    return response.data;
  },

  delete: async (projectId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}`);
  },

  // Repository management
  getRepositories: async (projectId: string): Promise<ProjectRepositoryWithUser[]> => {
    const response = await api.get(`/projects/${projectId}/repositories`);
    return response.data;
  },

  addRepository: async (projectId: string, data: AddProjectRepositoryRequest) => {
    const response = await api.post(`/projects/${projectId}/repositories`, data);
    return response.data;
  },

  removeRepository: async (projectId: string, repositoryId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/repositories/${repositoryId}`);
  },

  // VM management
  getVMs: async (projectId: string): Promise<ProjectVirtualMachineWithDetails[]> => {
    const response = await api.get(`/projects/${projectId}/vms`);
    return response.data;
  },

  addVM: async (projectId: string, data: AddProjectVMRequest) => {
    const response = await api.post(`/projects/${projectId}/vms`, data);
    return response.data;
  },

  removeVM: async (projectId: string, vmId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/vms/${vmId}`);
  },

  // Moment management
  getMoments: async (projectId: string): Promise<ProjectMomentWithDetails[]> => {
    const response = await api.get(`/projects/${projectId}/moments`);
    return response.data;
  },

  // Member management
  getMembers: async (projectId: string): Promise<ProjectMemberWithUser[]> => {
    const response = await api.get(`/projects/${projectId}/members`);
    return response.data;
  },

  addMember: async (projectId: string, data: AddProjectMemberRequest) => {
    const response = await api.post(`/projects/${projectId}/members`, data);
    return response.data;
  },

  removeMember: async (projectId: string, userId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/members/${userId}`);
  },

  // Favorite ports management
  getFavoritePorts: async (projectId: string): Promise<ProjectFavoritePortWithUser[]> => {
    const response = await api.get(`/projects/${projectId}/favorite-ports`);
    return response.data;
  },

  addFavoritePort: async (projectId: string, data: AddProjectFavoritePortRequest) => {
    const response = await api.post(`/projects/${projectId}/favorite-ports`, data);
    return response.data;
  },

  removeFavoritePort: async (projectId: string, portId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/favorite-ports/${portId}`);
  },
};