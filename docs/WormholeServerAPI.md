# Wormhole Server API Documentation V3

The Wormhole server has evolved from a simple file synchronization service to a comprehensive system monitoring and management platform. This guide documents all available APIs and features.

**What's New in V3:**
- Branch discovery: The `/api/daemons` endpoint now returns all available branches (local and remote) for each repository
- Enhanced `/api/repositories` endpoint with branch availability information

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

## Server Modes

### Full Mode (Default)
All features enabled: file synchronization, repository management, daemon control, and port monitoring.

```bash
wormhole server --port 8080
```

### Monitor-Only Mode
Lightweight mode that only provides port scanning functionality. Repository scanning and daemon management are disabled.

```bash
wormhole server --port 8080 --monitor-only
# or
wormhole server -p 8080 -m
```

**Monitor-only mode is ideal for:**
- System monitoring dashboards
- Port conflict detection
- Lightweight system observation
- Environments where you only need port visibility

## Environment Variables

- `WORMHOLE_PORT`: Server port (default: 8080)
- `WORMHOLE_SCAN_INTERVAL`: Repository scan interval in milliseconds (default: 300000 / 5 minutes)
- `WORMHOLE_MONITOR_ONLY`: Run in monitor-only mode (default: false)

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
  "mode": "full",
  "features": {
    "portScanning": true,
    "repositoryManagement": true,
    "daemonManagement": true,
    "fileSync": true
  },
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

**In monitor-only mode:**
```json
{
  "mode": "monitor-only",
  "features": {
    "portScanning": true,
    "repositoryManagement": false,
    "daemonManagement": false,
    "fileSync": false
  },
  "clients": [],
  "branches": []
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

**Note:** These endpoints return 503 Service Unavailable in monitor-only mode.

#### Get Repository Information
Retrieve detailed information about synchronized repositories.

**Request:**
```http
GET /api/repositories
```

**Response (V3 - Enhanced with branch availability):**
```json
[
  {
    "repoPath": "organization/repository",
    "branches": ["main", "develop", "feature/xyz"],
    "activeBranches": ["main", "develop"],
    "availableBranches": {
      "local": ["main", "develop", "feature/xyz"],
      "remote": ["main", "develop", "staging", "feature/abc"],
      "all": ["main", "develop", "staging", "feature/xyz", "feature/abc"]
    },
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

**New in V3:**
- `availableBranches`: Object containing all discovered branches for the repository
  - `local`: Array of branches that exist locally
  - `remote`: Array of branches that exist on the remote (without local counterpart)
  - `all`: Array of all unique branch names (union of local and remote)

#### Get Running Daemons
Monitor all Wormhole daemons managed by the server.

**Request:**
```http
GET /api/daemons
```

**Response (V3 - Enhanced with branch information):**
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
        "originUrl": "https://github.com/organization/myapp.git",
        "branches": {
          "local": ["main", "develop", "feature/xyz"],
          "remote": ["main", "develop", "staging", "feature/abc"],
          "all": ["main", "develop", "staging", "feature/xyz", "feature/abc"]
        }
      },
      "pid": 12345,
      "status": "running",
      "startTime": 1703123456789,
      "uptime": 300000
    }
  ]
}
```

**New in V3:**
- `repository.branches`: Object containing all branches discovered during repository scan
  - `local`: Branches that exist in the local repository
  - `remote`: Branches that exist on the remote (typically origin)
  - `all`: All unique branch names from both local and remote

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
- **New in V3**: Discovers all branches during scan

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

### Python (V3 - Using Branch Discovery)
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
    
    def get_repositories(self):
        return requests.get(f"{self.base_url}/api/repositories").json()
    
    def switch_branch(self, repo_name, target_branch):
        return requests.post(
            f"{self.base_url}/api/branch-switch",
            json={"repoPath": repo_name, "targetBranch": target_branch}
        ).json()
    
    def trigger_scan(self):
        return requests.post(f"{self.base_url}/api/scan").json()

# Example usage with V3 features
client = WormholeClient()

# Get all available branches for each repository
daemons = client.get_daemons()
for daemon in daemons['daemons']:
    repo = daemon['repository']
    print(f"\nRepository: {repo['name']}")
    print(f"Current branch: {repo['branch']}")
    print(f"Local branches: {', '.join(repo['branches']['local'])}")
    print(f"Remote branches: {', '.join(repo['branches']['remote'])}")
    
    # Check if a branch exists before switching
    target_branch = "develop"
    if target_branch in repo['branches']['all']:
        client.switch_branch(repo['name'], target_branch)
        print(f"Switched to {target_branch}")
    else:
        print(f"Branch {target_branch} not found")

# Get repositories with available branches
repos = client.get_repositories()
for repo in repos:
    print(f"\n{repo['repoPath']}:")
    available = repo.get('availableBranches', {})
    print(f"  Available branches: {', '.join(available.get('all', []))}")
    print(f"  Active branches: {', '.join(repo['activeBranches'])}")
```

### Node.js (V3 - Branch Discovery)
```javascript
const axios = require('axios');

class WormholeClient {
  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }
  
  async getRepositoryBranches() {
    const daemons = await axios.get(`${this.baseUrl}/api/daemons`);
    
    return daemons.data.daemons.map(daemon => ({
      name: daemon.repository.name,
      currentBranch: daemon.repository.branch,
      availableBranches: daemon.repository.branches,
      canSwitchTo: (targetBranch) => 
        daemon.repository.branches.all.includes(targetBranch)
    }));
  }
  
  async smartBranchSwitch(repoName, targetBranch) {
    // First check if branch exists
    const repos = await this.getRepositoryBranches();
    const repo = repos.find(r => r.name === repoName);
    
    if (!repo) {
      throw new Error(`Repository ${repoName} not found`);
    }
    
    if (!repo.canSwitchTo(targetBranch)) {
      console.log(`Available branches: ${repo.availableBranches.all.join(', ')}`);
      throw new Error(`Branch ${targetBranch} not available`);
    }
    
    // Perform the switch
    return axios.post(`${this.baseUrl}/api/branch-switch`, {
      repoPath: repoName,
      targetBranch: targetBranch
    });
  }
}

// Example usage
const client = new WormholeClient();

// List all branches for all repositories
client.getRepositoryBranches().then(repos => {
  repos.forEach(repo => {
    console.log(`\n${repo.name}:`);
    console.log(`  Current: ${repo.currentBranch}`);
    console.log(`  Local: ${repo.availableBranches.local.join(', ')}`);
    console.log(`  Remote: ${repo.availableBranches.remote.join(', ')}`);
  });
});
```

### cURL Commands (V3)
```bash
# Get daemon information with branch data
curl http://localhost:8080/api/daemons | jq '.daemons[].repository.branches'

# Get repositories with available branches
curl http://localhost:8080/api/repositories | jq '.[].availableBranches'

# Find all repositories with a specific branch
curl http://localhost:8080/api/daemons | jq '.daemons[] | select(.repository.branches.all[] | contains("develop")) | .repository.name'
```

## Use Cases (V3 - Enhanced)

### 1. Branch Availability Checker
```python
def check_branch_availability(branch_name):
    """Check which repositories have a specific branch available"""
    client = WormholeClient()
    daemons = client.get_daemons()
    
    repos_with_branch = []
    for daemon in daemons['daemons']:
        repo = daemon['repository']
        if branch_name in repo['branches']['all']:
            repos_with_branch.append({
                'name': repo['name'],
                'has_local': branch_name in repo['branches']['local'],
                'has_remote': branch_name in repo['branches']['remote']
            })
    
    return repos_with_branch
```

### 2. Automated Branch Synchronization
```python
def sync_all_to_branch(target_branch):
    """Switch all repositories to a specific branch if available"""
    client = WormholeClient()
    daemons = client.get_daemons()
    
    results = []
    for daemon in daemons['daemons']:
        repo = daemon['repository']
        
        if target_branch in repo['branches']['all']:
            try:
                client.switch_branch(repo['name'], target_branch)
                results.append({
                    'repo': repo['name'],
                    'status': 'switched',
                    'from': repo['branch'],
                    'to': target_branch
                })
            except Exception as e:
                results.append({
                    'repo': repo['name'],
                    'status': 'failed',
                    'error': str(e)
                })
        else:
            results.append({
                'repo': repo['name'],
                'status': 'skipped',
                'reason': 'branch not available',
                'available': repo['branches']['all']
            })
    
    return results
```

### 3. Branch Discovery Report
```python
def generate_branch_report():
    """Generate a comprehensive report of all branches across repositories"""
    client = WormholeClient()
    daemons = client.get_daemons()
    
    report = {
        'total_repositories': daemons['count'],
        'total_branches': set(),
        'orphaned_local_branches': [],
        'remote_only_branches': [],
        'repositories': []
    }
    
    for daemon in daemons['daemons']:
        repo = daemon['repository']
        branches = repo['branches']
        
        # Add to total branches
        report['total_branches'].update(branches['all'])
        
        # Find orphaned local branches (local but not remote)
        orphaned = set(branches['local']) - set(branches['remote'])
        if orphaned:
            report['orphaned_local_branches'].append({
                'repo': repo['name'],
                'branches': list(orphaned)
            })
        
        # Find remote-only branches
        remote_only = set(branches['remote']) - set(branches['local'])
        if remote_only:
            report['remote_only_branches'].append({
                'repo': repo['name'],
                'branches': list(remote_only)
            })
        
        report['repositories'].append({
            'name': repo['name'],
            'current_branch': repo['branch'],
            'local_count': len(branches['local']),
            'remote_count': len(branches['remote']),
            'total_count': len(branches['all'])
        })
    
    report['total_branches'] = list(report['total_branches'])
    return report
```

### 4. Smart Branch Management Dashboard
```javascript
// React component example using V3 branch discovery
const BranchManager = () => {
  const [repos, setRepos] = useState([]);
  
  useEffect(() => {
    fetchRepositories();
  }, []);
  
  const fetchRepositories = async () => {
    const response = await fetch('http://localhost:8080/api/daemons');
    const data = await response.json();
    setRepos(data.daemons);
  };
  
  const switchBranch = async (repoName, targetBranch) => {
    await fetch('http://localhost:8080/api/branch-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath: repoName,
        targetBranch: targetBranch
      })
    });
    fetchRepositories(); // Refresh
  };
  
  return (
    <div>
      {repos.map(daemon => (
        <div key={daemon.repository.path}>
          <h3>{daemon.repository.name}</h3>
          <p>Current: {daemon.repository.branch}</p>
          <select 
            onChange={(e) => switchBranch(daemon.repository.name, e.target.value)}
            value={daemon.repository.branch}
          >
            {daemon.repository.branches.all.map(branch => (
              <option key={branch} value={branch}>
                {branch}
                {daemon.repository.branches.local.includes(branch) ? ' (local)' : ''}
                {daemon.repository.branches.remote.includes(branch) ? ' (remote)' : ''}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
};
```

## Migration Guide from V2 to V3

### API Changes

1. **Enhanced `/api/daemons` response:**
   - Added `repository.branches` object with `local`, `remote`, and `all` arrays
   - Existing fields remain unchanged

2. **Enhanced `/api/repositories` response:**
   - Added `availableBranches` object (when daemon information is available)
   - Structure mirrors the branches object from daemons endpoint

### Code Updates

Before (V2):
```python
# Simple branch switch without checking availability
client.switch_branch("org/repo", "develop")
```

After (V3):
```python
# Check branch availability before switching
daemons = client.get_daemons()
repo = next((d for d in daemons['daemons'] if d['repository']['name'] == "org/repo"), None)

if repo and "develop" in repo['repository']['branches']['all']:
    client.switch_branch("org/repo", "develop")
else:
    print("Branch not available")
```

## Performance Notes

- Branch discovery adds ~100-200ms to repository scan time
- Branch information is cached until next scan
- API response size increased by ~20-30% with branch data

## Troubleshooting

### Missing Branch Information
If `branches` object is empty or missing:
- Ensure git repository has valid configuration
- Check network connectivity to remote
- Verify git credentials are properly configured
- Run manual scan with `/api/scan` endpoint

### Branch Switch to Remote-Only Branch
When switching to a branch that only exists on remote:
- Daemon will automatically create local branch
- First switch may take longer due to fetch operation
- Subsequent switches will be faster

## Future Enhancements

- Branch creation/deletion via API
- Branch merge status information
- Commit ahead/behind tracking
- Protected branch configuration
- Branch-specific ignore patterns