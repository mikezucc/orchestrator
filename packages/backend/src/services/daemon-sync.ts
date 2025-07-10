import axios from 'axios';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { vmRepositories } from '../db/schema-vm-repositories.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { WormholeClient } from '@gce-platform/types';

interface DaemonStatusResponse {
  clients: WormholeClient[];
  timestamp: number;
}

class DaemonSyncService {
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastSyncTime = 0;

  constructor() {
    // Start polling for daemon updates
    this.startPolling();
  }

  private startPolling() {
    if (this.pollInterval) {
      return;
    }

    // Poll every 30 seconds
    this.pollInterval = setInterval(() => {
      this.pollDaemonStatus();
    }, 30000);

    // Do an initial poll
    this.pollDaemonStatus();
  }

  private async pollDaemonStatus() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      // Fetch all connected daemons from the central server
      const response = await axios.get<DaemonStatusResponse>('https://ws.slopbox.dev/api/status');
      
      if (response.data && response.data.clients) {
        console.log(`Polling daemon status: ${response.data.clients.length} clients connected`);
        
        // Process all connected clients
        for (const client of response.data.clients) {
          if (client.connected && client.repoPath) {
            await this.syncClientRepository(client);
          }
        }

        // Clean up repositories from VMs where daemons are no longer connected
        await this.cleanupDisconnectedDaemons(response.data.clients);
        
        this.lastSyncTime = Date.now();
      }
    } catch (error) {
      console.error('Error polling daemon status:', error);
    } finally {
      this.isPolling = false;
    }
  }

  public async syncDaemonUpdate(clientId: string, branch?: string, repoPath?: string) {
    // This method can be called when we receive updates through other means
    // (e.g., from a WebSocket connection or webhook)
    
    try {
      // Fetch the specific client's information
      const response = await axios.get<DaemonStatusResponse>('https://ws.slopbox.dev/api/status');
      
      const client = response.data.clients.find(c => c.id === clientId);
      if (client && client.connected) {
        // Update with provided information if available
        if (branch) client.branch = branch;
        if (repoPath) client.repoPath = repoPath;
        
        await this.syncClientRepository(client);
      }
    } catch (error) {
      console.error(`Error syncing daemon update for client ${clientId}:`, error);
    }
  }

  private async syncClientRepository(client: WormholeClient) {
    // Extract hostname from clientId (e.g., "hostbox-0e7efc7" -> "hostbox")
    const hostname = this.extractHostname(client.id);
    if (!hostname) {
      console.warn(`Could not extract hostname from clientId: ${client.id}`);
      return;
    }

    try {
      // Find VM by name (hostname)
      const [vm] = await db
        .select()
        .from(virtualMachines)
        .where(eq(virtualMachines.name, hostname))
        .limit(1);

      if (!vm) {
        console.warn(`No VM found with name: ${hostname}`);
        return;
      }

      // USE THE REPO PATH AS THE CANONICAL IDENTIFIER FOR THE REPOSITORY
      // const repositoryUrl = client.repoPath;
      // let repositoryUrl = this.extractRepositoryUrl(client.repoPath);
      // if (!repositoryUrl) {
      //   console.warn(`Could not extract repository URL from path: ${client.repoPath}`);
      // }

      // Find the repository in projectRepositories
      // const [repository] = await db
      //   .select()
      //   .from(projectRepositories)
      //   .where(eq(projectRepositories.repositoryUrl, repositoryUrl))
      //   .limit(1);

      // if (!repository) {
      //   console.warn(`No repository found with URL: ${repositoryUrl}`);
      //   return;
      // }

      // Update the repository's daemon ID and branch
      // await db
      //   .update(projectRepositories)
      //   .set({
      //     wormholeDaemonId: client.id,
      //     branch: client.branch
      //   })
      //   .where(eq(projectRepositories.id, repository.id));

      // Check if this VM-repository association already exists
      const [existingAssociation] = await db
        .select()
        .from(vmRepositories)
        .where(
          and(
            eq(vmRepositories.vmId, vm.id),
            eq(vmRepositories.repoFullName, client.repoPath),
            isNull(vmRepositories.removedAt)
          )
        )
        .limit(1);

      if (!existingAssociation) {
        // Create new association
        await db.insert(vmRepositories).values({
          vmId: vm.id,
          repoFullName: client.repoPath,
          lastSyncedAt: new Date(),
        });

        console.log(`Associated repository ${client.repoPath} with VM ${hostname}`);
      } else {
        // Update existing association
        await db
          .update(vmRepositories)
          .set({
            localPath: client.repoPath,
            lastSyncedAt: new Date(),
            syncError: null
          })
          .where(eq(vmRepositories.repoFullName, client.repoPath));

        console.log(`Updated repository ${client.repoPath} association with VM ${hostname}`);
      }

      // Clean up removed repositories (those not reported by this daemon)
      // await this.cleanupRemovedRepositories(vm.id, client.id);
    } catch (error) {
      console.error(`Error syncing repository for client ${client.id}:`, error);
    }
  }

  private async cleanupRemovedRepositories(vmId: string, clientId: string) {
    // Get all active repositories currently associated with this VM
    const activeAssociations = await db
      .select({
        id: vmRepositories.id,
        repoFullName: vmRepositories.repoFullName
      })
      .from(vmRepositories)
      .where(
        and(
          eq(vmRepositories.vmId, vmId),
          isNull(vmRepositories.removedAt)
        )
      );

    // Get current client info to see which repos it's managing
    try {
      const response = await axios.get<DaemonStatusResponse>('https://ws.slopbox.dev/api/status');
      const client = response.data.clients.find(c => c.id === clientId);
      
      if (!client || !client.repoPath) {
        return;
      }

      // Find repos that are no longer managed by this client
      const toRemove = activeAssociations.filter(
        assoc => assoc.repoFullName !== client.repoPath
      );

      if (toRemove.length > 0) {
        // Soft delete these associations
        await db
          .update(vmRepositories)
          .set({
            removedAt: new Date()
          })
          .where(
            inArray(
              vmRepositories.id,
              toRemove.map(r => r.id)
            )
          );

        console.log(`Removed ${toRemove.length} repositories from VM ${vmId}`);
      }
    } catch (error) {
      console.error('Error cleaning up removed repositories:', error);
    }
  }

  private async cleanupDisconnectedDaemons(connectedClients: WormholeClient[]) {
    // Get all connected client IDs and their repository paths
    const connectedRepos = new Set(
      connectedClients
        .filter(c => c.connected && c.repoPath)
        .map(c => c.repoPath)
    );

    if (connectedRepos.size === 0) {
      // If no repos are connected, don't remove everything
      return;
    }

    // Find all VM repositories that are no longer connected
    const allVmRepos = await db
      .select({
        id: vmRepositories.id,
        repoFullName: vmRepositories.repoFullName
      })
      .from(vmRepositories)
      .where(isNull(vmRepositories.removedAt));

    const toRemove = allVmRepos.filter(
      repo => !connectedRepos.has(repo.repoFullName)
    );

    if (toRemove.length > 0) {
      // Soft delete VM associations for disconnected repositories
      await db
        .update(vmRepositories)
        .set({
          removedAt: new Date(),
          syncError: 'Daemon disconnected'
        })
        .where(
          inArray(
            vmRepositories.id,
            toRemove.map(r => r.id)
          )
        );

      console.log(`Cleaned up ${toRemove.length} disconnected repositories`);
    }
  }

  private extractHostname(clientId: string): string | null {
    // Extract hostname from clientId (e.g., "hostbox-0e7efc7" -> "hostbox")
    const match = clientId.match(/^(.+?)-[a-f0-9]+$/);
    return match ? match[1] : null;
  }

  private extractRepositoryUrl(repoPath: string): string | null {
    // Extract repository URL from local path
    // This is a simplified version - you might need to adjust based on your actual path structure
    // For example, if repoPath is "/home/user/repos/github.com/owner/repo", 
    // you might extract "https://github.com/owner/repo"
    
    // Check if path contains github.com structure
    const githubMatch = repoPath.match(/github\.com[\/:]([^\/]+\/[^\/]+)/);
    if (githubMatch) {
      return `https://github.com/${githubMatch[1].replace(/\.git$/, '')}`;
    }

    // Check for other git hosting services
    const gitlabMatch = repoPath.match(/gitlab\.com[\/:]([^\/]+\/[^\/]+)/);
    if (gitlabMatch) {
      return `https://gitlab.com/${gitlabMatch[1].replace(/\.git$/, '')}`;
    }

    // If we can't extract a URL, return null
    return null;
  }

  public disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

// Create and export a singleton instance
export const daemonSyncService = new DaemonSyncService();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing daemon sync connection...');
  daemonSyncService.disconnect();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing daemon sync connection...');
  daemonSyncService.disconnect();
});