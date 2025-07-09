import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { wormholeApi } from '../api/wormhole';
import { useToast } from '../contexts/ToastContext';

interface WormholeDebugPanelProps {
  organizationSlug?: string;
}

export default function WormholeDebugPanel({ organizationSlug }: WormholeDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { showError } = useToast();

  // Only fetch if user is in slopboxprimary org
  const { data: debugData, isLoading, error, refetch } = useQuery({
    queryKey: ['wormhole-debug-all-daemons'],
    queryFn: async () => {
      const response = await wormholeApi.getAllDaemonStatuses();
      console.log('response', response);
      if (!response) {
        throw new Error(response.error || 'Failed to fetch daemon statuses');
      }
      return response;
    },
    enabled: organizationSlug === 'slopboxprimary' && isExpanded,
    refetchInterval: isExpanded ? 5000 : false, // Auto-refresh every 5 seconds when expanded
    retry: false,
  });

  // Don't render if not slopboxprimary
  if (organizationSlug !== 'slopboxprimary') {
    return null;
  }

  return (
    <div className="card bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <svg 
            className={`w-4 h-4 text-purple-600 dark:text-purple-400 transform transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">
            🔧 Wormhole Debug Panel (Admin Only)
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {isExpanded && (
            <>
              <span className="text-xs text-purple-600 dark:text-purple-400">
                {debugData ? `${(debugData.clients || []).length} connected clients` : 'Loading...'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  refetch();
                }}
                className="btn-secondary text-xs"
                disabled={isLoading}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {error ? (
            <div className="text-xs text-red-600 dark:text-red-400">
              Error: {error instanceof Error ? error.message : 'Failed to load debug data'}
            </div>
          ) : isLoading ? (
            <div className="text-xs text-purple-600 dark:text-purple-400">Loading daemon statuses...</div>
          ) : debugData ? (
            <>
              {/* Server Status */}
              <div className="bg-white dark:bg-te-gray-800 rounded p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-te-gray-700 dark:text-te-gray-300 mb-2">
                  Central Server Status
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-te-gray-600 dark:text-te-gray-400">Server Time:</span>{' '}
                    <span className="font-mono">{new Date(debugData.serverTime || Date.now()).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-te-gray-600 dark:text-te-gray-400">Total Clients:</span>{' '}
                    <span className="font-mono">{Object.keys(debugData.clients || {}).length}</span>
                  </div>
                </div>
              </div>

              {/* Connected Clients */}
              <div className="bg-white dark:bg-te-gray-800 rounded p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-te-gray-700 dark:text-te-gray-300 mb-2">
                  Connected Daemon Clients
                </h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {Object.entries(debugData.clients || {}).length === 0 ? (
                    <p className="text-xs text-te-gray-600 dark:text-te-gray-400">No connected clients</p>
                  ) : (
                    Object.entries(debugData.clients || {}).map(([clientId, client]: [string, any]) => (
                      <div key={clientId} className="bg-te-gray-50 dark:bg-te-gray-900 rounded p-2 text-xs">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="font-mono font-medium text-te-gray-800 dark:text-te-gray-200">
                              {clientId}
                            </div>
                            {client.vmId && (
                              <div>
                                <span className="text-te-gray-600 dark:text-te-gray-400">VM ID:</span>{' '}
                                <span className="font-mono">{client.vmId}</span>
                              </div>
                            )}
                            {client.hostname && (
                              <div>
                                <span className="text-te-gray-600 dark:text-te-gray-400">Hostname:</span>{' '}
                                <span className="font-mono">{client.hostname}</span>
                              </div>
                            )}
                            {client.ip && (
                              <div>
                                <span className="text-te-gray-600 dark:text-te-gray-400">IP:</span>{' '}
                                <span className="font-mono">{client.ip}</span>
                              </div>
                            )}
                            {client.repository && (
                              <div>
                                <span className="text-te-gray-600 dark:text-te-gray-400">Repository:</span>{' '}
                                <span className="font-mono">{client.repository.path || client.repository}</span>
                                {client.repository.branch && (
                                  <span className="ml-2 px-1 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-2xs">
                                    {client.repository.branch}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <div className={`inline-flex items-center space-x-1 ${
                              client.connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              <span className="inline-block w-2 h-2 rounded-full bg-current"></span>
                              <span>{client.connected ? 'Connected' : 'Disconnected'}</span>
                            </div>
                            {client.lastActivity && (
                              <div className="text-te-gray-600 dark:text-te-gray-400">
                                Last: {new Date(client.lastActivity).toLocaleTimeString()}
                              </div>
                            )}
                            {client.uptime && (
                              <div className="text-te-gray-600 dark:text-te-gray-400">
                                Uptime: {Math.floor(client.uptime / 1000 / 60)}m
                              </div>
                            )}
                          </div>
                        </div>
                        {client.processes && client.processes.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-te-gray-200 dark:border-te-gray-700">
                            <span className="text-te-gray-600 dark:text-te-gray-400">Processes:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {client.processes.map((proc: any, idx: number) => (
                                <span key={idx} className="px-1.5 py-0.5 bg-te-gray-200 dark:bg-te-gray-700 rounded text-2xs">
                                  {proc.name || proc}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Raw Data View */}
              <details className="bg-white dark:bg-te-gray-800 rounded p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-te-gray-700 dark:text-te-gray-300">
                  Raw Response Data
                </summary>
                <pre className="mt-2 text-2xs font-mono overflow-x-auto whitespace-pre-wrap text-te-gray-600 dark:text-te-gray-400">
                  {JSON.stringify(debugData, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <div className="text-xs text-purple-600 dark:text-purple-400">No data available</div>
          )}
        </div>
      )}
    </div>
  );
}