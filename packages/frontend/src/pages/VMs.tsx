import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { Link } from 'react-router-dom';
import CreateVMModal from '../components/CreateVMModal';

export default function VMs() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: vmsResponse, isLoading } = useQuery({
    queryKey: ['vms'],
    queryFn: vmApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: vmApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
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
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          + Create VM
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Zone</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
            {vms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-te-gray-600 dark:text-te-gray-500">
                  No virtual machines found. Create your first VM to get started.
                </td>
              </tr>
            ) : (
              vms.map((vm) => (
                <tr key={vm.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-900 transition-colors">
                  <td className="px-4 py-3">
                    <span className={
                      vm.status === 'running' 
                        ? 'badge-success' 
                        : vm.status === 'stopped'
                        ? 'badge-error'
                        : 'badge-neutral'
                    }>
                      {vm.status}
                    </span>
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
                  <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400 tabular-nums">
                    {new Date(vm.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
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
          }}
        />
      )}
    </div>
  );
}