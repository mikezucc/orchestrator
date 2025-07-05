# GitHub OAuth Scopes Documentation

This document explains the GitHub OAuth scopes used by DevBox and what functionality they enable.

## Current Scopes

DevBox requests the following GitHub OAuth scopes when connecting a GitHub account:

### 1. `read:user`
- **Purpose**: Read access to profile data
- **Enables**: 
  - Fetching the user's GitHub username
  - Getting basic profile information
  - Required for API authentication

### 2. `user:email`
- **Purpose**: Access to user email addresses
- **Enables**:
  - Reading the user's primary email address
  - Used for Git configuration on VMs
  - Helps identify the user in commits

### 3. `read:public_key` and `write:public_key`
- **Purpose**: Manage user's SSH keys on GitHub
- **Enables**:
  - Listing existing SSH keys
  - Adding temporary SSH keys for VM access
  - Removing SSH keys after script execution
  - Essential for the "Create VM with Repository" feature

### 4. `repo` (Full repository access)
- **Purpose**: Full control of private and public repositories
- **Enables**:
  - Listing all user repositories (public and private)
  - Reading repository metadata
  - Cloning private repositories on VMs
  - Creating new repositories
  - Managing repository settings

## Why These Scopes Are Needed

### For Basic VM Creation
- `read:user`, `user:email`: Identify the user and configure Git
- `read:public_key`, `write:public_key`: Enable SSH access from VMs to GitHub

### For "Create VM with Repository" Feature
- All of the above, plus:
- `repo`: List and clone private repositories

### Security Considerations

1. **Token Storage**: GitHub access tokens are encrypted before storage in the database
2. **Ephemeral SSH Keys**: Temporary SSH keys can be automatically cleaned up after use
3. **Scope Limitations**: We only request the minimum scopes needed for functionality
4. **User Control**: Users can disconnect GitHub at any time, which removes the stored token

## Managing Permissions

Users who have already connected GitHub with limited scopes will need to:
1. Disconnect their GitHub account in User Settings
2. Reconnect to grant the additional `repo` scope
3. This ensures they can use all features including private repository access

## Future Considerations

If we add more GitHub-integrated features, we might need additional scopes:
- `write:packages`: For GitHub Packages integration
- `read:org`: For organization repository access
- `workflow`: For GitHub Actions integration

However, we should always follow the principle of least privilege and only request scopes when features actually require them.