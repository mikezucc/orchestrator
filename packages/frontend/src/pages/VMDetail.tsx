import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { firewallApi } from '../api/firewall';
import FirewallRules from '../components/FirewallRules';

export default function VMDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: vmResponse, isLoading: vmLoading } = useQuery({
    queryKey: ['vm', id],
    queryFn: () => vmApi.get(id!),
    enabled: !!id,
  });

  const { data: rulesResponse } = useQuery({
    queryKey: ['firewall-rules', id],
    queryFn: () => firewallApi.listByVM(id!),
    enabled: !!id,
  });

  const startMutation = useMutation({
    mutationFn: () => vmApi.start(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => vmApi.stop(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => vmApi.delete(id!),
    onSuccess: () => {
      navigate('/vms');
    },
  });

  if (vmLoading || !vmResponse?.data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading...
        </div>
      </div>
    );
  }

  const vm = vmResponse.data;
  const rules = rulesResponse?.data || [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/vms')}
            className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors mb-4 flex items-center space-x-1"
          >
            <span>←</span>
            <span>Back to VMs</span>
          </button>
          <h1 className="text-xl font-bold uppercase tracking-wider mb-2">{vm.name}</h1>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500">
            Virtual Machine Details
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {vm.status === 'stopped' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="btn-primary"
            >
              {startMutation.isPending ? 'Starting...' : 'Start VM'}
            </button>
          )}
          {vm.status === 'running' && (
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="btn-secondary"
            >
              {stopMutation.isPending ? 'Stopping...' : 'Stop VM'}
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Delete VM "${vm.name}"?`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="btn-danger"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
              Status
            </p>
            <span className={
              vm.status === 'running' 
                ? 'badge-success' 
                : vm.status === 'stopped'
                ? 'badge-error'
                : 'badge-neutral'
            }>
              {vm.status}
            </span>
          </div>
          
          <div>
            <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
              Project ID
            </p>
            <p className="font-medium">{vm.gcpProjectId}</p>
          </div>
          
          <div>
            <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
              Zone
            </p>
            <p className="font-medium">{vm.zone}</p>
          </div>
          
          <div>
            <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
              Machine Type
            </p>
            <p className="font-medium">{vm.machineType}</p>
          </div>
          
          <div>
            <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
              Created
            </p>
            <p className="font-medium tabular-nums">
              {new Date(vm.createdAt).toLocaleString()}
            </p>
          </div>
          
          <div>
            <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
              Updated
            </p>
            <p className="font-medium tabular-nums">
              {new Date(vm.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        
        {vm.initScript && (
          <div className="mt-6 pt-6 border-t border-te-gray-200 dark:border-te-gray-800">
            <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Init Script
            </p>
            <pre className="bg-te-gray-100 dark:bg-te-gray-950 p-3 text-xs overflow-x-auto font-mono">
              {vm.initScript}
            </pre>
          </div>
        )}
      </div>

      <div>
        <FirewallRules vmId={id!} rules={rules} />
      </div>
    </div>
  );
}