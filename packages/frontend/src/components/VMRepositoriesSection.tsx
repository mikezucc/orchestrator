import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmRepositoriesApi } from '../api/vm-repositories';
import { wormholeApi } from '../api/wormhole';
import { useToast } from '../contexts/ToastContext';
import type { VMRepository } from '../api/vm-repositories';

interface VMRepositoriesSectionProps {
  vmId: string;
  publicIp?: string;
}

export default function VMRepositoriesSection({ vmId, publicIp }: VMRepositoriesSectionProps) {
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [switchingBranch, setSwitchingBranch] = useState<string | null>(null);
  const [switchingClientBranch, setSwitchingClientBranch] = useState<string | null>(null);
  const [githubBranches, setGithubBranches] = useState<Record<string, Array<{ name: string; protected: boolean; commit: { sha: string }; isDefault?: boolean }>>>({});
  const [loadingGithubBranches, setLoadingGithubBranches] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  // Fetch repositories directly from wormhole daemon
  const { data: repositoriesData, isLoading, refetch } = useQuery({
    queryKey: ['wormhole-repositories-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getRepositories(publicIp) : null,
    enabled: !!publicIp,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Transform wormhole data to match expected format
  const repositories = repositoriesData ? repositoriesData.map((repo: any) => {
    // Get current branch from first connected client or default to 'main'
    const currentBranch = repo.clients?.find((c: any) => c.connected)?.branch || 'main';
    
    return {
      id: repo.repoPath,
      vmId,
      repoFullName: repo.repoPath,
      daemon: {
        branch: currentBranch,
        status: repo.connectedClientCount > 0 ? 'running' : 'stopped'
      },
      wormhole: {
        branches: repo.branches || [],
        availableBranches: repo.availableBranches,
        activeBranches: repo.activeBranches?.reduce((acc: any, branch: string) => {
          acc[branch] = repo.clients?.filter((c: any) => c.branch === branch).length || 0;
          return acc;
        }, {}) || {},
        clientCount: repo.clientCount || 0
      },
      clients: repo.clients || []
    };
  }) : [];

  // Branch switch mutation
  const switchBranchMutation = useMutation({
    mutationFn: async ({ repoPath, targetBranch }: { repoPath: string; targetBranch: string }) => {
      if (!publicIp) throw new Error('VM does not have a public IP');
      return wormholeApi.directApi.switchBranch(publicIp, { repoPath, targetBranch });
    },
    onSuccess: () => {
      showSuccess('Branch switch initiated');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['wormhole-repositories-direct', publicIp] });
      }, 2000);
    },
    onError: (error) => {
      showError(`Failed to switch branch: ${error.message}`);
    },
    onSettled: () => {
      setSwitchingBranch(null);
    }
  });

  // Scan for new repositories
  const scanMutation = useMutation({
    mutationFn: async () => {
      if (!publicIp) throw new Error('VM does not have a public IP');
      return wormholeApi.directApi.triggerScan(publicIp);
    },
    onSuccess: () => {
      showSuccess('Repository scan initiated');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['wormhole-repositories-direct', publicIp] });
      }, 3000);
    },
    onError: (error) => {
      showError(`Failed to scan repositories: ${error.message}`);
    }
  });

  const toggleRepo = async (repoId: string, repoPath: string) => {
    setExpandedRepos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(repoPath)) {
        newSet.delete(repoPath);
      } else {
        newSet.add(repoPath);
        // Fetch GitHub branches when expanding
        if (!githubBranches[repoId] && !loadingGithubBranches.has(repoId)) {
          fetchGitHubBranches(repoId);
        }
      }
      return newSet;
    });
  };

  const fetchGitHubBranches = async (repoId: string) => {
    // GitHub branches are now fetched from wormhole daemon data
    // This function is kept for compatibility but doesn't do anything
  };

  const handleBranchSwitch = (repoPath: string, targetBranch: string) => {
    setSwitchingBranch(`${repoPath}:${targetBranch}`);
    switchBranchMutation.mutate({ repoPath, targetBranch });
  };

  // Client branch switch mutation - uses the same endpoint as regular branch switch
  const switchClientBranchMutation = useMutation({
    mutationFn: async ({ clientId, repoPath, targetBranch }: { clientId: string; repoPath: string; targetBranch: string }) => {
      if (!publicIp) throw new Error('VM does not have a public IP');
      // Branch switches affect all clients on the daemon
      return wormholeApi.directApi.switchBranch(publicIp, { repoPath, targetBranch });
    },
    onSuccess: () => {
      showSuccess('Client branch switch initiated');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['wormhole-repositories-direct', publicIp] });
      }, 2000);
    },
    onError: (error) => {
      showError(`Failed to switch client branch: ${error.message}`);
    },
    onSettled: () => {
      setSwitchingClientBranch(null);
    }
  });

  const handleClientBranchSwitch = (clientId: string, repoPath: string, targetBranch: string) => {
    setSwitchingClientBranch(`${clientId}:${targetBranch}`);
    switchClientBranchMutation.mutate({ clientId, repoPath, targetBranch });
  };

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="animate-pulse">
          <div className="h-4 bg-te-gray-200 dark:bg-te-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-te-gray-200 dark:bg-te-gray-700 rounded"></div>
            <div className="h-3 bg-te-gray-200 dark:bg-te-gray-700 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-te-gray-900 dark:text-te-gray-100">
          Repositories
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-te-gray-500 hover:text-te-gray-700 dark:text-te-gray-400 dark:hover:text-te-gray-200"
            title="Refresh repositories"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {publicIp && (
            <button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              className="p-2 text-te-gray-500 hover:text-te-gray-700 dark:text-te-gray-400 dark:hover:text-te-gray-200 disabled:opacity-50"
              title="Scan for new repositories"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Repository List */}
      {repositories.length === 0 ? (
        <div className="card">
          <p className="text-sm text-te-gray-600 dark:text-te-gray-500 text-center py-8">
            No repositories found. {publicIp ? 'Click the scan button to search for repositories.' : 'Repositories will appear here once detected.'}
          </p>
        </div>
      ) : (
        repositories.map((repo) => {
          const isExpanded = expandedRepos.has(repo.repoFullName);
          const currentBranch = repo.daemon?.branch || 'main';
          const isOnline = repo.daemon?.status === 'running';
          
          return (
            <div key={repo.id} className="card">
              {/* Repository Header */}
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleRepo(repo.id, repo.repoFullName)}
              >
                <div className="flex items-center space-x-3">
                  <svg 
                    className={`w-4 h-4 text-te-gray-600 dark:text-te-gray-400 transform transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <h3 className="font-mono text-sm font-medium">{repo.repoFullName}</h3>
                    <div className="flex items-center space-x-3 mt-1">                      
                      {/* Client count */}
                      {repo.clients.length > 0 && (
                        <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                          {repo.clients.length} {repo.clients.length === 1 ? 'person' : 'people'} active
                        </span>
                      )}
                      
                      {/* Error indicator */}
                      {repo.syncError && (
                        <span className="text-xs text-red-600 dark:text-red-500" title={repo.syncError}>
                          ⚠️ Sync error
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Current branch */}
                  <span className="text-xs px-2 py-1 rounded bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900">
                    {currentBranch}
                  </span>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="mt-4 space-y-4">
                  {/* Connected Clients */}
                  {repo.clients.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                        Connected Clients
                      </h4>
                      <div className="space-y-2">
                        {repo.clients.map((client) => {
                          const isClientExpanded = expandedClients.has(client.id);
                          return (
                            <div key={client.id} className="bg-te-gray-50 dark:bg-te-gray-900 rounded">
                              <div 
                                className="flex items-center justify-between text-xs p-2 cursor-pointer"
                                onClick={() => toggleClient(client.id)}
                              >
                                <div className="flex items-center space-x-2">
                                  <svg 
                                    className={`w-3 h-3 text-te-gray-600 dark:text-te-gray-400 transform transition-transform ${
                                      isClientExpanded ? 'rotate-90' : ''
                                    }`} 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  <span className="font-mono">{client.id}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className={`px-2 py-0.5 rounded ${
                                    client.branch === currentBranch
                                      ? 'bg-te-gray-800 dark:bg-te-yellow text-white dark:text-te-gray-900'
                                      : 'bg-green-600 dark:bg-green-500 text-white'
                                  }`}>
                                    {client.branch}
                                  </span>
                                  <span className="text-te-gray-500 dark:text-te-gray-600">
                                    {new Date(client.lastActivity).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Client Branch Selector */}
                              {isClientExpanded && publicIp && (
                                <div className="px-2 pb-2">
                                  <div className="text-xs text-te-gray-600 dark:text-te-gray-400 mb-1">
                                    Switch to branch (affects all clients):
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {(() => {
                                      // Use GitHub branches if available, otherwise fall back to daemon branches
                                      const gitBranches = githubBranches[repo.id];
                                      const daemonBranches = repo.wormhole?.availableBranches?.all || repo.wormhole?.branches || [];
                                      
                                      if (gitBranches && gitBranches.length > 0) {
                                        return gitBranches.map((branch) => {
                                          const isCurrent = branch.name === client.branch;
                                          const isDisabled = switchingClientBranch === `${client.id}:${branch.name}` || isCurrent;
                                          
                                          return (
                                            <button
                                              key={branch.name}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleClientBranchSwitch(client.id, repo.repoFullName, branch.name);
                                              }}
                                              disabled={isDisabled}
                                              className={`
                                                px-2 py-0.5 text-xs rounded transition-colors
                                                ${isCurrent 
                                                  ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 cursor-default' 
                                                  : 'bg-te-gray-200 dark:bg-te-gray-700 hover:bg-te-gray-300 dark:hover:bg-te-gray-600'
                                                }
                                                ${isDisabled && !isCurrent ? 'opacity-50 cursor-not-allowed' : ''}
                                              `}
                                            >
                                              {branch.name}
                                              {branch.isDefault && ' ⭐'}
                                            </button>
                                          );
                                        });
                                      } else if (daemonBranches.length > 0) {
                                        return daemonBranches.map((branch) => {
                                          const isCurrent = branch === client.branch;
                                          const isDisabled = switchingClientBranch === `${client.id}:${branch}` || isCurrent;
                                          
                                          return (
                                            <button
                                              key={branch}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleClientBranchSwitch(client.id, repo.repoFullName, branch);
                                              }}
                                              disabled={isDisabled}
                                              className={`
                                                px-2 py-0.5 text-xs rounded transition-colors
                                                ${isCurrent 
                                                  ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 cursor-default' 
                                                  : 'bg-te-gray-200 dark:bg-te-gray-700 hover:bg-te-gray-300 dark:hover:bg-te-gray-600'
                                                }
                                                ${isDisabled && !isCurrent ? 'opacity-50 cursor-not-allowed' : ''}
                                              `}
                                            >
                                              {branch}
                                            </button>
                                          );
                                        });
                                      }
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Branch Management */}
                  {publicIp && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                        Change Branch
                      </h4>
                      {loadingGithubBranches.has(repo.id) ? (
                        <div className="flex items-center space-x-2 text-sm text-te-gray-600 dark:text-te-gray-500">
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Fetching branches from GitHub...</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            // Use GitHub branches if available, otherwise fall back to daemon branches
                            const gitBranches = githubBranches[repo.id];
                            const daemonBranches = repo.wormhole?.availableBranches?.all || repo.wormhole?.branches || [];
                            const localBranches = repo.wormhole?.availableBranches?.local || [];
                            const remoteBranches = repo.wormhole?.availableBranches?.remote || [];
                            
                            if (gitBranches && gitBranches.length > 0) {
                              // Use GitHub branches
                              return gitBranches.map((branch) => {
                                const isCurrent = branch.name === currentBranch;
                                const clientCount = repo.wormhole?.activeBranches?.[branch.name] || 0;
                                const isDisabled = switchingBranch === `${repo.repoFullName}:${branch.name}` || isCurrent;
                                
                                return (
                                  <button
                                    key={branch.name}
                                    onClick={() => handleBranchSwitch(repo.repoFullName, branch.name)}
                                    disabled={isDisabled}
                                    className={`
                                      px-3 py-1 text-xs rounded transition-colors
                                      ${isCurrent 
                                        ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 cursor-default' 
                                        : 'bg-te-gray-200 dark:bg-te-gray-700 hover:bg-te-gray-300 dark:hover:bg-te-gray-600'
                                      }
                                      ${isDisabled && !isCurrent ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}
                                  >
                                    <span className="flex items-center space-x-1">
                                      <span>{branch.name}</span>
                                      {branch.isDefault && (
                                        <span className="text-xs text-te-gray-500" title="Default branch">⭐</span>
                                      )}
                                      {branch.protected && (
                                        <span className="text-xs text-te-gray-500" title="Protected branch">🔒</span>
                                      )}
                                      {clientCount > 0 && branch.name !== currentBranch && (
                                        <span className="text-xs bg-te-gray-800 dark:bg-te-gray-900 text-white px-1 rounded">
                                          {clientCount}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                );
                              });
                            } else if (daemonBranches.length > 0) {
                              // Fall back to daemon branches
                              return daemonBranches.map((branch) => {
                                const isLocal = localBranches.includes(branch);
                                const isRemote = remoteBranches.includes(branch);
                                const isCurrent = branch === currentBranch;
                                const clientCount = repo.wormhole?.activeBranches?.[branch] || 0;
                                const isDisabled = switchingBranch === `${repo.repoFullName}:${branch}` || isCurrent;
                                
                                return (
                                  <button
                                    key={branch}
                                    onClick={() => handleBranchSwitch(repo.repoFullName, branch)}
                                    disabled={isDisabled}
                                    className={`
                                      px-3 py-1 text-xs rounded transition-colors
                                      ${isCurrent 
                                        ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 cursor-default' 
                                        : 'bg-te-gray-200 dark:bg-te-gray-700 hover:bg-te-gray-300 dark:hover:bg-te-gray-600'
                                      }
                                      ${isDisabled && !isCurrent ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}
                                  >
                                    <span className="flex items-center space-x-1">
                                      <span>{branch}</span>
                                      {clientCount > 0 && branch !== currentBranch && (
                                        <span className="text-xs bg-te-gray-800 dark:bg-te-gray-900 text-white px-1 rounded">
                                          {clientCount}
                                        </span>
                                      )}
                                      {isLocal && !isRemote && (
                                        <span className="text-xs text-te-gray-500" title="Local branch only">L</span>
                                      )}
                                      {!isLocal && isRemote && (
                                        <span className="text-xs text-te-gray-500" title="Remote branch only">R</span>
                                      )}
                                    </span>
                                  </button>
                                );
                              });
                            } else {
                              return (
                                <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                                  No branches available
                                </span>
                              );
                            }
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}