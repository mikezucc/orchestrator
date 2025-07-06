import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { scriptsApi } from '../api/scripts';
import { useToast } from '../contexts/ToastContext';
import type { CreateScriptRequest } from '@gce-platform/types';

interface SaveScriptDialogProps {
  scriptContent: string;
  defaultTimeout?: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function SaveScriptDialog({ scriptContent, defaultTimeout = 60, onClose, onSaved }: SaveScriptDialogProps) {
  const { showError, showSuccess } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timeout, setTimeout] = useState(defaultTimeout.toString());
  const [tags, setTags] = useState('');

  const saveMutation = useMutation({
    mutationFn: (data: CreateScriptRequest) => scriptsApi.create(data),
    onSuccess: () => {
      showSuccess('Script saved successfully');
      onSaved();
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to save script');
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      showError('Script name is required');
      return;
    }

    const tagList = tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    saveMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      scriptContent,
      timeout: parseInt(timeout) || 60,
      tags: tagList.length > 0 ? tagList : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-te-gray-900 rounded-lg max-w-md w-full p-6">
        <h2 className="text-lg font-semibold uppercase tracking-wider mb-4">Save Script to Library</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Script Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Update System Packages"
              className="w-full px-3 py-2 text-sm bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus:border-te-gray-500 dark:focus:border-te-yellow focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this script does..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus:border-te-gray-500 dark:focus:border-te-yellow focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="system, maintenance, backup (comma separated)"
              className="w-full px-3 py-2 text-sm bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus:border-te-gray-500 dark:focus:border-te-yellow focus:outline-none"
            />
            <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mt-1">
              Separate tags with commas
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
              Default Timeout (seconds)
            </label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout(e.target.value)}
              min="1"
              max="300"
              className="w-32 px-3 py-2 text-sm bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus:border-te-gray-500 dark:focus:border-te-yellow focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={saveMutation.isPending}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex items-center space-x-2"
            disabled={saveMutation.isPending || !name.trim()}
          >
            {saveMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
                </svg>
                <span>Save Script</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}