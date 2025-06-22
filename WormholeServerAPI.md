# Wormhole Server API Documentation V2

The Wormhole server has evolved from a simple file synchronization service to a comprehensive system monitoring and management platform. This guide documents all available APIs and features.

## Overview

The Wormhole server provides:
- **File Synchronization**: Real-time sync across distributed development environments
- **Repository Management**: Automatic discovery and daemon management for Git repositories
- **System Monitoring**: Active port scanning and process tracking
- **Remote Control**: Branch switching and daemon orchestration

## Server Connection

Default port: 8080 (configurable via `WORMHOLE_PORT` environment variable)

- **WebSocket endpoint**: `ws://localhost:8080`
- **REST API base URL**: `http://localhost:8080`

## Environment Variables

- `WORMHOLE_PORT`: Server port (default: 8080)
- `WORMHOLE_SCAN_INTERVAL`: Repository scan interval in milliseconds (default: 300000 / 5 minutes)

## REST API Endpoints

### 1. System Status

#### Get Server Status
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
      "id": "MacBook-Pro-a3f2c8b9",
      "branch": "main",
      "repoPath": "organization/repository",
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

#### Get Active Ports
Monitor all active network ports and their associated processes.

**Request:**
```http
GET /api/ports
```

**Response:**
```json
{
  "totalPorts": 15,
  "processes": [
    {
      "processName": "node",
      "pid": 12345,
      "ports": [
        {
          "port": 8080,
          "protocol": "tcp",
          "state": "LISTEN",
          "address": "0.0.0.0",
          "service": "HTTP-Alt"
        }
      ]
    }
  ],
  "raw": [
    {
      "port": 22,
      "protocol": "tcp",
      "state": "LISTEN",
      "address": "0.0.0.0",
      "pid": 1234,
      "processName": "sshd",
      "service": "SSH"
    }
  ]
}
```

**Notes:**
- Requires appropriate permissions (may need sudo)
- Linux: Attempts ss → netstat → lsof
- macOS: Uses lsof
- Automatically identifies common services

### 2. Repository Management

#### Get Repository Information
Retrieve detailed information about synchronized repositories.

**Request:**
```http
GET /api/repositories
```

**Response:**
```json
[
  {
    "repoPath": "organization/repository",
    "branches": ["main", "develop", "feature/xyz"],
    "activeBranches": ["main", "develop"],
    "clientCount": 3,
    "connectedClientCount": 2,
    "clients": [
      {
        "id": "MacBook-Pro-a3f2c8b9",
        "branch": "main",
        "connected": true,
        "lastActivity": 1703123456789
      }
    ]
  }
]
```

#### Get Running Daemons
Monitor all Wormhole daemons managed by the server.

**Request:**
```http
GET /api/daemons
```

**Response:**
```json
{
  "count": 3,
  "runningCount": 3,
  "daemons": [
    {
      "repository": {
        "path": "/Users/username/projects/myapp",
        "name": "organization/myapp",
        "branch": "main",
        "hasOrigin": true,
        "originUrl": "https://github.com/organization/myapp.git"
      },
      "pid": 12345,
      "status": "running",
      "startTime": 1703123456789,
      "uptime": 300000
    }
  ]
}
```

#### Trigger Repository Scan
Manually scan for Git repositories in the home directory.

**Request:**
```http
POST /api/scan
```

**Response:**
```json
{
  "success": true,
  "message": "Repository scan initiated"
}
```

**Automatic Scanning:**
- Scans home directory recursively (up to 5 levels)
- Excludes: node_modules, .cache, .npm, Library, etc.
- Starts daemons for new repositories
- Stops daemons for removed repositories

### 3. Remote Control

#### Trigger Branch Switch
Command all clients monitoring a specific repository to switch branches.

**Request:**
```http
POST /api/branch-switch
Content-Type: application/json

{
  "targetBranch": "feature/new-feature",
  "repoPath": "organization/repository"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Branch switch command sent to clients"
}
```

**Behavior:**
- Clients stash uncommitted changes
- Push pending commits before switching
- Create branch if it doesn't exist locally
- Pull latest changes after switch

## WebSocket Protocol

### Connection Flow

1. **Client Registration**
```json
{
  "type": "sync",
  "payload": {
    "clientId": "MacBook-Pro-a3f2c8b9",
    "branch": "main",
    "repoPath": "organization/repository",
    "action": "register"
  },
  "clientId": "MacBook-Pro-a3f2c8b9",
  "timestamp": 1703123456789
}
```

2. **Server Acknowledgment**
```json
{
  "type": "sync",
  "payload": {
    "action": "client-joined",
    "client": {
      "id": "MacBook-Pro-a3f2c8b9",
      "branch": "main",
      "lastSync": 1703123456789,
      "connected": true
    }
  },
  "clientId": "server",
  "timestamp": 1703123456789
}
```

### Message Types

#### Commit Notification
```json
{
  "type": "commit",
  "payload": {
    "id": "commit-id",
    "timestamp": 1703123456789,
    "filePath": "src/file.js",
    "changeType": "modify",
    "hash": "abc123",
    "message": "[wormhole:MacBook-Pro] modify src/file.js"
  },
  "clientId": "MacBook-Pro-a3f2c8b9",
  "timestamp": 1703123456789
}
```

#### Branch Switch Command
```json
{
  "type": "branch-switch",
  "payload": {
    "targetBranch": "feature/new-feature",
    "repoPath": "organization/repository"
  },
  "clientId": "server",
  "timestamp": 1703123456789
}
```

## Integration Examples

### Python
```python
import requests
import websocket
import json

class WormholeClient:
    def __init__(self, base_url="http://localhost:8080"):
        self.base_url = base_url
    
    def get_status(self):
        return requests.get(f"{self.base_url}/api/status").json()
    
    def get_ports(self):
        return requests.get(f"{self.base_url}/api/ports").json()
    
    def get_daemons(self):
        return requests.get(f"{self.base_url}/api/daemons").json()
    
    def switch_branch(self, repo_name, target_branch):
        return requests.post(
            f"{self.base_url}/api/branch-switch",
            json={"repoPath": repo_name, "targetBranch": target_branch}
        ).json()
    
    def trigger_scan(self):
        return requests.post(f"{self.base_url}/api/scan").json()

# Example usage
client = WormholeClient()

# Monitor system
ports = client.get_ports()
for process in ports['processes']:
    print(f"{process['processName']} (PID: {process['pid']})")
    for port in process['ports']:
        print(f"  - {port['port']}/{port['protocol']} ({port['service']})")

# Manage repositories
daemons = client.get_daemons()
print(f"Running daemons: {daemons['runningCount']}/{daemons['count']}")

# Switch branches
client.switch_branch("myorg/myrepo", "develop")
```

### Node.js
```javascript
const axios = require('axios');
const WebSocket = require('ws');

class WormholeClient {
  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }
  
  async getSystemInfo() {
    const [status, ports, daemons] = await Promise.all([
      axios.get(`${this.baseUrl}/api/status`),
      axios.get(`${this.baseUrl}/api/ports`),
      axios.get(`${this.baseUrl}/api/daemons`)
    ]);
    
    return {
      status: status.data,
      ports: ports.data,
      daemons: daemons.data
    };
  }
  
  async monitorChanges(repoName) {
    const ws = new WebSocket('ws://localhost:8080');
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'sync',
        payload: {
          clientId: 'monitor-service',
          branch: 'main',
          repoPath: repoName,
          action: 'register'
        },
        clientId: 'monitor-service',
        timestamp: Date.now()
      }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'commit') {
        console.log('New commit:', message.payload);
      }
    });
  }
}
```

### cURL Commands
```bash
# System monitoring
curl http://localhost:8080/api/status
curl http://localhost:8080/api/ports

# Repository management
curl http://localhost:8080/api/repositories
curl http://localhost:8080/api/daemons
curl -X POST http://localhost:8080/api/scan

# Remote control
curl -X POST http://localhost:8080/api/branch-switch \
  -H "Content-Type: application/json" \
  -d '{"repoPath": "org/repo", "targetBranch": "develop"}'
```

## Use Cases

### 1. Infrastructure Monitoring Dashboard
```python
# Monitor all development services
def get_development_services():
    client = WormholeClient()
    ports = client.get_ports()
    
    dev_services = {}
    for process in ports['processes']:
        if process['processName'] in ['node', 'python', 'ruby']:
            dev_services[process['processName']] = process['ports']
    
    return dev_services
```

### 2. Automated Repository Management
```python
# Ensure all repositories are on correct branch
def align_branches(target_branch):
    client = WormholeClient()
    repos = requests.get(f"{client.base_url}/api/repositories").json()
    
    for repo in repos:
        if target_branch not in repo['activeBranches']:
            client.switch_branch(repo['repoPath'], target_branch)
            print(f"Switched {repo['repoPath']} to {target_branch}")
```

### 3. System Health Check
```python
# Check for port conflicts and daemon health
def health_check():
    client = WormholeClient()
    
    # Check for common port conflicts
    ports = client.get_ports()
    common_ports = {80, 443, 3000, 8080, 5432, 3306}
    
    conflicts = []
    for port_info in ports['raw']:
        if port_info['port'] in common_ports:
            conflicts.append(port_info)
    
    # Check daemon health
    daemons = client.get_daemons()
    unhealthy = [d for d in daemons['daemons'] if d['status'] != 'running']
    
    return {
        'port_conflicts': conflicts,
        'unhealthy_daemons': unhealthy,
        'daemon_coverage': f"{daemons['runningCount']}/{daemons['count']}"
    }
```

## Security Considerations

1. **Port Scanning**: Requires elevated permissions on Linux
   - Run with `sudo` for complete visibility
   - Or configure capabilities: `setcap cap_net_admin+ep /path/to/wormhole`

2. **Authentication**: Currently no authentication implemented
   - Use firewall rules to restrict access
   - Consider reverse proxy with authentication

3. **CORS**: Enabled for all origins by default
   - Configure specific origins in production

## Performance Notes

- Repository scanning: O(n) where n is number of directories
- Port scanning: ~100-500ms depending on method and permissions
- WebSocket latency: <10ms for local connections
- Daemon startup: ~1s per repository

## Troubleshooting

### Port Scan Errors
```
Error: Port scan failed
```
Solution: Run server with sudo or configure appropriate capabilities

### Daemon Won't Start
Check logs in `.wormhole/server.log` for specific errors. Common issues:
- Repository doesn't have git origin
- Invalid git configuration
- Port already in use

### Branch Switch Fails
Ensure:
- Remote branch exists
- No merge conflicts
- Network connectivity to git remote

## Future Enhancements

- OAuth2/JWT authentication
- Metrics export (Prometheus format)
- Docker container support
- Repository grouping and tagging
- Custom scan directories
- Webhook notifications