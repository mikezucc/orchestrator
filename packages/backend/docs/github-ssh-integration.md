# GitHub SSH Integration

This feature allows users to connect their GitHub account to automatically generate SSH credentials that can be injected into virtual machines for Git operations.

## Setup

### 1. Create GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: Your app name
   - **Homepage URL**: Your frontend URL (e.g., `http://localhost:5173`)
   - **Authorization callback URL**: `http://localhost:3000/api/github-auth/callback` (or your backend URL)
4. Save the Client ID and Client Secret

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://localhost:3000/api/github-auth/callback

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000
```

### 3. Run Database Migrations

Apply the database migration to add the necessary tables:

```bash
psql -U orchestrator -d orchestrator -f packages/backend/src/db/migrations/add-github-ssh-keys.sql
```

## API Endpoints

### GitHub Authentication

- `GET /api/github-auth/connect` - Initiate GitHub OAuth flow
- `GET /api/github-auth/callback` - Handle OAuth callback (internal)
- `DELETE /api/github-auth/disconnect` - Disconnect GitHub account
- `GET /api/github-auth/status` - Get GitHub connection status

### SSH Key Management

- `GET /api/user/ssh-keys` - List all SSH keys for the user
- `POST /api/user/ssh-keys/generate` - Generate a new SSH key
- `GET /api/user/ssh-keys/:keyId/download` - Download SSH key pair
- `GET /api/user/ssh-keys/github` - Get GitHub SSH key
- `PATCH /api/user/ssh-keys/:keyId/toggle` - Toggle key active status
- `DELETE /api/user/ssh-keys/:keyId` - Delete an SSH key

### VM SSH Integration

- `POST /api/ssh/:vmId/setup` - Setup SSH access (supports GitHub keys)
- `POST /api/ssh/:vmId/add-user-keys` - Add all user's SSH keys to VM
- `GET /api/ssh/:vmId/info` - Get SSH connection info

## Usage Flow

1. **Connect GitHub Account**
   ```javascript
   // Frontend: Redirect user to GitHub OAuth
   window.location.href = '/api/github-auth/connect?returnUrl=/profile/ssh-keys';
   ```

2. **Setup SSH on VM with GitHub Key**
   ```javascript
   // Use GitHub SSH key for VM
   const response = await fetch(`/api/ssh/${vmId}/setup`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ useGitHubKey: true })
   });
   ```

3. **Add All User Keys to VM**
   ```javascript
   // Add all active SSH keys to VM
   const response = await fetch(`/api/ssh/${vmId}/add-user-keys`, {
     method: 'POST'
   });
   ```

## Security Considerations

1. **Encryption**: All private keys are encrypted using AES-256-GCM before storage
2. **Access Control**: Users can only access their own SSH keys
3. **Key Rotation**: Users can deactivate and regenerate keys at any time
4. **Audit Logging**: All key operations are logged for security tracking

## VM SSH Usage

Once SSH keys are added to a VM, users can connect using:

```bash
# Using the private key directly
ssh -i ~/.ssh/github-key username@vm-ip

# Or configure SSH config
cat >> ~/.ssh/config << EOF
Host my-vm
  HostName vm-ip
  User username
  IdentityFile ~/.ssh/github-key
EOF

# Then simply
ssh my-vm
```

For Git operations in the VM:

```bash
# Configure Git to use SSH
git config --global url."git@github.com:".insteadOf "https://github.com/"

# Clone repositories
git clone git@github.com:username/repo.git
```