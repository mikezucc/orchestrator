import { Client as SSHClient } from 'ssh2';
import { generateSSHKeys, addSSHKeyToVM, getSSHConnectionInfo } from './gcp-ssh.js';
import { getOrganizationAccessToken } from './organization-auth.js';
import { executionSessionManager } from './execution-sessions.js';
import { randomUUID } from 'crypto';
import { GitHubAPIService } from './github-api.js';

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
  githubSSHKey?: {
    registerKey?: boolean; // Register ephemeral SSH key with GitHub
    cleanupAfterExecution?: boolean; // Remove key from GitHub after execution
    keyTitle?: string; // Custom title for the SSH key
  };
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void; // Optional callback for streaming output
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
  userId,
  githubSSHKey,
  onOutput
}: SSHExecuteParams): Promise<{ stdout: string; stderr: string; exitCode: number; sessionId: string }> {
  console.log('=== Executing script via SSH ===');
  console.log('Instance:', instanceName);
  console.log('Username:', username);
  console.log('Script length:', script.length);
  console.log('Timeout:', timeout, 'seconds');

  // Generate SSH keys
  const { publicKey, privateKey } = await generateSSHKeys(username);
  console.log('SSH keys generated');

  // Track GitHub key ID if we register it
  let githubKeyId: number | undefined;
  
  // Register SSH key with GitHub if requested
  if (githubSSHKey?.registerKey && userId) {
    try {
      const githubAPI = new GitHubAPIService();
      
      // Generate a title for the key
      const keyTitle = githubSSHKey.keyTitle || 
        `DevBox VM: ${instanceName} (${new Date().toISOString().split('T')[0]})`;
      
      // Add the key to GitHub
      const githubKey = await githubAPI.addSSHKey(userId, keyTitle, publicKey);
      
      if (githubKey) {
        githubKeyId = githubKey.id;
        console.log(`Registered SSH key with GitHub: ${keyTitle} (ID: ${githubKeyId})`);
      } else {
        console.warn('Failed to register SSH key with GitHub - continuing without GitHub registration');
      }
    } catch (error) {
      console.error('Error registering SSH key with GitHub:', error);
      // Continue execution even if GitHub registration fails
    }
  }

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

    const cleanupSession = async () => {
      if (!sessionCleaned && vmId && organizationId && userId) {
        sessionCleaned = true;
        executionSessionManager.removeSession(executionSessionId);
      }
      
      // Remove GitHub SSH key if requested
      if (githubSSHKey?.cleanupAfterExecution && githubKeyId && userId) {
        try {
          const githubAPI = new GitHubAPIService();
          await githubAPI.removeSSHKey(userId, githubKeyId);
          console.log(`Removed SSH key from GitHub (ID: ${githubKeyId})`);
        } catch (error) {
          console.error('Error removing SSH key from GitHub:', error);
          // Don't fail the operation if cleanup fails
        }
      }
    };

    // Set up timeout
    timeoutHandle = setTimeout(async () => {
      console.error('Script execution timed out');
      await cleanupSession();
      sshClient.end();
      reject(new Error(`Script execution timed out after ${timeout} seconds`));
    }, timeout * 1000);

    sshClient.on('ready', () => {
      console.log('SSH connection established for script execution');

      // Use shell() to get a proper login shell with full environment
      sshClient.shell(async (err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle);
          await cleanupSession();
          sshClient.end();
          reject(err);
          return;
        }

        let shellReady = false;
        let currentLineIndex = 0;
        let lastOutput = '';
        let lastPromptTime = Date.now();
        let commandInProgress = false;
        let promptCheckInterval: NodeJS.Timeout;
        
        // Split script into individual lines, filtering out empty lines
        const scriptLines = script.split('\n').filter(line => line.trim());
        console.log(`Script has ${scriptLines.length} lines to execute`);

        // Check for abort periodically
        const abortCheckInterval = setInterval(() => {
          if (vmId && organizationId && userId) {
            const session = executionSessionManager.getSession(executionSessionId);
            if (session && session.aborted) {
              console.log('Execution aborted by user');
              clearInterval(abortCheckInterval);
              if (promptCheckInterval) clearInterval(promptCheckInterval);
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

        // Function to check if we're at a shell prompt
        const isAtPrompt = (output: string) => {
          const lines = output.split('\n');
          const lastLine = lines[lines.length - 1] || lines[lines.length - 2] || '';
          // Common shell prompt patterns
          return /[$#>]\s*$/.test(lastLine) || 
                 /\]\$\s*$/.test(lastLine) || 
                 /\]#\s*$/.test(lastLine) ||
                 />>>?\s*$/.test(lastLine); // Python prompts
        };

        // Function to send the next command
        const sendNextCommand = () => {
          if (currentLineIndex < scriptLines.length) {
            const command = scriptLines[currentLineIndex];
            console.log(`Executing command ${currentLineIndex + 1}/${scriptLines.length}: ${command.substring(0, 50)}...`);
            stream.write(command + '\n');
            currentLineIndex++;
            commandInProgress = true;
            lastPromptTime = Date.now();
          } else if (!commandInProgress) {
            // All commands executed, send exit
            console.log('All commands executed, sending exit');
            if (promptCheckInterval) clearInterval(promptCheckInterval);
            stream.write('exit\n');
          }
        };

        // Periodically check if we're stuck at a prompt
        promptCheckInterval = setInterval(() => {
          if (commandInProgress && isAtPrompt(lastOutput)) {
            const timeSinceLastPrompt = Date.now() - lastPromptTime;
            if (timeSinceLastPrompt > 1000) { // 1 second at prompt
              console.log('Detected shell prompt, moving to next command');
              commandInProgress = false;
              sendNextCommand();
            }
          }
        }, 500);

        stream.on('close', async (code: number) => {
          console.log('Stream closed with code:', code);
          exitCode = code || 0;
          clearTimeout(timeoutHandle);
          clearInterval(abortCheckInterval);
          if (promptCheckInterval) clearInterval(promptCheckInterval);
          await cleanupSession();
          sshClient.end();
          resolve({ stdout, stderr, exitCode, sessionId: executionSessionId });
        });

        stream.on('data', (data: Buffer) => {
          const output = data.toString();
          stdout += output;
          lastOutput = stdout.slice(-500); // Keep last 500 chars for prompt detection
          
          // Call onOutput callback if provided
          if (onOutput && shellReady) {
            onOutput('stdout', output);
          }
          
          // Check if shell is ready (looking for initial prompt)
          if (!shellReady && isAtPrompt(output)) {
            shellReady = true;
            console.log('Shell ready, starting command execution');
            sendNextCommand();
          } else if (shellReady && commandInProgress && isAtPrompt(lastOutput)) {
            // Command might have completed
            lastPromptTime = Date.now();
          }
        });

        stream.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          stderr += output;
          
          // Call onOutput callback if provided
          if (onOutput && shellReady) {
            onOutput('stderr', output);
          }
        });
      });
    });

    sshClient.on('error', async (err) => {
      console.error('SSH connection error:', err);
      clearTimeout(timeoutHandle);
      await cleanupSession();
      reject(err);
    });

    sshClient.on('close', async () => {
      console.log('SSH connection closed');
      clearTimeout(timeoutHandle);
      await cleanupSession();
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