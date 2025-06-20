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
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h2 className="text-base font-semibold leading-6 text-gray-900">Firewall Rules</h2>
          <p className="mt-2 text-sm text-gray-700">Configure network access for this virtual machine.</p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            onClick={() => setShowAddRule(true)}
            className="block rounded-md bg-indigo-600 py-2 px-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Add rule
          </button>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Name</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Direction</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Priority</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Source Ranges</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Allowed Ports</th>
                  <th className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                      {rule.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{rule.direction}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{rule.priority}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {rule.sourceRanges?.join(', ') || 'Any'}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-500">
                      {rule.allowedPorts.map((port, i) => (
                        <div key={i}>
                          {port.protocol}: {port.ports?.join(', ') || 'All'}
                        </div>
                      ))}
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this rule?')) {
                            deleteMutation.mutate(rule.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Add Firewall Rule</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Rule Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="direction" className="block text-sm font-medium text-gray-700">
              Direction
            </label>
            <select
              id="direction"
              value={formData.direction}
              onChange={(e) => setFormData({ ...formData, direction: e.target.value as 'ingress' | 'egress' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="ingress">Ingress (Inbound)</option>
              <option value="egress">Egress (Outbound)</option>
            </select>
          </div>

          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
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
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="sourceRanges" className="block text-sm font-medium text-gray-700">
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
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="0.0.0.0/0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Allowed Ports
            </label>
            {formData.allowedPorts.map((port, index) => (
              <div key={index} className="flex space-x-2 mb-2">
                <select
                  value={port.protocol}
                  onChange={(e) => updatePort(index, 'protocol', e.target.value as 'tcp' | 'udp' | 'icmp')}
                  className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
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
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="80, 443 (leave empty for all)"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}