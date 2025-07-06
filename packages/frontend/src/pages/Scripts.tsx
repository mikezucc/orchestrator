import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scriptsApi } from '../api/scripts';
import ScriptLibraryModal from '../components/ScriptLibraryModal';
import ScriptExecutionsList from '../components/ScriptExecutionsList';
import type { Script } from '@gce-platform/types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function Scripts() {
  const [activeTab, setActiveTab] = useState<'library' | 'executions'>('library');
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());

  const { data: scriptsData, isLoading: loadingScripts, refetch: refetchScripts } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  });

  const scripts = scriptsData?.data || [];

  const handleViewExecutions = (script: Script) => {
    setSelectedScript(script);
    setActiveTab('executions');
  };

  const toggleExpanded = (scriptId: string) => {
    setExpandedScripts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scriptId)) {
        newSet.delete(scriptId);
      } else {
        newSet.add(scriptId);
      }
      return newSet;
    });
  };

  const getScriptPreview = (scriptContent: string, isExpanded: boolean) => {
    const lines = scriptContent.split('\n');
    if (!isExpanded && lines.length > 20) {
      return lines.slice(0, 20).join('\n');
    }
    return scriptContent;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-te-gray-900 dark:text-te-gray-100">
          Scripts & Execution History
        </h1>
        <p className="mt-2 text-sm text-te-gray-600 dark:text-te-gray-400">
          Manage your script library and view execution history
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-te-gray-800 rounded-lg shadow">
        <div className="border-b border-te-gray-200 dark:border-te-gray-700">
          <div className="flex">
            <button
              onClick={() => {
                setActiveTab('library');
                setSelectedScript(null);
              }}
              className={`px-6 py-4 text-sm font-medium uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === 'library'
                  ? 'border-te-yellow text-te-gray-900 dark:text-te-yellow'
                  : 'border-transparent text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-300'
              }`}
            >
              Script Library
            </button>
            <button
              onClick={() => setActiveTab('executions')}
              className={`px-6 py-4 text-sm font-medium uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === 'executions'
                  ? 'border-te-yellow text-te-gray-900 dark:text-te-yellow'
                  : 'border-transparent text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-300'
              }`}
            >
              All Executions
              {selectedScript && (
                <span className="ml-2 text-xs text-te-gray-500">
                  ({selectedScript.name})
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'library' ? (
          <div>
            <div className="p-6 border-b border-te-gray-200 dark:border-te-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Your Scripts</h2>
                <button
                  onClick={() => setShowScriptModal(true)}
                  className="btn-primary"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Script
                </button>
              </div>
            </div>

            {loadingScripts ? (
              <div className="p-6 text-center">
                <div className="inline-flex items-center space-x-2 text-te-gray-600 dark:text-te-gray-400">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Loading scripts...</span>
                </div>
              </div>
            ) : scripts.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="w-12 h-12 mx-auto mb-4 text-te-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-sm font-medium text-te-gray-900 dark:text-te-gray-100 mb-2">
                  No scripts yet
                </h3>
                <p className="text-sm text-te-gray-500 dark:text-te-gray-400">
                  Create your first script to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="divide-y divide-te-gray-200 dark:divide-te-gray-700">
                  {scripts.map((script: Script) => {
                    const isExpanded = expandedScripts.has(script.id);
                    const scriptLines = script.scriptContent.split('\n').length;
                    const showExpandButton = scriptLines > 20;
                    
                    return (
                      <div key={script.id} className="p-6 hover:bg-te-gray-50 dark:hover:bg-te-gray-700">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-semibold text-te-gray-900 dark:text-te-gray-100">
                                {script.name}
                              </h3>
                              {script.tags && script.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {script.tags.map((tag: string) => (
                                    <span
                                      key={tag}
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-te-gray-100 dark:bg-te-gray-700 text-te-gray-800 dark:text-te-gray-200"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {script.description && (
                              <p className="text-sm text-te-gray-600 dark:text-te-gray-400 mt-1">
                                {script.description}
                              </p>
                            )}
                            <p className="text-xs text-te-gray-500 dark:text-te-gray-500 mt-1">
                              Created by {script.createdByUser?.email || 'Unknown'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewExecutions(script)}
                              className="text-sm text-te-blue-600 dark:text-te-blue-400 hover:text-te-blue-900 dark:hover:text-te-blue-300"
                            >
                              View Executions
                            </button>
                            <button
                              onClick={() => {
                                // Could implement edit functionality
                              }}
                              className="text-sm text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-200"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        
                        <div className="relative mt-4">
                          <div className="rounded-lg overflow-hidden bg-gray-900">
                            <SyntaxHighlighter
                              language="bash"
                              style={oneDark}
                              customStyle={{
                                margin: 0,
                                fontSize: '0.875rem',
                                maxHeight: isExpanded ? 'none' : '400px',
                              }}
                              showLineNumbers
                            >
                              {getScriptPreview(script.scriptContent, isExpanded)}
                            </SyntaxHighlighter>
                          </div>
                          {showExpandButton && !isExpanded && (
                            <div className="absolute bottom-0 left-0 right-0">
                              <div className="h-20 bg-gradient-to-t from-gray-900 to-transparent" />
                              <button
                                onClick={() => toggleExpanded(script.id)}
                                className="absolute bottom-0 left-0 right-0 bg-gray-900 text-white text-sm py-2 text-center hover:underline"
                              >
                                Show more ({scriptLines} lines)
                              </button>
                            </div>
                          )}
                          {isExpanded && showExpandButton && (
                            <button
                              onClick={() => toggleExpanded(script.id)}
                              className="mt-2 text-sm text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-200"
                            >
                              Show less
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <ScriptExecutionsList 
            scriptId={selectedScript?.id}
            title={selectedScript ? `Executions for "${selectedScript.name}"` : 'All Script Executions'}
          />
        )}
      </div>

      {showScriptModal && (
        <ScriptLibraryModal
          mode="save"
          onClose={() => setShowScriptModal(false)}
          onSelectScript={() => {}}
          onSaveScript={() => {
            refetchScripts();
            setShowScriptModal(false);
          }}
        />
      )}
    </div>
  );
}