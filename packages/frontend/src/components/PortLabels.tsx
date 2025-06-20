import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portLabelApi } from '../api/port-labels';
import { firewallApi } from '../api/firewall';
import type { PortLabel, CreatePortLabelRequest } from '@gce-platform/types';
import { useToast } from '../contexts/ToastContext';

interface PortLabelsProps {
  vmId: string;
}

export default function PortLabels({ vmId }: PortLabelsProps) {
  const [showAddLabel, setShowAddLabel] = useState(false);
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  // Fetch port labels
  const { data: labelsResponse } = useQuery({
    queryKey: ['port-labels', vmId],
    queryFn: () => portLabelApi.listByVM(vmId),
  });

  // Fetch firewall rules to show available ports
  const { data: rulesResponse } = useQuery({
    queryKey: ['firewall-rules', vmId],
    queryFn: () => firewallApi.listByVM(vmId),
  });

  const labels = labelsResponse?.data || [];
  const rules = rulesResponse?.data || [];

  const deleteMutation = useMutation({
    mutationFn: portLabelApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-labels', vmId] });
      showSuccess('Port label deleted successfully');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to delete port label');
    },
  });

  // Extract available ports from firewall rules
  const availablePorts = new Set<string>();
  rules
    .filter(rule => rule.direction === 'ingress')
    .forEach(rule => {
      rule.allowedPorts
        .filter(port => port.protocol === 'tcp' && port.ports)
        .forEach(port => {
          port.ports?.forEach(p => availablePorts.add(p));
        });
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wider">Port Labels</h2>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mt-1">
            {labels.length} Labeled Ports
          </p>
        </div>
        <button
          onClick={() => setShowAddLabel(true)}
          className="btn-primary"
        >
          + Add Label
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {labels.length === 0 ? (
          <div className="p-8 text-center text-te-gray-600 dark:text-te-gray-500">
            <p className="mb-2">No port labels configured.</p>
            <p className="text-xs">Add labels to help identify services running on specific ports.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-3">Port</th>
                <th className="text-left px-4 py-3">Protocol</th>
                <th className="text-left px-4 py-3">Label</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
              {labels.map((label) => (
                <tr key={label.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-900 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium">{label.port}</td>
                  <td className="px-4 py-3">
                    <span className="badge-neutral text-2xs uppercase">{label.protocol}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">{label.label}</td>
                  <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                    {label.description || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        if (confirm(`Delete label for port ${label.port}?`)) {
                          deleteMutation.mutate(label.id);
                        }
                      }}
                      className="text-xs uppercase tracking-wider text-red-600 dark:text-te-orange hover:text-red-700 dark:hover:text-te-yellow transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddLabel && (
        <AddPortLabelModal
          vmId={vmId}
          availablePorts={Array.from(availablePorts)}
          onClose={() => setShowAddLabel(false)}
          onSuccess={() => {
            setShowAddLabel(false);
            queryClient.invalidateQueries({ queryKey: ['port-labels', vmId] });
          }}
        />
      )}
    </div>
  );
}

interface AddPortLabelModalProps {
  vmId: string;
  availablePorts: string[];
  onClose: () => void;
  onSuccess: () => void;
}

function AddPortLabelModal({ vmId, availablePorts, onClose, onSuccess }: AddPortLabelModalProps) {
  const [formData, setFormData] = useState<CreatePortLabelRequest>({
    vmId,
    port: availablePorts[0] || '',
    protocol: 'tcp',
    label: '',
    description: '',
  });
  const [useCustomPort, setUseCustomPort] = useState(false);
  const [customPort, setCustomPort] = useState('');
  const { showError, showSuccess } = useToast();

  const createMutation = useMutation({
    mutationFn: portLabelApi.create,
    onSuccess: () => {
      showSuccess('Port label created successfully');
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to create port label');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const port = useCustomPort ? customPort : formData.port;
    if (!port || !formData.label) return;
    
    createMutation.mutate({
      ...formData,
      port,
    });
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold uppercase tracking-wider">Add Port Label</h3>
          <button
            onClick={onClose}
            className="p-1 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Port
            </label>
            {availablePorts.length > 0 && !useCustomPort ? (
              <>
                <select
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  className="w-full mb-2"
                  required
                >
                  <option value="">Select a port</option>
                  {availablePorts.map(port => (
                    <option key={port} value={port}>
                      Port {port}
                      {port === '80' && ' (HTTP)'}
                      {port === '443' && ' (HTTPS)'}
                      {port === '22' && ' (SSH)'}
                      {port === '3389' && ' (RDP)'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseCustomPort(true)}
                  className="text-xs uppercase tracking-wider hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                >
                  Use custom port
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                  placeholder="8080"
                  pattern="[0-9]+"
                  className="w-full mb-2"
                  required
                />
                {availablePorts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseCustomPort(false)}
                    className="text-xs uppercase tracking-wider hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                  >
                    Select from available ports
                  </button>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor="protocol" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Protocol
            </label>
            <select
              id="protocol"
              value={formData.protocol}
              onChange={(e) => setFormData({ ...formData, protocol: e.target.value as 'tcp' | 'udp' })}
              className="w-full"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>

          <div>
            <label htmlFor="label" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Label
            </label>
            <input
              type="text"
              id="label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Web Server"
              className="w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Main application web server running nginx"
              className="w-full h-20"
              style={{ resize: 'none' }}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-te-gray-200 dark:border-te-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Label'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}