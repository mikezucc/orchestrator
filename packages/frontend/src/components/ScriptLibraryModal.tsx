import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi } from '../api/scripts';
import type { Script, CreateScriptRequest } from '@gce-platform/types';
import { useToast } from '../contexts/ToastContext';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ScriptEditor from './ScriptEditor';

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
  });
  const [newTag, setNewTag] = useState('');

  // Fetch scripts
  const { data: scriptsData, isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  });
  
  const scripts = scriptsData?.data || [];

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
              Library
            </button>
            <button
              onClick={() => setSelectedTab('save')}
              className={`px-6 py-3 text-xs uppercase tracking-wider transition-colors ${
                selectedTab === 'save'
                  ? 'text-te-gray-900 dark:text-te-yellow border-b-2 border-te-gray-900 dark:border-te-yellow'
                  : 'text-te-gray-600 dark:text-te-gray-500 hover:text-te-gray-900 dark:hover:text-te-gray-100'
              }`}
            >
              Create New
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {(selectedTab === 'library' && mode !== 'save') && (
            <div className="flex h-full">
              {/* Left side - Script list */}
              <div className="w-1/3 border-r border-te-gray-200 dark:border-te-gray-800 overflow-y-auto">
                <div className="p-4 space-y-4">
                  {/* Search bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search scripts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 text-sm"
                    />
                    {/* <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-te-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg> */}
                  </div>

                  {/* Scripts list */}
                  {isLoading ? (
                    <div className="text-center py-8 text-te-gray-500 text-sm">Loading scripts...</div>
                  ) : filteredScripts.length === 0 ? (
                    <div className="text-center py-8 text-te-gray-500 text-sm">
                      {searchQuery ? 'No scripts found' : 'No scripts in library yet'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredScripts.map((script) => (
                        <div
                          key={script.id}
                          onClick={() => setSelectedScript(script)}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${
                            selectedScript?.id === script.id
                              ? 'border-te-yellow bg-te-gray-100 dark:bg-te-gray-800'
                              : 'border-te-gray-200 dark:border-te-gray-700 hover:border-te-gray-400 dark:hover:border-te-gray-500'
                          }`}
                        >
                          <h3 className="font-semibold text-sm truncate">{script.name}</h3>
                          {script.description && (
                            <p className="text-xs text-te-gray-600 dark:text-te-gray-400 mt-1 truncate">
                              {script.description}
                            </p>
                          )}
                          {script.tags && script.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {script.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-2xs px-1.5 py-0.5 bg-te-gray-200 dark:bg-te-gray-700 rounded truncate max-w-[80px]"
                                >
                                  {tag}
                                </span>
                              ))}
                              {script.tags.length > 2 && (
                                <span className="text-2xs text-te-gray-500">
                                  +{script.tags.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right side - Script details */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedScript ? (
                  <div className="flex flex-col h-full">
                    {/* Header section - fixed */}
                    <div className="p-6 pb-4">
                      <h2 className="text-lg font-semibold">{selectedScript.name}</h2>
                      {selectedScript.description && (
                        <p className="text-sm text-te-gray-600 dark:text-te-gray-400 mt-1">
                          {selectedScript.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <p className="text-xs text-te-gray-500">
                          By {selectedScript.createdByUser?.email || 'Unknown'}
                        </p>
                        {selectedScript.tags && selectedScript.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {selectedScript.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-2xs px-2 py-0.5 bg-te-gray-200 dark:bg-te-gray-700 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Content section - scrollable */}
                    <div className="flex-1 px-6 pb-6 overflow-y-scroll">
                      <div className="rounded overflow-x-scroll">
                        <SyntaxHighlighter
                          language="bash"
                          style={oneDark}
                          customStyle={{
                            margin: 0,
                            fontSize: '0.75rem',
                            minHeight: '100%'
                          }}
                        >
                          {selectedScript.scriptContent}
                        </SyntaxHighlighter>
                      </div>
                      
                      {selectedScript.createdBy === (window as any).userId && (
                        <button
                          onClick={() => {
                            if (confirm('Delete this script from your library?')) {
                              deleteMutation.mutate(selectedScript.id);
                            }
                          }}
                          className="mt-4 text-xs text-red-600 dark:text-te-orange hover:underline"
                        >
                          Delete Script
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-te-gray-500">
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto mb-4 text-te-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">Select a script to view details</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(selectedTab === 'save' && mode !== 'select') && (
            <div className="p-6 space-y-4">
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
                <ScriptEditor
                  value={newScript.scriptContent}
                  onChange={(code) => setNewScript({ ...newScript, scriptContent: code })}
                  placeholder="#!/bin/bash\n# Your script here..."
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