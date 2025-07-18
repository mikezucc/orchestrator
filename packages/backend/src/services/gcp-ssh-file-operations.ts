import { NodeSSH } from 'node-ssh';
import { connectToInstance } from './gcp-ssh-execute';

interface WriteFileOptions {
  projectId: string;
  zone: string;
  instanceName: string;
  username: string;
  filePath: string;
  content: string | Buffer;
  permissions?: string;
  sudo?: boolean;
  accessToken: string;
}

interface WriteMultipleFilesOptions extends Omit<WriteFileOptions, 'filePath' | 'content' | 'permissions'> {
  files: Array<{
    filePath: string;
    content: string | Buffer;
    permissions?: string;
  }>;
}

export async function writeFileViaSSH(options: WriteFileOptions): Promise<void> {
  const {
    projectId,
    zone,
    instanceName,
    username,
    filePath,
    content,
    permissions = '644',
    sudo = false,
    accessToken
  } = options;

  const ssh = new NodeSSH();

  try {
    await connectToInstance(ssh, projectId, zone, instanceName, username, accessToken);

    if (sudo) {
      const tempPath = `/tmp/${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      await ssh.execCommand(`touch ${tempPath}`);
      await ssh.execCommand(`chmod 666 ${tempPath}`);
      
      await ssh.putFile(Buffer.from(content).toString('base64'), tempPath, {
        mode: permissions,
        encoding: 'base64'
      });
      
      const result = await ssh.execCommand(`sudo mv ${tempPath} ${filePath} && sudo chmod ${permissions} ${filePath}`);
      
      if (result.code !== 0) {
        throw new Error(`Failed to move file to ${filePath}: ${result.stderr}`);
      }
    } else {
      await ssh.putFile(Buffer.from(content).toString('base64'), filePath, {
        mode: permissions,
        encoding: 'base64'
      });
    }

    console.log(`Successfully wrote file to ${filePath} on ${instanceName}`);
  } catch (error) {
    console.error(`Failed to write file via SSH: ${error}`);
    throw error;
  } finally {
    ssh.dispose();
  }
}

export async function writeMultipleFilesViaSSH(options: WriteMultipleFilesOptions): Promise<void> {
  const {
    projectId,
    zone,
    instanceName,
    username,
    files,
    sudo = false,
    accessToken
  } = options;

  const ssh = new NodeSSH();

  try {
    await connectToInstance(ssh, projectId, zone, instanceName, username, accessToken);

    for (const file of files) {
      const { filePath, content, permissions = '644' } = file;

      if (sudo) {
        const tempPath = `/tmp/${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        await ssh.execCommand(`touch ${tempPath}`);
        await ssh.execCommand(`chmod 666 ${tempPath}`);
        
        await ssh.putFile(Buffer.from(content).toString('base64'), tempPath, {
          mode: permissions,
          encoding: 'base64'
        });
        
        const result = await ssh.execCommand(`sudo mv ${tempPath} ${filePath} && sudo chmod ${permissions} ${filePath}`);
        
        if (result.code !== 0) {
          throw new Error(`Failed to move file to ${filePath}: ${result.stderr}`);
        }
      } else {
        await ssh.putFile(Buffer.from(content).toString('base64'), filePath, {
          mode: permissions,
          encoding: 'base64'
        });
      }

      console.log(`Successfully wrote file to ${filePath}`);
    }

    console.log(`Successfully wrote ${files.length} files to ${instanceName}`);
  } catch (error) {
    console.error(`Failed to write files via SSH: ${error}`);
    throw error;
  } finally {
    ssh.dispose();
  }
}

export async function createDirectoryViaSSH(options: Omit<WriteFileOptions, 'content' | 'permissions'>): Promise<void> {
  const {
    projectId,
    zone,
    instanceName,
    username,
    filePath: directoryPath,
    sudo = false,
    accessToken
  } = options;

  const ssh = new NodeSSH();

  try {
    await connectToInstance(ssh, projectId, zone, instanceName, username, accessToken);

    const command = sudo 
      ? `sudo mkdir -p ${directoryPath}` 
      : `mkdir -p ${directoryPath}`;
    
    const result = await ssh.execCommand(command);
    
    if (result.code !== 0) {
      throw new Error(`Failed to create directory ${directoryPath}: ${result.stderr}`);
    }

    console.log(`Successfully created directory ${directoryPath} on ${instanceName}`);
  } catch (error) {
    console.error(`Failed to create directory via SSH: ${error}`);
    throw error;
  } finally {
    ssh.dispose();
  }
}