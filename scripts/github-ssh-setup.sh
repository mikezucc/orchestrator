#!/bin/bash
# GitHub SSH Key Setup Script for DevBox VMs
#
# This script sets up SSH configuration for GitHub and tests the connection.
# When executed with githubSSHKey.registerKey=true, the ephemeral SSH key
# will be automatically registered with your GitHub account.

set -e

echo "=== GitHub SSH Key Setup ==="
echo

# Create SSH directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Configure SSH for GitHub
cat > ~/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa
    StrictHostKeyChecking no
EOF

chmod 600 ~/.ssh/config

# Test GitHub connection
echo "Testing GitHub SSH connection..."
ssh -T git@github.com || true

# Set up Git configuration
echo
echo "Configuring Git..."
git config --global user.email "${GIT_USER_EMAIL:-devbox@example.com}"
git config --global user.name "${GIT_USER_NAME:-DevBox User}"

# Display current Git configuration
echo
echo "Current Git configuration:"
git config --global --list

# List accessible repositories (requires GitHub CLI)
if command -v gh &> /dev/null; then
    echo
    echo "Listing your GitHub repositories:"
    gh repo list --limit 10
else
    echo
    echo "GitHub CLI not installed. Install it to list repositories."
fi

echo
echo "=== Setup Complete ==="
echo "You can now clone private repositories using:"
echo "  git clone git@github.com:owner/repo.git"