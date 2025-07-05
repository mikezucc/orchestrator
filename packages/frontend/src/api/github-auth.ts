import { fetchClient } from './fetchClient';

export interface GitHubStatus {
  connected: boolean;
  username?: string;
  email?: string;
}

export const githubAuthApi = {
  // Get current GitHub connection status
  getStatus: async (): Promise<GitHubStatus> => {
    const response = await fetchClient.get('/api/github-auth/status');
    return response.data;
  },

  // Initiate GitHub OAuth flow
  connect: () => {
    // This will redirect to GitHub OAuth with return URL
    const returnUrl = encodeURIComponent('/user/settings');
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/github-auth/connect?returnUrl=${returnUrl}`;
  },

  // Disconnect GitHub account
  disconnect: async (): Promise<void> => {
    await fetchClient.delete('/api/github-auth/disconnect');
  },
};