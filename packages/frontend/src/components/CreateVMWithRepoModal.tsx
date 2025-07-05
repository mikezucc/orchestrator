import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { organizationApi } from '../api/organizations';
import { githubAuthApi, type GitHubRepo } from '../api/github-auth';
import type { CreateVMRequest } from '@gce-platform/types';
import { useToast } from '../contexts/ToastContext';
import VMCreationTracker from './VMCreationTracker';
import { vmCreationProgress } from '../services/vm-creation-progress';

interface CreateVMWithRepoModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateVMWithRepoModal({ onClose, onSuccess }: CreateVMWithRepoModalProps) {
  const { showError, showSuccess } = useToast();
  
  // Fetch organization data to get configured projects
  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: organizationApi.getMyOrganization,
  });

  // Check GitHub connection status
  const { data: githubStatus } = useQuery({
    queryKey: ['github-status'],
    queryFn: githubAuthApi.getStatus,
  });

  const [formData, setFormData] = useState<CreateVMRequest>({
    name: '',
    gcpProjectId: '',
    zone: 'us-central1-a',
    machineType: 'e2-micro',
    initScript: '',
  });
  
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [userStartupScript, setUserStartupScript] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [repoPage, setRepoPage] = useState(1);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [showProgressTracker, setShowProgressTracker] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  // Premade scripts
  const premadeScripts = {
    'node-basic': {
      name: 'Node.js Basic Setup',
      script: `#!/bin/bash
# Node.js Basic Setup Script
set -e

echo "=== Installing Node.js and npm ==="

# Update package list
sudo apt-get update

# Install Node.js and npm using NodeSource repository
sudo apt-get install -y nodejs

# Install build essentials for native npm modules
sudo apt-get install -y build-essential

# Install PM2 globally for process management
sudo npm install -g pm2

# Display installed versions
echo "=== Installation Complete ==="
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "PM2 version: $(pm2 --version)"

# Install project dependencies if package.json exists
if [ -f "package.json" ]; then
  echo "=== Installing project dependencies ==="
  npm install
fi`
    },
    'node-typescript': {
      name: 'Node.js with TypeScript',
      script: `#!/bin/bash
# Node.js with TypeScript Setup Script
set -e

echo "=== Installing Node.js, npm, and TypeScript ==="

# Update package list
sudo apt-get update

# Install Node.js and npm
sudo apt-get install -y nodejs

# Install build essentials
sudo apt-get install -y build-essential

# Install TypeScript and PM2 globally
sudo npm install -g typescript pm2 ts-node

# Display installed versions
echo "=== Installation Complete ==="
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "TypeScript version: $(tsc --version)"
echo "PM2 version: $(pm2 --version)"

# Install project dependencies if package.json exists
if [ -f "package.json" ]; then
  echo "=== Installing project dependencies ==="
  npm install
  
  # Build TypeScript project if tsconfig.json exists
  if [ -f "tsconfig.json" ]; then
    echo "=== Building TypeScript project ==="
    npm run build || tsc
  fi
fi`
    },
    'node-full': {
      name: 'Node.js Full Stack Setup',
      script: `#!/bin/bash
# Node.js Full Stack Setup Script
set -e

echo "=== Installing Node.js Full Stack Environment ==="

# Update package list
sudo apt-get update

# Install Node.js and npm
sudo apt-get install -y nodejs

# Install build essentials
sudo apt-get install -y build-essential

# Install common global packages
sudo npm install -g pm2 nodemon typescript ts-node

# Install MongoDB (optional - uncomment if needed)
# wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
# sudo apt-get update
# sudo apt-get install -y mongodb-org
# sudo systemctl start mongod
# sudo systemctl enable mongod

# Install Redis (optional - uncomment if needed)
# sudo apt-get install -y redis-server
# sudo systemctl start redis-server
# sudo systemctl enable redis-server

# Display installed versions
echo "=== Installation Complete ==="
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "PM2 version: $(pm2 --version)"

# Install project dependencies and setup
if [ -f "package.json" ]; then
  echo "=== Installing project dependencies ==="
  npm install
  
  # Build project if build script exists
  if npm run | grep -q "build"; then
    echo "=== Building project ==="
    npm run build
  fi
  
  # Setup PM2 if ecosystem file exists
  if [ -f "ecosystem.config.js" ] || [ -f "pm2.json" ]; then
    echo "=== Setting up PM2 ==="
    pm2 start
    pm2 save
    sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
  fi
fi`
    },
    'custom': {
      name: 'Custom Script',
      script: ''
    }
  };

  // Handle script selection
  const handleScriptSelect = (scriptKey: string) => {
    setSelectedScript(scriptKey);
    if (scriptKey && scriptKey !== 'custom') {
      setUserStartupScript(premadeScripts[scriptKey as keyof typeof premadeScripts].script);
    }
  };

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setRepoPage(1); // Reset to first page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch GitHub repositories using useQuery
  const { data: reposData, isLoading: loadingRepos, isFetchingNextPage } = useQuery({
    queryKey: ['github-repos', debouncedSearchQuery, repoPage],
    queryFn: () => githubAuthApi.getRepositories(repoPage, 30, debouncedSearchQuery || undefined),
    enabled: !!githubStatus?.connected,
    keepPreviousData: true, // Keep previous data while loading new page
  });

  // Accumulate repos for pagination
  const [allRepos, setAllRepos] = useState<GitHubRepo[]>([]);
  
  useEffect(() => {
    if (reposData?.repositories) {
      if (repoPage === 1) {
        setAllRepos(reposData.repositories);
      } else {
        setAllRepos(prev => [...prev, ...reposData.repositories]);
      }
    }
  }, [reposData, repoPage]);

  const loadMoreRepos = () => {
    if (!loadingRepos && !isFetchingNextPage && reposData?.pagination?.hasMore) {
      setRepoPage(prev => prev + 1);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRepo) {
        throw new Error('Please select a repository');
      }

      // Generate tracking ID for progress tracking
      const newTrackingId = vmCreationProgress.generateTrackingId();
      setTrackingId(newTrackingId);

      // Create the VM with GitHub repository and user boot script
      const vmData: CreateVMRequest & { trackingId: string } = {
        ...formData,
        githubRepository: {
          id: selectedRepo.id,
          name: selectedRepo.name,
          full_name: selectedRepo.full_name,
          ssh_url: selectedRepo.ssh_url,
          private: selectedRepo.private,
        },
        userBootScript: userStartupScript || undefined,
        trackingId: newTrackingId,
      };

      // Show progress tracker
      setShowProgressTracker(true);

      const response = await vmApi.create(vmData);
      
      return response;
    },
    onSuccess: (response) => {
      if (response.success) {
        // Don't close immediately - let the progress tracker handle completion
        // showSuccess('VM created successfully with repository setup.');
        // onSuccess();
      }
    },
    onError: (error: any) => {
      showError(error.message || error.response?.data?.error || 'Failed to create VM');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo) {
      showError('Please select a GitHub repository');
      return;
    }
    createMutation.mutate();
  };

  if (!githubStatus?.connected) {
    return (
      <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="card max-w-md w-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold uppercase tracking-wider">Create VM with Repository</h2>
            <button
              onClick={onClose}
              className="p-1 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="text-center py-8">
            <svg className="w-16 h-16 mx-auto mb-4 text-te-gray-600 dark:text-te-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <h3 className="text-lg font-semibold mb-2">GitHub Connection Required</h3>
            <p className="text-sm text-te-gray-600 dark:text-te-gray-400 mb-6">
              Connect your GitHub account to create VMs with repositories
            </p>
            <a
              href="/settings"
              className="btn-primary inline-flex items-center space-x-2"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/settings';
              }}
            >
              <span>Connect GitHub Account</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-te-gray-200 dark:border-te-gray-800">
          <h2 className="text-lg font-semibold uppercase tracking-wider">
            {showProgressTracker ? 'Creating VM' : 'Create VM with Repository'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
            disabled={showProgressTracker && createMutation.isPending}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {showProgressTracker && trackingId ? (
          <>
            <div className="flex-1 overflow-auto p-6">
              <VMCreationTracker 
                trackingId={trackingId}
                onComplete={(vmId) => {
                  // Just refresh the VM list, no notification
                  // Don't close the modal - let the user close it manually
                  onSuccess();
                }}
                onError={(error) => {
                  // Error is already shown in the tracker
                  // Don't show a toast notification
                }}
              />
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t border-te-gray-200 dark:border-te-gray-800">
              <button
                type="button"
                onClick={onClose}
                className="btn-primary"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {/* Repository Selection */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                GitHub Repository
              </label>
              
              {/* Search Input */}
              <div className="relative mb-3">
                <input
                  type="text"
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10"
                />
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-te-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Repository List */}
              <div className="border border-te-gray-200 dark:border-te-gray-700 rounded-lg max-h-64 overflow-y-auto">
                {loadingRepos && allRepos.length === 0 ? (
                  <div className="p-4 text-center text-sm text-te-gray-600 dark:text-te-gray-400">
                    Loading repositories...
                  </div>
                ) : allRepos.length === 0 ? (
                  <div className="p-4 text-center text-sm text-te-gray-600 dark:text-te-gray-400">
                    No repositories found
                  </div>
                ) : (
                  <>
                    {allRepos.map((repo) => (
                      <div
                        key={repo.id}
                        onClick={() => setSelectedRepo(repo)}
                        className={`p-3 cursor-pointer hover:bg-te-gray-100 dark:hover:bg-te-gray-800 border-b border-te-gray-200 dark:border-te-gray-800 last:border-b-0 ${
                          selectedRepo?.id === repo.id ? 'bg-te-gray-100 dark:bg-te-gray-800' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm">{repo.name}</span>
                              {repo.private && (
                                <span className="text-2xs px-1.5 py-0.5 bg-te-gray-200 dark:bg-te-gray-700 rounded">
                                  Private
                                </span>
                              )}
                            </div>
                            {repo.description && (
                              <p className="text-xs text-te-gray-600 dark:text-te-gray-400 mt-1">
                                {repo.description}
                              </p>
                            )}
                            <div className="flex items-center space-x-3 mt-1">
                              {repo.language && (
                                <span className="text-2xs text-te-gray-600 dark:text-te-gray-400">
                                  {repo.language}
                                </span>
                              )}
                              <span className="text-2xs text-te-gray-600 dark:text-te-gray-400">
                                ⭐ {repo.stargazers_count}
                              </span>
                              <span className="text-2xs text-te-gray-600 dark:text-te-gray-400">
                                Updated {new Date(repo.updated_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {selectedRepo?.id === repo.id && (
                            <svg className="w-5 h-5 text-te-yellow ml-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {reposData?.pagination?.hasMore && (
                      <button
                        type="button"
                        onClick={loadMoreRepos}
                        disabled={loadingRepos || isFetchingNextPage}
                        className="w-full p-3 text-sm text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                      >
                        {loadingRepos || isFetchingNextPage ? 'Loading...' : 'Load more repositories'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {selectedRepo && (
                <div className="mt-2 p-2 bg-te-gray-100 dark:bg-te-gray-800 rounded text-xs">
                  Selected: <span className="font-medium">{selectedRepo.full_name}</span>
                </div>
              )}
            </div>

            {/* VM Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider">VM Configuration</h3>
              
              <div>
                <label htmlFor="name" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  VM Name
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full"
                  placeholder="my-dev-vm"
                />
              </div>

              <div>
                <label htmlFor="gcpProjectId" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  GCP Project
                </label>
                {organization?.gcpProjectIds && organization.gcpProjectIds.length > 0 ? (
                  <select
                    id="gcpProjectId"
                    required
                    value={formData.gcpProjectId}
                    onChange={(e) => setFormData({ ...formData, gcpProjectId: e.target.value })}
                    className="w-full"
                  >
                    <option value="">Select a project</option>
                    {organization.gcpProjectIds.map((projectId) => (
                      <option key={projectId} value={projectId}>
                        {projectId}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-te-gray-500 dark:text-te-gray-400">
                    No projects configured. Please configure GCP projects in organization settings.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="zone" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                    Zone
                  </label>
                  <select
                    id="zone"
                    value={formData.zone}
                    onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                    className="w-full"
                  >
                    <option value="us-central1-a">us-central1-a</option>
                    <option value="us-central1-b">us-central1-b</option>
                    <option value="us-east1-b">us-east1-b</option>
                    <option value="us-east1-c">us-east1-c</option>
                    <option value="us-west1-a">us-west1-a</option>
                    <option value="us-west1-b">us-west1-b</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="machineType" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                    Machine Type
                  </label>
                  <select
                    id="machineType"
                    value={formData.machineType}
                    onChange={(e) => setFormData({ ...formData, machineType: e.target.value })}
                    className="w-full"
                  >
                    <option value="e2-micro">e2-micro</option>
                    <option value="e2-small">e2-small</option>
                    <option value="e2-medium">e2-medium</option>
                    <option value="e2-standard-2">e2-standard-2</option>
                    <option value="e2-standard-4">e2-standard-4</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Advanced Options */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center space-x-2 text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
              >
                <svg 
                  className={`w-4 h-4 transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Advanced Options</span>
              </button>
            </div>

            {showAdvanced && (
              <div className="space-y-4 p-4 bg-te-gray-100 dark:bg-te-gray-900 rounded-lg">
                <div>
                  <label htmlFor="scriptTemplate" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                    Script Template
                  </label>
                  <select
                    id="scriptTemplate"
                    value={selectedScript}
                    onChange={(e) => handleScriptSelect(e.target.value)}
                    className="w-full mb-4"
                  >
                    <option value="">Select a template...</option>
                    {Object.entries(premadeScripts).map(([key, script]) => (
                      <option key={key} value={key}>
                        {script.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="userScript" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                    Post-Clone Startup Script (Optional)
                  </label>
                  <textarea
                    id="userScript"
                    rows={10}
                    value={userStartupScript}
                    onChange={(e) => {
                      setUserStartupScript(e.target.value);
                      // If user manually edits, switch to custom
                      if (selectedScript && selectedScript !== 'custom') {
                        setSelectedScript('custom');
                      }
                    }}
                    className="w-full font-mono text-xs"
                    placeholder="#!/bin/bash\n# This script runs after the repository is cloned\n# Working directory will be the cloned repository\n\n# Example:\n# npm install\n# npm run build"
                    spellCheck={false}
                  />
                  <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-1">
                    This script will run after the repository is cloned. The working directory will be set to the cloned repository.
                  </p>
                </div>
              </div>
            )}
          </div>
        </form>
        )}

        {!showProgressTracker && (
          <div className="flex justify-end space-x-3 p-6 border-t border-te-gray-200 dark:border-te-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !selectedRepo || !organization?.gcpProjectIds || organization.gcpProjectIds.length === 0}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Creating...' : 'Create VM with Repository'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}