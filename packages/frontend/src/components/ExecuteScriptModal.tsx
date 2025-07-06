import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { useToast } from '../contexts/ToastContext';
import type { VirtualMachine, Script } from '@gce-platform/types';
import AnsiToHtml from 'ansi-to-html';
import ScriptLibraryDropdown from './ScriptLibraryDropdown';
import SaveScriptDialog from './SaveScriptDialog';
import ScriptEditor from './ScriptEditor';
import '../styles/terminal.css';

interface ExecuteScriptModalProps {
  vm: VirtualMachine;
  onClose: () => void;
  output: { stdout: string; stderr: string; exitCode: number; sessionId?: string; timestamp?: Date } | null;
  setOutput: (output: { stdout: string; stderr: string; exitCode: number; sessionId?: string; timestamp?: Date } | null) => void;
}

export default function ExecuteScriptModal({ vm, onClose, output, setOutput }: ExecuteScriptModalProps) {
  const { showError, showSuccess } = useToast();
  const [script, setScript] = useState('');
  const [timeout, setTimeout] = useState('60');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [loadedScript, setLoadedScript] = useState<Script | null>(null);

  // Initialize ANSI to HTML converter
  const ansiConverter = useMemo(() => new AnsiToHtml({
    fg: '#e5e7eb', // gray-200
    bg: '#111827', // gray-900
    newline: true,
    escapeXML: true,
    stream: true
  }), []);

  // Function to clean terminal control sequences
  const cleanTerminalOutput = (text: string): string => {
    if (!text) return '';
    
    // Remove common terminal control sequences that ansi-to-html doesn't handle
    /* eslint-disable no-control-regex */
    return text
      .replace(/\x1b\[\?2004[lh]/g, '') // Remove bracketed paste mode
      .replace(/\x1b\[([0-9]+)?[GK]/g, '') // Remove cursor positioning (G: move to column, K: clear line)
      .replace(/\x1b\[\d*[JH]/g, '') // Remove clear screen and cursor home
      .replace(/\x1b\[[\d;]*[fl]/g, '') // Remove cursor save/restore
      .replace(/\x1b\[\?\d+[hl]/g, '') // Remove DEC private mode set/reset
      .replace(/\x1b\]0;[^\x07]*\x07/g, '') // Remove terminal title sequences
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, (match) => {
        // Preserve color codes but remove other escape sequences
        if (match.match(/\x1b\[[0-9;]*m/)) {
          return match; // Keep color codes
        }
        return ''; // Remove other sequences
      })
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n'); // Handle carriage returns
    /* eslint-enable no-control-regex */
  };

  const executeMutation = useMutation({
    mutationFn: async () => {
      const timeoutSeconds = parseInt(timeout) || 60;
      const response = await vmApi.executeScript(vm.id, { 
        script, 
        timeout: timeoutSeconds 
      });
      
      // Store sessionId immediately when we get it
      if (response.success && response.data?.sessionId) {
        setCurrentSessionId(response.data.sessionId);
      }
      
      return response;
    },
    onSuccess: (response) => {
      if (response.success && response.data) {
        setOutput({
          ...response.data,
          timestamp: new Date()
        });
        setCurrentSessionId(null); // Clear session ID after completion
        showSuccess('Script executed successfully');
      } else {
        showError(response.error || 'Failed to execute script');
        setCurrentSessionId(null);
      }
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to execute script');
      setCurrentSessionId(null);
    },
  });

  const abortMutation = useMutation({
    mutationFn: (sessionId: string) => {
      return vmApi.abortExecution(vm.id, sessionId);
    },
    onSuccess: (response) => {
      if (response.success) {
        showSuccess('Execution aborted');
        setCurrentSessionId(null);
        executeMutation.reset(); // Reset the execution mutation state
      } else {
        showError(response.error || 'Failed to abort execution');
      }
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to abort execution');
    },
  });

  const handleExecute = () => {
    if (!script.trim()) {
      showError('Please enter a script to execute');
      return;
    }
    // Don't clear output - preserve it across re-renders
    executeMutation.mutate();
  };

  const handleAbort = () => {
    if (currentSessionId) {
      abortMutation.mutate(currentSessionId);
    }
  };

  const handleClose = () => {
    if (executeMutation.isPending) {
      if (!confirm('Script is still executing. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  };

  const handleSelectScript = (selectedScript: Script) => {
    setScript(selectedScript.scriptContent);
    setTimeout(selectedScript.timeout.toString());
    setLoadedScript(selectedScript);
    showSuccess(`Loaded script: ${selectedScript.name}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-te-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-te-gray-200 dark:border-te-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold uppercase tracking-wider">Execute Script on {vm.name}</h2>
            <button
              onClick={handleClose}
              className="text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <ScriptLibraryDropdown onSelectScript={handleSelectScript} />
                <button
                  onClick={() => setShowSaveDialog(true)}
                  disabled={!script.trim() || executeMutation.isPending}
                  className="btn-secondary flex items-center space-x-2"
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
                  </svg>
                  <span>Save to Library</span>
                </button>
              </div>
              {loadedScript && (
                <div className="text-sm text-te-gray-600 dark:text-te-gray-400">
                  Loaded: <span className="font-medium">{loadedScript.name}</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                Bash Script
              </label>
              <ScriptEditor
                value={script}
                onChange={setScript}
                placeholder="#!/bin/bash\necho 'Hello from VM'\nls -la\npwd"
                minHeight="16rem"
                readOnly={executeMutation.isPending}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(e.target.value)}
                min="1"
                max="300"
                className="w-32 px-3 py-2 text-sm bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus:border-te-gray-500 dark:focus:border-te-yellow focus:outline-none"
                disabled={executeMutation.isPending}
              />
              <p className="text-xs text-te-gray-600 dark:text-te-gray-500 mt-1">
                Maximum execution time (1-300 seconds)
              </p>
            </div>

            {output && (
              <div className="space-y-4 pt-4 border-t border-te-gray-200 dark:border-te-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider">Output</h3>
                    <span className={`text-xs px-2 py-1 rounded ${
                      output.exitCode === 0 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      Exit Code: {output.exitCode}
                    </span>
                  </div>
                  {output.timestamp && (
                    <span className="text-xs text-te-gray-600 dark:text-te-gray-400">
                      Executed at {new Date(output.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {/* Combined Console Output - Always shown */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400">
                      Console Output
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setOutput(null)}
                        className="text-xs text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-800 dark:hover:text-te-gray-200"
                        title="Clear output"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          const fullOutput = [output.stdout, output.stderr].filter(Boolean).join('\n');
                          if (fullOutput) {
                            navigator.clipboard.writeText(fullOutput);
                            showSuccess('Output copied to clipboard');
                          }
                        }}
                        className="text-xs text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-800 dark:hover:text-te-gray-200"
                        title="Copy output to clipboard"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-900 dark:bg-black p-4 rounded-lg overflow-auto max-h-96">
                    <div className="terminal-output text-xs font-mono whitespace-pre-wrap">
                      {output.stdout ? (
                        <div 
                          className="text-gray-100"
                          dangerouslySetInnerHTML={{ 
                            __html: ansiConverter.toHtml(cleanTerminalOutput(output.stdout)) 
                          }}
                        />
                      ) : null}
                      {output.stdout && output.stderr ? '\n' : null}
                      {output.stderr ? (
                        <div 
                          className="text-red-400"
                          dangerouslySetInnerHTML={{ 
                            __html: ansiConverter.toHtml(cleanTerminalOutput(output.stderr)) 
                          }}
                        />
                      ) : null}
                      {!output.stdout && !output.stderr ? (
                        <span className="text-gray-500 italic">No output produced</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Separate stdout/stderr sections for detailed view */}
                <details className="group">
                  <summary className="cursor-pointer text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-800 dark:hover:text-te-gray-200">
                    View Separated Output Streams
                  </summary>
                  <div className="mt-4 space-y-4">
                    {output.stdout && (
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                          Standard Output (stdout)
                        </label>
                        <div 
                          className="terminal-output bg-te-gray-100 dark:bg-te-gray-950 p-3 text-xs overflow-x-auto font-mono rounded-lg whitespace-pre-wrap max-h-64 overflow-y-auto"
                          dangerouslySetInnerHTML={{ 
                            __html: ansiConverter.toHtml(cleanTerminalOutput(output.stdout)) 
                          }}
                        />
                      </div>
                    )}

                    {output.stderr && (
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                          Error Output (stderr)
                        </label>
                        <div 
                          className="terminal-output bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 p-3 text-xs overflow-x-auto font-mono rounded-lg text-red-700 dark:text-red-400 whitespace-pre-wrap max-h-64 overflow-y-auto"
                          dangerouslySetInnerHTML={{ 
                            __html: ansiConverter.toHtml(cleanTerminalOutput(output.stderr)) 
                          }}
                        />
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-te-gray-200 dark:border-te-gray-800 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="btn-secondary"
            disabled={executeMutation.isPending}
          >
            Close
          </button>
          {executeMutation.isPending && currentSessionId ? (
            <button
              onClick={handleAbort}
              className="btn-secondary flex items-center space-x-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              disabled={abortMutation.isPending}
            >
              {abortMutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Aborting...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Abort Execution</span>
                </>
              )}
            </button>
          ) : null}
          <button
            onClick={handleExecute}
            className="btn-primary flex items-center space-x-2"
            disabled={executeMutation.isPending || !script.trim()}
          >
            {executeMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Executing...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Execute Script</span>
              </>
            )}
          </button>
        </div>
      </div>

      {showSaveDialog && (
        <SaveScriptDialog
          scriptContent={script}
          defaultTimeout={parseInt(timeout) || 60}
          onClose={() => setShowSaveDialog(false)}
          onSaved={() => {
            setShowSaveDialog(false);
            showSuccess('Script saved to library');
          }}
        />
      )}
    </div>
  );
}