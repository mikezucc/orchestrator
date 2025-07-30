import React, { useState } from 'react';
import { X, Upload, Shield, AlertCircle } from 'lucide-react';
import { uploadSSLCertificates } from '../../api/vms';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

interface SSLSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmId: string;
  vmName: string;
  onSuccess?: () => void;
}

export function SSLSettingsModal({ isOpen, onClose, vmId, vmName, onSuccess }: SSLSettingsModalProps) {
  const [domain, setDomain] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [certificatePreview, setCertificatePreview] = useState('');
  const [privateKeyPreview, setPrivateKeyPreview] = useState('');

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!domain || !certificateFile || !privateKeyFile) {
        throw new Error('Please fill in all required fields');
      }

      return uploadSSLCertificates(vmId, {
        domain,
        certificate: certificateFile,
        privateKey: privateKeyFile,
      });
    },
    onSuccess: () => {
      toast.success('SSL certificates uploaded successfully');
      resetForm();
      onSuccess?.();
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload SSL certificates');
    },
  });

  const resetForm = () => {
    setDomain('');
    setCertificateFile(null);
    setPrivateKeyFile(null);
    setCertificatePreview('');
    setPrivateKeyPreview('');
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    fileType: 'certificate' | 'privateKey'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Read file content for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (fileType === 'certificate') {
        setCertificateFile(file);
        setCertificatePreview(content);
      } else {
        setPrivateKeyFile(file);
        setPrivateKeyPreview(content);
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/30" onClick={onClose} />
        
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                SSL Certificate Settings
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Upload SSL certificates for <span className="font-semibold">{vmName}</span>
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              uploadMutation.mutate();
            }}
            className="space-y-6"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Domain Name
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 
                         dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                SSL Certificate (Public Key)
              </label>
              <div className="space-y-2">
                <label className="flex items-center justify-center w-full px-4 py-2 border-2 
                               border-dashed border-gray-300 dark:border-gray-600 rounded-lg 
                               cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 
                               transition-colors">
                  <Upload className="w-5 h-5 mr-2" />
                  <span className="text-sm">
                    {certificateFile ? certificateFile.name : 'Choose certificate file (.crt, .pem)'}
                  </span>
                  <input
                    type="file"
                    accept=".crt,.pem,.cert"
                    onChange={(e) => handleFileChange(e, 'certificate')}
                    className="hidden"
                    required
                  />
                </label>
                {certificatePreview && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md">
                    <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap 
                                  overflow-x-auto max-h-32 overflow-y-auto">
                      {certificatePreview.substring(0, 300)}...
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Private Key
              </label>
              <div className="space-y-2">
                <label className="flex items-center justify-center w-full px-4 py-2 border-2 
                               border-dashed border-gray-300 dark:border-gray-600 rounded-lg 
                               cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 
                               transition-colors">
                  <Upload className="w-5 h-5 mr-2" />
                  <span className="text-sm">
                    {privateKeyFile ? privateKeyFile.name : 'Choose private key file (.key, .pem)'}
                  </span>
                  <input
                    type="file"
                    accept=".key,.pem"
                    onChange={(e) => handleFileChange(e, 'privateKey')}
                    className="hidden"
                    required
                  />
                </label>
                {privateKeyPreview && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md">
                    <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap 
                                  overflow-x-auto max-h-32 overflow-y-auto">
                      {privateKeyPreview.substring(0, 200)}...
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 
                          dark:border-yellow-800 rounded-lg p-4">
              <div className="flex">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mr-2 
                                     flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-300">
                  <p className="font-semibold mb-1">Important:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Both certificate and private key will be uploaded to <code>/etc/nginx/ssl/</code></li>
                    <li>Certificate file: <code>/etc/nginx/ssl/[domain].crt</code></li>
                    <li>Private key file: <code>/etc/nginx/ssl/[domain].key</code></li>
                    <li>The private key will be secured with 600 permissions</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 
                         dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 
                         transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadMutation.isPending || !domain || !certificateFile || !privateKeyFile}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center gap-2"
              >
                {uploadMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent 
                                  rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Certificates
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}