# VM Details API Documentation

## Port Descriptions API

This document outlines the API endpoints for retrieving and managing port descriptions for virtual machines in the orchestrator platform.

## Overview

The Port Descriptions API allows external services to retrieve detailed information about ports running on a specific virtual machine, including custom descriptions, service names, and metadata that helps identify what services are exposed.

## Base URL

```
https://{orchestrator-host}/api
```

## Authentication

All API requests require authentication using a Bearer token in the Authorization header:

```
Authorization: Bearer {access_token}
```

## Endpoints

### Get Port Descriptions for a VM

Retrieves all port descriptions associated with a specific virtual machine.

**Endpoint:** `GET /api/vms/:vmId/ports`

**Parameters:**
- `vmId` (string, required) - The unique identifier of the virtual machine

**Response Format:**

```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "vmId": "string",
      "port": 8080,
      "protocol": "tcp",
      "name": "Web Server",
      "description": "Main application web server",
      "processName": "nginx",
      "isFavorite": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Response Fields:**
- `id` - Unique identifier for the port description
- `vmId` - The VM this port description belongs to
- `port` - The port number (1-65535)
- `protocol` - The protocol (tcp/udp)
- `name` - Short, descriptive name for the service
- `description` - Detailed description of what the service does
- `processName` - Name of the process that owns this port (optional)
- `isFavorite` - Whether this port is marked as a favorite
- `createdAt` - Timestamp when the description was created
- `updatedAt` - Timestamp when the description was last modified

**Example Request:**

```bash
curl -X GET \
  https://orchestrator.example.com/api/vms/vm-12345/ports \
  -H "Authorization: Bearer your-access-token"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "pd-001",
      "vmId": "vm-12345",
      "port": 3000,
      "protocol": "tcp",
      "name": "Frontend Dev Server",
      "description": "React development server for the main application",
      "processName": "node",
      "isFavorite": true,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "pd-002",
      "vmId": "vm-12345",
      "port": 5432,
      "protocol": "tcp",
      "name": "PostgreSQL Database",
      "description": "Main application database",
      "processName": "postgres",
      "isFavorite": true,
      "createdAt": "2024-01-15T10:31:00Z",
      "updatedAt": "2024-01-15T10:31:00Z"
    },
    {
      "id": "pd-003",
      "vmId": "vm-12345",
      "port": 8080,
      "protocol": "tcp",
      "name": "API Server",
      "description": "REST API backend service",
      "processName": null,
      "isFavorite": false,
      "createdAt": "2024-01-15T10:32:00Z",
      "updatedAt": "2024-01-15T10:32:00Z"
    }
  ]
}
```

### Get Active Ports with Descriptions

Retrieves real-time port information from the VM combined with saved descriptions. This endpoint requires the VM to have the Wormhole service running.

**Endpoint:** `GET /api/vms/:vmId/active-ports`

**Parameters:**
- `vmId` (string, required) - The unique identifier of the virtual machine

**Response Format:**

```json
{
  "success": true,
  "data": {
    "ports": [
      {
        "port": 3000,
        "protocol": "tcp",
        "state": "LISTEN",
        "service": "node",
        "processName": "node",
        "pid": 12345,
        "description": {
          "id": "pd-001",
          "name": "Frontend Dev Server",
          "description": "React development server for the main application",
          "isFavorite": true
        }
      }
    ],
    "lastUpdated": "2024-01-15T10:35:00Z"
  }
}
```

**Response Fields:**
- `ports` - Array of active ports with their descriptions
  - `port` - The port number
  - `protocol` - The protocol (tcp/udp)
  - `state` - Port state (LISTEN, ESTABLISHED, etc.)
  - `service` - Service name detected by the system
  - `processName` - Process name that owns the port
  - `pid` - Process ID
  - `description` - Associated port description (if exists)
- `lastUpdated` - When this data was last refreshed

### Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

**Common Error Codes:**
- `VM_NOT_FOUND` - The specified VM does not exist
- `UNAUTHORIZED` - Invalid or missing authentication token
- `FORBIDDEN` - User doesn't have permission to access this VM
- `WORMHOLE_DISCONNECTED` - Wormhole service is not connected (for active ports endpoint)

## Integration Example

Here's a complete example of how to integrate with the Port Descriptions API:

```javascript
// Fetch port descriptions for a VM
async function getVMPortDescriptions(vmId, accessToken) {
  try {
    const response = await fetch(`https://orchestrator.example.com/api/vms/${vmId}/ports`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error.message);
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching port descriptions:', error);
    throw error;
  }
}

// Example usage
const vmId = 'vm-12345';
const accessToken = 'your-access-token';

try {
  const portDescriptions = await getVMPortDescriptions(vmId, accessToken);
  
  // Display favorite ports
  const favoritePorts = portDescriptions.filter(p => p.isFavorite);
  console.log('Favorite services:');
  favoritePorts.forEach(port => {
    console.log(`- ${port.name} (${port.port}/${port.protocol}): ${port.description}`);
  });
  
} catch (error) {
  console.error('Failed to get port descriptions:', error);
}
```

## Implementation Details

### Data Model

Port descriptions are stored in the PostgreSQL database with the following schema:

```sql
CREATE TABLE port_descriptions (
  id TEXT PRIMARY KEY,
  vm_id TEXT NOT NULL REFERENCES vms(id) ON DELETE CASCADE,
  port INTEGER NOT NULL CHECK (port >= 1 AND port <= 65535),
  protocol TEXT NOT NULL CHECK (protocol IN ('tcp', 'udp')),
  name TEXT NOT NULL,
  description TEXT,
  process_name TEXT,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vm_id, port, protocol)
);
```

### Caching

- Port descriptions are cached in the frontend application using React Query
- Cache invalidation occurs when descriptions are updated
- Real-time port data is fetched every 10 seconds when the Wormhole connection is active

### Permissions

- Users must have `read` permission on the VM to view port descriptions
- Users must have `write` permission on the VM to create/update port descriptions
- Port descriptions are shared across all users with access to the VM

## Best Practices

1. **Cache responses** - Port descriptions don't change frequently, so cache them appropriately
2. **Handle disconnected state** - The active ports endpoint requires Wormhole connection
3. **Batch requests** - If querying multiple VMs, consider implementing a batch endpoint
4. **Filter by favorites** - For dashboards, filter by `isFavorite: true` to show key services

## Rate Limits

- Standard API rate limits apply: 1000 requests per hour per authenticated user
- Burst limit: 100 requests per minute

## Webhook Events (Future Enhancement)

The following webhook events are planned for future releases:

- `port.description.created` - When a new port description is added
- `port.description.updated` - When a port description is modified
- `port.description.deleted` - When a port description is removed
- `port.status.changed` - When a described port goes up/down

## Support

For API support, please contact the platform team or file an issue in the orchestrator repository.