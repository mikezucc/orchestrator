import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scriptExecutionsApi } from '../api/script-executions';
import type { ScriptExecution, ScriptExecutionFilter } from '@gce-platform/types';
import { formatDistanceToNow } from 'date-fns';
import ScriptExecutionDetailModal from './ScriptExecutionDetailModal';

interface ScriptExecutionsListProps {
  vmId?: string;
  scriptId?: string;
  title?: string;
}

export default function ScriptExecutionsList({ vmId, scriptId, title }: ScriptExecutionsListProps) {
  const [selectedExecution, setSelectedExecution] = useState<ScriptExecution | null>(null);
  const [filter, setFilter] = useState<ScriptExecutionFilter>({
    vmId,
    scriptId,
    limit: 50,
  });

  // Update filter when props change
  useEffect(() => {
    setFilter(prev => ({
      ...prev,
      vmId,
      scriptId,
    }));
  }, [vmId, scriptId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['script-executions', filter],
    queryFn: () => scriptExecutionsApi.list(filter),
  });

  const executions = data?.data || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'completed':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'failed':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'cancelled':
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getExecutionTypeLabel = (type: string) => {
    switch (type) {
      case 'manual':
        return 'Manual';
      case 'boot':
        return 'Boot Script';
      case 'scheduled':
        return 'Scheduled';
      case 'api':
        return 'API';
      default:
        return type;
    }
  };

  const formatDuration = (ms?: number | null) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="bg-white dark:bg-te-gray-800 rounded-lg shadow">
      <div className="p-6 border-b border-te-gray-200 dark:border-te-gray-700">
        <h2 className="text-lg font-semibold text-te-gray-900 dark:text-te-gray-100">
          {title || 'Script Execution History'}
        </h2>
        
        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={filter.status || ''}
            onChange={(e) => setFilter({ ...filter, status: e.target.value || undefined })}
            className="text-sm"
          >
            <option value="">All Statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          
          <select
            value={filter.executionType || ''}
            onChange={(e) => setFilter({ ...filter, executionType: e.target.value || undefined })}
            className="text-sm"
          >
            <option value="">All Types</option>
            <option value="manual">Manual</option>
            <option value="boot">Boot Script</option>
            <option value="scheduled">Scheduled</option>
            <option value="api">API</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-center">
          <div className="inline-flex items-center space-x-2 text-te-gray-600 dark:text-te-gray-400">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading executions...</span>
          </div>
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-600 dark:text-red-400">
          Failed to load script executions
        </div>
      ) : executions.length === 0 ? (
        <div className="p-6 text-center text-te-gray-500 dark:text-te-gray-400">
          No script executions found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-te-gray-200 dark:divide-te-gray-700">
            <thead className="bg-te-gray-50 dark:bg-te-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                  Script
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                  Executed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                  By
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-te-gray-800 divide-y divide-te-gray-200 dark:divide-te-gray-700">
              {executions.map((execution) => (
                <tr key={execution.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-te-gray-900 dark:text-te-gray-100">
                      {execution.scriptName}
                    </div>
                    {execution.exitCode !== null && execution.exitCode !== undefined && (
                      <div className="text-xs text-te-gray-500 dark:text-te-gray-400">
                        Exit code: {execution.exitCode}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-te-gray-900 dark:text-te-gray-100">
                      {getExecutionTypeLabel(execution.executionType)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(execution.status)}`}>
                      {execution.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-te-gray-900 dark:text-te-gray-100">
                    {formatDuration(execution.durationMs)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-te-gray-900 dark:text-te-gray-100">
                      {formatDistanceToNow(new Date(execution.startedAt), { addSuffix: true })}
                    </div>
                    <div className="text-xs text-te-gray-500 dark:text-te-gray-400">
                      {new Date(execution.startedAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-te-gray-900 dark:text-te-gray-100">
                      {execution.executedByUser?.email || execution.executedBy}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setSelectedExecution(execution)}
                      className="text-te-blue-600 dark:text-te-blue-400 hover:text-te-blue-900 dark:hover:text-te-blue-300"
                    >
                      View Logs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedExecution && (
        <ScriptExecutionDetailModal
          execution={selectedExecution}
          onClose={() => setSelectedExecution(null)}
        />
      )}
    </div>
  );
}