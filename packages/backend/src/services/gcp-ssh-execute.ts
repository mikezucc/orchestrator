import { Client as SSHClient } from 'ssh2';
import { generateSSHKeys, addSSHKeyToVM, getSSHConnectionInfo } from './gcp-ssh.js';
import { getOrganizationAccessToken } from './organization-auth.js';
import { executionSessionManager } from './execution-sessions.js';
import { randomUUID } from 'crypto';

interface SSHExecuteParams {
  projectId: string;
  zone: string;
  instanceName: string;
  username: string;
  script: string;
  timeout?: number; // in seconds
  accessToken: string;
  sessionId?: string; // optional session ID for tracking
  vmId?: string; // VM ID for session tracking
  organizationId?: string; // Organization ID for session tracking
  userId?: string; // User ID for session tracking
}

export async function executeScriptViaSSH({
  projectId,
  zone,
  instanceName,
  username,
  script,
  timeout = 300,
  accessToken,
  sessionId,
  vmId,
  organizationId,
  userId
}: SSHExecuteParams): Promise<{ stdout: string; stderr: string; exitCode: number; sessionId: string }> {
  console.log('=== Executing script via SSH ===');
  console.log('Instance:', instanceName);
  console.log('Username:', username);
  console.log('Script length:', script.length);
  console.log('Timeout:', timeout, 'seconds');

  // Generate SSH keys
  const { publicKey, privateKey } = await generateSSHKeys(username);
  console.log('SSH keys generated');

  // Add public key to VM
  await addSSHKeyToVM({
    projectId,
    zone,
    instanceName,
    username,
    publicKey,
    accessToken
  });
  console.log('SSH key added to VM');

  // Get connection info
  const connectionInfo = await getSSHConnectionInfo(projectId, zone, instanceName, accessToken);
  console.log('Got connection info:', { host: connectionInfo.externalIp });

  // Wait a bit for the key to propagate
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Generate session ID if not provided
  const executionSessionId = sessionId || randomUUID();

  return new Promise((resolve, reject) => {
    const sshClient = new SSHClient();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timeoutHandle: NodeJS.Timeout;
    let sessionCleaned = false;

    // Register the session if tracking info is provided
    if (vmId && organizationId && userId) {
      executionSessionManager.createSession(executionSessionId, vmId, organizationId, userId, sshClient);
    }

    const cleanupSession = () => {
      if (!sessionCleaned && vmId && organizationId && userId) {
        sessionCleaned = true;
        executionSessionManager.removeSession(executionSessionId);
      }
    };

    // Set up timeout
    timeoutHandle = setTimeout(() => {
      console.error('Script execution timed out');
      cleanupSession();
      sshClient.end();
      reject(new Error(`Script execution timed out after ${timeout} seconds`));
    }, timeout * 1000);

    sshClient.on('ready', () => {
      console.log('SSH connection established for script execution');

      // Use shell() to get a proper login shell with full environment
      sshClient.shell((err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle);
          cleanupSession();
          sshClient.end();
          reject(err);
          return;
        }

        let scriptSent = false;
        let shellReady = false;

        // Check for abort periodically
        const abortCheckInterval = setInterval(() => {
          if (vmId && organizationId && userId) {
            const session = executionSessionManager.getSession(executionSessionId);
            if (session && session.aborted) {
              console.log('Execution aborted by user');
              clearInterval(abortCheckInterval);
              clearTimeout(timeoutHandle);
              stream.write('\x03'); // Send Ctrl+C
              setTimeout(() => {
                stream.end();
                sshClient.end();
              }, 100);
              reject(new Error('Execution aborted by user'));
            }
          }
        }, 500);

        stream.on('close', (code: number) => {
          console.log('Stream closed with code:', code);
          exitCode = code || 0;
          clearTimeout(timeoutHandle);
          clearInterval(abortCheckInterval);
          cleanupSession();
          sshClient.end();
          resolve({ stdout, stderr, exitCode, sessionId: executionSessionId });
        });

        stream.on('data', (data: Buffer) => {
          const output = data.toString();
          stdout += output;
          
          // Check if shell is ready (looking for prompt)
          if (!shellReady && (output.includes('$') || output.includes('#') || output.includes('>'))) {
            shellReady = true;
            console.log('Shell appears ready, sending script');
          }
          
          // Send script after shell is ready
          if (shellReady && !scriptSent) {
            scriptSent = true;
            // Send the script
            stream.write(script);
            if (!script.endsWith('\n')) {
              stream.write('\n');
            }
            // Send exit command to close the shell cleanly
            stream.write('exit\n');
          }
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    sshClient.on('error', (err) => {
      console.error('SSH connection error:', err);
      clearTimeout(timeoutHandle);
      cleanupSession();
      reject(err);
    });

    sshClient.on('close', () => {
      console.log('SSH connection closed');
      clearTimeout(timeoutHandle);
      cleanupSession();
    });

    // Connect to SSH
    const sshConfig = {
      host: connectionInfo.externalIp,
      port: 22,
      username,
      privateKey,
      readyTimeout: 30000,
      tryKeyboard: true,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    };

    console.log('Connecting to SSH:', { 
      host: sshConfig.host, 
      port: sshConfig.port, 
      username: sshConfig.username 
    });

    sshClient.connect(sshConfig);
  });
}