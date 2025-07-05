#!/bin/bash
# Demo script showing the VM with Repository creation flow
#
# This script demonstrates how the new "Create VM with Repository" feature works:
# 1. User selects a GitHub repository from their account
# 2. VM is created with a minimal startup script
# 3. After VM boots, the system automatically:
#    a. Injects the user's GitHub SSH key
#    b. Clones the selected repository
#    c. Runs any custom post-clone setup script
#
# The key difference from regular VM creation is that instead of using 
# GCE's built-in startup-script (which runs as root during boot),
# we use SSH execution after boot to:
# - Run as the proper user (not root)
# - Have access to the user's GitHub SSH keys
# - Provide better error handling and progress tracking

echo "=== DevBox VM with Repository Demo ==="
echo
echo "This demo shows how the new VM creation flow works."
echo

# Example of the script that gets executed after VM boot
# This is what the hook runs via SSH with GitHub key injection enabled

cat << 'DEMO_SCRIPT'
#!/bin/bash
set -e

echo "=== DevBox VM Setup with GitHub Repository ==="
echo

# At this point, the GitHub SSH key has already been injected
# by the executeScriptViaSSH function with githubSSHKey.registerKey=true

# Set up Git configuration
git config --global user.email "user@example.com"
git config --global user.name "DevBox User"

# Clone the repository
echo "Cloning repository: octocat/hello-world"
cd ~
git clone git@github.com:octocat/hello-world.git

# Enter the repository directory
cd hello-world

# Run user's custom startup script if provided
echo "Running user's custom startup script..."
# Example: npm install && npm run build

echo
echo "=== Setup Complete ==="
echo "Repository cloned to: ~/hello-world"
DEMO_SCRIPT

echo
echo "Key Features:"
echo "1. GitHub repository browser in the Create VM modal"
echo "2. Automatic SSH key injection using existing backend capability"
echo "3. Repository cloning happens after VM boot via SSH"
echo "4. Custom post-clone scripts can be specified"
echo "5. Progress tracking and error handling"
echo
echo "Implementation Details:"
echo "- Frontend: CreateVMWithRepoModal component"
echo "- Backend: Uses existing executeScriptViaSSH with githubSSHKey option"
echo "- Hook: useVMPostCreationSetup monitors new VMs and runs setup"
echo "- API: New /api/github-auth/repos endpoint lists user's repositories"