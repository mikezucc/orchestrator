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
const configPath = path.join(certsDir, 'openssl.cnf');

// Parse command line arguments
const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force');
const domains = args.filter(arg => !arg.startsWith('--'));

// Default domains if none specified
const defaultDomains = ['localhost', 'slopbox.dev', '*.slopbox.dev', 'api.slopbox.dev'];
const allDomains = domains.length > 0 ? domains : defaultDomains;

// Check if certificates already exist
if (!forceRegenerate && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('Certificates already exist in', certsDir);
  console.log('To regenerate, use --force flag or delete the existing certificates.');
  process.exit(0);
}

console.log('Generating self-signed certificates for development...');
console.log('Domains:', allDomains.join(', '));

// Create OpenSSL config file with Subject Alternative Names
const opensslConfig = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = DevBox Orchestrator
CN = ${allDomains[0]}

[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${allDomains.map((domain, index) => {
  if (domain.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    // IP address
    return `IP.${index + 1} = ${domain}`;
  } else {
    // Domain name
    return `DNS.${index + 1} = ${domain}`;
  }
}).join('\n')}
`;

try {
  // Write OpenSSL config
  fs.writeFileSync(configPath, opensslConfig);

  // Generate private key and certificate with SAN (Subject Alternative Names)
  execSync(`openssl req -x509 -nodes -days 365 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -config "${configPath}" -extensions v3_req`, {
    stdio: 'inherit'
  });

  // Clean up config file
  fs.unlinkSync(configPath);

  console.log('✅ Certificates generated successfully!');
  console.log('Certificate:', certPath);
  console.log('Private key:', keyPath);
  console.log('\nTo enable HTTPS, add these to your .env file:');
  console.log('VITE_HTTPS_ENABLED=true');
  console.log(`VITE_SSL_CERT_PATH=${certPath}`);
  console.log(`VITE_SSL_KEY_PATH=${keyPath}`);
  console.log('\nThe certificate includes the following domains:');
  allDomains.forEach(domain => console.log(`  - ${domain}`));
  console.log('\nNote: Browsers will show a security warning for self-signed certificates.');
  console.log('You\'ll need to accept the certificate in your browser to proceed.');
} catch (error) {
  console.error('Failed to generate certificates:', error.message);
  console.error('Make sure OpenSSL is installed on your system.');
  process.exit(1);
}