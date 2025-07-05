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
  
  try {
    // Report initial progress
    vmCreationProgress.reportPreparing(trackingId, 'Validating request and preparing resources...');
    // Get organization access token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      vmCreationProgress.reportError(trackingId, 'Failed to authenticate with Google Cloud');
      return c.json<ApiResponse<never>>({ success: false, error: 'Failed to authenticate with Google Cloud' }, 401);
    }

    // Generate the complete init script
    let completeInitScript = body.initScript || '';

    // If GitHub repository is provided, create the repository setup script
    if (body.githubRepository) {
      vmCreationProgress.reportPreparing(trackingId, 'Preparing GitHub repository configuration...');
      // Get user's GitHub info
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

      // Create the repository setup script
      const repoSetupScript = `#!/bin/bash
set -e

echo "=== DevBox VM Setup with GitHub Repository ==="
echo

# Wait for cloud-init to complete
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do
  echo "Waiting for cloud-init to finish..."
  sleep 5
done

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

# Display the public key for manual addition to GitHub
echo
echo "=== GitHub SSH Key ==="
echo "Add this SSH key to your GitHub account:"
echo
cat ~/.ssh/github_devbox.pub
echo
echo "=== End of SSH Key ==="
echo

# Clone the repository
echo "Cloning repository: ${body.githubRepository.full_name}"
cd ~
git clone ${body.githubRepository.ssh_url}

# Enter the repository directory
cd $(basename "${body.githubRepository.ssh_url}" .git)
${body.userBootScript ? `

# Run user's custom boot script
echo
echo "=== Running User Boot Script ==="
${body.userBootScript}` : ''}

echo
echo "=== Setup Complete ==="
echo "Repository cloned to: ~/$(basename "${body.githubRepository.ssh_url}" .git)"
`;

      // Combine with any existing init script
      completeInitScript = repoSetupScript;
    } else if (body.userBootScript) {
      // If no repository but user boot script is provided
      completeInitScript = body.userBootScript;
    }

    // Report creating VM
    vmCreationProgress.reportCreating(trackingId, 'Creating VM instance in Google Cloud...');

    const gcpInstance = await createVM({
      projectId: body.gcpProjectId,
      zone: body.zone,
      name: body.name,
      machineType: body.machineType,
      initScript: completeInitScript,
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
      initScript: completeInitScript,
      gcpInstanceId: gcpInstance.id,
    }).returning();

    // Report installing software
    if (body.githubRepository || body.userBootScript) {
      vmCreationProgress.reportInstalling(
        trackingId, 
        'VM is booting and running setup scripts...',
        body.githubRepository ? `Repository: ${body.githubRepository.full_name}` : undefined
      );
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