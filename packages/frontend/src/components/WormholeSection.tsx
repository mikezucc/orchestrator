import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { wormholeApi } from '../api/wormhole';
import { useToast } from '../contexts/ToastContext';
import type { WormholeWebSocketMessage, WormholeRepository } from '@gce-platform/types';

interface WormholeSectionProps {
  vmId: string;
  publicIp?: string;
}

export default function WormholeSection({ vmId, publicIp }: WormholeSectionProps) {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const { showError, showSuccess } = useToast();

  // Fetch Wormhole status
  const { data: statusResponse, refetch: refetchStatus } = useQuery({
    queryKey: ['wormhole-status', vmId],
    queryFn: () => wormholeApi.getStatus(vmId),
    enabled: !!vmId && connectionStatus === 'connected',
    refetchInterval: 5000,
  });

  // Fetch repositories
  const { data: reposResponse, refetch: refetchRepos } = useQuery({
    queryKey: ['wormhole-repositories', vmId],
    queryFn: () => wormholeApi.getRepositories(vmId),
    enabled: !!vmId && connectionStatus === 'connected',
  });

  const repositories = reposResponse?.data || [];
  const status = statusResponse?.data;

  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleConnect = () => {
    if (!publicIp) {
      showError('No public IP available for this VM');
      return;
    }

    setConnectionStatus('connecting');
    
    try {
      const ws = wormholeApi.connectWebSocket(vmId, publicIp);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        showSuccess('Connected to Wormhole service');
        
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
        
        // Fetch initial data
        refetchStatus();
        refetchRepos();
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
        showError('WebSocket connection error');
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        wsRef.current = null;
      };
    } catch (error) {
      setConnectionStatus('disconnected');
      showError('Failed to connect to Wormhole service');
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
    try {
      const response = await wormholeApi.switchBranch(vmId, {
        repoPath,
        targetBranch
      });

      if (response.success) {
        showSuccess(`Switched to branch ${targetBranch}`);
        // Refresh data
        setTimeout(() => {
          refetchStatus();
          refetchRepos();
        }, 1000);
      } else {
        showError(response.error || 'Failed to switch branch');
      }
    } catch (error) {
      showError('Failed to send branch switch command');
      console.error('Branch switch error:', error);
    }
  };

  // Get clients for a specific repository
  const getRepoClients = (repoPath: string) => {
    return status?.clients.filter(c => c.connected && c.repoPath === repoPath) || [];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wider">Wormhole Service</h2>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mt-1">
            File Synchronization (Port 8080)
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
            <button
              onClick={handleDisconnect}
              className="btn-secondary"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {connectionStatus === 'connected' && (
        <div className="space-y-3">
          {repositories.length === 0 ? (
            <div className="card">
              <p className="text-sm text-te-gray-600 dark:text-te-gray-500 text-center py-8">
                No repositories found. Waiting for clients to connect...
              </p>
            </div>
          ) : (
            repositories.map((repo) => {
              const repoClients = getRepoClients(repo.repoPath);
              const isExpanded = expandedRepos.has(repo.repoPath);
              const mainBranch = repo.branches.find(b => b === 'main' || b === 'master') || repo.branches[0];
              
              return (
                <div key={repo.repoPath} className="card">
                  {/* Repository Header */}
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleRepo(repo.repoPath)}
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
                        <h3 className="font-mono text-sm font-medium">{repo.repoPath}</h3>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                            {repoClients.length} connected client{repoClients.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                            {repo.branches.length} branch{repo.branches.length !== 1 ? 'es' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {repo.activeBranches.map((branch) => (
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
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4">
                      {/* Connected Clients */}
                      {repoClients.length > 0 && (
                        <div>
                          <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                            Connected Clients
                          </h4>
                          <div className="space-y-2">
                            {repoClients.map((client) => (
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
                      <div>
                        <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                          Branch Management
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {repo.branches.map((branch) => {
                            const isActive = repo.activeBranches.includes(branch);
                            const isMain = branch === mainBranch;
                            
                            return (
                              <button
                                key={branch}
                                onClick={() => handleBranchSwitch(repo.repoPath, branch)}
                                disabled={isActive}
                                className={`text-xs px-3 py-1 rounded transition-colors ${
                                  isActive
                                    ? isMain
                                      ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 cursor-default'
                                      : 'bg-green-600 dark:bg-green-500 text-white cursor-default'
                                    : 'bg-te-gray-100 dark:bg-te-gray-800 hover:bg-te-gray-200 dark:hover:bg-te-gray-700'
                                }`}
                                title={isActive ? 'Currently active' : 'Click to switch all clients to this branch'}
                              >
                                {branch}
                                {isActive && ' ✓'}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-2">
                          Click any branch to switch all connected clients
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
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
        <p>• Ensure port 8080 is accessible through firewall rules</p>
      </div>
    </div>
  );
}