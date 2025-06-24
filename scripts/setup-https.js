#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🔐 Setting up HTTPS for both frontend and backend...\n');

// Generate backend certificates
console.log('📦 Backend certificates:');
try {
  process.chdir(path.join(rootDir, 'packages', 'backend'));
  execSync('npm run generate-certs', { stdio: 'inherit' });
  
  // Create/update backend .env.local
  const backendEnvPath = path.join(rootDir, 'packages', 'backend', '.env.local');
  let backendEnv = '';
  
  if (fs.existsSync(backendEnvPath)) {
    backendEnv = fs.readFileSync(backendEnvPath, 'utf8');
  }
  
  // Update or add HTTPS settings
  const httpsSettings = [
    'HTTPS_ENABLED=true',
    'SSL_CERT_PATH=./certs/cert.pem',
    'SSL_KEY_PATH=./certs/key.pem'
  ];
  
  httpsSettings.forEach(setting => {
    const key = setting.split('=')[0];
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(backendEnv)) {
      backendEnv = backendEnv.replace(regex, setting);
    } else {
      backendEnv += `\n${setting}`;
    }
  });
  
  fs.writeFileSync(backendEnvPath, backendEnv.trim() + '\n');
  console.log('✅ Backend .env.local updated\n');
} catch (error) {
  console.error('❌ Failed to setup backend HTTPS:', error.message);
  process.exit(1);
}

// Generate frontend certificates
console.log('📦 Frontend certificates:');
try {
  process.chdir(path.join(rootDir, 'packages', 'frontend'));
  execSync('npm run generate-certs', { stdio: 'inherit' });
  
  // Create/update frontend .env.local
  const frontendEnvPath = path.join(rootDir, 'packages', 'frontend', '.env.local');
  let frontendEnv = '';
  
  if (fs.existsSync(frontendEnvPath)) {
    frontendEnv = fs.readFileSync(frontendEnvPath, 'utf8');
  }
  
  // Update or add HTTPS settings
  const httpsSettings = [
    'VITE_HTTPS_ENABLED=true',
    'VITE_SSL_CERT_PATH=./certs/cert.pem',
    'VITE_SSL_KEY_PATH=./certs/key.pem',
    'VITE_BACKEND_HTTPS=true'
  ];
  
  httpsSettings.forEach(setting => {
    const key = setting.split('=')[0];
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(frontendEnv)) {
      frontendEnv = frontendEnv.replace(regex, setting);
    } else {
      frontendEnv += `\n${setting}`;
    }
  });
  
  fs.writeFileSync(frontendEnvPath, frontendEnv.trim() + '\n');
  console.log('✅ Frontend .env.local updated\n');
} catch (error) {
  console.error('❌ Failed to setup frontend HTTPS:', error.message);
  process.exit(1);
}

console.log('🎉 HTTPS setup complete!\n');
console.log('To start both servers with HTTPS:');
console.log('1. Backend: cd packages/backend && npm run dev');
console.log('2. Frontend: cd packages/frontend && npm run dev');
console.log('\nServers will be available at:');
console.log('- Frontend: https://localhost:5173');
console.log('- Backend: https://localhost:3000');
console.log('\n⚠️  Note: You will need to accept the self-signed certificates in your browser.');