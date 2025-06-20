# Wormhole Server API Documentation

The Wormhole server provides both WebSocket and REST API endpoints for managing file synchronization across distributed development environments. This guide explains how external services can interact with the Wormhole server.

## Server Connection

The Wormhole server runs on port 8080 by default (configurable via `WORMHOLE_PORT` environment variable).

- **WebSocket endpoint**: `ws://localhost:8080`
- **REST API base URL**: `http://localhost:8080`

## REST API Endpoints

### 1. Get Server Status

Retrieve information about all connected clients and branches.

**Request:**
```http
GET /api/status
```

**Response:**
```json
{
  "clients": [
    {
      "id": "abc123",
      "branch": "main",
      "repoPath": "/path/to/repo",
      "connected": true,
      "lastActivity": 1703123456789
    }
  ],
  "branches": [
    {
      "branch": "main",
      "clientCount": 2
    }
  ]
}
```

### 2. Get Repository Information

Retrieve detailed information about repositories and their branches.

**Request:**
```http
GET /api/repositories
```

**Response:**
```json
[
  {
    "repoPath": "/path/to/repo",
    "branches": ["main", "develop", "feature/xyz"],
    "activeBranches": ["main", "develop"],
    "clientCount": 3,
    "connectedClientCount": 2,
    "clients": [
      {
        "id": "abc123",
        "branch": "main",
        "connected": true,
        "lastActivity": 1703123456789
      }
    ]
  }
]
```

**Response Fields:**
- `repoPath`: Full path to the repository
- `branches`: All branches that have been used by clients
- `activeBranches`: Branches with currently connected clients
- `clientCount`: Total number of clients (connected and disconnected)
- `connectedClientCount`: Number of currently connected clients
- `clients`: Detailed list of clients sorted by most recent activity

### 3. Trigger Branch Switch

Command all clients monitoring a specific repository to switch branches.

**Request:**
```http
POST /api/branch-switch
Content-Type: application/json

{
  "targetBranch": "feature/new-feature",
  "repoPath": "/path/to/repo"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Branch switch command sent to clients"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid request"
}
```

**Notes:**
- All connected clients monitoring the specified repository will switch to the target branch
- Clients will stash uncommitted changes before switching
- Pending commits are pushed before the switch
- If the branch doesn't exist locally, it will be created tracking the remote branch

## WebSocket Protocol

For real-time synchronization, clients connect via WebSocket and exchange messages.

### Message Types

All WebSocket messages follow this structure:

```typescript
interface SyncMessage {
  type: 'commit' | 'pull' | 'conflict' | 'sync' | 'branch-switch';
  payload: any;
  clientId: string;
  timestamp: number;
}
```

### Client Registration

When a client connects, it must register with the server:

```json
{
  "type": "sync",
  "payload": {
    "clientId": "unique-client-id",
    "branch": "main",
    "repoPath": "/path/to/repo",
    "action": "register"
  },
  "clientId": "unique-client-id",
  "timestamp": 1703123456789
}
```

### Message Types Explained

1. **commit**: Notifies other clients about a new commit
   ```json
   {
     "type": "commit",
     "payload": {
       "id": "commit-id",
       "timestamp": 1703123456789,
       "filePath": "src/file.js",
       "changeType": "modify",
       "hash": "abc123",
       "message": "[wormhole:clientid] modify src/file.js"
     },
     "clientId": "sender-client-id",
     "timestamp": 1703123456789
   }
   ```

2. **pull**: Request other clients to push their changes
   ```json
   {
     "type": "pull",
     "payload": {
       "branch": "main"
     },
     "clientId": "requesting-client-id",
     "timestamp": 1703123456789
   }
   ```

3. **conflict**: Report a merge conflict
   ```json
   {
     "type": "conflict",
     "payload": {
       "commit": { /* commit details */ },
       "error": "Conflict details"
     },
     "clientId": "client-id",
     "timestamp": 1703123456789
   }
   ```

4. **branch-switch**: Server-initiated branch switch command
   ```json
   {
     "type": "branch-switch",
     "payload": {
       "targetBranch": "feature/new-feature",
       "repoPath": "/path/to/repo"
     },
     "clientId": "server",
     "timestamp": 1703123456789
   }
   ```

## Integration Examples

### Python Example

```python
import requests
import websocket
import json

# REST API Example - Trigger branch switch
def switch_branch(repo_path, target_branch):
    url = "http://localhost:8080/api/branch-switch"
    payload = {
        "repoPath": repo_path,
        "targetBranch": target_branch
    }
    response = requests.post(url, json=payload)
    return response.json()

# REST API Example - Get repository status
def get_repositories():
    url = "http://localhost:8080/api/repositories"
    response = requests.get(url)
    return response.json()

# WebSocket Example - Monitor commits
def on_message(ws, message):
    data = json.loads(message)
    if data['type'] == 'commit':
        print(f"New commit: {data['payload']['message']}")

def monitor_commits():
    ws = websocket.WebSocketApp("ws://localhost:8080",
                                on_message=on_message)
    ws.run_forever()
```

### Node.js Example

```javascript
const axios = require('axios');
const WebSocket = require('ws');

// REST API Example - Get server status
async function getServerStatus() {
  const response = await axios.get('http://localhost:8080/api/status');
  return response.data;
}

// REST API Example - Switch branches
async function switchBranch(repoPath, targetBranch) {
  const response = await axios.post('http://localhost:8080/api/branch-switch', {
    repoPath,
    targetBranch
  });
  return response.data;
}

// WebSocket Example - Connect as monitoring service
function connectMonitor() {
  const ws = new WebSocket('ws://localhost:8080');
  
  ws.on('open', () => {
    // Register as a monitoring client
    ws.send(JSON.stringify({
      type: 'sync',
      payload: {
        clientId: 'monitor-service',
        branch: 'main',
        repoPath: '/monitored/repo',
        action: 'register'
      },
      clientId: 'monitor-service',
      timestamp: Date.now()
    }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('Received:', message.type, message.payload);
  });
}
```

### cURL Examples

```bash
# Get server status
curl http://localhost:8080/api/status

# Get repository information
curl http://localhost:8080/api/repositories

# Trigger branch switch
curl -X POST http://localhost:8080/api/branch-switch \
  -H "Content-Type: application/json" \
  -d '{
    "repoPath": "/path/to/repo",
    "targetBranch": "develop"
  }'
```

## Admin Dashboard Integration

An admin dashboard can use these APIs to:

1. **Monitor Repository Status**: Poll `/api/repositories` to display:
   - Active repositories
   - Connected clients per repository
   - Current branches being worked on

2. **Manage Branches**: Use `/api/branch-switch` to:
   - Coordinate team branch switches
   - Ensure all developers are on the correct branch
   - Implement branch policies

3. **Real-time Monitoring**: Connect via WebSocket to:
   - Track commit activity
   - Monitor client connections/disconnections
   - Observe conflict resolution

## Security Considerations

Currently, the Wormhole server does not implement authentication. For production use, consider:

1. Adding API key authentication for REST endpoints
2. Implementing WebSocket token-based authentication
3. Using HTTPS/WSS for encrypted connections
4. Restricting access by IP address
5. Adding rate limiting

## Error Handling

The server returns appropriate HTTP status codes:

- `200 OK`: Successful request
- `400 Bad Request`: Invalid request data
- `404 Not Found`: Unknown endpoint
- `500 Internal Server Error`: Server error

WebSocket disconnections trigger automatic reconnection attempts by clients.

## CORS Support

The server includes CORS headers to allow cross-origin requests:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

For production, configure specific allowed origins instead of using `*`.