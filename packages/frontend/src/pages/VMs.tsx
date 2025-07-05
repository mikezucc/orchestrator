import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { portsApi } from '../api/ports';
import { organizationApi } from '../api/organizations';
import { Link } from 'react-router-dom';
import CreateVMModal from '../components/CreateVMModal';
import CreateVMWithRepoModal from '../components/CreateVMWithRepoModal';
import VMStatusBadge from '../components/VMStatusBadge';
import DuplicateVMModal from '../components/DuplicateVMModal';
import { useToast } from '../contexts/ToastContext';
import { useVMPostCreationSetup } from '../hooks/useVMPostCreationSetup';
import type { VirtualMachine } from '@gce-platform/types';
import type { PortDescription } from '../api/ports';

export default function VMs() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateWithRepoModal, setShowCreateWithRepoModal] = useState(false);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [duplicateVM, setDuplicateVM] = useState<VirtualMachine | null>(null);
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Use the VM post-creation setup hook
  useVMPostCreationSetup();
  
  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCreateOptions(false);
      }
    }
    
    if (showCreateOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCreateOptions]);

  // Fetch organization data to get configured projects
  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: organizationApi.getMyOrganization,
  });

  const { data: vmsResponse, isLoading, refetch, error } = useQuery({
    queryKey: ['vms', organization?.gcpProjectIds],
    queryFn: async () => {
      // Only sync if organization has configured projects
      const shouldSync = organization?.gcpProjectIds && organization.gcpProjectIds.length > 0;
      const response = await vmApi.list(shouldSync ? organization.gcpProjectIds : undefined);
      // Check if sync had partial errors
      if (response.error) {
        showError(response.error);
      }
      return response;
    },
    enabled: !!organization,
    refetchOnWindowFocus: true,
  });

  // Handle query error
  if (error) {
    showError((error as any).response?.data?.error || 'Failed to load VMs');
  }

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

  // Fetch favorite ports for all VMs
  const { data: allPortDescriptions = {} } = useQuery({
    queryKey: ['all-port-descriptions', vms.map(vm => vm.id)],
    queryFn: async () => {
      const portsByVm: Record<string, PortDescription[]> = {};
      await Promise.all(
        vms.map(async (vm) => {
          try {
            const ports = await portsApi.getPortDescriptions(vm.id);
            portsByVm[vm.id] = ports.filter(p => p.isFavorite);
          } catch (error) {
            portsByVm[vm.id] = [];
          }
        })
      );
      return portsByVm;
    },
    enabled: vms.length > 0,
  });

  if (!organization || isLoading) {
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
          {organization.gcpProjectIds && organization.gcpProjectIds.length > 0 && (
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
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowCreateOptions(!showCreateOptions)}
              className="btn-primary flex items-center space-x-2"
            >
              <span>+ Create VM</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showCreateOptions && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-te-gray-900 rounded-lg shadow-lg border border-te-gray-200 dark:border-te-gray-700 z-10">
                <button
                  onClick={() => {
                    setShowCreateOptions(false);
                    setShowCreateModal(true);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-te-gray-50 dark:hover:bg-te-gray-800 border-b border-te-gray-200 dark:border-te-gray-700"
                >
                  <div className="font-medium text-sm">Create Basic VM</div>
                  <div className="text-xs text-te-gray-600 dark:text-te-gray-400 mt-1">
                    Create a new VM with custom startup script
                  </div>
                </button>
                <button
                  onClick={() => {
                    setShowCreateOptions(false);
                    setShowCreateWithRepoModal(true);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-te-gray-50 dark:hover:bg-te-gray-800"
                >
                  <div className="font-medium text-sm flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span>Create VM with Repository</span>
                  </div>
                  <div className="text-xs text-te-gray-600 dark:text-te-gray-400 mt-1">
                    Create a VM with a GitHub repository pre-cloned
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Machine Name</th>
              <th className="text-left px-4 py-3">Public IP</th>
              <th className="text-left px-4 py-3">Favorite Ports</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
            {vms.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-te-gray-600 dark:text-te-gray-500">
                  {!organization.gcpProjectIds || organization.gcpProjectIds.length === 0 ? (
                    <div>
                      <p className="mb-2">No Google Cloud projects configured.</p>
                      <Link to="/organization/settings?tab=gcp" className="text-te-yellow hover:underline">
                        Configure GCP Projects
                      </Link>
                    </div>
                  ) : (
                    'No virtual machines found. Create your first VM to get started.'
                  )}
                </td>
              </tr>
            ) : (
              vms.map((vm) => {
                const favoritePorts = allPortDescriptions[vm.id] || [];
                return (
                  <tr key={vm.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-900 transition-colors">
                    <td className="px-4 py-3">
                      <VMStatusBadge status={vm.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/vms/${vm.id}`} className="link font-medium">
                        {vm.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {vm.publicIp ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono text-te-gray-900 dark:text-te-gray-100">{vm.publicIp}</span>
                        </div>
                      ) : (
                        <span className="text-te-gray-500 dark:text-te-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {favoritePorts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {favoritePorts.map((port) => (
                            <button
                              key={`${port.port}-${port.protocol}`}
                              onClick={() => {
                                if (vm.publicIp) {
                                  const protocol = port.protocol.toLowerCase() === 'tcp' ? 'http' : port.protocol.toLowerCase();
                                  const url = `${protocol}://${vm.publicIp}:${port.port}`;
                                  window.open(url, '_blank');
                                }
                              }}
                              className="inline-flex items-center px-2 py-1 bg-green-600 dark:bg-te-yellow text-white dark:text-te-gray-900 text-xs rounded hover:bg-green-700 dark:hover:bg-te-orange transition-colors"
                              title={port.description || `Open ${port.name}`}
                            >
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              {port.name}:{port.port}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-te-gray-500 dark:text-te-gray-600">No favorites</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative group">
                        <button className="btn-secondary text-xs">
                          Actions
                          <svg className="w-3 h-3 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                          {vm.status === 'stopped' && (
                            <button
                              onClick={() => startMutation.mutate(vm.id)}
                              disabled={startMutation.isPending}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-50 dark:hover:bg-te-gray-700 text-green-600 dark:text-te-yellow"
                            >
                              Start VM
                            </button>
                          )}
                          {vm.status === 'suspended' && (
                            <button
                              onClick={() => startMutation.mutate(vm.id)}
                              disabled={startMutation.isPending}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-50 dark:hover:bg-te-gray-700 text-green-600 dark:text-te-yellow"
                            >
                              Resume VM
                            </button>
                          )}
                          {vm.status === 'running' && (
                            <>
                              <button
                                onClick={() => stopMutation.mutate(vm.id)}
                                disabled={stopMutation.isPending}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-50 dark:hover:bg-te-gray-700 text-yellow-600 dark:text-te-orange"
                              >
                                Stop VM
                              </button>
                              <button
                                onClick={() => suspendMutation.mutate(vm.id)}
                                disabled={suspendMutation.isPending}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-50 dark:hover:bg-te-gray-700 text-blue-600 dark:text-te-yellow"
                              >
                                Suspend VM
                              </button>
                            </>
                          )}
                          <div className="border-t border-te-gray-200 dark:border-te-gray-700"></div>
                          <Link
                            to={`/vms/${vm.id}`}
                            className="block px-4 py-2 text-sm hover:bg-te-gray-50 dark:hover:bg-te-gray-700"
                          >
                            View Details
                          </Link>
                          <button
                            onClick={() => setDuplicateVM(vm)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-50 dark:hover:bg-te-gray-700 text-blue-600 dark:text-te-yellow"
                          >
                            Duplicate VM
                          </button>
                          <div className="border-t border-te-gray-200 dark:border-te-gray-700"></div>
                          <button
                            onClick={() => {
                              if (confirm(`Delete VM "${vm.name}"?`)) {
                                deleteMutation.mutate(vm.id);
                              }
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-50 dark:hover:bg-te-gray-700 text-red-600 dark:text-te-orange"
                          >
                            Delete VM
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
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

      {showCreateWithRepoModal && (
        <CreateVMWithRepoModal
          onClose={() => setShowCreateWithRepoModal(false)}
          onSuccess={() => {
            // Don't close the modal - let the user close it manually
            queryClient.invalidateQueries({ queryKey: ['vms'] });
            // Refresh after 500ms to get updated state
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ['vms'] });
            }, 500);
          }}
        />
      )}

      {duplicateVM && (
        <DuplicateVMModal
          vm={duplicateVM}
          onClose={() => setDuplicateVM(null)}
        />
      )}
    </div>
  );
}