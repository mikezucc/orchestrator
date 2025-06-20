import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FirewallRule, PortLabel } from '@gce-platform/types';
import { portLabelApi } from '../api/port-labels';

interface PortSelectorModalProps {
  publicIp: string;
  vmId: string;
  firewallRules: FirewallRule[];
  onClose: () => void;
}

export default function PortSelectorModal({ publicIp, vmId, firewallRules, onClose }: PortSelectorModalProps) {
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [customPort, setCustomPort] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);

  // Fetch port labels for this VM
  const { data: labelsResponse } = useQuery({
    queryKey: ['port-labels', vmId],
    queryFn: () => portLabelApi.listByVM(vmId),
  });

  const portLabels = labelsResponse?.data || [];
  const portLabelMap = new Map(portLabels.map(label => [`${label.port}-${label.protocol}`, label]));

  // Extract unique TCP ports from ingress firewall rules
  const availablePorts = new Set<string>();
  firewallRules
    .filter(rule => rule.direction === 'ingress')
    .forEach(rule => {
      rule.allowedPorts
        .filter(port => port.protocol === 'tcp' && port.ports)
        .forEach(port => {
          port.ports?.forEach(p => availablePorts.add(p));
        });
    });

  const sortedPorts = Array.from(availablePorts).sort((a, b) => parseInt(a) - parseInt(b));

  const handleOpen = () => {
    const port = useCustom ? customPort : selectedPort;
    if (port) {
      // Determine protocol based on common ports
      const protocol = ['443', '8443'].includes(port) ? 'https' : 'http';
      window.open(`${protocol}://${publicIp}:${port}`, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold uppercase tracking-wider">Open in Browser</h3>
          <button
            onClick={onClose}
            className="p-1 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
              Public IP
            </p>
            <p className="font-mono text-sm">{publicIp}</p>
          </div>

          {sortedPorts.length > 0 ? (
            <>
              <div>
                <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
                  Available Ports (from firewall rules)
                </p>
                <div className="space-y-2">
                  {sortedPorts.map(port => (
                    <label key={port} className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="port"
                        value={port}
                        checked={!useCustom && selectedPort === port}
                        onChange={(e) => {
                          setSelectedPort(e.target.value);
                          setUseCustom(false);
                        }}
                        className="text-te-gray-900 dark:text-te-yellow focus:ring-te-gray-900 dark:focus:ring-te-yellow"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Port {port}</span>
                        {(() => {
                          const label = portLabelMap.get(`${port}-tcp`);
                          if (label) {
                            return (
                              <>
                                <span className="text-te-gray-600 dark:text-te-gray-400"> — </span>
                                <span className="font-medium">{label.label}</span>
                                {label.description && (
                                  <span className="text-te-gray-500 dark:text-te-gray-600 text-xs block ml-6 mt-1">
                                    {label.description}
                                  </span>
                                )}
                              </>
                            );
                          }
                          // Default labels for common ports
                          const defaultLabel = 
                            port === '80' ? 'HTTP' :
                            port === '443' ? 'HTTPS' :
                            port === '22' ? 'SSH' :
                            port === '3389' ? 'RDP' :
                            port === '8080' ? 'HTTP Alt' :
                            port === '8443' ? 'HTTPS Alt' :
                            null;
                          return defaultLabel ? <span className="text-te-gray-600 dark:text-te-gray-400"> ({defaultLabel})</span> : null;
                        })()}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-te-gray-200 dark:border-te-gray-800 pt-4">
                <label className="flex items-center space-x-3 cursor-pointer mb-2">
                  <input
                    type="radio"
                    name="port"
                    checked={useCustom}
                    onChange={() => setUseCustom(true)}
                    className="text-te-gray-900 dark:text-te-yellow focus:ring-te-gray-900 dark:focus:ring-te-yellow"
                  />
                  <span className="text-sm">Use custom port</span>
                </label>
                {useCustom && (
                  <input
                    type="text"
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    placeholder="8080"
                    className="w-full mt-2"
                    pattern="[0-9]+"
                  />
                )}
              </div>
            </>
          ) : (
            <div>
              <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
                No TCP ingress ports found in firewall rules
              </p>
              <input
                type="text"
                value={customPort}
                onChange={(e) => {
                  setCustomPort(e.target.value);
                  setUseCustom(true);
                }}
                placeholder="Enter port number (e.g., 80, 443, 8080)"
                className="w-full"
                pattern="[0-9]+"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-te-gray-200 dark:border-te-gray-800">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleOpen}
            disabled={!useCustom && !selectedPort && sortedPorts.length > 0}
            className="btn-primary"
          >
            Open in New Tab
          </button>
        </div>
      </div>
    </div>
  );
}