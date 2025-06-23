import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { useToast } from '../contexts/ToastContext';
import type { VirtualMachine } from '@gce-platform/types';

interface ExecuteScriptModalProps {
  vm: VirtualMachine;
  onClose: () => void;
}

export default function ExecuteScriptModal({ vm, onClose }: ExecuteScriptModalProps) {
  const { showError, showSuccess } = useToast();
  const [script, setScript] = useState('');
  const [timeout, setTimeout] = useState('60');
  const [output, setOutput] = useState<{ stdout: string; stderr: string; exitCode: number } | null>(null);

  const executeMutation = useMutation({
    mutationFn: () => {
      const timeoutSeconds = parseInt(timeout) || 60;
      return vmApi.executeScript(vm.id, { 
        script, 
        timeout: timeoutSeconds 
      });
    },
    onSuccess: (response) => {
      if (response.success && response.data) {
        setOutput(response.data);
        showSuccess('Script executed successfully');
      } else {
        showError(response.error || 'Failed to execute script');
      }
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to execute script');
    },
  });

  const handleExecute = () => {
    if (!script.trim()) {
      showError('Please enter a script to execute');
      return;
    }
    setOutput(null);
    executeMutation.mutate();
  };

  const handleClose = () => {
    if (executeMutation.isPending) {
      if (!confirm('Script is still executing. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
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
            <div>
              <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                Bash Script
              </label>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="#!/bin/bash&#10;echo 'Hello from VM'&#10;ls -la&#10;pwd"
                className="w-full h-64 px-3 py-2 text-sm bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus:border-te-gray-500 dark:focus:border-te-yellow focus:outline-none font-mono"
                disabled={executeMutation.isPending}
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

                {output.stdout && (
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                      Standard Output
                    </label>
                    <pre className="bg-te-gray-100 dark:bg-te-gray-950 p-3 text-xs overflow-x-auto font-mono rounded-lg whitespace-pre-wrap">
                      {output.stdout}
                    </pre>
                  </div>
                )}

                {output.stderr && (
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 mb-2">
                      Error Output
                    </label>
                    <pre className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 p-3 text-xs overflow-x-auto font-mono rounded-lg text-red-700 dark:text-red-400 whitespace-pre-wrap">
                      {output.stderr}
                    </pre>
                  </div>
                )}
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
    </div>
  );
}