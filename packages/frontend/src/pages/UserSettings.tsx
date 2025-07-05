import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { githubAuthApi, GitHubStatus } from '../api/github-auth';
import { sshKeysApi, SSHKey } from '../api/ssh-keys';
import { useToast } from '../contexts/ToastContext';
import { Github, Key, Trash2, Download, Copy, Plus, X } from 'lucide-react';

export default function UserSettings() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showGenerateKey, setShowGenerateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [privateKey, setPrivateKey] = useState('');

  // Fetch GitHub connection status
  const { data: githubStatus, isLoading: githubLoading } = useQuery({
    queryKey: ['github-status'],
    queryFn: githubAuthApi.getStatus,
  });

  // Fetch SSH keys
  const { data: sshKeys, isLoading: keysLoading } = useQuery({
    queryKey: ['ssh-keys'],
    queryFn: sshKeysApi.list,
  });

  // Disconnect GitHub mutation
  const disconnectGitHub = useMutation({
    mutationFn: githubAuthApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-status'] });
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      showToast('GitHub account disconnected', 'success');
    },
    onError: () => {
      showToast('Failed to disconnect GitHub account', 'error');
    },
  });

  // Generate SSH key mutation
  const generateKey = useMutation({
    mutationFn: (name: string) => sshKeysApi.generate(name),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      setPrivateKey(data.privateKey);
      showToast('SSH key generated successfully', 'success');
    },
    onError: () => {
      showToast('Failed to generate SSH key', 'error');
    },
  });

  // Delete SSH key mutation
  const deleteKey = useMutation({
    mutationFn: sshKeysApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      showToast('SSH key deleted', 'success');
    },
    onError: () => {
      showToast('Failed to delete SSH key', 'error');
    },
  });

  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) {
      showToast('Please enter a key name', 'error');
      return;
    }
    await generateKey.mutateAsync(newKeyName);
    setNewKeyName('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  const downloadPrivateKey = () => {
    const blob = new Blob([privateKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${newKeyName || 'id_rsa'}.pem`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-2">User Settings</h2>
        <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
          Manage your account connections and SSH keys
        </p>
      </div>

      {/* GitHub Connection Section */}
      <div className="border border-te-gray-300 dark:border-te-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Github className="h-6 w-6" />
            <h3 className="text-lg font-medium">GitHub Connection</h3>
          </div>
        </div>

        {githubLoading ? (
          <div className="text-sm text-te-gray-500">Loading...</div>
        ) : githubStatus?.connected ? (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    Connected to GitHub
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {githubStatus.username && `@${githubStatus.username}`}
                    {githubStatus.email && ` (${githubStatus.email})`}
                  </p>
                </div>
                <button
                  onClick={() => disconnectGitHub.mutate()}
                  disabled={disconnectGitHub.isPending}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
            <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
              Your GitHub account is connected. This allows you to use GitHub SSH authentication when executing scripts on VMs.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-te-gray-600 dark:text-te-gray-400">
              Connect your GitHub account to enable SSH authentication for private repositories when executing scripts on VMs.
            </p>
            <button
              onClick={() => githubAuthApi.connect()}
              className="px-4 py-2 text-sm bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 rounded-lg hover:bg-te-gray-800 dark:hover:bg-te-yellow/90 transition-colors"
            >
              Connect GitHub Account
            </button>
          </div>
        )}
      </div>

      {/* SSH Keys Section */}
      <div className="border border-te-gray-300 dark:border-te-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Key className="h-6 w-6" />
            <h3 className="text-lg font-medium">SSH Keys</h3>
          </div>
          <button
            onClick={() => setShowGenerateKey(true)}
            className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 rounded-lg hover:bg-te-gray-800 dark:hover:bg-te-yellow/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Generate Key</span>
          </button>
        </div>

        {keysLoading ? (
          <div className="text-sm text-te-gray-500">Loading...</div>
        ) : sshKeys && sshKeys.length > 0 ? (
          <div className="space-y-3">
            {sshKeys.map((key: SSHKey) => (
              <div
                key={key.id}
                className="border border-te-gray-200 dark:border-te-gray-800 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-medium">{key.name}</h4>
                      {key.source === 'github' && (
                        <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                          GitHub
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-te-gray-500 dark:text-te-gray-600 mt-1 font-mono">
                      {key.fingerprint}
                    </p>
                    <p className="text-xs text-te-gray-500 dark:text-te-gray-600 mt-1">
                      Created: {new Date(key.createdAt).toLocaleDateString()}
                      {key.lastUsedAt && ` • Last used: ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyToClipboard(key.publicKey)}
                      className="p-2 text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-100 transition-colors"
                      title="Copy public key"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {key.source !== 'github' && (
                      <button
                        onClick={() => deleteKey.mutate(key.id)}
                        className="p-2 text-red-600 hover:text-red-700 transition-colors"
                        title="Delete key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-te-gray-500 dark:text-te-gray-600">
            No SSH keys found. Generate a key or connect your GitHub account.
          </p>
        )}
      </div>

      {/* Generate SSH Key Modal */}
      {showGenerateKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-te-gray-900 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Generate SSH Key</h3>
              <button
                onClick={() => {
                  setShowGenerateKey(false);
                  setNewKeyName('');
                  setPrivateKey('');
                }}
                className="p-1 hover:bg-te-gray-100 dark:hover:bg-te-gray-800 rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!privateKey ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., My Laptop"
                    className="w-full px-3 py-2 border border-te-gray-300 dark:border-te-gray-700 rounded-lg bg-white dark:bg-te-gray-800 focus:outline-none focus:ring-2 focus:ring-te-yellow"
                  />
                </div>
                <button
                  onClick={handleGenerateKey}
                  disabled={generateKey.isPending}
                  className="w-full px-4 py-2 bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 rounded-lg hover:bg-te-gray-800 dark:hover:bg-te-yellow/90 disabled:opacity-50 transition-colors"
                >
                  {generateKey.isPending ? 'Generating...' : 'Generate Key'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    Important: Save your private key
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    This is the only time you'll be able to download the private key. Keep it secure!
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Private Key
                  </label>
                  <div className="relative">
                    <textarea
                      value={privateKey}
                      readOnly
                      className="w-full h-32 px-3 py-2 font-mono text-xs border border-te-gray-300 dark:border-te-gray-700 rounded-lg bg-te-gray-50 dark:bg-te-gray-800"
                    />
                    <button
                      onClick={() => copyToClipboard(privateKey)}
                      className="absolute top-2 right-2 p-2 bg-white dark:bg-te-gray-700 rounded hover:bg-te-gray-100 dark:hover:bg-te-gray-600 transition-colors"
                      title="Copy to clipboard"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={downloadPrivateKey}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-te-gray-900 dark:bg-te-yellow text-white dark:text-te-gray-900 rounded-lg hover:bg-te-gray-800 dark:hover:bg-te-yellow/90 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Private Key</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}