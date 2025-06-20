import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { Link } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useState } from 'react';
import ProjectManager from '../components/ProjectManager';
import { useToast } from '../contexts/ToastContext';

export default function Dashboard() {
  const { projects } = useProjects();
  const [showProjectManager, setShowProjectManager] = useState(false);
  const queryClient = useQueryClient();
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
  const runningVMs = vms.filter(vm => vm.status === 'running').length;
  const stoppedVMs = vms.filter(vm => vm.status === 'stopped' || vm.status === 'suspended').length;

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
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider mb-2">Dashboard</h1>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500">
            System Overview
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
        </div>
      </div>
      
      {projects.length === 0 && (
        <div className="card bg-te-yellow dark:bg-te-gray-900 border-te-yellow dark:border-te-yellow">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-te-gray-900 dark:text-te-yellow flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-te-gray-900 dark:text-te-yellow">No GCP Projects Configured</p>
              <p className="text-xs text-te-gray-700 dark:text-te-gray-400 mt-1">
                Configure your Google Cloud project IDs to sync existing VMs.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                Total VMs
              </p>
              <p className="text-2xl font-bold tabular-nums">{vms.length}</p>
            </div>
            <div className="p-2 bg-te-gray-100 dark:bg-te-gray-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                Running
              </p>
              <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-te-yellow">
                {runningVMs}
              </p>
            </div>
            <div className="p-2 bg-green-50 dark:bg-te-gray-800 text-green-600 dark:text-te-yellow">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                Stopped
              </p>
              <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-te-orange">
                {stoppedVMs}
              </p>
            </div>
            <div className="p-2 bg-red-50 dark:bg-te-gray-800 text-red-600 dark:text-te-orange">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-semibold uppercase tracking-wider">Recent Machines</h2>
          <Link to="/vms" className="link text-xs uppercase tracking-wider">
            View All →
          </Link>
        </div>
        
        <div className="card p-0 overflow-hidden">
          {vms.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
                No virtual machines found
              </p>
              <Link to="/vms" className="btn-primary inline-block mt-4">
                Create Your First VM
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Zone</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
                {vms.slice(0, 5).map((vm) => (
                  <tr key={vm.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-900 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        vm.status === 'running' 
                          ? 'bg-green-500 dark:bg-te-yellow' 
                          : vm.status === 'suspended'
                          ? 'bg-yellow-500 dark:bg-te-orange'
                          : 'bg-te-gray-400 dark:bg-te-gray-600'
                      }`} />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/vms/${vm.id}`} className="link font-medium">
                        {vm.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                      {vm.zone}
                    </td>
                    <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                      {vm.machineType}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {vm.status === 'stopped' && (
                          <button
                            onClick={() => startMutation.mutate(vm.id)}
                            disabled={startMutation.isPending}
                            className="text-xs uppercase tracking-wider text-green-600 dark:text-te-yellow hover:text-green-700 dark:hover:text-te-orange transition-colors"
                          >
                            Start
                          </button>
                        )}
                        {vm.status === 'suspended' && (
                          <button
                            onClick={() => startMutation.mutate(vm.id)}
                            disabled={startMutation.isPending}
                            className="text-xs uppercase tracking-wider text-green-600 dark:text-te-yellow hover:text-green-700 dark:hover:text-te-orange transition-colors"
                          >
                            Resume
                          </button>
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
                            <span className="text-te-gray-300 dark:text-te-gray-700 mx-1">|</span>
                            <button
                              onClick={() => suspendMutation.mutate(vm.id)}
                              disabled={suspendMutation.isPending}
                              className="text-xs uppercase tracking-wider text-blue-600 dark:text-te-yellow hover:text-blue-700 dark:hover:text-te-orange transition-colors"
                            >
                              Suspend
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {showProjectManager && (
        <ProjectManager onClose={() => setShowProjectManager(false)} />
      )}
    </div>
  );
}