import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi } from '../api/scripts';
import type { Script, CreateScriptRequest } from '@gce-platform/types';
import { useToast } from '../contexts/ToastContext';

interface ScriptLibraryModalProps {
  onClose: () => void;
  onSelectScript: (script: Script) => void;
  onSaveScript?: (script: CreateScriptRequest) => void;
  mode: 'select' | 'save' | 'both';
  initialScript?: { name: string; script: string; description?: string };
}

export default function ScriptLibraryModal({ 
  onClose, 
  onSelectScript, 
  onSaveScript,
  mode = 'select',
  initialScript 
}: ScriptLibraryModalProps) {
  const { showError, showSuccess } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<'library' | 'save'>(mode === 'save' ? 'save' : 'library');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  
  // Form state for saving new script
  const [newScript, setNewScript] = useState({
    name: initialScript?.name || '',
    description: initialScript?.description || '',
    scriptContent: initialScript?.script || '',
    tags: [] as string[],
    isPublic: false,
  });
  const [newTag, setNewTag] = useState('');

  // Fetch scripts
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  });

  // Filter scripts based on search
  const filteredScripts = scripts.filter(script => 
    script.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    script.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    script.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Create script mutation
  const createMutation = useMutation({
    mutationFn: scriptsApi.create,
    onSuccess: (newScript) => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
      showSuccess('Script saved to library');
      if (onSaveScript) {
        onSaveScript(newScript as any);
      }
      onClose();
    },
    onError: (error: any) => {
      showError(error.message || 'Failed to save script');
    },
  });

  // Delete script mutation
  const deleteMutation = useMutation({
    mutationFn: scriptsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
      showSuccess('Script deleted');
      setSelectedScript(null);
    },
    onError: (error: any) => {
      showError(error.message || 'Failed to delete script');
    },
  });

  const handleAddTag = () => {
    if (newTag.trim() && !newScript.tags.includes(newTag.trim())) {
      setNewScript({ ...newScript, tags: [...newScript.tags, newTag.trim()] });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setNewScript({ ...newScript, tags: newScript.tags.filter(t => t !== tag) });
  };

  const handleSaveScript = () => {
    if (!newScript.name.trim() || !newScript.scriptContent.trim()) {
      showError('Name and script content are required');
      return;
    }
    createMutation.mutate(newScript);
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-te-gray-200 dark:border-te-gray-800">
          <h2 className="text-lg font-semibold uppercase tracking-wider">Script Library</h2>
          <button
            onClick={onClose}
            className="p-1 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {mode === 'both' && (
          <div className="flex border-b border-te-gray-200 dark:border-te-gray-800">
            <button
              onClick={() => setSelectedTab('library')}
              className={`px-6 py-3 text-xs uppercase tracking-wider transition-colors ${
                selectedTab === 'library'
                  ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow'
                  : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
              }`}
            >
              Browse Library
            </button>
            <button
              onClick={() => setSelectedTab('save')}
              className={`px-6 py-3 text-xs uppercase tracking-wider transition-colors ${
                selectedTab === 'save'
                  ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow'
                  : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
              }`}
            >
              Save Script
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          {(selectedTab === 'library' && mode !== 'save') && (
            <div className="space-y-4">
              {/* Search bar */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search scripts by name, description, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10"
                />
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-te-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Scripts grid */}
              {isLoading ? (
                <div className="text-center py-8 text-te-gray-500">Loading scripts...</div>
              ) : filteredScripts.length === 0 ? (
                <div className="text-center py-8 text-te-gray-500">
                  {searchQuery ? 'No scripts found matching your search' : 'No scripts in library yet'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredScripts.map((script) => (
                    <div
                      key={script.id}
                      onClick={() => setSelectedScript(script)}
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedScript?.id === script.id
                          ? 'border-te-yellow bg-te-gray-100 dark:bg-te-gray-800'
                          : 'border-te-gray-200 dark:border-te-gray-700 hover:border-te-gray-400 dark:hover:border-te-gray-500'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm">{script.name}</h3>
                        {script.isPublic && (
                          <span className="text-2xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                            Public
                          </span>
                        )}
                      </div>
                      {script.description && (
                        <p className="text-xs text-te-gray-600 dark:text-te-gray-400 mb-2">
                          {script.description}
                        </p>
                      )}
                      {script.tags && script.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {script.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-2xs px-2 py-0.5 bg-te-gray-200 dark:bg-te-gray-700 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-2xs text-te-gray-500">
                        By {script.createdByUser?.email || 'Unknown'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected script preview */}
              {selectedScript && (
                <div className="mt-6 p-4 bg-te-gray-100 dark:bg-te-gray-900 rounded-lg">
                  <h4 className="font-semibold text-sm mb-2">Script Preview</h4>
                  <pre className="text-xs font-mono bg-white dark:bg-te-gray-800 p-3 rounded overflow-x-auto max-h-64">
                    {selectedScript.scriptContent}
                  </pre>
                  {selectedScript.createdBy === (window as any).userId && (
                    <button
                      onClick={() => {
                        if (confirm('Delete this script from your library?')) {
                          deleteMutation.mutate(selectedScript.id);
                        }
                      }}
                      className="mt-3 text-xs text-red-600 dark:text-te-orange hover:underline"
                    >
                      Delete Script
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {(selectedTab === 'save' && mode !== 'select') && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  Script Name *
                </label>
                <input
                  type="text"
                  value={newScript.name}
                  onChange={(e) => setNewScript({ ...newScript, name: e.target.value })}
                  className="w-full"
                  placeholder="e.g., Node.js Setup with PM2"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  Description
                </label>
                <textarea
                  value={newScript.description}
                  onChange={(e) => setNewScript({ ...newScript, description: e.target.value })}
                  className="w-full"
                  rows={2}
                  placeholder="Brief description of what this script does..."
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  Script Content *
                </label>
                <textarea
                  value={newScript.scriptContent}
                  onChange={(e) => setNewScript({ ...newScript, scriptContent: e.target.value })}
                  className="w-full font-mono text-xs"
                  rows={15}
                  placeholder="#!/bin/bash\n# Your script here..."
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                  Tags
                </label>
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    className="flex-1"
                    placeholder="Add a tag..."
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="btn-secondary text-xs"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {newScript.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-1 bg-te-gray-200 dark:bg-te-gray-700 rounded flex items-center space-x-1"
                    >
                      <span>{tag}</span>
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={newScript.isPublic}
                  onChange={(e) => setNewScript({ ...newScript, isPublic: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isPublic" className="text-sm">
                  Make this script public to all organization members
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t border-te-gray-200 dark:border-te-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          {selectedTab === 'library' && mode !== 'save' && (
            <button
              onClick={() => selectedScript && onSelectScript(selectedScript)}
              disabled={!selectedScript}
              className="btn-primary"
            >
              Use Selected Script
            </button>
          )}
          {selectedTab === 'save' && mode !== 'select' && (
            <button
              onClick={handleSaveScript}
              disabled={!newScript.name.trim() || !newScript.scriptContent.trim() || createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Saving...' : 'Save to Library'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}