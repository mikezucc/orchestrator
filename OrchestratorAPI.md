# Orchestrator API Documentation

## Overview

The Orchestrator API provides a comprehensive interface for managing Google Cloud Platform (GCP) virtual machines, SSH access, firewall rules, and development environments. The API supports two authentication methods: OTP (One-Time Password) with TOTP (Time-based OTP) and Google OAuth.

## Base URL

```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

The API uses a flexible authentication system that supports two methods:

### 1. OTP/TOTP Authentication

This is the primary authentication method for email-based login.

#### Sign Up Flow

```bash
# 1. Request sign up
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "organizationName": "My Company"
  }'

# Response:
{
  "success": true,
  "message": "Please check your email to verify your account",
  "userId": "user_id_here"
}

# 2. Verify email (user clicks link in email or uses token)
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "verification_token_from_email"
  }'

# Response:
{
  "success": true,
  "message": "Email verified successfully",
  "userId": "user_id_here"
}

# 3. Setup TOTP
curl -X POST http://localhost:3000/api/auth/setup-totp \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_id_here"
  }'

# Response:
{
  "success": true,
  "qrCode": "data:image/png;base64,...", // QR code for authenticator app
  "secret": "TOTP_SECRET",
  "setupToken": "setup_token_here"
}

# 4. Confirm TOTP setup
curl -X POST http://localhost:3000/api/auth/confirm-totp \
  -H "Content-Type: application/json" \
  -d '{
    "setupToken": "setup_token_here",
    "totpCode": "123456" // Code from authenticator app
  }'

# Response:
{
  "success": true,
  "token": "jwt_token_here",
  "organizationId": "org_id_here"
}
```

#### Login Flow

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "totpCode": "123456"
  }'

# Response:
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "organizations": [
    {
      "id": "org_id",
      "name": "My Company",
      "role": "owner"
    }
  ]
}
```

### 2. Google OAuth Authentication

For users who prefer to authenticate with their existing Google Cloud credentials.

```bash
# 1. Get user ID and auth token from your Google OAuth flow
# 2. Use the token with x-user-id header:

curl -X GET http://localhost:3000/api/vms \
  -H "Authorization: Bearer google_oauth_token" \
  -H "x-user-id: user_id" \
  -H "x-organization-id: org_id" # Optional
```

### Using Authentication

For all authenticated endpoints, include the token in the Authorization header:

```bash
curl -X GET http://localhost:3000/api/vms \
  -H "Authorization: Bearer your_jwt_token"
```

For flexible auth endpoints, you can use either authentication method.

## Core Resources

### Organizations

Organizations are the top-level resource that contains VMs, members, and Google Cloud credentials.

#### Get User's Organizations

```bash
curl -X GET http://localhost:3000/api/organizations/user/memberships \
  -H "Authorization: Bearer your_token"

# Response:
{
  "success": true,
  "data": [
    {
      "organization": {
        "id": "org_id",
        "name": "My Company",
        "slug": "my-company",
        "hasGoogleAuth": true,
        "gcpProjectIds": ["project-1", "project-2"]
      },
      "role": "owner",
      "joinedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Switch Organization

```bash
curl -X POST http://localhost:3000/api/auth/switch-organization \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_id"
  }'

# Response:
{
  "success": true,
  "token": "new_jwt_token", // New token with organization context
  "organizationId": "org_id"
}
```

### Virtual Machines

VMs are the primary resource for managing Google Cloud compute instances.

#### List VMs

```bash
curl -X GET http://localhost:3000/api/vms?sync=true \
  -H "Authorization: Bearer your_token"

# Response:
{
  "success": true,
  "data": [
    {
      "id": "vm_id",
      "name": "dev-machine-1",
      "organizationId": "org_id",
      "gcpProjectId": "my-gcp-project",
      "zone": "us-central1-a",
      "machineType": "e2-medium",
      "status": "running",
      "publicIp": "34.125.67.89",
      "gcpInstanceId": "1234567890",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Create VM

```bash
curl -X POST http://localhost:3000/api/vms \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev-machine-2",
    "machineType": "e2-medium",
    "zone": "us-central1-a",
    "projectId": "my-gcp-project", // Optional, uses org default if not provided
    "startupScript": "#!/bin/bash\necho \"Hello World\""
  }'
```

#### VM Operations

```bash
# Start VM
curl -X POST http://localhost:3000/api/vms/vm_id/start \
  -H "Authorization: Bearer your_token"

# Stop VM
curl -X POST http://localhost:3000/api/vms/vm_id/stop \
  -H "Authorization: Bearer your_token"

# Delete VM
curl -X DELETE http://localhost:3000/api/vms/vm_id \
  -H "Authorization: Bearer your_token"
```

### SSH Access

The API provides SSH key management and WebSocket-based terminal access.

#### Setup SSH Keys

```bash
curl -X POST http://localhost:3000/api/ssh/vm_id/setup \
  -H "Authorization: Bearer your_token"

# Response:
{
  "success": true,
  "data": {
    "username": "admin", // Derived from org's Google Cloud account
    "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
    "publicKey": "ssh-rsa AAAAB3...",
    "host": "34.125.67.89",
    "port": 22
  }
}
```

#### WebSocket SSH Connection

```javascript
// JavaScript example for WebSocket SSH connection
const token = 'your_jwt_token';
const vmId = 'vm_id';
const organizationId = 'org_id';
const userId = 'user_id'; // Only needed for Google OAuth

const ws = new WebSocket(
  `ws://localhost:3000/ssh-ws?vmId=${vmId}&token=${encodeURIComponent(token)}&organizationId=${organizationId}`
);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'connected':
      console.log('SSH connected:', msg.data);
      break;
    case 'data':
      // Terminal output (base64 encoded)
      const output = atob(msg.data);
      console.log(output);
      break;
    case 'error':
      console.error('SSH error:', msg.data);
      break;
  }
};

// Send terminal input
ws.send(JSON.stringify({
  type: 'data',
  data: btoa('ls -la\n') // Base64 encode input
}));

// Resize terminal
ws.send(JSON.stringify({
  type: 'resize',
  cols: 80,
  rows: 24
}));
```

### Firewall Rules

Manage GCP firewall rules for VMs.

#### List Firewall Rules

```bash
curl -X GET http://localhost:3000/api/firewall/vm/vm_id?sync=true \
  -H "Authorization: Bearer your_token"
```

#### Create Firewall Rule

```bash
curl -X POST http://localhost:3000/api/firewall \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "vmId": "vm_id",
    "name": "allow-http",
    "direction": "ingress",
    "priority": 1000,
    "sourceRanges": ["0.0.0.0/0"],
    "ports": [
      {
        "protocol": "tcp",
        "ports": ["80", "443"]
      }
    ]
  }'
```

### Wormhole Integration

The Wormhole service provides repository management and development environment features.

#### Check Wormhole Status

```bash
curl -X GET http://localhost:3000/api/wormhole/vm_id/status \
  -H "Authorization: Bearer your_token" \
  -H "x-user-id: user_id"

# Response:
{
  "success": true,
  "data": {
    "installed": true,
    "running": true,
    "version": "1.0.0",
    "port": 52241
  }
}
```

#### Get Active Repositories

```bash
curl -X GET http://localhost:3000/api/wormhole/vm_id/repositories \
  -H "Authorization: Bearer your_token" \
  -H "x-user-id: user_id"

# Response:
{
  "success": true,
  "data": {
    "repositories": [
      {
        "name": "my-project",
        "path": "/home/user/projects/my-project",
        "remote": "https://github.com/user/my-project.git",
        "branch": "main",
        "status": "clean",
        "lastCommit": {
          "hash": "abc123",
          "message": "Latest commit",
          "author": "John Doe",
          "date": "2024-01-01T00:00:00Z"
        }
      }
    ]
  }
}
```

#### Switch Repository Branch

```bash
curl -X POST http://localhost:3000/api/wormhole/vm_id/branch-switch \
  -H "Authorization: Bearer your_token" \
  -H "x-user-id: user_id" \
  -H "Content-Type: application/json" \
  -d '{
    "repositoryPath": "/home/user/projects/my-project",
    "targetBranch": "feature/new-feature",
    "createIfNotExists": true
  }'
```

## Error Handling

All API responses follow a consistent format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

Error responses include appropriate HTTP status codes:
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

Example error response:

```json
{
  "success": false,
  "error": "VM not found"
}
```

## Rate Limiting

The API implements rate limiting for certain endpoints:
- Authentication endpoints: 5 requests per minute per IP
- API endpoints: 100 requests per minute per authenticated user

## Desktop Application Integration Guide

### 1. Authentication Flow

For a desktop application, implement the following flow:

1. **Initial Setup**: Check if user has stored credentials
2. **Login Options**: Offer both OTP/TOTP and Google OAuth
3. **Token Storage**: Securely store JWT tokens (use OS keychain/credential manager)
4. **Token Refresh**: Implement token refresh before expiration
5. **Organization Selection**: After login, fetch organizations and allow selection

### 2. Repository Detection

To find active repositories on VMs:

1. List all VMs for the selected organization
2. For each running VM, check Wormhole status
3. If Wormhole is active, fetch repositories
4. Display repositories with their current branch and status

### 3. Persistent Connection

For real-time features:
- Use WebSocket for SSH connections
- Implement reconnection logic for network interruptions
- Handle terminal resize events from the desktop UI

### 4. Security Considerations

- Never store passwords or TOTP secrets
- Use secure storage for JWT tokens
- Implement certificate pinning for production
- Validate SSL certificates
- Handle token expiration gracefully

### 5. Example Desktop App Flow

```javascript
class OrchestratorClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.token = null;
    this.organizationId = null;
  }

  async login(email, totpCode) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, totpCode })
    });
    
    const data = await response.json();
    if (data.success) {
      this.token = data.token;
      // Store token securely
      await this.secureStorage.setToken(data.token);
      return data;
    }
    throw new Error(data.error);
  }

  async getActiveRepositories() {
    // Get all VMs
    const vms = await this.getVMs();
    
    const repositories = [];
    for (const vm of vms.data) {
      if (vm.status === 'running') {
        try {
          // Check Wormhole status
          const status = await this.getWormholeStatus(vm.id);
          if (status.data.running) {
            // Get repositories
            const repos = await this.getRepositories(vm.id);
            repositories.push({
              vm: vm,
              repositories: repos.data.repositories
            });
          }
        } catch (error) {
          console.error(`Failed to check VM ${vm.name}:`, error);
        }
      }
    }
    
    return repositories;
  }

  async getVMs() {
    const response = await fetch(`${this.baseUrl}/vms`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    return response.json();
  }

  async getWormholeStatus(vmId) {
    const response = await fetch(`${this.baseUrl}/wormhole/${vmId}/status`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'x-user-id': this.userId
      }
    });
    return response.json();
  }

  async getRepositories(vmId) {
    const response = await fetch(`${this.baseUrl}/wormhole/${vmId}/repositories`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'x-user-id': this.userId
      }
    });
    return response.json();
  }
}
```

## API Versioning

The API currently uses URL-based versioning. Future versions will be available at:
- v1: `/api/v1/` (current)
- v2: `/api/v2/` (future)

## Support

For issues or questions:
- GitHub Issues: [your-repo-url]/issues
- Documentation: [your-docs-url]
- Email: support@your-domain.com