import { fetchClient } from './fetchClient';

export interface GitHubStatus {
  success: boolean;
  connected: boolean;
  username?: string;
  email?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  ssh_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
}

export interface ReposResponse {
  success: boolean;
  repositories: GitHubRepo[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
  };
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commit: {
    sha: string;
  };
  isDefault?: boolean;
}

export const githubAuthApi = {
  // Get current GitHub connection status
  getStatus: async (): Promise<GitHubStatus> => {
    const response = await fetchClient.get('/github-auth/status');
    return response;
  },

  // Initiate GitHub OAuth flow
  connect: async () => {
    // Get the OAuth URL from the API with proper authentication
    const returnUrl = '/user/settings';
    const response = await fetchClient.get(`/github-auth/connect-url?returnUrl=${encodeURIComponent(returnUrl)}`);

    console.log('GitHub OAuth URL response:', response);
    
    if (response.success && response.url) {
      // Redirect to GitHub OAuth
      window.location.href = response.url;
    } else {
      throw new Error('Failed to get GitHub OAuth URL');
    }
  },

  // Disconnect GitHub account
  disconnect: async (): Promise<void> => {
    await fetchClient.delete('/github-auth/disconnect');
  },
  
  // Get user's GitHub repositories
  getRepositories: async (page: number = 1, perPage: number = 30, search?: string): Promise<ReposResponse> => {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
      ...(search && { q: search }),
    });
    
    const response = await fetchClient.get(`/github-auth/repos?${params}`);
    return response;
  },

  // Get branches for a specific repository
  getRepositoryBranches: async (repoFullName: string): Promise<GitHubBranch[]> => {
    const encodedRepo = encodeURIComponent(repoFullName);
    const response = await fetchClient.get(`/github-auth/repos/${encodedRepo}/branches`);
    return response.branches || [];
  },
};