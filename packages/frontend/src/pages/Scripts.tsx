import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scriptsApi } from '../api/scripts';
import ScriptLibraryModal from '../components/ScriptLibraryModal';
import ScriptExecutionsList from '../components/ScriptExecutionsList';
import type { Script } from '@gce-platform/types';

export default function Scripts() {
  const [activeTab, setActiveTab] = useState<'library' | 'executions'>('library');
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);

  const { data: scriptsData, isLoading: loadingScripts, refetch: refetchScripts } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  });

  const scripts = scriptsData?.data || [];

  const handleViewExecutions = (script: Script) => {
    setSelectedScript(script);
    setActiveTab('executions');
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
                <table className="min-w-full divide-y divide-te-gray-200 dark:divide-te-gray-700">
                  <thead className="bg-te-gray-50 dark:bg-te-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                        Tags
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                        Visibility
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                        Created By
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-te-gray-500 dark:text-te-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-te-gray-800 divide-y divide-te-gray-200 dark:divide-te-gray-700">
                    {scripts.map((script) => (
                      <tr key={script.id} className="hover:bg-te-gray-50 dark:hover:bg-te-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-te-gray-900 dark:text-te-gray-100">
                            {script.name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-te-gray-900 dark:text-te-gray-100 max-w-xs truncate">
                            {script.description || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {script.tags && script.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {script.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-te-gray-100 dark:bg-te-gray-700 text-te-gray-800 dark:text-te-gray-200"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-te-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            script.isPublic
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                              : 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300'
                          }`}>
                            {script.isPublic ? 'Public' : 'Private'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-te-gray-900 dark:text-te-gray-100">
                            {script.createdByUser?.email || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleViewExecutions(script)}
                            className="text-te-blue-600 dark:text-te-blue-400 hover:text-te-blue-900 dark:hover:text-te-blue-300 mr-3"
                          >
                            View Executions
                          </button>
                          <button
                            onClick={() => {
                              // Could implement edit functionality
                            }}
                            className="text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-200"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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