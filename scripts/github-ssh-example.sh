#!/bin/bash
# Example script showing how to use GitHub SSH key authentication in DevBox VMs
#
# This script demonstrates cloning a private repository using ephemeral SSH keys
# that are automatically registered with your GitHub account.
#
# Usage: Execute this script through the DevBox VM execute endpoint with:
# {
#   "script": "$(cat github-ssh-example.sh)",
#   "githubSSHKey": {
#     "registerKey": true,
#     "cleanupAfterExecution": true,
#     "keyTitle": "DevBox temporary key"
#   }
# }

# Set up Git configuration
git config --global user.email "devbox@example.com"
git config --global user.name "DevBox VM"

# Clone a private repository
echo "Cloning private repository..."
git clone git@github.com:your-org/your-private-repo.git

# Make some changes
cd your-private-repo
echo "# Changes from DevBox VM" >> README.md
git add README.md
git commit -m "Update from DevBox VM"

# Push changes back
git push origin main

echo "Script completed successfully!"