import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { organizationApi } from '../api/organizations';
import type { CreateVMRequest } from '@gce-platform/types';
import { useToast } from '../contexts/ToastContext';

interface CreateVMModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateVMModal({ onClose, onSuccess }: CreateVMModalProps) {
  const { showError, showSuccess } = useToast();
  
  // Fetch organization data to get configured projects
  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: organizationApi.getMyOrganization,
  });

  const [formData, setFormData] = useState<CreateVMRequest>({
    name: '',
    gcpProjectId: '',
    zone: 'us-central1-a',
    machineType: 'e2-micro',
    initScript: '',
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createMutation = useMutation({
    mutationFn: vmApi.create,
    onSuccess: () => {
      showSuccess('VM created successfully');
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to create VM');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold uppercase tracking-wider">Create VM</h2>
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
              VM Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full"
              placeholder="my-vm-instance"
            />
          </div>

          <div>
            <label htmlFor="gcpProjectId" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              GCP Project
            </label>
            {organization?.gcpProjectIds && organization.gcpProjectIds.length > 0 ? (
              <select
                id="gcpProjectId"
                required
                value={formData.gcpProjectId}
                onChange={(e) => setFormData({ ...formData, gcpProjectId: e.target.value })}
                className="w-full"
              >
                <option value="">Select a project</option>
                {organization.gcpProjectIds.map((projectId) => (
                  <option key={projectId} value={projectId}>
                    {projectId}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-te-gray-500 dark:text-te-gray-400">
                No projects configured. Please configure GCP projects in organization settings.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="zone" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                Zone
              </label>
              <select
                id="zone"
                value={formData.zone}
                onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                className="w-full"
              >
                <option value="us-central1-a">us-central1-a</option>
                <option value="us-central1-b">us-central1-b</option>
                <option value="us-east1-b">us-east1-b</option>
                <option value="us-east1-c">us-east1-c</option>
                <option value="us-west1-a">us-west1-a</option>
                <option value="us-west1-b">us-west1-b</option>
              </select>
            </div>

            <div>
              <label htmlFor="machineType" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                Machine Type
              </label>
              <select
                id="machineType"
                value={formData.machineType}
                onChange={(e) => setFormData({ ...formData, machineType: e.target.value })}
                className="w-full"
              >
                <option value="e2-micro">e2-micro</option>
                <option value="e2-small">e2-small</option>
                <option value="e2-medium">e2-medium</option>
                <option value="e2-standard-2">e2-standard-2</option>
                <option value="e2-standard-4">e2-standard-4</option>
              </select>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-2 text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
            >
              <svg 
                className={`w-4 h-4 transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Advanced Options</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 p-4 bg-te-gray-100 dark:bg-te-gray-900 rounded-lg">
              <div>
                <label htmlFor="initScript" className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  Startup Script (Optional)
                </label>
                <textarea
                  id="initScript"
                  rows={6}
                  value={formData.initScript}
                  onChange={(e) => setFormData({ ...formData, initScript: e.target.value })}
                  className="w-full font-mono text-xs"
                  placeholder="#!/bin/bash\n# Your startup script here\n# This script will run when the VM boots up\n\n# Example:\n# apt-get update\n# apt-get install -y nginx"
                  spellCheck={false}
                />
                <p className="text-2xs text-te-gray-600 dark:text-te-gray-500 mt-1">
                  This script will run automatically when the VM starts. Use it to install software, configure services, etc.
                </p>
              </div>
            </div>
          )}

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
              disabled={createMutation.isPending || !organization?.gcpProjectIds || organization.gcpProjectIds.length === 0}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Creating...' : 'Create VM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}