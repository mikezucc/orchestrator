import { executeScriptViaSSH } from './gcp-ssh-execute.js';

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

  try {
    // Convert content to base64 to safely handle binary data and special characters
    const base64Content = Buffer.from(content).toString('base64');
    
    // Create a script that writes the file
    const script = sudo ? `
# Create temporary file
TEMP_FILE=$(mktemp)
# Decode base64 content and write to temp file
echo "${base64Content}" | base64 -d > "$TEMP_FILE"
# Move to final location with sudo
sudo mv "$TEMP_FILE" "${filePath}"
# Set permissions
sudo chmod ${permissions} "${filePath}"
# Verify file was written
if [ -f "${filePath}" ]; then
  echo "File successfully written to ${filePath}"
else
  echo "Failed to write file to ${filePath}" >&2
  exit 1
fi
    ` : `
# Create directory if it doesn't exist
mkdir -p "$(dirname "${filePath}")"
# Decode base64 content and write to file
echo "${base64Content}" | base64 -d > "${filePath}"
# Set permissions
chmod ${permissions} "${filePath}"
# Verify file was written
if [ -f "${filePath}" ]; then
  echo "File successfully written to ${filePath}"
else
  echo "Failed to write file to ${filePath}" >&2
  exit 1
fi
    `;

    const result = await executeScriptViaSSH({
      projectId,
      zone,
      instanceName,
      username,
      script,
      accessToken,
      timeout: 30
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file to ${filePath}: ${result.stderr}`);
    }

    console.log(`Successfully wrote file to ${filePath} on ${instanceName}`);
  } catch (error) {
    console.error(`Failed to write file via SSH: ${error}`);
    throw error;
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

  try {
    // Build a single script to write all files
    const scriptParts: string[] = ['#!/bin/bash', 'set -e', ''];
    
    for (const file of files) {
      const { filePath, content, permissions = '644' } = file;
      const base64Content = Buffer.from(content).toString('base64');
      
      if (sudo) {
        scriptParts.push(`
# Write file: ${filePath}
TEMP_FILE=$(mktemp)
echo "${base64Content}" | base64 -d > "$TEMP_FILE"
sudo mkdir -p "$(dirname "${filePath}")"
sudo mv "$TEMP_FILE" "${filePath}"
sudo chmod ${permissions} "${filePath}"
if [ -f "${filePath}" ]; then
  echo "Successfully wrote ${filePath}"
else
  echo "Failed to write ${filePath}" >&2
  exit 1
fi
`);
      } else {
        scriptParts.push(`
# Write file: ${filePath}
mkdir -p "$(dirname "${filePath}")"
echo "${base64Content}" | base64 -d > "${filePath}"
chmod ${permissions} "${filePath}"
if [ -f "${filePath}" ]; then
  echo "Successfully wrote ${filePath}"
else
  echo "Failed to write ${filePath}" >&2
  exit 1
fi
`);
      }
    }
    
    scriptParts.push(`echo "Successfully wrote ${files.length} files"`);
    const script = scriptParts.join('\n');

    const result = await executeScriptViaSSH({
      projectId,
      zone,
      instanceName,
      username,
      script,
      accessToken,
      timeout: 60 // Increase timeout for multiple files
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write files: ${result.stderr}`);
    }

    console.log(`Successfully wrote ${files.length} files to ${instanceName}`);
  } catch (error) {
    console.error(`Failed to write files via SSH: ${error}`);
    throw error;
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

  try {
    const script = sudo 
      ? `sudo mkdir -p "${directoryPath}" && echo "Successfully created directory ${directoryPath}"` 
      : `mkdir -p "${directoryPath}" && echo "Successfully created directory ${directoryPath}"`;
    
    const result = await executeScriptViaSSH({
      projectId,
      zone,
      instanceName,
      username,
      script,
      accessToken,
      timeout: 10
    });
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory ${directoryPath}: ${result.stderr}`);
    }

    console.log(`Successfully created directory ${directoryPath} on ${instanceName}`);
  } catch (error) {
    console.error(`Failed to create directory via SSH: ${error}`);
    throw error;
  }
}