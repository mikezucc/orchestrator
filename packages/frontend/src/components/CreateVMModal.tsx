import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import type { CreateVMRequest } from '@gce-platform/types';

interface CreateVMModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateVMModal({ onClose, onSuccess }: CreateVMModalProps) {
  const [formData, setFormData] = useState<CreateVMRequest>({
    name: '',
    gcpProjectId: '',
    zone: 'us-central1-a',
    machineType: 'e2-micro',
    initScript: '',
  });

  const createMutation = useMutation({
    mutationFn: vmApi.create,
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Create Virtual Machine</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              VM Name
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
            <label htmlFor="gcpProjectId" className="block text-sm font-medium text-gray-700">
              GCP Project ID
            </label>
            <input
              type="text"
              id="gcpProjectId"
              required
              value={formData.gcpProjectId}
              onChange={(e) => setFormData({ ...formData, gcpProjectId: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="zone" className="block text-sm font-medium text-gray-700">
              Zone
            </label>
            <select
              id="zone"
              value={formData.zone}
              onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
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
            <label htmlFor="machineType" className="block text-sm font-medium text-gray-700">
              Machine Type
            </label>
            <select
              id="machineType"
              value={formData.machineType}
              onChange={(e) => setFormData({ ...formData, machineType: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="e2-micro">e2-micro (0.25-2 vCPUs, 1GB)</option>
              <option value="e2-small">e2-small (0.5-2 vCPUs, 2GB)</option>
              <option value="e2-medium">e2-medium (1-2 vCPUs, 4GB)</option>
              <option value="e2-standard-2">e2-standard-2 (2 vCPUs, 8GB)</option>
              <option value="e2-standard-4">e2-standard-4 (4 vCPUs, 16GB)</option>
            </select>
          </div>

          <div>
            <label htmlFor="initScript" className="block text-sm font-medium text-gray-700">
              Init Script (optional)
            </label>
            <textarea
              id="initScript"
              rows={4}
              value={formData.initScript}
              onChange={(e) => setFormData({ ...formData, initScript: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="#!/bin/bash&#10;# Your startup script here"
            />
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
              {createMutation.isPending ? 'Creating...' : 'Create VM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}