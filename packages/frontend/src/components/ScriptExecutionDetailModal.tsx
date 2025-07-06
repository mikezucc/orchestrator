import { useState, useMemo } from 'react';
import type { ScriptExecution } from '@gce-platform/types';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import Convert from 'ansi-to-html';

SyntaxHighlighter.registerLanguage('bash', bash);

interface ScriptExecutionDetailModalProps {
  execution: ScriptExecution;
  onClose: () => void;
}

export default function ScriptExecutionDetailModal({ execution, onClose }: ScriptExecutionDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'script' | 'output' | 'metadata'>('output');
  const [showFullScript, setShowFullScript] = useState(false);

  // Helper function to clean ANSI sequences that ansi-to-html doesn't handle
  const cleanAnsiOutput = (text: string): string => {
    return text
      // Remove bracketed paste mode sequences
      .replace(/\x1b\[\?2004[lh]/g, '')
      // Remove other problematic escape sequences
      .replace(/\x1b\]0;[^\x07]*\x07/g, '') // Terminal title sequences
      .replace(/\x1b\[\?[\d;]*[a-zA-Z]/g, '') // Other mode sequences
      .replace(/\x1b\[[\d;]*[GHf]/g, '') // Cursor positioning
      .replace(/\x1b\[[\d;]*[ABCD]/g, '') // Cursor movement
      .replace(/\x1b\[[\d;]*[su]/g, '') // Save/restore cursor
      .replace(/\x1b\[\d*[JK]/g, '') // Clear screen/line
      .replace(/\x1b\[=\d*[lh]/g, '') // Screen modes
      .replace(/\x1b\[\?\d+[lh]/g, ''); // Private mode sequences
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 dark:text-blue-400';
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      case 'cancelled':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const formatDuration = (ms?: number | null) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-te-gray-200 dark:border-te-gray-800">
          <div>
            <h2 className="text-lg font-semibold uppercase tracking-wider">
              Script Execution Details
            </h2>
            <div className="mt-2 flex items-center gap-4 text-sm">
              <span className={`font-medium ${getStatusColor(execution.status)}`}>
                {execution.status.toUpperCase()}
              </span>
              {execution.exitCode !== null && execution.exitCode !== undefined && (
                <span className="text-te-gray-600 dark:text-te-gray-400">
                  Exit Code: {execution.exitCode}
                </span>
              )}
              <span className="text-te-gray-600 dark:text-te-gray-400">
                Duration: {formatDuration(execution.durationMs)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Execution Info */}
        <div className="p-6 border-b border-te-gray-200 dark:border-te-gray-800 bg-te-gray-50 dark:bg-te-gray-900">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-te-gray-600 dark:text-te-gray-400">Script Name:</span>
              <div className="font-medium">{execution.scriptName}</div>
            </div>
            <div>
              <span className="text-te-gray-600 dark:text-te-gray-400">Type:</span>
              <div className="font-medium capitalize">{execution.executionType}</div>
            </div>
            <div>
              <span className="text-te-gray-600 dark:text-te-gray-400">Started:</span>
              <div className="font-medium">{new Date(execution.startedAt).toLocaleString()}</div>
            </div>
            <div>
              <span className="text-te-gray-600 dark:text-te-gray-400">Executed By:</span>
              <div className="font-medium">{execution.executedByUser?.email || execution.executedBy}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-te-gray-200 dark:border-te-gray-800">
          <button
            onClick={() => setActiveTab('output')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'output'
                ? 'border-te-yellow text-te-gray-900 dark:text-te-yellow'
                : 'border-transparent text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-300'
            }`}
          >
            Output Logs
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'script'
                ? 'border-te-yellow text-te-gray-900 dark:text-te-yellow'
                : 'border-transparent text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-300'
            }`}
          >
            Script Content
          </button>
          {execution.metadata && (
            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'metadata'
                  ? 'border-te-yellow text-te-gray-900 dark:text-te-yellow'
                  : 'border-transparent text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-300'
              }`}
            >
              Metadata
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'output' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium uppercase tracking-wider text-te-gray-700 dark:text-te-gray-300">
                  Execution Output
                </h3>
                <button
                  onClick={() => copyToClipboard(execution.logOutput || '')}
                  className="text-xs text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              
              {execution.logOutput ? (
                <div className="bg-te-gray-900 dark:bg-black rounded-lg overflow-hidden">
                  <pre 
                    className="p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto"
                    dangerouslySetInnerHTML={{
                      __html: useMemo(() => {
                        const convert = new Convert({
                          fg: '#10b981',
                          bg: '#111827',
                          newline: true,
                          escapeXML: true,
                          stream: true
                        });
                        const cleanedOutput = cleanAnsiOutput(execution.logOutput);
                        return convert.toHtml(cleanedOutput);
                      }, [execution.logOutput])
                    }}
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-te-gray-500 dark:text-te-gray-400">
                  No output captured
                </div>
              )}

              {execution.errorOutput && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-red-700 dark:text-red-400 mb-4">
                    Error Output
                  </h3>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                    <pre 
                      className="p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto"
                      dangerouslySetInnerHTML={{
                        __html: useMemo(() => {
                          const convert = new Convert({
                            fg: '#dc2626',
                            bg: '#7f1d1d',
                            newline: true,
                            escapeXML: true,
                            stream: true
                          });
                          const cleanedOutput = cleanAnsiOutput(execution.errorOutput);
                          return convert.toHtml(cleanedOutput);
                        }, [execution.errorOutput])
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'script' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium uppercase tracking-wider text-te-gray-700 dark:text-te-gray-300">
                  Script Content
                </h3>
                <div className="flex items-center gap-2">
                  {execution.scriptContent.length > 1000 && (
                    <button
                      onClick={() => setShowFullScript(!showFullScript)}
                      className="text-xs text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors"
                    >
                      {showFullScript ? 'Show Less' : 'Show Full Script'}
                    </button>
                  )}
                  <button
                    onClick={() => copyToClipboard(execution.scriptContent)}
                    className="text-xs text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                </div>
              </div>
              
              <div className="rounded-lg overflow-hidden">
                <SyntaxHighlighter
                  language="bash"
                  style={atomOneDark}
                  customStyle={{
                    fontSize: '0.75rem',
                    padding: '1rem',
                    margin: 0,
                    maxHeight: showFullScript ? 'none' : '400px',
                    overflow: 'auto'
                  }}
                >
                  {execution.scriptContent}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {activeTab === 'metadata' && execution.metadata && (
            <div>
              <h3 className="text-sm font-medium uppercase tracking-wider text-te-gray-700 dark:text-te-gray-300 mb-4">
                Execution Metadata
              </h3>
              <div className="bg-te-gray-100 dark:bg-te-gray-900 rounded-lg p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(execution.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-te-gray-200 dark:border-te-gray-800">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}