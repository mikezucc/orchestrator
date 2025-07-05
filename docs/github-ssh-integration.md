# GitHub SSH Key Integration

This feature allows users to execute scripts on DevBox VMs with automatic GitHub SSH key authentication. When enabled, ephemeral SSH keys are generated, registered with GitHub, and optionally cleaned up after script execution.

## Features

- **Ephemeral SSH Keys**: Temporary SSH keys are generated for each script execution
- **Automatic GitHub Registration**: Keys can be automatically registered with your GitHub account
- **Automatic Cleanup**: Keys can be removed from GitHub after script execution
- **Custom Key Titles**: Specify custom titles for SSH keys in GitHub

## Prerequisites

1. User must have a GitHub account linked in DevBox
2. User must have a valid GitHub access token stored
3. VM must be running

## Usage

### API Request Format

When executing a script via the VM execute endpoint, include the `githubSSHKey` options:

```json
POST /api/vms/:id/execute
{
  "script": "git clone git@github.com:private/repo.git",
  "timeout": 300,
  "githubSSHKey": {
    "registerKey": true,
    "cleanupAfterExecution": true,
    "keyTitle": "DevBox VM temporary key"
  }
}
```

### Options

- `registerKey` (boolean): Whether to register the SSH key with GitHub
- `cleanupAfterExecution` (boolean): Whether to remove the key from GitHub after execution
- `keyTitle` (string): Custom title for the SSH key (defaults to "DevBox VM: {instanceName} ({date})")

## Example Use Cases

### 1. Clone Private Repository

```bash
#!/bin/bash
git config --global user.email "dev@example.com"
git config --global user.name "DevBox User"
git clone git@github.com:myorg/private-repo.git
cd private-repo
# Work with the repository...
```

### 2. Deploy Code from Private Repository

```bash
#!/bin/bash
# Clone private deployment scripts
git clone git@github.com:myorg/deploy-scripts.git
cd deploy-scripts

# Run deployment
./deploy.sh production
```

### 3. Automated Git Operations

```bash
#!/bin/bash
# Clone repository
git clone git@github.com:myorg/my-app.git
cd my-app

# Make automated changes
echo "Updated at $(date)" >> status.txt
git add status.txt
git commit -m "Automated update from DevBox"
git push origin main
```

## Security Considerations

1. **Ephemeral Keys**: Keys are temporary and only exist for the duration of the script
2. **Encrypted Storage**: GitHub access tokens are encrypted in the database
3. **Automatic Cleanup**: Keys can be automatically removed after use
4. **Audit Trail**: All key operations are logged

## Troubleshooting

### GitHub Authentication Failed
- Ensure your GitHub account is properly linked
- Verify your GitHub access token hasn't expired
- Check that your token has the necessary SSH key permissions

### SSH Key Registration Failed
- The script will continue without GitHub registration
- Check logs for specific error messages
- Verify GitHub API access

### Key Cleanup Failed
- Keys may need to be manually removed from GitHub settings
- Check GitHub Settings > SSH and GPG keys

## Best Practices

1. **Always use cleanup**: Enable `cleanupAfterExecution` to avoid key accumulation
2. **Use descriptive titles**: Provide meaningful key titles for easier management
3. **Limit key lifetime**: Use keys only for the duration needed
4. **Monitor key usage**: Regularly check your GitHub SSH keys