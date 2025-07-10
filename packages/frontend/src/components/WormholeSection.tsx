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

  // Fetch repositories directly from the VM (disabled - now handled by VMRepositoriesSection)
  const { data: repositories, refetch: refetchRepos } = useQuery({
    queryKey: ['wormhole-repositories-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getRepositories(publicIp) : null,
    enabled: false, // Disabled - repositories now handled by VMRepositoriesSection
  });

  // Fetch active ports directly from the VM
  const { data: portsData, refetch: refetchPorts } = useQuery({
    queryKey: ['wormhole-ports-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getPorts(publicIp) : null,
    enabled: !!publicIp && connectionStatus === 'connected',
    refetchInterval: 10000,
  });

  // Fetch daemons directly from the VM (disabled - now handled by VMRepositoriesSection)
  const { data: daemonsData, refetch: refetchDaemons } = useQuery({
    queryKey: ['wormhole-daemons-direct', publicIp],
    queryFn: () => publicIp ? wormholeApi.directApi.getDaemons(publicIp) : null,
    enabled: false, // Disabled - daemons now handled by VMRepositoriesSection
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

      if (response && !response.error) {
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
      if (response && !response.error) {
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

  console.log('repositories', repositories);

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
    <div>
    </div>
  );
}