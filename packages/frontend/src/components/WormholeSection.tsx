import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { wormholeApi } from '../api/wormhole';
import { useToast } from '../contexts/ToastContext';
import type { 
  WormholeWebSocketMessage, 
  WormholeRepository,
  WormholeDaemon,
  WormholeProcess
} from '@gce-platform/types';

interface WormholeSectionProps {
  vmId: string;
  publicIp?: string;
  autoConnect?: boolean;
}

export default function WormholeSection({ vmId, publicIp, autoConnect = true }: WormholeSectionProps) {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { showError, showSuccess } = useToast();

  // Debug logging
  useEffect(() => {
    console.log('WormholeSection mounted/updated:', {
      vmId,
      publicIp,
      autoConnect,
      connectionStatus,
      hasAttemptedAutoConnect
    });
  }, [vmId, publicIp, autoConnect, connectionStatus, hasAttemptedAutoConnect]);

  // Fetch Wormhole status directly from the VM
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['wormhole-status-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getStatus(publicIp) : null,
    enabled: !!publicIp && connectionStatus === 'connected',
    refetchInterval: 5000,
  });

  // Fetch repositories directly from the VM
  const { data: repositories, refetch: refetchRepos } = useQuery({
    queryKey: ['wormhole-repositories-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getRepositories(publicIp) : null,
    enabled: !!publicIp && connectionStatus === 'connected',
  });

  // Fetch active ports directly from the VM
  const { data: portsData, refetch: refetchPorts } = useQuery({
    queryKey: ['wormhole-ports-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getPorts(publicIp) : null,
    enabled: !!publicIp && connectionStatus === 'connected',
    refetchInterval: 10000,
  });

  // Fetch daemons directly from the VM
  const { data: daemonsData, refetch: refetchDaemons } = useQuery({
    queryKey: ['wormhole-daemons-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getDaemons(publicIp) : null,
    enabled: !!publicIp && connectionStatus === 'connected',
    refetchInterval: 10000,
  });

  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleConnect = (isAutoConnect = false) => {
    if (!publicIp) {
      if (!isAutoConnect) {
        showError('No public IP available for this VM');
      }
      return;
    }

    setConnectionStatus('connecting');
    
    try {
      const ws = wormholeApi.connectWebSocket(vmId, publicIp);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        if (!isAutoConnect) {
          showSuccess('Connected to Wormhole service');
        }
        
        // Register as a monitoring client
        const registerMessage: WormholeWebSocketMessage = {
          type: 'sync',
          payload: {
            clientId: `orchestrator-${vmId}`,
            branch: 'main',
            repoPath: '/monitored/repo',
            action: 'register'
          },
          clientId: `orchestrator-${vmId}`,
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(registerMessage));
        
        // Fetch all data
        refetchStatus();
        refetchRepos();
        refetchPorts();
        refetchDaemons();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WormholeWebSocketMessage;
          // Refresh data on relevant messages
          if (message.type === 'sync' || message.type === 'branch-switch') {
            refetchStatus();
            refetchRepos();
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!isAutoConnect) {
          showError('WebSocket connection error');
        }
      };

      ws.onclose = (event) => {
        setConnectionStatus('disconnected');
        wsRef.current = null;
        
        // If this was an auto-connection attempt and it failed quickly, 
        // it might mean the service isn't ready yet
        if (isAutoConnect && event.code === 1006) {
          console.log('Auto-connection failed, service might not be ready');
        }
      };
    } catch (error) {
      setConnectionStatus('disconnected');
      if (!isAutoConnect) {
        showError('Failed to connect to Wormhole service');
      }
      console.error('Connection error:', error);
    }
  };

  const handleDisconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  };

  // Auto-connect when component mounts if publicIp is available
  useEffect(() => {
    if (autoConnect && publicIp && !hasAttemptedAutoConnect && connectionStatus === 'disconnected') {
      console.log('Auto-connect conditions met, attempting connection...');
      setHasAttemptedAutoConnect(true);
      // Small delay to ensure the page is fully loaded and network is ready
      const timer = setTimeout(() => {
        console.log('Auto-connecting to Wormhole service at:', publicIp);
        handleConnect(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [publicIp, autoConnect]); // Simplified dependencies

  const toggleRepo = (repoPath: string) => {
    setExpandedRepos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(repoPath)) {
        newSet.delete(repoPath);
      } else {
        newSet.add(repoPath);
      }
      return newSet;
    });
  };

  const handleBranchSwitch = async (repoPath: string, targetBranch: string) => {
    if (!publicIp) return;
    
    try {
      const response = await wormholeApi.directApi.switchBranch(publicIp, {
        repoPath,
        targetBranch
      });

      if (response.success) {
        showSuccess(`Switched to branch ${targetBranch}`);
        // Refresh data
        setTimeout(() => {
          refetchStatus();
          refetchRepos();
          refetchDaemons();
        }, 1000);
      } else {
        showError(response.error || 'Failed to switch branch');
      }
    } catch (error) {
      showError('Failed to send branch switch command');
      console.error('Branch switch error:', error);
    }
  };

  const handleScan = async () => {
    if (!publicIp) return;
    
    try {
      const response = await wormholeApi.directApi.triggerScan(publicIp);
      if (response.success) {
        showSuccess('Repository scan initiated');
        // Refresh daemons after a delay
        setTimeout(() => {
          refetchDaemons();
          refetchRepos();
        }, 2000);
      }
    } catch (error) {
      showError('Failed to trigger repository scan');
      console.error('Scan error:', error);
    }
  };

  // Get clients for a specific repository
  const getRepoClients = (repoPath: string) => {
    return statusData?.clients.filter((c: any) => c.connected && c.repoPath === repoPath) || [];
  };

  // Get daemon for a specific repository
  const getRepoDaemon = (repoPath: string): WormholeDaemon | undefined => {
    return daemonsData?.daemons.find((d: WormholeDaemon) => 
      d.repository.name === repoPath || d.repository.path.endsWith(repoPath)
    );
  };

  // Get ports for specific processes
  const getProcessPorts = (processName: string): WormholeProcess | undefined => {
    return portsData?.processes.find((p: WormholeProcess) => 
      p.processName.toLowerCase() === processName.toLowerCase()
    );
  };

  // Combine active repositories with all daemons
  const allRepositories = Array.from(new Set([
    ...(repositories || []).map((r: WormholeRepository) => r.repoPath),
    ...(daemonsData?.daemons || []).map((d: WormholeDaemon) => d.repository.name)
  ]));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wider">Wormhole Service</h2>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mt-1">
            File Synchronization & System Monitoring
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center space-x-2 text-xs uppercase tracking-wider ${
            connectionStatus === 'connected' 
              ? 'text-green-600 dark:text-te-yellow' 
              : connectionStatus === 'connecting'
              ? 'text-yellow-600 dark:text-te-orange'
              : 'text-te-gray-500 dark:text-te-gray-600'
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full ${
              connectionStatus === 'connected' 
                ? 'bg-green-500 dark:bg-te-yellow' 
                : connectionStatus === 'connecting'
                ? 'bg-yellow-500 dark:bg-te-orange animate-pulse'
                : 'bg-te-gray-400 dark:bg-te-gray-600'
            }`} />
            {connectionStatus}
            {connectionStatus === 'connecting' && hasAttemptedAutoConnect && ' (auto)'}
          </span>
          {connectionStatus === 'disconnected' ? (
            <button
              onClick={handleConnect}
              disabled={!publicIp}
              className="btn-primary"
              title={!publicIp ? 'No public IP available' : 'Connect to Wormhole service'}
            >
              Connect
            </button>
          ) : (
            <>
              <button
                onClick={handleScan}
                className="btn-secondary text-xs"
                title="Scan for new repositories"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => setShowSystemInfo(!showSystemInfo)}
                className="btn-secondary text-xs"
                title="Toggle system information"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              <button
                onClick={handleDisconnect}
                className="btn-secondary"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {connectionStatus === 'connected' && (
        <>
          {/* System Information */}
          {showSystemInfo && (
            <div className="card bg-te-gray-50 dark:bg-te-gray-900">
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">System Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Daemon Status */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                    Wormhole Daemons
                  </h4>
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="text-te-gray-600 dark:text-te-gray-500">Running:</span>{' '}
                      <span className="font-medium">{daemonsData?.runningCount || 0} / {daemonsData?.count || 0}</span>
                    </p>
                    {daemonsData && daemonsData.count > daemonsData.runningCount && (
                      <p className="text-xs text-yellow-600 dark:text-te-orange">
                        {daemonsData.count - daemonsData.runningCount} daemon(s) not running
                      </p>
                    )}
                  </div>
                </div>

                {/* Port Summary */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                    Active Ports
                  </h4>
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="text-te-gray-600 dark:text-te-gray-500">Total:</span>{' '}
                      <span className="font-medium">{portsData?.totalPorts || 0} ports</span>
                    </p>
                    <p className="text-xs text-te-gray-600 dark:text-te-gray-500">
                      {portsData?.processes.length || 0} processes with open ports
                    </p>
                  </div>
                </div>
              </div>

              {/* Active Processes with Ports */}
              {portsData && portsData.processes.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                    Key Processes
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {portsData.processes
                      .filter((p: WormholeProcess) => ['node', 'python', 'ruby', 'java', 'go'].includes(p.processName.toLowerCase()))
                      .map((process: WormholeProcess) => (
                        <div key={process.pid} className="bg-white dark:bg-te-gray-800 px-3 py-1 rounded text-xs">
                          <span className="font-medium">{process.processName}</span>
                          <span className="text-te-gray-500 dark:text-te-gray-600 ml-1">
                            ({process.ports.length} port{process.ports.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Repositories */}
          <div className="space-y-3">
            {allRepositories.length === 0 ? (
              <div className="card">
                <p className="text-sm text-te-gray-600 dark:text-te-gray-500 text-center py-8">
                  No repositories found. Click the refresh button to scan for repositories.
                </p>
              </div>
            ) : (
              allRepositories.map((repoPath) => {
                const repo = repositories?.find((r: WormholeRepository) => r.repoPath === repoPath);
                const daemon = getRepoDaemon(repoPath);
                const repoClients = repo ? getRepoClients(repo.repoPath) : [];
                const isExpanded = expandedRepos.has(repoPath);
                const mainBranch = repo?.branches.find((b: string) => b === 'main' || b === 'master') || 
                                 daemon?.repository.branch || 'main';
                const isActive = repo && repo.connectedClientCount > 0;
                
                return (
                  <div key={repoPath} className={`card ${!isActive ? 'opacity-75' : ''}`}>
                    {/* Repository Header */}
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleRepo(repoPath)}
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
                          <h3 className="font-mono text-sm font-medium">{repoPath}</h3>
                          <div className="flex items-center space-x-3 mt-1">
                            {/* Daemon Status */}
                            {daemon && (
                              <span className={`text-xs ${
                                daemon.status === 'running' 
                                  ? 'text-green-600 dark:text-green-500' 
                                  : 'text-red-600 dark:text-red-500'
                              }`}>
                                <span className="inline-block w-2 h-2 rounded-full bg-current mr-1"></span>
                                Daemon {daemon.status}
                              </span>
                            )}
                            {/* Client count */}
                            {repo && (
                              <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                                {repoClients.length} connected client{repoClients.length !== 1 ? 's' : ''}
                              </span>
                            )}
                            {/* Branch count with details */}
                            {(() => {
                              const branchInfo = repo?.availableBranches || daemon?.repository.branches;
                              if (branchInfo) {
                                const totalBranches = branchInfo.all.length;
                                const localOnly = branchInfo.local.filter(b => !branchInfo.remote.includes(b)).length;
                                const remoteOnly = branchInfo.remote.filter(b => !branchInfo.local.includes(b)).length;
                                
                                return (
                                  <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                                    {totalBranches} branch{totalBranches !== 1 ? 'es' : ''}
                                    {(localOnly > 0 || remoteOnly > 0) && (
                                      <span className="text-2xs ml-1">
                                        ({localOnly > 0 && `${localOnly} local`}
                                        {localOnly > 0 && remoteOnly > 0 && ', '}
                                        {remoteOnly > 0 && `${remoteOnly} remote`})
                                      </span>
                                    )}
                                  </span>
                                );
                              } else if (repo) {
                                return (
                                  <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                                    {repo.branches.length} branch{repo.branches.length !== 1 ? 'es' : ''}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Active branches */}
                        {repo?.activeBranches.map((branch: string) => (
                          <span 
                            key={branch}
                            className={`text-xs px-2 py-1 rounded ${
                              branch === mainBranch
                                ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900'
                                : 'bg-green-600 dark:bg-green-500 text-white'
                            }`}
                          >
                            {branch}
                          </span>
                        ))}
                        {/* Daemon branch if no active branches */}
                        {!repo && daemon && (
                          <span className="text-xs px-2 py-1 rounded bg-te-gray-300 dark:bg-te-gray-700">
                            {daemon.repository.branch}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="mt-4 space-y-4">
                        {/* Daemon Information */}
                        {daemon && (
                          <div>
                            <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                              Daemon Information
                            </h4>
                            <div className="bg-te-gray-50 dark:bg-te-gray-900 p-3 rounded text-xs space-y-1">
                              <p>
                                <span className="text-te-gray-600 dark:text-te-gray-500">Path:</span>{' '}
                                <span className="font-mono">{daemon.repository.path}</span>
                              </p>
                              <p>
                                <span className="text-te-gray-600 dark:text-te-gray-500">PID:</span>{' '}
                                {daemon.pid}
                              </p>
                              <p>
                                <span className="text-te-gray-600 dark:text-te-gray-500">Uptime:</span>{' '}
                                {Math.floor(daemon.uptime / 1000 / 60)} minutes
                              </p>
                              {daemon.repository.originUrl && (
                                <p>
                                  <span className="text-te-gray-600 dark:text-te-gray-500">Origin:</span>{' '}
                                  <span className="font-mono break-all">{daemon.repository.originUrl}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Connected Clients */}
                        {repo && repoClients.length > 0 && (
                          <div>
                            <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                              Connected Clients
                            </h4>
                            <div className="space-y-2">
                              {repoClients.map((client: any) => (
                                <div 
                                  key={client.id}
                                  className="flex items-center justify-between text-xs bg-te-gray-50 dark:bg-te-gray-900 p-2 rounded"
                                >
                                  <span className="font-mono">{client.id}</span>
                                  <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-0.5 rounded ${
                                      client.branch === mainBranch
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
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Branch Management */}
                        {(repo || daemon) && (
                          <div>
                            <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                              Branch Management
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {(() => {
                                // Get all available branches from either repo or daemon
                                let allBranches: string[] = [];
                                let localBranches: string[] = [];
                                let remoteBranches: string[] = [];
                                
                                if (repo?.availableBranches) {
                                  allBranches = repo.availableBranches.all || repo.branches;
                                  localBranches = repo.availableBranches.local || [];
                                  remoteBranches = repo.availableBranches.remote || [];
                                } else if (daemon?.repository.branches) {
                                  allBranches = daemon.repository.branches.all;
                                  localBranches = daemon.repository.branches.local;
                                  remoteBranches = daemon.repository.branches.remote;
                                } else if (repo) {
                                  allBranches = repo.branches;
                                }
                                
                                return allBranches.map((branch: string) => {
                                  const isActive = repo?.activeBranches.includes(branch) || daemon?.repository.branch === branch;
                                  const isMain = branch === mainBranch;
                                  const isLocal = localBranches.includes(branch);
                                  const isRemote = remoteBranches.includes(branch);
                                  const isRemoteOnly = isRemote && !isLocal;
                                  
                                  return (
                                    <div key={branch} className="relative group">
                                      <button
                                        onClick={() => handleBranchSwitch(repo?.repoPath || daemon?.repository.name || '', branch)}
                                        disabled={isActive}
                                        className={`text-xs px-3 py-1 rounded transition-colors ${
                                          isActive
                                            ? isMain
                                              ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 cursor-default'
                                              : 'bg-green-600 dark:bg-green-500 text-white cursor-default'
                                            : isRemoteOnly
                                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800'
                                              : 'bg-te-gray-100 dark:bg-te-gray-800 hover:bg-te-gray-200 dark:hover:bg-te-gray-700'
                                        }`}
                                        title={
                                          isActive ? 'Currently active' : 
                                          isRemoteOnly ? 'Remote branch - will be created locally on switch' :
                                          'Click to switch all clients to this branch'
                                        }
                                      >
                                        {branch}
                                        {isActive && ' ✓'}
                                        {isRemoteOnly && ' ↓'}
                                      </button>
                                      {/* Branch info tooltip */}
                                      {(isLocal || isRemote) && (
                                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-2xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                          {isLocal && isRemote ? 'Local & Remote' : isLocal ? 'Local only' : 'Remote only'}
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                            <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-2">
                              Click any branch to switch all connected clients
                              {(() => {
                                const remoteBranchCount = repo?.availableBranches?.remote?.length || 
                                                         daemon?.repository.branches?.remote?.length || 0;
                                return remoteBranchCount > 0 ? <span className="ml-1">(↓ = remote branch)</span> : null;
                              })()}
                            </p>
                          </div>
                        )}

                        {/* No active sync warning */}
                        {!repo && daemon && daemon.status === 'running' && (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded">
                            <p className="text-xs text-yellow-700 dark:text-yellow-400">
                              Daemon is running but no clients are connected for active synchronization
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {connectionStatus === 'disconnected' && (
        <div className="card">
          <div className="text-center py-8 text-te-gray-600 dark:text-te-gray-500">
            <p className="mb-2">Not connected to Wormhole service</p>
            <p className="text-xs">Click Connect to establish WebSocket connection on port 8080</p>
          </div>
        </div>
      )}

      <div className="text-xs text-te-gray-600 dark:text-te-gray-500 space-y-1">
        <p>• WebSocket: ws://{publicIp || '<public-ip>'}:8080</p>
        <p>• REST API: http://{publicIp || '<public-ip>'}:8080/api/*</p>
        <p>• Ensure port 8080 is accessible through firewall rules</p>
      </div>
    </div>
  );
}