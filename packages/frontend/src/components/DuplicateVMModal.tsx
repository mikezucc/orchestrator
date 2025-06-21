import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import type { VirtualMachine } from '@gce-platform/types';

interface DuplicateVMModalProps {
  vm: VirtualMachine;
  onClose: () => void;
}

export default function DuplicateVMModal({ vm, onClose }: DuplicateVMModalProps) {
  const [name, setName] = useState(`${vm.name}-copy`);
  const [isValidating, setIsValidating] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const duplicateMutation = useMutation({
    mutationFn: () => vmApi.duplicate(vm.id, name),
    onSuccess: (response) => {
      showSuccess(`VM "${name}" has been duplicated successfully!`);
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      onClose();
      // Navigate to the new VM's detail page
      if (response.data) {
        navigate(`/vms/${response.data.id}`);
      }
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to duplicate VM');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      showError('VM name is required');
      return;
    }

    // Basic name validation
    if (!/^[a-z]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
      showError('VM name must start with a lowercase letter, followed by up to 62 lowercase letters, numbers, or hyphens, and cannot end with a hyphen');
      return;
    }

    duplicateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold uppercase tracking-wider">Duplicate VM</h3>
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
            <p className="text-sm text-te-gray-600 dark:text-te-gray-400 mb-4">
              This will create an exact copy of <span className="font-medium">{vm.name}</span> with:
            </p>
            <ul className="list-disc list-inside text-xs text-te-gray-600 dark:text-te-gray-500 space-y-1 mb-4">
              <li>Same disk image and installed software</li>
              <li>Same machine type ({vm.machineType})</li>
              <li>Same firewall rules</li>
              <li>Same port labels</li>
              <li>Same startup script</li>
            </ul>
          </div>

          <div>
            <label htmlFor="name" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              New VM Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="my-vm-copy"
              className="w-full"
              pattern="[a-z]([-a-z0-9]*[a-z0-9])?"
              maxLength={63}
              required
              autoFocus
            />
            <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-1">
              Must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens
            </p>
          </div>

          {duplicateMutation.isPending && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
              <p className="text-xs text-blue-700 dark:text-blue-400">
                This process may take 1-2 minutes as we create a snapshot and duplicate the VM.
              </p>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-te-gray-200 dark:border-te-gray-800">
            <p className="text-xs text-te-gray-600 dark:text-te-gray-500">
              Zone: {vm.zone}
            </p>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
                disabled={duplicateMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={duplicateMutation.isPending || !name.trim()}
                className="btn-primary"
              >
                {duplicateMutation.isPending ? (
                  <span className="flex items-center space-x-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Creating snapshot...</span>
                  </span>
                ) : 'Duplicate VM'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}