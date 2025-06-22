import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wormholeApi } from '../api/wormhole';
import { portsApi } from '../api/ports';
import { useToast } from '../contexts/ToastContext';
import type { 
  WormholeWebSocketMessage, 
  WormholeRepository,
  WormholeDaemon,
  WormholeProcess,
  WormholePort
} from '@gce-platform/types';
import type { PortDescription } from '../api/ports';

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
  const [switchingBranch, setSwitchingBranch] = useState<string | null>(null);
  const [showDebugView, setShowDebugView] = useState(false);
  const [showPortsView, setShowPortsView] = useState(false);
  const [editingPort, setEditingPort] = useState<{ port: number; protocol: string } | null>(null);
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set(['node']));
  const [wsMessages, setWsMessages] = useState<Array<{ time: string; type: 'sent' | 'received'; message: any }>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
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

  // Fetch port descriptions from database
  const { data: portDescriptions = [] } = useQuery({
    queryKey: ['port-descriptions', vmId],
    queryFn: () => portsApi.getPortDescriptions(vmId),
    enabled: connectionStatus === 'connected',
  });

  // Mutation for saving port descriptions
  const savePortMutation = useMutation({
    mutationFn: (data: { port: number; protocol: string; name: string; description?: string; processName?: string; isFavorite?: boolean }) => 
      portsApi.savePortDescription(vmId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-descriptions', vmId] });
      showSuccess('Port description saved');
      setEditingPort(null);
    },
    onError: () => {
      showError('Failed to save port description');
    }
  });

  // Helper function to toggle favorite
  const toggleFavorite = (port: number, protocol: string, description?: PortDescription) => {
    if (!description) return;
    
    savePortMutation.mutate({
      port,
      protocol: protocol.toLowerCase(),
      name: description.name,
      description: description.description,
      processName: description.processName,
      isFavorite: !description.isFavorite,
    });
  };

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
        
        // Track sent message
        setWsMessages(prev => [...prev, { 
          time: new Date().toLocaleTimeString(), 
          type: 'sent', 
          message: registerMessage 
        }]);
        
        // Fetch all data
        refetchStatus();
        refetchRepos();
        refetchPorts();
        refetchDaemons();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WormholeWebSocketMessage;
          
          // Track received message
          setWsMessages(prev => [...prev.slice(-50), { 
            time: new Date().toLocaleTimeString(), 
            type: 'received', 
            message 
          }]);
          
          // Refresh data on relevant messages
          if (message.type === 'sync' || message.type === 'branch-switch' || 
              message.type === 'client-update' || message.type === 'status-update') {
            console.log('Refreshing data due to message:', message.type);
            refetchStatus();
            refetchRepos();
            refetchDaemons();
            
            // For branch switches, also refetch after a delay
            if (message.type === 'branch-switch') {
              setTimeout(() => {
                refetchStatus();
                refetchRepos();
                refetchDaemons();
              }, 1000);
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          setWsMessages(prev => [...prev.slice(-50), { 
            time: new Date().toLocaleTimeString(), 
            type: 'received', 
            message: { error: 'Failed to parse', raw: event.data }
          }]);
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
    setWsMessages([]);
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
    
    setSwitchingBranch(`${repoPath}:${targetBranch}`);
    
    try {
      // Track the API call
      const switchRequest = {
        repoPath,
        targetBranch
      };
      
      setWsMessages(prev => [...prev.slice(-50), { 
        time: new Date().toLocaleTimeString(), 
        type: 'sent', 
        message: { type: 'API_CALL', endpoint: 'switchBranch', payload: switchRequest }
      }]);
      
      const response = await wormholeApi.directApi.switchBranch(publicIp, switchRequest);

      setWsMessages(prev => [...prev.slice(-50), { 
        time: new Date().toLocaleTimeString(), 
        type: 'received', 
        message: { type: 'API_RESPONSE', endpoint: 'switchBranch', response }
      }]);

      if (response.success) {
        showSuccess(`Switched to branch ${targetBranch}`);
        // Immediately refetch to get updated state
        await Promise.all([
          refetchStatus(),
          refetchRepos(),
          refetchDaemons()
        ]);
        
        // Additional delayed refetch to catch any slower updates
        setTimeout(async () => {
          await Promise.all([
            refetchStatus(),
            refetchRepos(),
            refetchDaemons()
          ]);
          setSwitchingBranch(null);
        }, 2000);
      } else {
        showError(response.error || 'Failed to switch branch');
        setSwitchingBranch(null);
      }
    } catch (error) {
      showError('Failed to send branch switch command');
      console.error('Branch switch error:', error);
      setSwitchingBranch(null);
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

  // Port Card Component
  const PortCard = ({ port, description, processName, isEditing, onEdit, isCompact = false }: {
    port: WormholePort | any;
    description?: PortDescription;
    processName?: string;
    isEditing: boolean;
    onEdit: () => void;
    isCompact?: boolean;
  }) => {
    const handleOpenPort = () => {
      if (publicIp) {
        const protocol = port.protocol.toLowerCase() === 'tcp' ? 'http' : port.protocol.toLowerCase();
        const url = `${protocol}://${publicIp}:${port.port}`;
        window.open(url, '_blank');
      }
    };

    if (isEditing) {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            savePortMutation.mutate({
              port: port.port,
              protocol: port.protocol.toLowerCase(),
              name: formData.get('name') as string,
              description: formData.get('description') as string,
              processName,
              isFavorite: description?.isFavorite,
            });
          }}
          className="space-y-2"
        >
          <div className="text-xs text-te-gray-600 dark:text-te-gray-400">
            {port.port}/{port.protocol}
          </div>
          <input
            name="name"
            type="text"
            placeholder="Service name"
            defaultValue={description?.name}
            className="w-full px-2 py-1 rounded bg-white dark:bg-te-gray-700 border border-te-gray-300 dark:border-te-gray-600 text-sm"
            required
            autoFocus
          />
          <input
            name="description"
            type="text"
            placeholder="Description (optional)"
            defaultValue={description?.description}
            className="w-full px-2 py-1 rounded bg-white dark:bg-te-gray-700 border border-te-gray-300 dark:border-te-gray-600 text-sm"
          />
          <div className="flex space-x-1">
            <button
              type="submit"
              className="flex-1 px-2 py-1 bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600 text-xs"
              disabled={savePortMutation.isPending}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingPort(null)}
              className="flex-1 px-2 py-1 bg-te-gray-400 dark:bg-te-gray-600 text-white rounded hover:bg-te-gray-500 dark:hover:bg-te-gray-700 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      );
    }

    return (
      <div className="h-full flex flex-col">
        <div className="absolute top-1 right-1 flex items-center space-x-1">
          {description && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(port.port, port.protocol, description);
              }}
              className={`p-1 rounded hover:bg-te-gray-100 dark:hover:bg-te-gray-700 ${
                description.isFavorite ? 'text-yellow-500' : 'text-te-gray-400 dark:text-te-gray-600'
              }`}
              title={description.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 rounded hover:bg-te-gray-100 dark:hover:bg-te-gray-700 text-te-gray-400 dark:text-te-gray-600"
            title="Edit description"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
        <div 
          className={`cursor-pointer hover:bg-te-gray-50 dark:hover:bg-te-gray-700 rounded -m-2 ${isCompact ? 'p-2' : 'p-3'} flex-1 flex flex-col`}
          onClick={handleOpenPort}
        >
          {description ? (
            <>
              <div className={`font-semibold ${isCompact ? 'text-sm' : 'text-base'} text-te-gray-900 dark:text-te-gray-100 mb-1`}>
                {description.name}
              </div>
              {description.description && (
                <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-te-gray-700 dark:text-te-gray-300 mb-1`}>
                  {description.description}
                </div>
              )}
              <div className="text-xs text-te-gray-500 dark:text-te-gray-400 mt-auto">
                {port.port}/{port.protocol}
              </div>
            </>
          ) : (
            <>
              <div className="text-te-gray-500 dark:text-te-gray-400 italic text-sm mb-1">
                {port.service || 'Click to add description'}
              </div>
              <div className="text-xs text-te-gray-500 dark:text-te-gray-400">
                {port.port}/{port.protocol}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-end">
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
                onClick={() => setShowPortsView(!showPortsView)}
                className="btn-secondary text-xs"
                title="Toggle ports view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => setShowDebugView(!showDebugView)}
                className="btn-secondary text-xs"
                title="Toggle debug view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
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
          {/* Favorite Ports - Always visible when connected */}
          {(() => {
            const favoritePorts = portDescriptions.filter(d => d.isFavorite);
            if (favoritePorts.length === 0 || !portsData) return null;
            
            return (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center space-x-2">
                    <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span>Apps</span>
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {favoritePorts.map((description) => {
                    const port = portsData.raw?.find((p: any) => 
                      p.port === description.port && 
                      p.protocol.toLowerCase() === description.protocol.toLowerCase()
                    );
                    
                    if (!port) return null;
                    
                    const isEditing = editingPort?.port === port.port && editingPort?.protocol === port.protocol;
                    
                    return (
                      <div 
                        key={`${port.port}-${port.protocol}`}
                        className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 relative shadow-sm hover:shadow-md transition-shadow"
                      >
                        <PortCard
                          port={port}
                          description={description}
                          processName={description.processName}
                          isEditing={isEditing}
                          onEdit={() => setEditingPort({ port: port.port, protocol: port.protocol })}
                          isCompact={false}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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

          {/* Debug View */}
          {showDebugView && (
            <div className="card bg-te-gray-50 dark:bg-te-gray-900">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider">Debug View - WebSocket Messages</h3>
                <button
                  onClick={() => setWsMessages([])}
                  className="text-xs text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-800 dark:hover:text-te-gray-200"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {wsMessages.length === 0 ? (
                  <p className="text-xs text-te-gray-600 dark:text-te-gray-500">No messages yet...</p>
                ) : (
                  wsMessages.map((msg, index) => (
                    <div 
                      key={index}
                      className={`text-xs p-2 rounded ${
                        msg.type === 'sent' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-800' 
                          : 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold ${
                          msg.type === 'sent' ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-400'
                        }`}>
                          {msg.type === 'sent' ? '→ SENT' : '← RECEIVED'}
                        </span>
                        <span className="text-te-gray-600 dark:text-te-gray-500">{msg.time}</span>
                      </div>
                      <pre className="font-mono text-2xs overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(msg.message, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-te-gray-200 dark:border-te-gray-700">
                <h4 className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  Current Data State
                </h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-te-gray-600 dark:text-te-gray-500">Repositories:</p>
                    <pre className="font-mono text-2xs mt-1 overflow-x-auto">
                      {JSON.stringify(repositories?.map((r: WormholeRepository) => ({
                        path: r.repoPath,
                        branches: r.branches,
                        activeBranches: r.activeBranches,
                        clients: r.connectedClientCount
                      })), null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-te-gray-600 dark:text-te-gray-500">Connected Clients:</p>
                    <pre className="font-mono text-2xs mt-1 overflow-x-auto">
                      {JSON.stringify(statusData?.clients?.filter((c: any) => c.connected).map((c: any) => ({
                        id: c.id,
                        repo: c.repoPath,
                        branch: c.branch,
                        lastActivity: new Date(c.lastActivity).toLocaleTimeString()
                      })), null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ports View */}
          {showPortsView && portsData && (
            <div className="card bg-te-gray-50 dark:bg-te-gray-900">
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Active Ports Management</h3>
              
              {portsData.processes.length === 0 ? (
                <p className="text-sm text-te-gray-600 dark:text-te-gray-500">No active ports detected</p>
              ) : (
                <div className="space-y-3">
                  {portsData.processes.map((process: WormholeProcess) => {
                    const sortedPorts = [...process.ports].sort((a, b) => a.port - b.port);
                    const isExpanded = expandedProcesses.has(process.processName);
                    const isNodeProcess = process.processName.toLowerCase() === 'node';
                    
                    return (
                      <div key={process.pid} className="border border-te-gray-200 dark:border-te-gray-700 rounded">
                        <div 
                          className="flex items-center justify-between p-2 cursor-pointer hover:bg-te-gray-50 dark:hover:bg-te-gray-800"
                          onClick={() => {
                            setExpandedProcesses(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(process.processName)) {
                                newSet.delete(process.processName);
                              } else {
                                newSet.add(process.processName);
                              }
                              return newSet;
                            });
                          }}
                        >
                          <div className="flex items-center space-x-2">
                            <svg 
                              className={`w-3 h-3 text-te-gray-600 dark:text-te-gray-400 transform transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <h4 className="text-sm font-medium">
                              <span className="font-mono">{process.processName}</span>
                            </h4>
                          </div>
                          <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                            {process.ports.length} port{process.ports.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        {isExpanded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-2 pt-0">
                            {sortedPorts.map((port: WormholePort) => {
                              const description = portDescriptions.find(
                                d => d.port === port.port && d.protocol === port.protocol.toLowerCase()
                              );
                              const isEditing = editingPort?.port === port.port && editingPort?.protocol === port.protocol;
                              
                              return (
                                <div 
                                  key={`${port.port}-${port.protocol}`}
                                  className="text-xs bg-white dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded p-2 relative"
                                >
                                  <PortCard
                                    port={port}
                                    description={description}
                                    processName={process.processName}
                                    isEditing={isEditing}
                                    onEdit={() => setEditingPort({ port: port.port, protocol: port.protocol })}
                                    isCompact={true}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Raw ports section for unassigned ports */}
                  {portsData.raw && portsData.raw.filter((p: any) => !p.processName).length > 0 && (
                    <div className="border border-te-gray-200 dark:border-te-gray-700 rounded">
                      <div className="p-2">
                        <h4 className="text-sm font-medium">Other Ports</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-2 pt-0">
                        {portsData.raw
                          .filter((p: any) => !p.processName)
                          .sort((a: any, b: any) => a.port - b.port)
                          .map((port: any) => {
                            const description = portDescriptions.find(
                              d => d.port === port.port && d.protocol === port.protocol.toLowerCase()
                            );
                            const isEditing = editingPort?.port === port.port && editingPort?.protocol === port.protocol;
                            
                            return (
                              <div 
                                key={`${port.port}-${port.protocol}`}
                                className="text-xs bg-white dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded p-2 relative"
                              >
                                <PortCard
                                  port={port}
                                  description={description}
                                  processName={undefined}
                                  isEditing={isEditing}
                                  onEdit={() => setEditingPort({ port: port.port, protocol: port.protocol })}
                                  isCompact={true}
                                />
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mt-4">
                Port descriptions are shared across all users and help identify services running on the VM.
              </p>
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
                const mainBranch = daemon?.repository.branch;
                
                return (
                  <div key={repoPath} className={`card`}>
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
                              </span>
                            )}
                            {/* Client count */}
                            {repo && (
                              <span className="text-xs text-te-gray-600 dark:text-te-gray-500">
                                {repoClients.length-1} {repoClients.length === 1 ? 'people' : 'persons'} working
                              </span>
                            )}
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
                                  const isActive = daemon?.repository.branch === branch;
                                  const isLocal = localBranches.includes(branch);
                                  const isRemote = remoteBranches.includes(branch);
                                  const isRemoteOnly = isRemote && !isLocal;
                                  const isSwitching = switchingBranch === `${repo?.repoPath || daemon?.repository.name || ''}:${branch}`;
                                  
                                  return (
                                    <div key={branch} className="relative group">
                                      <button
                                        onClick={() => handleBranchSwitch(repo?.repoPath || daemon?.repository.name || '', branch)}
                                        disabled={!!switchingBranch}
                                        className={`text-xs px-3 py-1 rounded transition-colors ${
                                          isSwitching
                                            ? 'bg-yellow-500 dark:bg-yellow-600 text-white animate-pulse'
                                          : isRemoteOnly
                                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800'
                                            : 'bg-te-gray-100 dark:bg-te-gray-800 hover:bg-te-gray-200 dark:hover:bg-te-gray-700'
                                        } ${switchingBranch && !isSwitching ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title={
                                          isSwitching ? 'Switching branch...' :
                                          isRemoteOnly ? 'Remote branch - will be created locally on switch' :
                                          'Click to switch all clients to this branch'
                                        }
                                      >
                                        {branch}
                                        {isSwitching && ' ...'}
                                        {!isActive && !isSwitching && isRemoteOnly && ' ↓'}
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
    </div>
  );
}