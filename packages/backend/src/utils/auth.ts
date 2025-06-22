import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const APP_NAME = 'DevBox Orchestrator';

// Generate TOTP secret for a user
export function generateTOTPSecret(email: string) {
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${email})`,
    length: 32,
  });
  
  return {
    secret: secret.base32,
    url: secret.otpauth_url!,
  };
}

// Generate QR code for TOTP setup
export async function generateQRCode(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl);
}

// Verify TOTP token
export function verifyTOTP(token: string, secret: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps in either direction for clock skew
  });
}

// Generate session token
export function generateSessionToken(userId: string, organizationId?: string): string {
  return jwt.sign(
    { 
      userId,
      organizationId,
      type: 'session' 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify session token
export function verifySessionToken(token: string): { userId: string; organizationId?: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== 'session') return null;
    return { userId: decoded.userId, organizationId: decoded.organizationId };
  } catch {
    return null;
  }
}

// Generate email verification token
export function generateEmailToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Hash sensitive data (for storing TOTP secrets)
export async function hashData(data: string): Promise<string> {
  return bcrypt.hash(data, 10);
}

// Verify hashed data
export async function verifyHash(data: string, hash: string): Promise<boolean> {
  return bcrypt.compare(data, hash);
}

// Generate random password for initial setup (users will use TOTP instead)
export function generateRandomPassword(): string {
  return crypto.randomBytes(32).toString('base64');
}

// Encrypt TOTP secret for storage
export function encryptTOTPSecret(secret: string): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'your-32-byte-encryption-key-here', 'utf8');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

// Decrypt TOTP secret
export function decryptTOTPSecret(encryptedData: string): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'your-32-byte-encryption-key-here', 'utf8');
  
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}