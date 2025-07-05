import { EventEmitter } from 'events';
import type { VMCreationProgress } from '@gce-platform/types';

class VMCreationProgressService extends EventEmitter {
  private progressMap = new Map<string, VMCreationProgress[]>();
  private activeClients = new Map<string, Set<any>>();

  constructor() {
    super();
    // Clean up old progress data after 1 hour
    setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const [key, progress] of this.progressMap.entries()) {
        const lastUpdate = progress[progress.length - 1]?.timestamp || 0;
        if (lastUpdate < oneHourAgo) {
          this.progressMap.delete(key);
          this.activeClients.delete(key);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  // Generate a unique tracking ID for VM creation
  generateTrackingId(): string {
    return `vm-creation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Add a progress update
  addProgress(trackingId: string, progress: Omit<VMCreationProgress, 'timestamp'>): void {
    const fullProgress: VMCreationProgress = {
      ...progress,
      timestamp: Date.now(),
    };

    if (!this.progressMap.has(trackingId)) {
      this.progressMap.set(trackingId, []);
    }

    this.progressMap.get(trackingId)!.push(fullProgress);
    
    // Emit progress to all connected clients watching this tracking ID
    this.emit(`progress:${trackingId}`, fullProgress);
  }

  // Get all progress for a tracking ID
  getProgress(trackingId: string): VMCreationProgress[] {
    return this.progressMap.get(trackingId) || [];
  }

  // Get the latest progress for a tracking ID
  getLatestProgress(trackingId: string): VMCreationProgress | null {
    const progress = this.progressMap.get(trackingId);
    return progress ? progress[progress.length - 1] : null;
  }

  // Subscribe a client to progress updates
  subscribeClient(trackingId: string, client: any): void {
    if (!this.activeClients.has(trackingId)) {
      this.activeClients.set(trackingId, new Set());
    }
    this.activeClients.get(trackingId)!.add(client);
  }

  // Unsubscribe a client from progress updates
  unsubscribeClient(trackingId: string, client: any): void {
    const clients = this.activeClients.get(trackingId);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        this.activeClients.delete(trackingId);
      }
    }
  }

  // Helper methods for common progress stages
  reportPreparing(trackingId: string, message: string = 'Preparing VM creation...'): void {
    this.addProgress(trackingId, {
      stage: 'preparing',
      message,
      progress: 10,
    });
  }

  reportCreating(trackingId: string, message: string = 'Creating VM instance...'): void {
    this.addProgress(trackingId, {
      stage: 'creating',
      message,
      progress: 30,
    });
  }

  reportConfiguring(trackingId: string, message: string = 'Configuring VM...'): void {
    this.addProgress(trackingId, {
      stage: 'configuring',
      message,
      progress: 50,
    });
  }

  reportInstalling(trackingId: string, message: string = 'Installing software...', detail?: string): void {
    this.addProgress(trackingId, {
      stage: 'installing',
      message,
      detail,
      progress: 70,
    });
  }

  reportFinalizing(trackingId: string, message: string = 'Finalizing setup...'): void {
    this.addProgress(trackingId, {
      stage: 'finalizing',
      message,
      progress: 90,
    });
  }

  reportComplete(trackingId: string, vmId: string, message: string = 'VM created successfully!'): void {
    this.addProgress(trackingId, {
      vmId,
      stage: 'complete',
      message,
      progress: 100,
    });
  }

  reportError(trackingId: string, error: string, message: string = 'VM creation failed'): void {
    this.addProgress(trackingId, {
      stage: 'error',
      message,
      error,
      progress: 0,
    });
  }

  reportScriptOutput(trackingId: string, type: 'stdout' | 'stderr', data: string): void {
    this.addProgress(trackingId, {
      stage: 'script-output',
      message: 'Script output',
      scriptOutput: {
        type,
        data,
      },
      progress: -1, // Don't affect progress
    });
  }
}

// Export a singleton instance
export const vmCreationProgress = new VMCreationProgressService();