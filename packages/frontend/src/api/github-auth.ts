import { fetchClient } from './fetchClient';

export interface GitHubStatus {
  success: boolean;
  connected: boolean;
  username?: string;
  email?: string;
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
};