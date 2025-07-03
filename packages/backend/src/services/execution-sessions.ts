import { Client as SSHClient } from 'ssh2';

interface ExecutionSession {
  id: string;
  vmId: string;
  organizationId: string;
  userId: string;
  sshClient: SSHClient;
  startTime: Date;
  aborted: boolean;
}

class ExecutionSessionManager {
  private sessions = new Map<string, ExecutionSession>();

  createSession(sessionId: string, vmId: string, organizationId: string, userId: string, sshClient: SSHClient): void {
    this.sessions.set(sessionId, {
      id: sessionId,
      vmId,
      organizationId,
      userId,
      sshClient,
      startTime: new Date(),
      aborted: false
    });
  }

  getSession(sessionId: string): ExecutionSession | undefined {
    return this.sessions.get(sessionId);
  }

  abortSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session && !session.aborted) {
      session.aborted = true;
      try {
        // Force close the SSH connection
        session.sshClient.end();
        console.log(`Aborted execution session ${sessionId}`);
        return true;
      } catch (error) {
        console.error(`Error aborting session ${sessionId}:`, error);
        return false;
      } finally {
        // Clean up the session after a delay
        setTimeout(() => this.removeSession(sessionId), 5000);
      }
    }
    return false;
  }

  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        // Ensure connection is closed
        session.sshClient.end();
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.sessions.delete(sessionId);
      console.log(`Removed execution session ${sessionId}`);
    }
  }

  // Clean up old sessions (call periodically)
  cleanupOldSessions(maxAgeMinutes: number = 30): void {
    const now = new Date();
    const maxAge = maxAgeMinutes * 60 * 1000;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now.getTime() - session.startTime.getTime() > maxAge) {
        console.log(`Cleaning up old session ${sessionId}`);
        this.removeSession(sessionId);
      }
    }
  }

  // Get sessions for a specific organization/user
  getSessionsForUser(organizationId: string, userId: string): ExecutionSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.organizationId === organizationId && session.userId === userId
    );
  }
}

export const executionSessionManager = new ExecutionSessionManager();

// Clean up old sessions every 5 minutes
setInterval(() => {
  executionSessionManager.cleanupOldSessions();
}, 5 * 60 * 1000);