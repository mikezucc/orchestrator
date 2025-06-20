import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { firewallApi } from '../api/firewall';
import FirewallRules from '../components/FirewallRules';
import VMStatusBadge from '../components/VMStatusBadge';
import PortSelectorModal from '../components/PortSelectorModal';
import PortLabels from '../components/PortLabels';
import { useToast } from '../contexts/ToastContext';

export default function VMDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const [showPortSelector, setShowPortSelector] = useState(false);

  const { data: vmResponse, isLoading: vmLoading } = useQuery({
    queryKey: ['vm', id],
    queryFn: () => vmApi.get(id!, true), // Sync VM data on load
    enabled: !!id,
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to load VM details');
    },
  });

  const { data: rulesResponse } = useQuery({
    queryKey: ['firewall-rules', id],
    queryFn: async () => {
      // Sync firewall rules from GCP on page load
      const response = await firewallApi.listByVM(id!, true);
      // Check if sync had partial errors
      if (response.success && response.error) {
        showError(response.error);
      }
      return response;
    },
    enabled: !!id,
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to load firewall rules');
    },
  });

  const startMutation = useMutation({
    mutationFn: () => vmApi.start(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM started successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vm', id] });
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to start VM');
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => vmApi.stop(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM stopped successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vm', id] });
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to stop VM');
    },
  });

  const suspendMutation = useMutation({
    mutationFn: () => vmApi.suspend(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM suspended successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vm', id] });
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to suspend VM');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => vmApi.delete(id!),
    onSuccess: () => {
      showSuccess('VM deleted successfully');
      navigate('/vms');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to delete VM');
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
              className="btn-primary flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{startMutation.isPending ? 'Starting...' : 'Start VM'}</span>
            </button>
          )}
          {vm.status === 'suspended' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="btn-primary flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{startMutation.isPending ? 'Resuming...' : 'Resume VM'}</span>
            </button>
          )}
          {vm.status === 'running' && (
            <>
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="btn-secondary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 9.5h-5m0 0h-5m5 0v5m0-5v-5M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                </svg>
                <span>{stopMutation.isPending ? 'Stopping...' : 'Stop VM'}</span>
              </button>
              <button
                onClick={() => suspendMutation.mutate()}
                disabled={suspendMutation.isPending}
                className="btn-secondary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{suspendMutation.isPending ? 'Suspending...' : 'Suspend VM'}</span>
              </button>
            </>
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
            <VMStatusBadge status={vm.status} />
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
              Public IP
            </p>
            {vm.publicIp ? (
              <div className="flex items-center space-x-2">
                <p className="font-medium font-mono">{vm.publicIp}</p>
                <button
                  onClick={() => setShowPortSelector(true)}
                  className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                  title="Open in browser"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </div>
            ) : (
              <p className="text-te-gray-500 dark:text-te-gray-600">—</p>
            )}
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
        <PortLabels vmId={id!} />
      </div>

      <div>
        <FirewallRules vmId={id!} rules={rules} />
      </div>

      {showPortSelector && vm.publicIp && (
        <PortSelectorModal
          publicIp={vm.publicIp}
          vmId={id!}
          firewallRules={rules}
          onClose={() => setShowPortSelector(false)}
        />
      )}
    </div>
  );
}