import { Hono } from 'hono';
import axios, { AxiosError } from 'axios';
import { db } from '../db/index.js';
import { virtualMachines } from '../db/schema.js';
import { organizationMembers, organizations } from '../db/schema-auth.js';
import { and, eq } from 'drizzle-orm';
import { flexibleAuth } from '../middleware/flexibleAuth.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { 
  WormholeStatus, 
  WormholeRepositories, 
  WormholeBranchSwitchRequest,
  WormholeBranchSwitchResponse,
  ApiResponse
} from '@gce-platform/types';

export const wormholeRoutes = new Hono();

// Get the directory path for storing binaries
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BINARIES_DIR = path.join(__dirname, '../../wormhole-binaries');

// Initialize binaries directory
async function initBinariesDir() {
  try {
    await fs.mkdir(BINARIES_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create binaries directory:', error);
  }
}
initBinariesDir();

// Helper function to get Wormhole server URL for a VM
function getWormholeUrl(publicIp: string): string {
  return `https://ws.slopbox.dev`;
}

// Helper function to check if user is member of slopboxprimary org
async function isSlopboxPrimaryMember(userId: string): Promise<boolean> {
  // First get the slopboxprimary org
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, 'slopboxprimary'))
    .limit(1);
  
  if (!org) {
    return false;
  }

  // Check if user is a member
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, org.id)
      )
    )
    .limit(1);

  return !!membership;
}

// Get Wormhole server status
wormholeRoutes.get('/:vmId/status', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');

  console.log('Fetching Wormhole status for VM ID:', vmId);
  
  try {
    // Get VM details to find public IP
    const resp = await db.select().from(virtualMachines).where(
      eq(virtualMachines.id, vmId)
    );

    console.log('VM details:', resp);

    const [vm] = resp;

    console.log('VM details details:', vm);

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    if (!vm.publicIp) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM does not have a public IP' }, 400);
    }

    // Forward request to Wormhole server
    const response = await axios.get<WormholeStatus>(`${getWormholeUrl(vm.publicIp)}/api/status`);
    
    return c.json<ApiResponse<WormholeStatus>>({ success: true, data: response.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        return c.json<ApiResponse<never>>({ 
          success: false, 
          error: 'Could not connect to Wormhole service. Ensure it is running on port 8080.' 
        }, 503);
      }
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: axiosError.response?.data || 'Failed to connect to Wormhole service' 
      }, axiosError.response?.status || 500);
    }
    console.error('Error fetching Wormhole status:', error);
    return c.json<ApiResponse<never>>({ success: false, error: 'Failed to fetch Wormhole status' }, 500);
  }
});

// Get repository information
wormholeRoutes.get('/:vmId/repositories', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');
  
  try {
    // Get VM details to find public IP
    const [vm] = await db.select().from(virtualMachines).where(
      eq(virtualMachines.id, vmId)
    );

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    if (!vm.publicIp) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM does not have a public IP' }, 400);
    }

    // Forward request to Wormhole server
    const response = await axios.get<WormholeRepositories>(`${getWormholeUrl(vm.publicIp)}/api/repositories`);
    
    return c.json<ApiResponse<WormholeRepositories>>({ success: true, data: response.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        return c.json<ApiResponse<never>>({ 
          success: false, 
          error: 'Could not connect to Wormhole service. Ensure it is running on port 8080.' 
        }, 503);
      }
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: axiosError.response?.data || 'Failed to connect to Wormhole service' 
      }, axiosError.response?.status || 500);
    }
    console.error('Error fetching repositories:', error);
    return c.json<ApiResponse<never>>({ success: false, error: 'Failed to fetch repositories' }, 500);
  }
});

// Trigger branch switch
wormholeRoutes.post('/:vmId/branch-switch', async (c) => {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    return c.json<ApiResponse<never>>({ success: false, error: 'User ID is required' }, 401);
  }

  const vmId = c.req.param('vmId');
  
  try {
    // Get VM details to find public IP
    const [vm] = await db.select().from(virtualMachines).where(
      and(
        eq(virtualMachines.id, vmId)
      )
    );

    if (!vm) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM not found' }, 404);
    }

    if (!vm.publicIp) {
      return c.json<ApiResponse<never>>({ success: false, error: 'VM does not have a public IP' }, 400);
    }

    // Get request body
    const body = await c.req.json<WormholeBranchSwitchRequest>();
    
    if (!body.targetBranch || !body.repoPath) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'targetBranch and repoPath are required' 
      }, 400);
    }

    // Forward request to Wormhole server
    const response = await axios.post<WormholeBranchSwitchResponse>(
      `${getWormholeUrl(vm.publicIp)}/api/branch-switch`,
      body
    );
    
    return c.json<ApiResponse<WormholeBranchSwitchResponse>>({ success: true, data: response.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        return c.json<ApiResponse<never>>({ 
          success: false, 
          error: 'Could not connect to Wormhole service. Ensure it is running on port 8080.' 
        }, 503);
      }
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: axiosError.response?.data || 'Failed to connect to Wormhole service' 
      }, axiosError.response?.status || 500);
    }
    console.error('Error triggering branch switch:', error);
    return c.json<ApiResponse<never>>({ success: false, error: 'Failed to trigger branch switch' }, 500);
  }
});

// WebSocket proxy endpoint - This will be handled separately in the main server
// as Hono doesn't directly support WebSocket proxying

// Get all connected daemons status from central server (slopboxprimary only)
wormholeRoutes.get('/debug/all-daemons', flexibleAuth, async (c) => {
  try {
    const userId = (c as any).userId;
    
    if (!userId) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Authentication required' 
      }, 401);
    }
    
    // Check if user is member of slopboxprimary
    const isMember = await isSlopboxPrimaryMember(userId);
    if (!isMember) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Only members of slopboxprimary organization can access debug information' 
      }, 403);
    }
    
    // Fetch all daemon statuses from central server
    const response = await axios.get('https://ws.slopbox.dev/debug/all-clients');
    
    return c.json<ApiResponse<any>>({ 
      success: true, 
      data: response.data 
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: axiosError.response?.data || 'Failed to fetch daemon statuses' 
      }, axiosError.response?.status || 500);
    }
    console.error('Error fetching all daemon statuses:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to fetch daemon statuses' 
    }, 500);
  }
});

// Download wormhole daemon binary
wormholeRoutes.get('/daemon/download', async (c) => {
  try {
    const platform = c.req.query('platform') || 'linux-amd64';
    const binaryPath = path.join(BINARIES_DIR, `wormhole-daemon-${platform}`);
    
    // Check if binary exists
    try {
      await fs.access(binaryPath);
    } catch {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: `No binary available for platform: ${platform}` 
      }, 404);
    }
    
    // Read the binary
    const binary = await fs.readFile(binaryPath);
    
    // Set appropriate headers
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="wormhole-daemon-${platform}"`);
    
    return c.body(binary);
  } catch (error) {
    console.error('Error downloading wormhole daemon:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to download wormhole daemon' 
    }, 500);
  }
});

// Upload new wormhole daemon binary (restricted to slopboxprimary members)
wormholeRoutes.post('/daemon/upload', flexibleAuth, async (c) => {
  try {
    const userId = (c as any).userId;
    
    if (!userId) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Authentication required' 
      }, 401);
    }
    
    // Check if user is member of slopboxprimary
    const isMember = await isSlopboxPrimaryMember(userId);
    if (!isMember) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'Only members of slopboxprimary organization can upload binaries' 
      }, 403);
    }
    
    // Get platform from query or default
    const platform = c.req.query('platform') || 'linux-amd64';
    
    // Parse the multipart form data
    const formData = await c.req.formData();
    const file = formData.get('binary') as File;
    
    if (!file) {
      return c.json<ApiResponse<never>>({ 
        success: false, 
        error: 'No binary file provided' 
      }, 400);
    }
    
    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Save the binary
    const binaryPath = path.join(BINARIES_DIR, `wormhole-daemon-${platform}`);
    await fs.writeFile(binaryPath, buffer);
    
    // Make it executable
    await fs.chmod(binaryPath, 0o755);
    
    return c.json<ApiResponse<{ platform: string; size: number }>>({ 
      success: true, 
      data: {
        platform,
        size: buffer.length
      }
    });
  } catch (error) {
    console.error('Error uploading wormhole daemon:', error);
    return c.json<ApiResponse<never>>({ 
      success: false, 
      error: 'Failed to upload wormhole daemon' 
    }, 500);
  }
});

export default wormholeRoutes;