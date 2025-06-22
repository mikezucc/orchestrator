import { createId } from '@paralleldrive/cuid2';
import crypto from 'crypto';

export interface OTPStore {
  [email: string]: {
    code: string;
    expiresAt: Date;
    attempts: number;
  };
}

// In-memory OTP store (in production, use Redis or database)
const otpStore: OTPStore = {};

export function generateOTP(): string {
  // Generate a 6-digit OTP
  return crypto.randomInt(100000, 999999).toString();
}

export function storeOTP(email: string, code: string, expiryMinutes: number = 5): void {
  otpStore[email] = {
    code,
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    attempts: 0
  };
}

export function verifyOTP(email: string, code: string): boolean {
  const otpData = otpStore[email];
  
  if (!otpData) {
    return false;
  }
  
  // Check if OTP is expired
  if (new Date() > otpData.expiresAt) {
    delete otpStore[email];
    return false;
  }
  
  // Check if too many attempts
  if (otpData.attempts >= 3) {
    delete otpStore[email];
    return false;
  }
  
  // Increment attempts
  otpData.attempts++;
  
  // Verify code
  if (otpData.code === code) {
    delete otpStore[email];
    return true;
  }
  
  return false;
}

export function cleanupExpiredOTPs(): void {
  const now = new Date();
  for (const email in otpStore) {
    if (otpStore[email].expiresAt < now) {
      delete otpStore[email];
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredOTPs, 60 * 1000);