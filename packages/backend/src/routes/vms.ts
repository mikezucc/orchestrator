import { Hono } from 'hono';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { organizations, authUsers } from '../db/schema-auth.js';
import { eq, and } from 'drizzle-orm';
import type { CreateVMRequest, UpdateVMRequest, ApiResponse, VirtualMachine, ExecuteScriptRequest, ExecuteScriptResponse } from '@gce-platform/types';
import { createVM, deleteVM, startVM, stopVM, resumeVM, suspendVM, duplicateVM } from '../services/gcp.js';
import { executeScriptViaSSH } from '../services/gcp-ssh-execute.js';
import { executionSessionManager } from '../services/execution-sessions.js';
import { syncOrganizationVMsFromProjects } from '../services/gcp-sync-org.js';
import { syncSingleVM } from '../services/gcp-vm-sync.js';
import { getOrganizationAccessToken } from '../services/organization-auth.js';
import { flexibleAuth, flexibleRequireOrganization } from '../middleware/flexibleAuth.js';
import { GitHubAPIService } from '../services/github-api.js';
import { vmCreationProgress } from '../services/vm-creation-progress.js';

export const vmRoutes = new Hono();

// Apply flexible auth middleware to all routes
vmRoutes.use('*', flexibleAuth, flexibleRequireOrganization);

vmRoutes.get('/', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const syncRequested = c.req.query('sync') === 'true';
  
  // Get organization details to check GCP projects
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Organization not found' }, 404);
  }

  // If sync is requested and organization has GCP configured
  let syncErrors: string[] = [];
  console.log('Sync requested:', syncRequested);
  console.log('Organization has GCP refresh token:', !!organization.gcpRefreshToken);
  console.log('Organization GCP project IDs:', organization.gcpProjectIds);
  
  if (syncRequested && organization.gcpRefreshToken && organization.gcpProjectIds && organization.gcpProjectIds.length > 0) {
    try {
      const accessToken = await getOrganizationAccessToken(organizationId);
      console.log('Got access token:', !!accessToken);
      
      if (accessToken) {
        const syncResult = await syncOrganizationVMsFromProjects(
          organizationId, 
          accessToken, 
          organization.gcpProjectIds
        );
        console.log(`Synced ${syncResult.synced} VMs for organization ${organizationId}`);
        if (syncResult.errors.length > 0) {
          console.warn('Sync errors:', syncResult.errors);
          syncErrors = syncResult.errors;
        }
      } else {
        console.error('Failed to get access token for organization');
        syncErrors = ['Failed to authenticate with Google Cloud'];
      }
    } catch (error) {
      console.error('Failed to sync VMs:', error);
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: `Failed to sync VMs: ${error instanceof Error ? error.message : String(error)}` 
      }, 500);
    }
  }

  // Get VMs for the organization
  const vms = await db
    .select()
    .from(virtualMachines)
    .where(eq(virtualMachines.organizationId, organizationId));
  
  console.log(`Found ${vms.length} VMs for organization ${organizationId}`);
  
  // If there were sync errors, include them in a successful response but with a warning
  if (syncErrors.length > 0) {
    return c.json<ApiResponse<VirtualMachine[]>>({ 
      success: true, 
      data: vms as VirtualMachine[],
      error: `Sync completed with errors: ${syncErrors.join('; ')}` 
    });
  }
  
  return c.json<ApiResponse<VirtualMachine[]>>({ success: true, data: vms as VirtualMachine[] });
});

vmRoutes.get('/:id', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');
  const shouldSync = c.req.query('sync') === 'true';

  let [vm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!vm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  // Sync VM data from GCP if requested
  if (shouldSync) {
    try {
      const accessToken = await getOrganizationAccessToken(organizationId);
      if (accessToken) {
        await syncSingleVM(userId, vmId, accessToken);
        // Fetch updated VM data
        [vm] = await db.select().from(virtualMachines)
          .where(and(
            eq(virtualMachines.id, vmId),
            eq(virtualMachines.organizationId, organizationId)
          ));
      }
    } catch (error) {
      console.error('Failed to sync VM data:', error);
      // Don't fail the request, just log the error
    }
  }

  return c.json<ApiResponse<VirtualMachine>>({ success: true, data: vm as VirtualMachine });
});

vmRoutes.post('/', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;

  const body = await c.req.json<CreateVMRequest & { trackingId?: string }>();
  
  // Generate or use provided tracking ID
  const trackingId = body.trackingId || vmCreationProgress.generateTrackingId();

  const userBootScript = body.userBootScript?.trim() || '';
  
  try {
    // Report initial progress
    vmCreationProgress.reportPreparing(trackingId, 'Validating request and preparing resources...');
    
    // Get organization access token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      vmCreationProgress.reportError(trackingId, 'Failed to authenticate with Google Cloud');
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // We'll handle GitHub repository setup after VM is ready via SSH

    // Report creating VM
    vmCreationProgress.reportCreating(trackingId, 'Creating VM instance in Google Cloud...');

    const gcpInstance = await createVM({
      projectId: body.gcpProjectId,
      zone: body.zone,
      name: body.name,
      machineType: body.machineType,
      initScript: '', // Don't use init script, we'll execute via SSH instead
      accessToken,
    });

    // Report configuring VM
    vmCreationProgress.reportConfiguring(trackingId, 'Configuring VM settings and network...');

    const [vm] = await db.insert(virtualMachines).values({
      createdBy: userId,
      organizationId,
      name: body.name,
      gcpProjectId: body.gcpProjectId,
      zone: body.zone,
      machineType: body.machineType,
      status: 'pending',
      initScript: '', // We execute scripts via SSH instead
      gcpInstanceId: gcpInstance.id,
    }).returning();

    // Wait for VM to be ready
    vmCreationProgress.reportConfiguring(trackingId, 'Waiting for VM to be ready...');
    
    // Check VM status until it's running
    let vmReady = false;
    let retries = 0;
    const maxRetries = 60; // 5 minutes with 5 second intervals
    
    while (!vmReady && retries < maxRetries) {
      try {
        const { OAuth2Client } = await import('google-auth-library');
        const oauth2Client = new OAuth2Client();
        oauth2Client.setCredentials({ access_token: accessToken });
        const { google } = await import('googleapis');
        google.options({ auth: oauth2Client });
        const compute = google.compute('v1');
        
        const instance = await compute.instances.get({
          project: body.gcpProjectId,
          zone: body.zone,
          instance: gcpInstance.id,
        });
        
        if (instance.data.status === 'RUNNING') {
          vmReady = true;
          // Update VM status in database
          await db.update(virtualMachines)
            .set({ status: 'running', updatedAt: new Date() })
            .where(eq(virtualMachines.id, vm.id));
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          retries++;
          
          if (retries % 6 === 0) { // Every 30 seconds
            vmCreationProgress.reportConfiguring(
              trackingId, 
              `Waiting for VM to be ready... (${Math.floor(retries * 5 / 60)}m ${(retries * 5) % 60}s)`
            );
          }
        }
      } catch (error) {
        console.error('Error checking VM status:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
        retries++;
      }
    }
    
    if (!vmReady) {
      throw new Error('VM failed to become ready within 5 minutes');
    }

    // Get the VM's public IP address
    let publicIp = '';
    try {
      const { OAuth2Client } = await import('google-auth-library');
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      const { google } = await import('googleapis');
      google.options({ auth: oauth2Client });
      const compute = google.compute('v1');
      
      const instance = await compute.instances.get({
        project: body.gcpProjectId,
        zone: body.zone,
        instance: gcpInstance.id,
      });
      
      // Extract public IP from network interfaces
      const networkInterface = instance.data.networkInterfaces?.[0];
      const accessConfig = networkInterface?.accessConfigs?.[0];
      publicIp = accessConfig?.natIP || '';
      
      if (publicIp) {
        // Update VM with public IP
        await db.update(virtualMachines)
          .set({ publicIp, updatedAt: new Date() })
          .where(eq(virtualMachines.id, vm.id));
      }
    } catch (error) {
      console.error('Error getting VM public IP:', error);
    }

    // Wait for SSH to be ready and test reachability
    vmCreationProgress.reportConfiguring(trackingId, 'Waiting for SSH to be ready...');
    
    // Import net module for TCP connection testing
    const net = await import('net');
    
    let sshReady = false;
    let sshRetries = 0;
    const maxSshRetries = 30; // 30 attempts, 2 seconds each = 1 minute
    
    while (!sshReady && sshRetries < maxSshRetries && publicIp) {
      try {
        // Test TCP connection to SSH port
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection({ port: 22, host: publicIp }, () => {
            socket.end();
            resolve();
          });
          
          socket.on('error', (err) => {
            reject(err);
          });
          
          socket.setTimeout(5000, () => {
            socket.destroy();
            reject(new Error('Connection timeout'));
          });
        });
        
        sshReady = true;
        vmCreationProgress.reportConfiguring(trackingId, 'SSH is ready!');
      } catch (error) {
        sshRetries++;
        if (sshRetries % 5 === 0) { // Every 10 seconds
          vmCreationProgress.reportConfiguring(
            trackingId, 
            `Testing SSH connectivity... (attempt ${sshRetries}/${maxSshRetries})`
          );
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      }
    }
    
    if (!sshReady) {
      vmCreationProgress.reportConfiguring(
        trackingId, 
        'SSH connectivity could not be verified, but proceeding anyway...'
      );
    }
    
    // Additional wait for SSH daemon to fully initialize
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    // Get organization details for SSH username (needed for both scripts)
    let username = '';
    if (body.githubRepository || body.userBootScript) {
      const [organization] = await db.select().from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!organization || !organization.gcpEmail) {
        vmCreationProgress.reportError(trackingId, 'Organization does not have Google Cloud credentials configured');
        throw new Error('Organization does not have Google Cloud credentials configured');
      }

      // Generate username from organization's Google Cloud email
      username = organization.gcpEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // Execute GitHub repository setup script if needed
    if (body.githubRepository) {
      vmCreationProgress.reportInstalling(
        trackingId, 
        'Setting up GitHub SSH access...',
        'Generating SSH keys for GitHub'
      );

      try {
        // Get user's GitHub info for the SSH setup
        const [authUser] = await db
          .select({ 
            githubUsername: authUsers.githubUsername,
            githubEmail: authUsers.githubEmail
          })
          .from(authUsers)
          .where(eq(authUsers.id, userId.toString()))
          .limit(1);

        const githubUsername = authUser?.githubUsername || 'DevBox User';
        const githubEmail = authUser?.githubEmail || 'devbox@example.com';

        // First, generate SSH keys and get the public key
        const sshKeyGenScript = `
echo "=== Setting up SSH for GitHub ==="
echo

echo "=== Installing Git cause Debian sucks lol ==="
sudo apt -y install git < "/dev/null"

# Set up Git configuration
git config --global user.email "${githubEmail}"
git config --global user.name "${githubUsername}"

# Generate SSH key for GitHub
mkdir -p ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/github_devbox -N "" -C "devbox-vm-${body.name}"

# Add SSH key to SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/github_devbox

# Configure SSH for GitHub
cat > ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_devbox
  StrictHostKeyChecking no
EOF

chmod 600 ~/.ssh/config

# Display the public key
echo "=== GitHub SSH Key ==="
echo "Add this SSH key to your GitHub account:"
cat ~/.ssh/github_devbox.pub
echo "=== End of SSH Key ==="
echo
exit
`;

        const gitSessionId = `vm-git-${vm.id}-${Date.now()}`;
        vmCreationProgress.reportScriptOutput(trackingId, 'stdout', '\n=== Starting GitHub SSH Setup ===\n');
        
        // Variable to capture the SSH public key
        let capturedSSHKey = '';
        let isCapturingKey = false;
        
        const gitResult = await executeScriptViaSSH({
          projectId: body.gcpProjectId,
          zone: body.zone,
          instanceName: gcpInstance.id,
          username,
          script: sshKeyGenScript,
          timeout: 300000, // 5 minutes timeout for git operations
          accessToken,
          vmId: vm.id,
          organizationId,
          userId,
          githubSSHKey: false, // Don't add GitHub SSH key, script will generate its own
          sessionId: gitSessionId,
          onOutput: (type: 'stdout' | 'stderr', data: string) => {
            // Stream output to progress tracker
            vmCreationProgress.reportScriptOutput(trackingId, type, data);
            
            // Capture SSH key from output
            if (type === 'stdout') {
              if (data.includes('=== GitHub SSH Key ===')) {
                isCapturingKey = true;
                capturedSSHKey = ''; // Reset in case of multiple runs
              } else if (data.includes('=== End of SSH Key ===')) {
                isCapturingKey = false;
              } else if (isCapturingKey) {
                // Accumulate the key data, removing any prompts or extra text
                const lines = data.split('\n');
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  // SSH keys start with ssh- or ecdsa- or similar
                  if (trimmedLine.startsWith('ssh-') || trimmedLine.startsWith('ecdsa-') || 
                      trimmedLine.startsWith('ed25519-') || trimmedLine.includes('ssh-ed25519')) {
                    capturedSSHKey = trimmedLine;
                  }
                }
              }
            }
          },
        });

        if (gitResult.exitCode !== 0) {
          vmCreationProgress.reportError(
            trackingId,
            `GitHub repository setup failed with exit code ${gitResult.exitCode}`
          );
          vmCreationProgress.reportScriptOutput(trackingId, 'stderr', `\nRepository setup failed: ${gitResult.stderr}\n`);
        } else {
          vmCreationProgress.reportInstalling(
            trackingId,
            'GitHub repository setup completed successfully!'
          );
          vmCreationProgress.reportScriptOutput(trackingId, 'stdout', '\n=== SSH Key Generated Successfully ===\n');
          
          // Add SSH key to user's GitHub account if we captured it
          if (capturedSSHKey && userId) {
            try {
              vmCreationProgress.reportInstalling(trackingId, 'Adding SSH key to GitHub account...');
              
              const githubAPI = new GitHubAPIService();
              const keyTitle = `DevBox VM: ${body.name} (${new Date().toISOString().split('T')[0]})`;

              vmCreationProgress.reportInstalling(
                trackingId,
                `SSH key ${capturedSSHKey}`
              );
              
              const addedKey = await githubAPI.addSSHKey(userId, keyTitle, capturedSSHKey);
              
              if (addedKey) {
                vmCreationProgress.reportInstalling(
                  trackingId,
                  'SSH key added to GitHub account successfully!'
                );
                vmCreationProgress.reportScriptOutput(
                  trackingId, 
                  'stdout', 
                  `\n✓ SSH key automatically added to your GitHub account as "${keyTitle}"\n`
                );
                
                // Now clone the repository
                vmCreationProgress.reportInstalling(
                  trackingId,
                  'Cloning repository...',
                  `Cloning ${body.githubRepository.full_name}`
                );
                
                const cloneScript = `
echo "=== Cloning Repository ==="
echo "Repository: ${body.githubRepository.full_name}"
cd ~

# Clone the repository
git clone ${body.githubRepository.ssh_url}

# Enter the repository directory
cd $(basename "${body.githubRepository.ssh_url}" .git)

echo "=== Repository Cloned Successfully ==="
echo "Location: ~/$(basename "${body.githubRepository.ssh_url}" .git)"
pwd
exit
`;

                const cloneSessionId = `vm-clone-${vm.id}-${Date.now()}`;
                vmCreationProgress.reportScriptOutput(trackingId, 'stdout', '\n=== Starting Repository Clone ===\n');
                
                const cloneResult = await executeScriptViaSSH({
                  projectId: body.gcpProjectId,
                  zone: body.zone,
                  instanceName: gcpInstance.id,
                  username,
                  script: cloneScript,
                  timeout: 300000, // 5 minutes timeout for clone
                  accessToken,
                  vmId: vm.id,
                  organizationId,
                  userId,
                  githubSSHKey: false,
                  sessionId: cloneSessionId,
                  onOutput: (type: 'stdout' | 'stderr', data: string) => {
                    vmCreationProgress.reportScriptOutput(trackingId, type, data);
                  },
                });
                
                if (cloneResult.exitCode !== 0) {
                  vmCreationProgress.reportError(
                    trackingId,
                    `Repository clone failed with exit code ${cloneResult.exitCode}`
                  );
                  vmCreationProgress.reportScriptOutput(trackingId, 'stderr', `\nClone failed: ${cloneResult.stderr}\n`);
                } else {
                  vmCreationProgress.reportInstalling(
                    trackingId,
                    'Repository cloned successfully!'
                  );
                }
              } else {
                vmCreationProgress.reportScriptOutput(
                  trackingId, 
                  'stderr', 
                  '\n⚠ Failed to add SSH key to GitHub account. You may need to add it manually.\n'
                );
              }
            } catch (error) {
              console.error('Failed to add SSH key to GitHub:', error);
              vmCreationProgress.reportScriptOutput(
                trackingId, 
                'stderr', 
                `\n⚠ Could not add SSH key to GitHub: ${error instanceof Error ? error.message : String(error)}\n`
              );
              vmCreationProgress.reportScriptOutput(
                trackingId, 
                'stdout', 
                `\nPlease add the following SSH key to your GitHub account manually:\n${capturedSSHKey}\n`
              );
            }
          }
        }
      } catch (error) {
        console.error('Failed to execute GitHub setup script:', error);
        vmCreationProgress.reportError(
          trackingId, 
          `Failed to setup GitHub repository: ${error instanceof Error ? error.message : String(error)}`
        );
        vmCreationProgress.reportScriptOutput(trackingId, 'stderr', `\nError: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }

    // Execute user boot script if provided
    if (userBootScript) {
      vmCreationProgress.reportInstalling(
        trackingId, 
        'Executing user boot script...',
        'Running custom setup commands'
      );

      try {
        const bootSessionId = `vm-boot-${vm.id}-${Date.now()}`;

        vmCreationProgress.reportScriptOutput(trackingId, 'stdout', '\n=== Starting User Boot Script ===\n');
        
        const bootResult = await executeScriptViaSSH({
          projectId: body.gcpProjectId,
          zone: body.zone,
          instanceName: gcpInstance.id,
          username,
          script: userBootScript,
          timeout: 600000, // 10 minutes timeout for user scripts
          accessToken,
          vmId: vm.id,
          organizationId,
          userId,
          githubSSHKey: false,
          sessionId: bootSessionId,
          onOutput: (type: 'stdout' | 'stderr', data: string) => {
            // Stream output to progress tracker
            vmCreationProgress.reportScriptOutput(trackingId, type, data);
          },
        });

        if (bootResult.exitCode !== 0) {
          vmCreationProgress.reportError(
            trackingId,
            `User boot script failed with exit code ${bootResult.exitCode}`
          );
          vmCreationProgress.reportScriptOutput(trackingId, 'stderr', `\nBoot script failed: ${bootResult.stderr}\n`);
        } else {
          vmCreationProgress.reportInstalling(
            trackingId,
            'User boot script completed successfully!'
          );
          vmCreationProgress.reportScriptOutput(trackingId, 'stdout', '\n=== User Boot Script Completed Successfully ===\n');
        }
      } catch (error) {
        console.error('Failed to execute user boot script:', error);
        vmCreationProgress.reportError(
          trackingId, 
          `Failed to execute user boot script: ${error instanceof Error ? error.message : String(error)}`
        );
        vmCreationProgress.reportScriptOutput(trackingId, 'stderr', `\nError: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }

    // Report finalizing
    vmCreationProgress.reportFinalizing(trackingId, 'Finalizing VM setup...');

    // Report complete
    vmCreationProgress.reportComplete(trackingId, vm.id, 'VM created successfully!');

    return c.json<ApiResponse<VirtualMachine & { trackingId: string }>>({ 
      success: true, 
      data: { ...vm as VirtualMachine, trackingId } 
    });
  } catch (error) {
    vmCreationProgress.reportError(trackingId, String(error));
    return c.json<ApiResponse<never>>({ success: false, error: String(error) }, 500);
  }
});

vmRoutes.post('/:id/start', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');

  const [vm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!vm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  try {
    // Get organization access token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // Use appropriate action based on current status
    if (vm.status === 'suspended') {
      await resumeVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    } else {
      await startVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    }
    
    await db.update(virtualMachines)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM started' } });
  } catch (error: any) {
    console.error('Failed to start VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 404) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'VM instance not found in Google Cloud. It may have been deleted outside this platform.' 
      }, 404);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.post('/:id/stop', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');

  const [vm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!vm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  try {
    // Get organization access token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    await stopVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    await db.update(virtualMachines)
      .set({ status: 'stopped', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM stopped' } });
  } catch (error: any) {
    console.error('Failed to stop VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 404) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'VM instance not found in Google Cloud. It may have been deleted outside this platform.' 
      }, 404);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.post('/:id/suspend', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');

  const [vm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!vm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  if (vm.status !== 'running') {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM must be running to suspend' }, 400);
  }

  try {
    // Get organization access token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    await suspendVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId!, accessToken);
    await db.update(virtualMachines)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(virtualMachines.id, vmId));

    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'VM suspended' } });
  } catch (error: any) {
    console.error('Failed to suspend VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 404) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'VM instance not found in Google Cloud. It may have been deleted outside this platform.' 
      }, 404);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.post('/:id/execute', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');

  const body = await c.req.json<ExecuteScriptRequest>();
  
  if (!body.script) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Script is required' }, 400);
  }

  const [vm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!vm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  if (vm.status !== 'running') {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM must be running to execute scripts' }, 400);
  }

  try {
    // Get organization to get GCP email for username
    const [organization] = await db.select().from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!organization || !organization.gcpEmail) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Organization does not have Google Cloud credentials configured' }, 400);
    }

    // Generate username from organization's Google Cloud email
    const username = organization.gcpEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Get organization access token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    const result = await executeScriptViaSSH({
      projectId: vm.gcpProjectId,
      zone: vm.zone,
      instanceName: vm.gcpInstanceId!,
      username,
      script: body.script,
      timeout: body.timeout,
      accessToken,
      vmId: vm.id,
      organizationId,
      userId,
      githubSSHKey: body.githubSSHKey,
    });

    return c.json<ApiResponse<ExecuteScriptResponse>>({ 
      success: true, 
      data: result 
    });
  } catch (error: any) {
    console.error('Failed to execute script on VM:', error);
    
    // Handle specific errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure SSH access is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 404) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'VM instance not found in Google Cloud.' 
      }, 404);
    } else if (error.message?.includes('timed out')) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: error.message 
      }, 408);
    }
    
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: error.message || String(error) 
    }, 500);
  }
});

vmRoutes.post('/:id/execute/abort', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');
  
  const body = await c.req.json<{ sessionId: string }>();
  
  if (!body.sessionId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Session ID is required' }, 400);
  }

  // Check if VM exists and belongs to the organization
  const [vm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!vm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  // Get the session to verify it belongs to this user/org
  const session = executionSessionManager.getSession(body.sessionId);
  
  if (!session) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Execution session not found' }, 404);
  }
  
  if (session.organizationId !== organizationId || session.userId !== userId || session.vmId !== vmId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Unauthorized to abort this session' }, 403);
  }

  // Abort the session
  const aborted = executionSessionManager.abortSession(body.sessionId);
  
  if (aborted) {
    return c.json<ApiResponse<{ aborted: boolean }>>({ 
      success: true, 
      data: { aborted: true } 
    });
  } else {
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to abort execution session' 
    }, 500);
  }
});

vmRoutes.post('/:id/duplicate', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');

  const body = await c.req.json<{ name: string; startupScript?: string }>();
  
  if (!body.name) {
    return c.json<ApiResponse<never>>({ success: false, error: 'New VM name is required' }, 400);
  }

  // Check if name already exists within the organization
  const existingVm = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.name, body.name),
      eq(virtualMachines.organizationId, organizationId)
    ));
  
  if (existingVm.length > 0) {
    return c.json<ApiResponse<never>>({ success: false, error: 'A VM with this name already exists' }, 400);
  }

  const [sourceVm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!sourceVm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'Source VM not found' }, 404);
  }

  try {
    // Get organization access token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // Duplicate the VM in GCP
    await duplicateVM({
      sourceProjectId: sourceVm.gcpProjectId,
      sourceZone: sourceVm.zone,
      sourceInstanceName: sourceVm.gcpInstanceId!,
      newName: body.name,
      startupScript: body.startupScript,
      accessToken,
    });

    return c.json<ApiResponse<VirtualMachine>>({ 
      success: true, 
      data: newVm as VirtualMachine 
    });
  } catch (error: any) {
    console.error('Failed to duplicate VM:', error);
    
    // Handle specific Google Cloud errors
    if (error.code === 403) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Permission denied. Please ensure the Compute Engine API is enabled and you have the necessary permissions.' 
      }, 403);
    } else if (error.code === 409) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'A VM with this name already exists in Google Cloud' 
      }, 409);
    }
    
    return c.json<ApiResponse<never>>({ success: false, error: error.message || String(error) }, 500);
  }
});

vmRoutes.delete('/:id', async (c) => {
  const organizationId = (c as any).organizationId;
  const userId = (c as any).userId;
  const vmId = c.req.param('id');

  const [vm] = await db.select().from(virtualMachines)
    .where(and(
      eq(virtualMachines.id, vmId),
      eq(virtualMachines.organizationId, organizationId)
    ));

  if (!vm) {
    return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
  }

  let gcpDeletionError: string | null = null;

  // Try to delete from GCP if we have credentials
  const accessToken = await getOrganizationAccessToken(organizationId);
  if (accessToken && vm.gcpInstanceId) {
    try {
      await deleteVM(vm.gcpProjectId, vm.zone, vm.gcpInstanceId, accessToken);
    } catch (error: any) {
      console.error('Failed to delete VM from GCP:', error);
      gcpDeletionError = error.message || String(error);
      // Continue with database deletion even if GCP deletion fails
    }
  }

  // Delete associated firewall rules from database
  try {
    const { firewallRules } = await import('../db/schema.js');
    await db.delete(firewallRules).where(eq(firewallRules.vmId, vmId));
  } catch (error) {
    console.error('Failed to delete associated firewall rules:', error);
    // Continue with VM deletion even if firewall rule deletion fails
  }

  // Always delete from our database
  try {
    await db.delete(virtualMachines).where(eq(virtualMachines.id, vmId));
  } catch (error) {
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: `Failed to delete VM from database: ${error}` 
    }, 500);
  }

  // Return success with warning if GCP deletion failed
  if (gcpDeletionError) {
    return c.json<ApiResponse<{ message: string; warning: string }>>({ 
      success: true, 
      data: { 
        message: 'VM deleted from database', 
        warning: `Failed to delete from GCP: ${gcpDeletionError}. The VM may still exist in Google Cloud.` 
      } 
    });
  }

  return c.json<ApiResponse<{ message: string }>>({ 
    success: true, 
    data: { message: 'VM deleted successfully' } 
  });
});