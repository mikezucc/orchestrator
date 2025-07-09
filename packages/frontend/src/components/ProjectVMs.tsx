import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects';
import { vmApi } from '../api/vms';
import { portsApi } from '../api/ports';
import { useToast } from '../contexts/ToastContext';
import VMStatusBadge from './VMStatusBadge';
import { Link } from 'react-router-dom';
import type { AddProjectVMRequest, VirtualMachine } from '@gce-platform/types';
import type { PortDescription } from '../api/ports';

interface ProjectVMsProps {
  projectId: string;
  canEdit: boolean;
}

export default function ProjectVMs({ projectId, canEdit }: ProjectVMsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedVmId, setSelectedVmId] = useState('');
  const [role, setRole] = useState<'development' | 'staging' | 'production' | 'testing'>('development');
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  const { data: projectVms, isLoading } = useQuery({
    queryKey: ['project-vms', projectId],
    queryFn: () => projectsApi.getVMs(projectId),
  });

  const { data: availableVms } = useQuery({
    queryKey: ['available-vms'],
    queryFn: async () => {
      const response = await vmApi.list();
      const projectVmIds = projectVms?.map(pvm => pvm.vm.id) || [];
      return response.data?.filter((vm: VirtualMachine) => !projectVmIds.includes(vm.id)) || [];
    },
    enabled: showAddForm && !!projectVms,
  });

  // Fetch favorite ports for all project VMs
  const vmIds = projectVms?.map(pvm => pvm.vm.id) || [];
  const { data: allFavoritePorts = {} } = useQuery({
    queryKey: ['project-vm-favorite-ports', vmIds],
    queryFn: async () => {
      const portsByVm: Record<string, PortDescription[]> = {};
      await Promise.all(
        vmIds.map(async (vmId) => {
          try {
            const ports = await portsApi.getPortDescriptions(vmId);
            portsByVm[vmId] = ports.filter(p => p.isFavorite);
          } catch (error) {
            portsByVm[vmId] = [];
          }
        })
      );
      return portsByVm;
    },
    enabled: vmIds.length > 0,
  });

  const addMutation = useMutation({
    mutationFn: (data: AddProjectVMRequest) => 
      projectsApi.addVM(projectId, data),
    onSuccess: () => {
      showSuccess('VM added to project successfully');
      queryClient.invalidateQueries({ queryKey: ['project-vms', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowAddForm(false);
      setSelectedVmId('');
      setRole('development');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to add VM');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (vmId: string) => 
      projectsApi.removeVM(projectId, vmId),
    onSuccess: () => {
      showSuccess('VM removed from project successfully');
      queryClient.invalidateQueries({ queryKey: ['project-vms', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to remove VM');
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedVmId) {
      showError('Please select a VM');
      return;
    }

    addMutation.mutate({
      vmId: selectedVmId,
      role,
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading VMs...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors"
          >
            {showAddForm ? 'Cancel' : 'Add VM'}
          </button>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAdd} className="border border-te-gray-300 dark:border-te-gray-800 p-4 space-y-4">
          <div>
            <label htmlFor="vm-select" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Select VM <span className="text-red-500">*</span>
            </label>
            <select
              id="vm-select"
              value={selectedVmId}
              onChange={(e) => setSelectedVmId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
            >
              <option value="">Select a VM...</option>
              {availableVms?.map((vm: VirtualMachine) => (
                <option key={vm.id} value={vm.id}>
                  {vm.name} ({vm.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="role" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Environment Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-te-gray-300 dark:border-te-gray-800 bg-white dark:bg-te-gray-950 focus:outline-none focus:border-te-gray-500 dark:focus:border-te-gray-600"
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
              <option value="testing">Testing</option>
            </select>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-te-gray-900 dark:bg-te-gray-100 text-white dark:text-te-gray-900 text-xs uppercase tracking-wider hover:bg-te-gray-800 dark:hover:bg-te-gray-200 transition-colors disabled:opacity-50"
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? 'Adding...' : 'Add VM'}
            </button>
          </div>
        </form>
      )}

      {projectVms && projectVms.length === 0 ? (
        <div className="text-center py-8 border border-te-gray-300 dark:border-te-gray-800">
          <p className="text-sm text-te-gray-600 dark:text-te-gray-500">
            No VMs associated with this project yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projectVms?.map(({ projectVm, vm, addedBy }) => {
            const favoritePorts = allFavoritePorts[vm.id] || [];
            
            return (
              <div
                key={projectVm.id}
                className="border border-te-gray-300 dark:border-te-gray-800 p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <Link
                    to={`/vms/${vm.id}`}
                    className="text-sm font-medium hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors"
                  >
                    {vm.name}
                  </Link>
                  <VMStatusBadge status={vm.status} />
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-te-gray-500 dark:text-te-gray-600">Role</span>
                    <span className="uppercase tracking-wider text-te-gray-700 dark:text-te-gray-400">
                      {projectVm.role}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-te-gray-500 dark:text-te-gray-600">Machine Type</span>
                    <span className="text-te-gray-700 dark:text-te-gray-400">{vm.machineType}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-te-gray-500 dark:text-te-gray-600">Zone</span>
                    <span className="text-te-gray-700 dark:text-te-gray-400">{vm.zone}</span>
                  </div>
                </div>

                {/* Favorite Ports Section */}
                {favoritePorts.length > 0 && (
                  <div className="mb-3 pt-3 border-t border-te-gray-200 dark:border-te-gray-800">
                    <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600 mb-2">
                      Favorite Ports
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {favoritePorts.map((port) => (
                        <button
                          key={`${port.port}-${port.protocol}`}
                          onClick={() => {
                            if (vm.publicIp) {
                              const protocol = port.protocol.toLowerCase() === 'tcp' ? 'http' : port.protocol.toLowerCase();
                              const url = `${protocol}://${vm.publicIp}:${port.port}`;
                              window.open(url, '_blank');
                            } else {
                              showError('VM does not have a public IP address');
                            }
                          }}
                          className="inline-flex items-center px-2 py-1 bg-green-600 dark:bg-te-yellow text-white dark:text-te-gray-900 text-2xs rounded hover:bg-green-700 dark:hover:bg-te-orange transition-colors"
                          title={port.description || `Open ${port.name}`}
                        >
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {port.name}:{port.port}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-te-gray-200 dark:border-te-gray-800">
                  <span className="text-2xs text-te-gray-500 dark:text-te-gray-600">
                    Added by {addedBy.name || addedBy.email}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => removeMutation.mutate(projectVm.id)}
                      className="text-2xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 uppercase tracking-wider"
                      disabled={removeMutation.isPending}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}