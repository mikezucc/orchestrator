import { db } from '../db/index.js';
import { userSSHKeys, authUsers } from '../db/schema-auth.js';
import { eq, and, desc } from 'drizzle-orm';
import { decrypt } from '../utils/auth.js';
import crypto from 'crypto';

interface UserSSHKey {
  id: string;
  keyName: string;
  publicKey: string;
  fingerprint: string;
  keyType: string;
  source: 'github' | 'manual' | 'generated';
  isActive: boolean;
  createdAt: Date;
}

interface SSHKeyWithPrivate extends UserSSHKey {
  privateKey: string;
}

// Get all SSH keys for a user
export async function getUserSSHKeys(userId: string): Promise<UserSSHKey[]> {
  const keys = await db
    .select({
      id: userSSHKeys.id,
      keyName: userSSHKeys.keyName,
      publicKey: userSSHKeys.publicKey,
      fingerprint: userSSHKeys.fingerprint,
      keyType: userSSHKeys.keyType,
      source: userSSHKeys.source,
      isActive: userSSHKeys.isActive,
      createdAt: userSSHKeys.createdAt,
    })
    .from(userSSHKeys)
    .where(eq(userSSHKeys.userId, userId))
    .orderBy(desc(userSSHKeys.createdAt));

  return keys;
}

// Get active SSH keys for a user
export async function getActiveUserSSHKeys(userId: string): Promise<UserSSHKey[]> {
  const keys = await db
    .select({
      id: userSSHKeys.id,
      keyName: userSSHKeys.keyName,
      publicKey: userSSHKeys.publicKey,
      fingerprint: userSSHKeys.fingerprint,
      keyType: userSSHKeys.keyType,
      source: userSSHKeys.source,
      isActive: userSSHKeys.isActive,
      createdAt: userSSHKeys.createdAt,
    })
    .from(userSSHKeys)
    .where(and(
      eq(userSSHKeys.userId, userId),
      eq(userSSHKeys.isActive, true)
    ))
    .orderBy(desc(userSSHKeys.createdAt));

  return keys;
}

// Get a specific SSH key with decrypted private key
export async function getUserSSHKeyWithPrivate(userId: string, keyId: string): Promise<SSHKeyWithPrivate | null> {
  const [key] = await db
    .select()
    .from(userSSHKeys)
    .where(and(
      eq(userSSHKeys.userId, userId),
      eq(userSSHKeys.id, keyId)
    ))
    .limit(1);

  if (!key) {
    return null;
  }

  const privateKey = decrypt(key.privateKeyEncrypted);

  return {
    id: key.id,
    keyName: key.keyName,
    publicKey: key.publicKey,
    privateKey,
    fingerprint: key.fingerprint,
    keyType: key.keyType,
    source: key.source,
    isActive: key.isActive,
    createdAt: key.createdAt,
  };
}

// Get GitHub SSH key for a user
export async function getUserGitHubSSHKey(userId: string): Promise<SSHKeyWithPrivate | null> {
  // First get the user's GitHub username
  const [user] = await db
    .select({
      githubUsername: authUsers.githubUsername,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);

  if (!user?.githubUsername) {
    return null;
  }

  const keyName = `github-${user.githubUsername}`;

  const [key] = await db
    .select()
    .from(userSSHKeys)
    .where(and(
      eq(userSSHKeys.userId, userId),
      eq(userSSHKeys.keyName, keyName),
      eq(userSSHKeys.source, 'github'),
      eq(userSSHKeys.isActive, true)
    ))
    .limit(1);

  if (!key) {
    return null;
  }

  const privateKey = decrypt(key.privateKeyEncrypted);

  return {
    id: key.id,
    keyName: key.keyName,
    publicKey: key.publicKey,
    privateKey,
    fingerprint: key.fingerprint,
    keyType: key.keyType,
    source: key.source,
    isActive: key.isActive,
    createdAt: key.createdAt,
  };
}

// Get formatted SSH public keys for VM injection
export async function getFormattedUserSSHKeys(userId: string, username: string): Promise<string[]> {
  const keys = await getActiveUserSSHKeys(userId);
  
  // Format keys for VM metadata (username:ssh-rsa KEY comment)
  return keys.map(key => {
    // Extract the key parts
    const parts = key.publicKey.split(' ');
    const keyType = parts[0];
    const keyData = parts[1];
    const comment = parts.slice(2).join(' ') || `${username}@orchestrator`;
    
    // Rebuild with username prefix
    return `${username}:${keyType} ${keyData} ${comment}`;
  });
}

// Toggle SSH key active status
export async function toggleSSHKeyStatus(userId: string, keyId: string): Promise<boolean> {
  const [key] = await db
    .select({ isActive: userSSHKeys.isActive })
    .from(userSSHKeys)
    .where(and(
      eq(userSSHKeys.userId, userId),
      eq(userSSHKeys.id, keyId)
    ))
    .limit(1);

  if (!key) {
    throw new Error('SSH key not found');
  }

  await db
    .update(userSSHKeys)
    .set({
      isActive: !key.isActive,
      updatedAt: new Date(),
    })
    .where(eq(userSSHKeys.id, keyId));

  return !key.isActive;
}

// Delete an SSH key
export async function deleteUserSSHKey(userId: string, keyId: string): Promise<void> {
  const result = await db
    .delete(userSSHKeys)
    .where(and(
      eq(userSSHKeys.userId, userId),
      eq(userSSHKeys.id, keyId)
    ));

  if (!result) {
    throw new Error('SSH key not found');
  }
}

// Update last used timestamp
export async function updateSSHKeyLastUsed(keyId: string): Promise<void> {
  await db
    .update(userSSHKeys)
    .set({
      lastUsedAt: new Date(),
    })
    .where(eq(userSSHKeys.id, keyId));
}