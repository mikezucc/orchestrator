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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Repository Status */}
          <div className="card">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Repository Status</h3>
            {repositories.length === 0 ? (
              <p className="text-xs text-te-gray-600 dark:text-te-gray-500">No repositories found</p>
            ) : (
              <div className="space-y-2">
                {repositories.map((repo, index) => (
                  <div key={index} className="border-b border-te-gray-200 dark:border-te-gray-800 pb-2 last:border-0">
                    <p className="font-mono text-xs font-medium">{repo.repoPath}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-2xs text-te-gray-600 dark:text-te-gray-500">
                        {repo.connectedClientCount}/{repo.clientCount} clients connected
                      </span>
                      <span className="text-2xs text-te-gray-600 dark:text-te-gray-500">
                        {repo.activeBranches.length} active branches
                      </span>
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
                {status?.clients.filter(c => c.connected).map((client, index) => (
                  <div key={index} className="border-b border-te-gray-200 dark:border-te-gray-800 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{client.id}</span>
                      <span className="badge-neutral text-2xs">{client.branch}</span>
                    </div>
                    <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-1">
                      Last activity: {new Date(client.lastActivity).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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