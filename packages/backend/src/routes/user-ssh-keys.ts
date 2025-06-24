import { Hono } from 'hono';
import { flexibleAuth } from '../middleware/flexibleAuth.js';
import { 
  getUserSSHKeys, 
  getUserSSHKeyWithPrivate, 
  toggleSSHKeyStatus, 
  deleteUserSSHKey,
  getUserGitHubSSHKey
} from '../services/user-ssh-keys.js';
import { generateSSHKeys } from '../services/gcp-ssh.js';
import { db } from '../db/index.js';
import { userSSHKeys, auditLogs } from '../db/schema-auth.js';
import { encrypt } from '../utils/auth.js';
import crypto from 'crypto';

export const userSSHKeysRoutes = new Hono();

// Apply authentication middleware
userSSHKeysRoutes.use('*', flexibleAuth);

// Get all SSH keys for the authenticated user
userSSHKeysRoutes.get('/', async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    const keys = await getUserSSHKeys(userId);

    return c.json({
      success: true,
      data: keys,
    });
  } catch (error) {
    console.error('Failed to get SSH keys:', error);
    return c.json({ success: false, error: 'Failed to retrieve SSH keys' }, 500);
  }
});

// Generate a new SSH key
userSSHKeysRoutes.post('/generate', async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;
    const { keyName } = await c.req.json();

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    if (!keyName) {
      return c.json({ success: false, error: 'Key name is required' }, 400);
    }

    // Validate key name
    if (!/^[a-zA-Z0-9-_]+$/.test(keyName)) {
      return c.json({ success: false, error: 'Key name must contain only letters, numbers, hyphens, and underscores' }, 400);
    }

    // Generate SSH key pair
    const { publicKey, privateKey } = await generateSSHKeys(keyName);
    
    // Calculate fingerprint
    const fingerprint = crypto
      .createHash('md5')
      .update(Buffer.from(publicKey.split(' ')[1], 'base64'))
      .digest('hex')
      .match(/.{1,2}/g)!
      .join(':');

    // Encrypt private key
    const encryptedPrivateKey = encrypt(privateKey);

    // Save to database
    const [newKey] = await db.insert(userSSHKeys).values({
      userId,
      keyName,
      publicKey,
      privateKeyEncrypted: encryptedPrivateKey,
      fingerprint,
      keyType: 'ssh-rsa',
      source: 'generated',
      isActive: true,
    }).returning();

    // Log the action
    await db.insert(auditLogs).values({
      userId,
      action: 'ssh_key.generated',
      resourceType: 'ssh_key',
      resourceId: newKey.id,
      metadata: { keyName, fingerprint },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      success: true,
      data: {
        id: newKey.id,
        keyName: newKey.keyName,
        publicKey: newKey.publicKey,
        fingerprint: newKey.fingerprint,
        keyType: newKey.keyType,
        source: newKey.source,
        isActive: newKey.isActive,
        createdAt: newKey.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Failed to generate SSH key:', error);
    
    if (error.message?.includes('duplicate key')) {
      return c.json({ success: false, error: 'An SSH key with this name already exists' }, 400);
    }
    
    return c.json({ success: false, error: 'Failed to generate SSH key' }, 500);
  }
});

// Get a specific SSH key with private key (for download)
userSSHKeysRoutes.get('/:keyId/download', async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;
    const keyId = c.req.param('keyId');

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    const key = await getUserSSHKeyWithPrivate(userId, keyId);

    if (!key) {
      return c.json({ success: false, error: 'SSH key not found' }, 404);
    }

    // Log the action
    await db.insert(auditLogs).values({
      userId,
      action: 'ssh_key.downloaded',
      resourceType: 'ssh_key',
      resourceId: keyId,
      metadata: { keyName: key.keyName },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      success: true,
      data: {
        keyName: key.keyName,
        publicKey: key.publicKey,
        privateKey: key.privateKey,
        fingerprint: key.fingerprint,
      },
    });
  } catch (error) {
    console.error('Failed to download SSH key:', error);
    return c.json({ success: false, error: 'Failed to download SSH key' }, 500);
  }
});

// Get GitHub SSH key for VM use
userSSHKeysRoutes.get('/github', async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    const key = await getUserGitHubSSHKey(userId);

    if (!key) {
      return c.json({ success: false, error: 'GitHub account not connected or SSH key not found' }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: key.id,
        keyName: key.keyName,
        publicKey: key.publicKey,
        privateKey: key.privateKey,
        fingerprint: key.fingerprint,
      },
    });
  } catch (error) {
    console.error('Failed to get GitHub SSH key:', error);
    return c.json({ success: false, error: 'Failed to retrieve GitHub SSH key' }, 500);
  }
});

// Toggle SSH key active status
userSSHKeysRoutes.patch('/:keyId/toggle', async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;
    const keyId = c.req.param('keyId');

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    const newStatus = await toggleSSHKeyStatus(userId, keyId);

    // Log the action
    await db.insert(auditLogs).values({
      userId,
      action: newStatus ? 'ssh_key.activated' : 'ssh_key.deactivated',
      resourceType: 'ssh_key',
      resourceId: keyId,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      success: true,
      data: { isActive: newStatus },
    });
  } catch (error: any) {
    console.error('Failed to toggle SSH key:', error);
    
    if (error.message === 'SSH key not found') {
      return c.json({ success: false, error: 'SSH key not found' }, 404);
    }
    
    return c.json({ success: false, error: 'Failed to toggle SSH key status' }, 500);
  }
});

// Delete an SSH key
userSSHKeysRoutes.delete('/:keyId', async (c) => {
  try {
    const userId = (c as any).userId || (c as any).user?.id;
    const keyId = c.req.param('keyId');

    if (!userId) {
      return c.json({ success: false, error: 'User not authenticated' }, 401);
    }

    await deleteUserSSHKey(userId, keyId);

    // Log the action
    await db.insert(auditLogs).values({
      userId,
      action: 'ssh_key.deleted',
      resourceType: 'ssh_key',
      resourceId: keyId,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '',
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ success: true, message: 'SSH key deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete SSH key:', error);
    
    if (error.message === 'SSH key not found') {
      return c.json({ success: false, error: 'SSH key not found' }, 404);
    }
    
    return c.json({ success: false, error: 'Failed to delete SSH key' }, 500);
  }
});

export default userSSHKeysRoutes;