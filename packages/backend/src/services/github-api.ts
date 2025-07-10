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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to add SSH key to GitHub: ${message}`);
      throw new Error(`Failed to add SSH key to GitHub: ${message}`);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to remove SSH key from GitHub: ${message}`);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to list SSH keys from GitHub: ${message}`);
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

  async getRepositoryBranches(userId: string, repoFullName: string): Promise<Array<{ name: string; protected: boolean; commit: { sha: string }; isDefault?: boolean }> | null> {
    const octokit = await this.getOctokit(userId);
    if (!octokit) return null;

    try {
      const [owner, repo] = repoFullName.split('/');
      if (!owner || !repo) {
        console.error(`Invalid repository name format: ${repoFullName}`);
        return null;
      }

      // Get default branch info
      const repoInfo = await octokit.repos.get({ owner, repo });
      const defaultBranch = repoInfo.data.default_branch;

      // Get all branches
      const branches: Array<{ name: string; protected: boolean; commit: { sha: string }; isDefault?: boolean }> = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await octokit.repos.listBranches({
          owner,
          repo,
          per_page: 100,
          page,
        });

        branches.push(...response.data.map(branch => ({
          name: branch.name,
          protected: branch.protected,
          commit: { sha: branch.commit.sha },
          isDefault: branch.name === defaultBranch,
        })));

        hasMore = response.data.length === 100;
        page++;
      }

      return branches;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to get branches for ${repoFullName}: ${message}`);
      return null;
    }
  }
}