import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { Link } from 'react-router-dom';
import CreateVMModal from '../components/CreateVMModal';
import ProjectManager from '../components/ProjectManager';
import VMStatusBadge from '../components/VMStatusBadge';
import { useProjects } from '../hooks/useProjects';
import { useToast } from '../contexts/ToastContext';

export default function VMs() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  const { showError, showSuccess } = useToast();

  const { data: vmsResponse, isLoading, refetch } = useQuery({
    queryKey: ['vms', projects],
    queryFn: async () => {
      const response = await vmApi.list(projects);
      // Check if sync had partial errors
      if (response.success && response.error) {
        showError(response.error);
      }
      return response;
    },
    refetchOnWindowFocus: true,
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to load VMs');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: vmApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM deleted successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to delete VM');
    },
  });

  const startMutation = useMutation({
    mutationFn: vmApi.start,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM started successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to start VM');
    },
  });

  const stopMutation = useMutation({
    mutationFn: vmApi.stop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM stopped successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to stop VM');
    },
  });

  const suspendMutation = useMutation({
    mutationFn: vmApi.suspend,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM suspended successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to suspend VM');
    },
  });

  const vms = vmsResponse?.data || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider mb-2">Virtual Machines</h1>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500">
            {vms.length} Total Instances
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowProjectManager(true)}
            className="btn-secondary"
          >
            {projects.length === 0 ? 'Configure Projects' : `${projects.length} Project${projects.length !== 1 ? 's' : ''}`}
          </button>
          {projects.length > 0 && (
            <button
              onClick={() => {
                refetch().catch((error: any) => {
                  showError(error.response?.data?.error || 'Failed to sync VMs');
                });
              }}
              disabled={isLoading}
              className="btn-secondary"
            >
              {isLoading ? 'Syncing...' : 'Sync VMs'}
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            + Create VM
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Public IP</th>
              <th className="text-left px-4 py-3">Zone</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
            {vms.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-te-gray-600 dark:text-te-gray-500">
                  No virtual machines found. Create your first VM to get started.
                </td>
              </tr>
            ) : (
              vms.map((vm) => (
                <tr key={vm.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-900 transition-colors">
                  <td className="px-4 py-3">
                    <VMStatusBadge status={vm.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/vms/${vm.id}`} className="link font-medium">
                      {vm.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">
                    {vm.publicIp ? (
                      <span className="text-te-gray-900 dark:text-te-gray-100">{vm.publicIp}</span>
                    ) : (
                      <span className="text-te-gray-500 dark:text-te-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                    {vm.zone}
                  </td>
                  <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                    {vm.machineType}
                  </td>
                  <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400 tabular-nums">
                    {new Date(vm.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      {vm.status === 'stopped' && (
                        <>
                          <button
                            onClick={() => startMutation.mutate(vm.id)}
                            disabled={startMutation.isPending}
                            className="text-xs uppercase tracking-wider text-green-600 dark:text-te-yellow hover:text-green-700 dark:hover:text-te-orange transition-colors"
                          >
                            Start
                          </button>
                          <span className="text-te-gray-300 dark:text-te-gray-700">|</span>
                        </>
                      )}
                      {vm.status === 'suspended' && (
                        <>
                          <button
                            onClick={() => startMutation.mutate(vm.id)}
                            disabled={startMutation.isPending}
                            className="text-xs uppercase tracking-wider text-green-600 dark:text-te-yellow hover:text-green-700 dark:hover:text-te-orange transition-colors"
                          >
                            Resume
                          </button>
                          <span className="text-te-gray-300 dark:text-te-gray-700">|</span>
                        </>
                      )}
                      {vm.status === 'running' && (
                        <>
                          <button
                            onClick={() => stopMutation.mutate(vm.id)}
                            disabled={stopMutation.isPending}
                            className="text-xs uppercase tracking-wider text-yellow-600 dark:text-te-orange hover:text-yellow-700 dark:hover:text-te-yellow transition-colors"
                          >
                            Stop
                          </button>
                          <span className="text-te-gray-300 dark:text-te-gray-700">|</span>
                          <button
                            onClick={() => suspendMutation.mutate(vm.id)}
                            disabled={suspendMutation.isPending}
                            className="text-xs uppercase tracking-wider text-blue-600 dark:text-te-yellow hover:text-blue-700 dark:hover:text-te-orange transition-colors"
                          >
                            Suspend
                          </button>
                          <span className="text-te-gray-300 dark:text-te-gray-700">|</span>
                        </>
                      )}
                      <Link
                        to={`/vms/${vm.id}`}
                        className="text-xs uppercase tracking-wider hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                      >
                        View
                      </Link>
                      <span className="text-te-gray-300 dark:text-te-gray-700">|</span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete VM "${vm.name}"?`)) {
                            deleteMutation.mutate(vm.id);
                          }
                        }}
                        className="text-xs uppercase tracking-wider text-red-600 dark:text-te-orange hover:text-red-700 dark:hover:text-te-yellow transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateVMModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['vms'] });
            // Refresh after 500ms to get updated state
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ['vms'] });
            }, 500);
          }}
        />
      )}

      {showProjectManager && (
        <ProjectManager onClose={() => setShowProjectManager(false)} />
      )}
    </div>
  );
}