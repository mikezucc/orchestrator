import { Client as SSHClient } from 'ssh2';
import { generateSSHKeys, addSSHKeyToVM, getSSHConnectionInfo } from './gcp-ssh.js';
import { getOrganizationAccessToken } from './organization-auth.js';

interface SSHExecuteParams {
  projectId: string;
  zone: string;
  instanceName: string;
  username: string;
  script: string;
  timeout?: number; // in seconds
  accessToken: string;
}

export async function executeScriptViaSSH({
  projectId,
  zone,
  instanceName,
  username,
  script,
  timeout = 300,
  accessToken
}: SSHExecuteParams): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

  return new Promise((resolve, reject) => {
    const sshClient = new SSHClient();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timeoutHandle: NodeJS.Timeout;

    // Set up timeout
    timeoutHandle = setTimeout(() => {
      console.error('Script execution timed out');
      sshClient.end();
      reject(new Error(`Script execution timed out after ${timeout} seconds`));
    }, timeout * 1000);

    sshClient.on('ready', () => {
      console.log('SSH connection established for script execution');

      // Execute the script with login shell to get full environment
      sshClient.exec(`bash -l -s`, (err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle);
          sshClient.end();
          reject(err);
          return;
        }

        let scriptSent = false;

        stream.on('close', (code: number) => {
          console.log('Stream closed with code:', code);
          exitCode = code || 0;
          clearTimeout(timeoutHandle);
          sshClient.end();
          resolve({ stdout, stderr, exitCode });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        // Send the script content
        if (!scriptSent) {
          scriptSent = true;
          stream.write(script);
          if (!script.endsWith('\n')) {
            stream.write('\n');
          }
          stream.end();
        }
      });
    });

    sshClient.on('error', (err) => {
      console.error('SSH connection error:', err);
      clearTimeout(timeoutHandle);
      reject(err);
    });

    sshClient.on('close', () => {
      console.log('SSH connection closed');
      clearTimeout(timeoutHandle);
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