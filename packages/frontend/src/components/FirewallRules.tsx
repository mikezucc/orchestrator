import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { firewallApi } from '../api/firewall';
import type { FirewallRule, CreateFirewallRuleRequest, PortRule } from '@gce-platform/types';

interface FirewallRulesProps {
  vmId: string;
  rules: FirewallRule[];
}

export default function FirewallRules({ vmId, rules }: FirewallRulesProps) {
  const [showAddRule, setShowAddRule] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: firewallApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall-rules', vmId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wider">Firewall Rules</h2>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mt-1">
            {rules.length} Active Rules
          </p>
        </div>
        <button
          onClick={() => setShowAddRule(true)}
          className="btn-primary"
        >
          + Add Rule
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Direction</th>
              <th className="text-left px-4 py-3">Priority</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Ports</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-te-gray-200 dark:divide-te-gray-800">
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-te-gray-600 dark:text-te-gray-500">
                  No firewall rules configured. Add a rule to control network access.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-900 transition-colors">
                  <td className="px-4 py-3 font-medium">{rule.name}</td>
                  <td className="px-4 py-3">
                    <span className={`badge-neutral text-2xs`}>
                      {rule.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums">{rule.priority}</td>
                  <td className="px-4 py-3 text-sm text-te-gray-600 dark:text-te-gray-400">
                    {rule.sourceRanges?.join(', ') || 'Any'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {rule.allowedPorts.map((port, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-medium uppercase">{port.protocol}</span>
                          {port.ports && (
                            <span className="text-te-gray-600 dark:text-te-gray-400">
                              : {port.ports.join(', ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        if (confirm(`Delete rule "${rule.name}"?`)) {
                          deleteMutation.mutate(rule.id);
                        }
                      }}
                      className="text-xs uppercase tracking-wider text-red-600 dark:text-te-orange hover:text-red-700 dark:hover:text-te-yellow transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddRule && (
        <AddFirewallRuleModal
          vmId={vmId}
          onClose={() => setShowAddRule(false)}
          onSuccess={() => {
            setShowAddRule(false);
            queryClient.invalidateQueries({ queryKey: ['firewall-rules', vmId] });
          }}
        />
      )}
    </div>
  );
}

interface AddFirewallRuleModalProps {
  vmId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddFirewallRuleModal({ vmId, onClose, onSuccess }: AddFirewallRuleModalProps) {
  const [formData, setFormData] = useState<CreateFirewallRuleRequest>({
    vmId,
    name: '',
    direction: 'ingress',
    priority: 1000,
    sourceRanges: ['0.0.0.0/0'],
    allowedPorts: [{ protocol: 'tcp', ports: ['80'] }],
  });

  const createMutation = useMutation({
    mutationFn: firewallApi.create,
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const updatePort = (index: number, field: keyof PortRule, value: any) => {
    const newPorts = [...formData.allowedPorts];
    newPorts[index] = { ...newPorts[index], [field]: value };
    setFormData({ ...formData, allowedPorts: newPorts });
  };

  const addPort = () => {
    setFormData({
      ...formData,
      allowedPorts: [...formData.allowedPorts, { protocol: 'tcp', ports: [] }],
    });
  };

  const removePort = (index: number) => {
    setFormData({
      ...formData,
      allowedPorts: formData.allowedPorts.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold uppercase tracking-wider">Add Firewall Rule</h3>
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
            <label htmlFor="name" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Rule Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full"
              placeholder="allow-http"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="direction" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                Direction
              </label>
              <select
                id="direction"
                value={formData.direction}
                onChange={(e) => setFormData({ ...formData, direction: e.target.value as 'ingress' | 'egress' })}
                className="w-full"
              >
                <option value="ingress">Ingress</option>
                <option value="egress">Egress</option>
              </select>
            </div>

            <div>
              <label htmlFor="priority" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                Priority
              </label>
              <input
                type="number"
                id="priority"
                required
                min="0"
                max="65535"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sourceRanges" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Source IP Ranges
            </label>
            <input
              type="text"
              id="sourceRanges"
              value={formData.sourceRanges?.join(', ')}
              onChange={(e) => setFormData({ 
                ...formData, 
                sourceRanges: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
              })}
              className="w-full"
              placeholder="0.0.0.0/0"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400">
                Allowed Ports
              </label>
              <button
                type="button"
                onClick={addPort}
                className="text-xs uppercase tracking-wider hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
              >
                + Add Port
              </button>
            </div>
            
            <div className="space-y-2">
              {formData.allowedPorts.map((port, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <select
                    value={port.protocol}
                    onChange={(e) => updatePort(index, 'protocol', e.target.value as 'tcp' | 'udp' | 'icmp')}
                    className="w-24"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="icmp">ICMP</option>
                  </select>
                  <input
                    type="text"
                    value={port.ports?.join(', ') || ''}
                    onChange={(e) => updatePort(index, 'ports', 
                      e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : undefined
                    )}
                    className="flex-1"
                    placeholder="80, 443"
                  />
                  {formData.allowedPorts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePort(index)}
                      className="p-1 text-red-600 dark:text-te-orange hover:text-red-700 dark:hover:text-te-yellow transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
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
              {createMutation.isPending ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}