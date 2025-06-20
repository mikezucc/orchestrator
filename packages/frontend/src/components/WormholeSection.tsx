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
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [targetBranch, setTargetBranch] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<Array<{ type: string; content: string; timestamp: Date }>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const { showError, showSuccess } = useToast();

  // Fetch Wormhole status
  const { data: statusResponse, refetch: refetchStatus } = useQuery({
    queryKey: ['wormhole-status', vmId],
    queryFn: () => wormholeApi.getStatus(vmId),
    enabled: !!vmId && connectionStatus === 'connected',
    refetchInterval: 5000, // Poll every 5 seconds when connected
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
          setMessages(prev => [...prev, {
            type: message.type,
            content: JSON.stringify(message.payload, null, 2),
            timestamp: new Date(message.timestamp)
          }]);
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

  const handleBranchSwitch = async () => {
    if (!selectedRepo || !targetBranch) {
      showError('Please select a repository and enter a target branch');
      return;
    }

    try {
      const response = await wormholeApi.switchBranch(vmId, {
        repoPath: selectedRepo,
        targetBranch: targetBranch
      });

      if (response.success) {
        showSuccess('Branch switch command sent successfully');
        setTargetBranch('');
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wider">Wormhole Service</h2>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mt-1">
            File Synchronization & Branch Management (Port 8080)
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
        <>
          {/* Active Branches Summary */}
          {repositories.length > 0 && (
            <div className="card bg-te-gray-50 dark:bg-te-gray-900 border-te-gray-300 dark:border-te-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider">Active Branches</h3>
                <svg className="w-4 h-4 text-green-600 dark:text-te-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from(new Set(repositories.flatMap(repo => repo.activeBranches))).map((branch, index) => {
                  const clientCount = status?.clients.filter(c => c.connected && c.branch === branch).length || 0;
                  const isMainBranch = branch === 'main' || branch === 'master';
                  
                  return (
                    <div key={index} className={`${
                      isMainBranch 
                        ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900' 
                        : 'bg-green-600 dark:bg-green-500 text-white'
                    } px-3 py-1 rounded-full flex items-center gap-2`}>
                      <span className="text-xs font-medium">{branch}</span>
                      <span className="text-2xs opacity-75">({clientCount} client{clientCount !== 1 ? 's' : ''})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Repository Status */}
          <div className="card">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Repository Status</h3>
            {repositories.length === 0 ? (
              <p className="text-xs text-te-gray-600 dark:text-te-gray-500">No repositories found</p>
            ) : (
              <div className="space-y-3">
                {repositories.map((repo, index) => (
                  <div key={index} className="border-b border-te-gray-200 dark:border-te-gray-800 pb-3 last:border-0">
                    <p className="font-mono text-xs font-medium">{repo.repoPath}</p>
                    <div className="mt-2 space-y-1">
                      {/* Active branches display */}
                      {repo.activeBranches.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-2xs text-te-gray-600 dark:text-te-gray-500 uppercase tracking-wider">Active:</span>
                          <div className="flex flex-wrap gap-1">
                            {repo.activeBranches.map((branch, branchIndex) => (
                              <span key={branchIndex} className="badge-success text-2xs">
                                {branch}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-2xs text-te-gray-600 dark:text-te-gray-500">
                        <span>{repo.connectedClientCount}/{repo.clientCount} clients connected</span>
                        <span>{repo.branches.length} total branches</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connected Clients */}
          <div className="card">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Connected Clients</h3>
            {status?.clients.filter(c => c.connected).length === 0 ? (
              <p className="text-xs text-te-gray-600 dark:text-te-gray-500">No connected clients</p>
            ) : (
              <div className="space-y-2">
                {status?.clients.filter(c => c.connected).map((client, index) => {
                  // Determine if this branch is the main/master branch
                  const isMainBranch = client.branch === 'main' || client.branch === 'master';
                  
                  return (
                    <div key={index} className="border-b border-te-gray-200 dark:border-te-gray-800 pb-2 last:border-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <span className="font-mono text-xs block">{client.id}</span>
                          <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-1">
                            {client.repoPath}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`${
                            isMainBranch 
                              ? 'badge-primary' 
                              : 'badge-success'
                          } text-2xs flex items-center gap-1`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            {client.branch}
                          </span>
                          <span className="text-2xs text-te-gray-500 dark:text-te-gray-600">
                            {new Date(client.lastActivity).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </>
      )}

      {/* Branch Management */}
      {connectionStatus === 'connected' && repositories.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Branch Management</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-1">
                Repository
              </label>
              <select
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                className="w-full"
              >
                <option value="">Select a repository</option>
                {repositories.map((repo, index) => (
                  <option key={index} value={repo.repoPath}>
                    {repo.repoPath}
                  </option>
                ))}
              </select>
            </div>
            
            {selectedRepo && (
              <>
                {/* Show existing branches for selected repo */}
                {(() => {
                  const selectedRepoData = repositories.find(r => r.repoPath === selectedRepo);
                  const currentActiveBranches = selectedRepoData?.activeBranches || [];
                  
                  return selectedRepoData && selectedRepoData.branches.length > 0 ? (
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-1">
                        Available Branches
                      </label>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {selectedRepoData.branches.map((branch, index) => {
                          const isActive = currentActiveBranches.includes(branch);
                          const isMainBranch = branch === 'main' || branch === 'master';
                          
                          return (
                            <button
                              key={index}
                              onClick={() => setTargetBranch(branch)}
                              className={`text-2xs px-2 py-1 rounded transition-colors ${
                                targetBranch === branch
                                  ? 'bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900'
                                  : isActive
                                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800'
                                  : 'bg-te-gray-100 dark:bg-te-gray-800 hover:bg-te-gray-200 dark:hover:bg-te-gray-700'
                              }`}
                              title={isActive ? 'Currently active branch' : 'Click to select'}
                            >
                              {branch}
                              {isActive && ' ✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null;
                })()}
                
                <div>
                  <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-1">
                    Target Branch
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={targetBranch}
                      onChange={(e) => setTargetBranch(e.target.value)}
                      placeholder="e.g., feature/new-feature"
                      className="flex-1"
                    />
                    <button
                      onClick={handleBranchSwitch}
                      disabled={!targetBranch.trim()}
                      className="btn-primary"
                    >
                      Switch Branch
                    </button>
                  </div>
                  <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-1">
                    All connected clients will switch to this branch
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* WebSocket Messages */}
      {connectionStatus === 'connected' && (
        <div className="card">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Activity Log</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-xs text-te-gray-600 dark:text-te-gray-500">No activity yet</p>
            ) : (
              messages.slice(-10).map((msg, index) => (
                <div key={index} className="space-y-1">
                  <div className="flex items-start space-x-2">
                    <span className="text-2xs text-te-gray-600 dark:text-te-gray-500 whitespace-nowrap">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                    <div className="flex-1">
                      <span className="badge-neutral text-2xs uppercase">{msg.type}</span>
                      <pre className="font-mono text-2xs text-te-gray-600 dark:text-te-gray-400 mt-1 overflow-x-auto">
                        {msg.content}
                      </pre>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
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
        <p>• WebSocket connection: ws://{publicIp || '<public-ip>'}:8080</p>
        <p>• REST API endpoints: http://{publicIp || '<public-ip>'}:8080/api/*</p>
        <p>• Ensure port 8080 is accessible through firewall rules</p>
      </div>
    </div>
  );
}