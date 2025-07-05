import { fetchClient } from './fetchClient';

export interface SSHKey {
  id: string;
  name: string;
  publicKey: string;
  fingerprint: string;
  source: 'manual' | 'generated' | 'github';
  createdAt: string;
  lastUsedAt?: string;
}

export const sshKeysApi = {
  // List all SSH keys
  list: async (): Promise<SSHKey[]> => {
    const response = await fetchClient.get('/api/ssh-keys');
    return response.data;
  },

  // Generate a new SSH key
  generate: async (name: string): Promise<{ id: string; privateKey: string }> => {
    const response = await fetchClient.post('/api/ssh-keys/generate', { name });
    return response.data;
  },

  // Delete an SSH key
  delete: async (keyId: string): Promise<void> => {
    await fetchClient.delete(`/api/ssh-keys/${keyId}`);
  },
};