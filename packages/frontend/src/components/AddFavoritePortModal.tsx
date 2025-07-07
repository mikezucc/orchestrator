import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { portsApi } from '../api/ports';
import { useToast } from '../contexts/ToastContext';

interface AddFavoritePortModalProps {
  vmId: string;
  onClose: () => void;
}

const COMMON_PORTS = [
  { port: 22, protocol: 'TCP', name: 'SSH', description: 'Secure Shell' },
  { port: 80, protocol: 'TCP', name: 'HTTP', description: 'Web Server' },
  { port: 443, protocol: 'TCP', name: 'HTTPS', description: 'Secure Web Server' },
  { port: 3000, protocol: 'TCP', name: 'Dev Server', description: 'Development Server' },
  { port: 3306, protocol: 'TCP', name: 'MySQL', description: 'MySQL Database' },
  { port: 5432, protocol: 'TCP', name: 'PostgreSQL', description: 'PostgreSQL Database' },
  { port: 6379, protocol: 'TCP', name: 'Redis', description: 'Redis Cache' },
  { port: 8080, protocol: 'TCP', name: 'Alt HTTP', description: 'Alternative HTTP' },
  { port: 8443, protocol: 'TCP', name: 'Alt HTTPS', description: 'Alternative HTTPS' },
  { port: 9000, protocol: 'TCP', name: 'PHP-FPM', description: 'PHP FastCGI' },
];

export default function AddFavoritePortModal({ vmId, onClose }: AddFavoritePortModalProps) {
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState('TCP');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCommonPort, setSelectedCommonPort] = useState<typeof COMMON_PORTS[0] | null>(null);
  
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();

  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof portsApi.savePortDescription>[1]) => 
      portsApi.savePortDescription(vmId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-descriptions', vmId] });
      showSuccess('Favorite port added successfully');
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to add favorite port');
    }
  });

  const handleSelectCommonPort = (commonPort: typeof COMMON_PORTS[0]) => {
    setSelectedCommonPort(commonPort);
    setPort(commonPort.port.toString());
    setProtocol(commonPort.protocol);
    setName(commonPort.name);
    setDescription(commonPort.description);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const portNumber = parseInt(port);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
      showError('Port must be a number between 1 and 65535');
      return;
    }

    if (!name.trim()) {
      showError('Service name is required');
      return;
    }

    saveMutation.mutate({
      port: portNumber,
      protocol: protocol.toLowerCase(),
      name: name.trim(),
      description: description.trim() || undefined,
      isFavorite: true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-te-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-te-gray-200 dark:border-te-gray-700">
          <h2 className="text-xl font-semibold text-te-gray-900 dark:text-te-gray-100">
            Add Favorite Port
          </h2>
          <p className="text-sm text-te-gray-600 dark:text-te-gray-400 mt-1">
            Create a favorite port description for quick access
          </p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Common ports section */}
            <div>
              <label className="block text-sm font-medium text-te-gray-700 dark:text-te-gray-300 mb-2">
                Common Ports
              </label>
              <div className="grid grid-cols-2 gap-2">
                {COMMON_PORTS.map((commonPort) => (
                  <button
                    key={`${commonPort.port}-${commonPort.protocol}`}
                    type="button"
                    onClick={() => handleSelectCommonPort(commonPort)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      selectedCommonPort?.port === commonPort.port && selectedCommonPort?.protocol === commonPort.protocol
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-te-gray-300 dark:border-te-gray-600 hover:border-te-gray-400 dark:hover:border-te-gray-500'
                    }`}
                  >
                    <div className="font-medium text-te-gray-900 dark:text-te-gray-100">
                      {commonPort.name}
                    </div>
                    <div className="text-sm text-te-gray-600 dark:text-te-gray-400">
                      {commonPort.port}/{commonPort.protocol} - {commonPort.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-te-gray-200 dark:border-te-gray-700 pt-4">
              <h3 className="text-sm font-medium text-te-gray-700 dark:text-te-gray-300 mb-3">
                Custom Port Details
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="port" className="block text-sm font-medium text-te-gray-700 dark:text-te-gray-300 mb-1">
                    Port Number
                  </label>
                  <input
                    id="port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="w-full px-3 py-2 border border-te-gray-300 dark:border-te-gray-600 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 dark:bg-te-gray-700 dark:text-te-gray-100"
                    placeholder="e.g., 3000"
                    min="1"
                    max="65535"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="protocol" className="block text-sm font-medium text-te-gray-700 dark:text-te-gray-300 mb-1">
                    Protocol
                  </label>
                  <select
                    id="protocol"
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value)}
                    className="w-full px-3 py-2 border border-te-gray-300 dark:border-te-gray-600 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 dark:bg-te-gray-700 dark:text-te-gray-100"
                  >
                    <option value="TCP">TCP</option>
                    <option value="UDP">UDP</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="name" className="block text-sm font-medium text-te-gray-700 dark:text-te-gray-300 mb-1">
                  Service Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-te-gray-300 dark:border-te-gray-600 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 dark:bg-te-gray-700 dark:text-te-gray-100"
                  placeholder="e.g., Web Server"
                  required
                />
              </div>

              <div className="mt-4">
                <label htmlFor="description" className="block text-sm font-medium text-te-gray-700 dark:text-te-gray-300 mb-1">
                  Description (Optional)
                </label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-te-gray-300 dark:border-te-gray-600 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 dark:bg-te-gray-700 dark:text-te-gray-100"
                  placeholder="e.g., Main application server"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-te-gray-200 dark:border-te-gray-700 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-te-gray-700 dark:text-te-gray-300 bg-white dark:bg-te-gray-700 border border-te-gray-300 dark:border-te-gray-600 rounded-md hover:bg-te-gray-50 dark:hover:bg-te-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? 'Adding...' : 'Add Favorite'}
          </button>
        </div>
      </div>
    </div>
  );
}