import { Octokit } from '@octokit/rest';
import { encrypt, decrypt } from '../utils/auth.js';
import { db } from '../db/index.js';
import { authUsers } from '../db/schema-auth.js';
import { eq } from 'drizzle-orm';

export class GitHubAPIService {
  constructor() {}

  private async getOctokit(userId: string): Promise<Octokit | null> {
    try {
      const [user] = await db
        .select({ githubAccessToken: authUsers.githubAccessToken })
        .from(authUsers)
        .where(eq(authUsers.id, userId.toString()))
        .limit(1);

      if (!user?.githubAccessToken) {
        console.warn(`No GitHub access token found for user ${userId}`);
        return null;
      }

      const accessToken = decrypt(user.githubAccessToken);
      return new Octokit({ auth: accessToken });
    } catch (error) {
      console.error('Error getting Octokit instance:', error);
      return null;
    }
  }

  async addSSHKey(userId: string, title: string, key: string): Promise<{ id: number; key: string } | null> {
    const octokit = await this.getOctokit(userId);
    if (!octokit) return null;

    try {
      const response = await octokit.users.createPublicSshKeyForAuthenticatedUser({
        title,
        key,
      });

      console.log(`Added SSH key to GitHub for user ${userId}: ${title}`);
      return { id: response.data.id, key: response.data.key };
    } catch (error: any) {
      console.error(`Failed to add SSH key to GitHub: ${error.message}`);
      throw new Error(`Failed to add SSH key to GitHub: ${error.message}`);
    }
  }

  async removeSSHKey(userId: string, keyId: number): Promise<boolean> {
    const octokit = await this.getOctokit(userId);
    if (!octokit) return false;

    try {
      await octokit.users.deletePublicSshKeyForAuthenticatedUser({
        key_id: keyId,
      });

      console.log(`Removed SSH key ${keyId} from GitHub for user ${userId}`);
      return true;
    } catch (error: any) {
      console.error(`Failed to remove SSH key from GitHub: ${error.message}`);
      return false;
    }
  }

  async listSSHKeys(userId: string): Promise<Array<{ id: number; key: string; title: string }> | null> {
    const octokit = await this.getOctokit(userId);
    if (!octokit) return null;

    try {
      const response = await octokit.users.listPublicSshKeysForAuthenticatedUser({
        per_page: 100,
      });

      return response.data.map(key => ({
        id: key.id,
        key: key.key,
        title: key.title || 'Untitled',
      }));
    } catch (error: any) {
      console.error(`Failed to list SSH keys from GitHub: ${error.message}`);
      return null;
    }
  }

  async validateAccessToken(userId: string): Promise<boolean> {
    const octokit = await this.getOctokit(userId);
    if (!octokit) return false;

    try {
      await octokit.users.getAuthenticated();
      return true;
    } catch (error) {
      console.error(`GitHub access token validation failed for user ${userId}`);
      return false;
    }
  }

  async getAuthenticatedUser(userId: string): Promise<{ login: string; name: string | null } | null> {
    const octokit = await this.getOctokit(userId);
    if (!octokit) return null;

    try {
      const response = await octokit.users.getAuthenticated();
      return {
        login: response.data.login,
        name: response.data.name,
      };
    } catch (error) {
      console.error(`Failed to get authenticated GitHub user for user ${userId}`);
      return null;
    }
  }
}