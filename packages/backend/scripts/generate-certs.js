#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certsDir = path.join(__dirname, '..', 'certs');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

const certPath = path.join(certsDir, 'cert.pem');
const keyPath = path.join(certsDir, 'key.pem');

// Check if certificates already exist
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('Certificates already exist in', certsDir);
  console.log('To regenerate, delete the existing certificates first.');
  process.exit(0);
}

console.log('Generating self-signed certificates for development...');

try {
  // Generate private key and certificate
  execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`, {
    stdio: 'inherit'
  });

  console.log('✅ Certificates generated successfully!');
  console.log('Certificate:', certPath);
  console.log('Private key:', keyPath);
  console.log('\nTo enable HTTPS, add these to your .env file:');
  console.log('HTTPS_ENABLED=true');
  console.log(`SSL_CERT_PATH=${certPath}`);
  console.log(`SSL_KEY_PATH=${keyPath}`);
} catch (error) {
  console.error('Failed to generate certificates:', error.message);
  console.error('Make sure OpenSSL is installed on your system.');
  process.exit(1);
}