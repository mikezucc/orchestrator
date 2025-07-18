import { useState } from 'react';
import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';

export default function Admin() {
  const { isOwnerOrAdmin } = useCurrentUserRole();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('daemon', file);

      const response = await fetch('/api/admin/daemon-binary', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload daemon binary');
      }

      return response.json();
    },
    onSuccess: () => {
      setSelectedFile(null);
      setUploadProgress(0);
      alert('Daemon binary uploaded successfully!');
    },
    onError: (error) => {
      console.error('Upload failed:', error);
      alert('Failed to upload daemon binary');
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <h2 className="text-lg font-medium text-te-gray-900 dark:text-te-gray-100 mb-2">
            Access Denied
          </h2>
          <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
            You must be an organization owner or admin to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium text-te-gray-900 dark:text-te-gray-100 mb-2">
          Admin Dashboard
        </h1>
        <p className="text-xs text-te-gray-600 dark:text-te-gray-400">
          Manage system configuration and daemon binaries
        </p>
      </div>

      <div className="bg-white dark:bg-te-gray-900 border border-te-gray-200 dark:border-te-gray-800 rounded-lg p-6">
        <h2 className="text-base font-medium text-te-gray-900 dark:text-te-gray-100 mb-4">
          Daemon Binary Upload
        </h2>
        
        <div className="space-y-4">
          <div>
            <p className="text-xs text-te-gray-600 dark:text-te-gray-400 mb-4">
              Upload a new daemon binary that will be available for download by virtual machines.
              The binary will be served from api.onfacet.dev/daemon/latest
            </p>
          </div>

          <div className="border-2 border-dashed border-te-gray-300 dark:border-te-gray-700 rounded-lg p-6">
            <div className="text-center">
              <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-te-gray-400" />
              
              <div className="mt-4">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="inline-flex items-center px-4 py-2 border border-te-gray-300 dark:border-te-gray-700 rounded-md shadow-sm text-xs font-medium text-te-gray-700 dark:text-te-gray-300 bg-white dark:bg-te-gray-800 hover:bg-te-gray-50 dark:hover:bg-te-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-te-yellow">
                    Select Binary
                  </span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    onChange={handleFileSelect}
                    accept=".exe,.bin,application/octet-stream"
                  />
                </label>
              </div>

              {selectedFile && (
                <div className="mt-4">
                  <p className="text-sm text-te-gray-900 dark:text-te-gray-100">
                    Selected: {selectedFile.name}
                  </p>
                  <p className="text-xs text-te-gray-500 dark:text-te-gray-500">
                    Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {selectedFile && (
            <div className="flex justify-end">
              <button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-te-yellow hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-te-yellow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload Binary'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-te-gray-900 border border-te-gray-200 dark:border-te-gray-800 rounded-lg p-6">
        <h2 className="text-base font-medium text-te-gray-900 dark:text-te-gray-100 mb-4">
          VM Download Script
        </h2>
        
        <div className="space-y-4">
          <p className="text-xs text-te-gray-600 dark:text-te-gray-400">
            Users can run this script on their virtual machines to download and start the latest daemon:
          </p>
          
          <pre className="bg-te-gray-100 dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded p-4 text-xs overflow-x-auto">
            <code>{`#!/bin/bash

# Download the latest daemon binary from Slopbox
echo "Downloading latest daemon binary..."
curl -o /tmp/slopbox-daemon https://api.onfacet.dev/daemon/latest

# Make it executable
chmod +x /tmp/slopbox-daemon

# Start the daemon
echo "Starting Slopbox daemon..."
/tmp/slopbox-daemon`}</code>
          </pre>
          
          <div className="text-xs text-te-gray-600 dark:text-te-gray-400">
            <p className="font-medium mb-1">One-liner command:</p>
            <pre className="bg-te-gray-100 dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded p-2 overflow-x-auto">
              <code>curl -s https://api.onfacet.dev/daemon/install.sh | bash</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}