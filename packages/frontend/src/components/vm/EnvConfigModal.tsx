import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, FileText, Plus, Trash2, Save, AlertCircle, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { vmApi } from '../../api/vms';
import { useMutation } from '@tanstack/react-query';
import AnsiToHtml from 'ansi-to-html';
import '../../styles/terminal.css';

interface EnvVariable {
  id: string;
  key: string;
  value: string;
  isSecret?: boolean;
}

interface EnvFile {
  id: string;
  path: string;
  variables: EnvVariable[];
  isExpanded: boolean;
  description?: string;
}

interface EnvConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmId: string;
  vmName: string;
  onSuccess?: () => void;
}

// Parse .env file content to extract variables
const parseEnvContent = (content: string): EnvVariable[] => {
  const variables: EnvVariable[] = [];
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    // Skip empty lines and comments
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }
    
    // Parse KEY=VALUE format
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      const cleanValue = value.replace(/^["'](.*)["']$/, '$1');
      
      variables.push({
        id: `var-${Date.now()}-${index}`,
        key,
        value: cleanValue,
        isSecret: key.toLowerCase().includes('secret') || 
                 key.toLowerCase().includes('password') || 
                 key.toLowerCase().includes('key') ||
                 key.toLowerCase().includes('token')
      });
    }
  });
  
  return variables;
};

// Generate .env file content from variables
const generateEnvContent = (variables: EnvVariable[]): string => {
  return variables
    .filter(v => v.key.trim())
    .map(v => {
      // Add quotes if value contains spaces or special characters
      const needsQuotes = v.value.includes(' ') || v.value.includes('#') || v.value.includes('$');
      const value = needsQuotes ? `"${v.value}"` : v.value;
      return `${v.key}=${value}`;
    })
    .join('\n');
};

export function EnvConfigModal({ isOpen, onClose, vmId, vmName, onSuccess }: EnvConfigModalProps) {
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([
    {
      id: `file-${Date.now()}`,
      path: '/home/ubuntu/app/.env',
      variables: [
        { id: `var-${Date.now()}`, key: 'NODE_ENV', value: 'production' },
        { id: `var-${Date.now()}-1`, key: 'PORT', value: '3000' }
      ],
      isExpanded: true,
      description: 'Application environment variables'
    }
  ]);
  const [output, setOutput] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({});

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
      .replace(/\x1b\[([0-9]+)?[GK]/g, '') // Remove cursor positioning
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

  // File management functions
  const addEnvFile = () => {
    const newFile: EnvFile = {
      id: `file-${Date.now()}`,
      path: '/home/ubuntu/.env',
      variables: [{ id: `var-${Date.now()}`, key: '', value: '' }],
      isExpanded: true
    };
    setEnvFiles([...envFiles, newFile]);
  };

  const removeEnvFile = (id: string) => {
    if (envFiles.length > 1) {
      setEnvFiles(envFiles.filter(file => file.id !== id));
    } else {
      toast.error('At least one environment file is required');
    }
  };

  const updateEnvFile = (id: string, updates: Partial<EnvFile>) => {
    setEnvFiles(envFiles.map(file => 
      file.id === id ? { ...file, ...updates } : file
    ));
  };

  const toggleFileExpanded = (id: string) => {
    setEnvFiles(envFiles.map(file => 
      file.id === id ? { ...file, isExpanded: !file.isExpanded } : file
    ));
  };

  // Variable management functions
  const addVariable = (fileId: string) => {
    const newVar: EnvVariable = {
      id: `var-${Date.now()}`,
      key: '',
      value: ''
    };
    
    setEnvFiles(envFiles.map(file => 
      file.id === fileId 
        ? { ...file, variables: [...file.variables, newVar] }
        : file
    ));
  };

  const removeVariable = (fileId: string, varId: string) => {
    setEnvFiles(envFiles.map(file => 
      file.id === fileId 
        ? { ...file, variables: file.variables.filter(v => v.id !== varId) }
        : file
    ));
  };

  const updateVariable = (fileId: string, varId: string, field: keyof EnvVariable, value: any) => {
    setEnvFiles(envFiles.map(file => 
      file.id === fileId 
        ? {
            ...file,
            variables: file.variables.map(v => {
              if (v.id === varId) {
                const updated = { ...v, [field]: value };
                // Auto-detect secrets
                if (field === 'key') {
                  const key = value.toLowerCase();
                  updated.isSecret = key.includes('secret') || 
                                   key.includes('password') || 
                                   key.includes('key') ||
                                   key.includes('token');
                }
                return updated;
              }
              return v;
            })
          }
        : file
    ));
  };

  const toggleShowSecret = (varId: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [varId]: !prev[varId]
    }));
  };

  const applyConfigurationMutation = useMutation({
    mutationFn: async () => {
      // Validate at least one file has a valid path
      const hasValidFile = envFiles.some(file => 
        file.path && file.path.trim() && file.variables.some(v => v.key.trim())
      );
      
      if (!hasValidFile) {
        throw new Error('At least one file must have a valid path and variables');
      }

      // Generate script to write all env files
      let script = `#!/bin/bash
set -e
echo "Writing environment files..."
`;

      envFiles.forEach((file, index) => {
        if (!file.path || !file.path.trim()) return;
        
        const content = generateEnvContent(file.variables);
        const dir = file.path.substring(0, file.path.lastIndexOf('/'));
        
        script += `
# File ${index + 1}: ${file.path}
${dir !== '' ? `sudo mkdir -p ${dir}` : ''}
sudo tee ${file.path} > /dev/null << 'EOF'
${content}
EOF
sudo chmod 600 ${file.path}
echo "✓ Written ${file.path}"
`;
      });

      script += `
echo "All environment files have been written successfully!"
`;

      const response = await vmApi.executeScript(vmId, { 
        script, 
        timeout: 360,
        streamWriteDelay: 100 // 100ms delay for env file writes
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to write environment files');
      }
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        // Split output by newlines but filter out empty lines for cleaner display
        const outputLines = data.stdout.split('\n').filter(line => line.trim());
        setOutput(outputLines);
        
        // Auto-scroll to bottom after setting output
        setTimeout(() => {
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        }, 0);
        
        toast.success('Environment files written successfully');
        onSuccess?.();

        setTimeout(() => {
          onClose();
        }, 1000);
        
        if (data.stderr) {
          // Also show stderr in output
          setOutput(prev => [...prev, '', '=== ERRORS ===', ...data.stderr.split('\n')]);
        }
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to write environment files');
    }
  });

  const handleClose = () => {
    if (applyConfigurationMutation.isPending) {
      if (!confirm('Configuration is being applied. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  };

  const loadFromFile = async (fileId: string) => {
    const file = envFiles.find(f => f.id === fileId);
    if (!file) return;

    setLoadingFiles(prev => ({ ...prev, [fileId]: true }));

    try {
      const response = await vmApi.executeScript(vmId, {
        script: `cat ${file.path} 2>/dev/null || echo "# File not found"`,
        timeout: 10
      });

      console.log('response', response);

      if (response.success && response.data?.stdout) {
        // Clean terminal output before parsing
        const content = cleanTerminalOutput(response.data.stdout);
        
        const variables = parseEnvContent(content);
        console.log('Parsed variables:', variables);
        if (variables.length > 0) {
          updateEnvFile(fileId, { variables });
          toast.success(`Loaded ${variables.length} variables from ${file.path}`);
        } else {
          toast.info('No variables found in file');
        }
      }
    } catch (error) {
      toast.error('Failed to load file from VM');
    } finally {
      setLoadingFiles(prev => ({ ...prev, [fileId]: false }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/30" onClick={handleClose} />
        
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Environment Configuration
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Configure environment files for <span className="font-semibold">{vmName}</span>
              </p>
            </div>

            <div className="space-y-6">
              {/* Environment Files */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Environment Files</h3>
                  <button
                    onClick={addEnvFile}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white 
                             rounded hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add File
                  </button>
                </div>

                <div className="space-y-4">
                  {envFiles.map((file, fileIndex) => (
                    <div key={file.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {/* File Header */}
                      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <button
                            onClick={() => toggleFileExpanded(file.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            {file.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <input
                            type="text"
                            value={file.path}
                            onChange={(e) => updateEnvFile(file.id, { path: e.target.value })}
                            placeholder="/path/to/.env"
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 
                                     rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                     dark:bg-gray-700 dark:text-white font-mono"
                          />
                          <button
                            onClick={() => loadFromFile(file.id)}
                            disabled={loadingFiles[file.id]}
                            className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 
                                     hover:text-blue-700 dark:hover:text-blue-300
                                     disabled:opacity-50 disabled:cursor-not-allowed
                                     flex items-center gap-1"
                            title="Load from VM"
                          >
                            {loadingFiles[file.id] ? (
                              <>
                                <div className="w-3 h-3 border-2 border-blue-600 dark:border-blue-400 
                                              border-t-transparent rounded-full animate-spin" />
                                Loading...
                              </>
                            ) : (
                              'Load'
                            )}
                          </button>
                        </div>
                        {envFiles.length > 1 && (
                          <button
                            onClick={() => removeEnvFile(file.id)}
                            className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 
                                     dark:hover:text-red-300 ml-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* File Content */}
                      {file.isExpanded && (
                        <div className="p-4 space-y-4">
                          {/* Description */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Description (optional)
                            </label>
                            <input
                              type="text"
                              value={file.description || ''}
                              onChange={(e) => updateEnvFile(file.id, { description: e.target.value })}
                              placeholder="e.g., Production environment variables"
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 
                                       rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                       dark:bg-gray-700 dark:text-white"
                            />
                          </div>

                          {/* Variables */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Variables</h5>
                              <button
                                onClick={() => addVariable(file.id)}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 text-white 
                                         rounded hover:bg-gray-700 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Add Variable
                              </button>
                            </div>

                            <div className="space-y-2">
                              {file.variables.map((variable) => (
                                <div key={variable.id} className="flex gap-3 items-start p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                  <div className="flex-1 grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        Key
                                      </label>
                                      <input
                                        type="text"
                                        value={variable.key}
                                        onChange={(e) => updateVariable(file.id, variable.id, 'key', e.target.value)}
                                        placeholder="VARIABLE_NAME"
                                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 
                                                 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                                 dark:bg-gray-800 dark:text-white font-mono"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        Value
                                      </label>
                                      <div className="relative">
                                        <input
                                          type={variable.isSecret && !showSecrets[variable.id] ? "password" : "text"}
                                          value={variable.value}
                                          onChange={(e) => updateVariable(file.id, variable.id, 'value', e.target.value)}
                                          placeholder="value"
                                          className="w-full px-2 py-1 pr-8 text-sm border border-gray-300 dark:border-gray-600 
                                                   rounded focus:outline-none focus:ring-1 focus:ring-blue-500 
                                                   dark:bg-gray-800 dark:text-white font-mono"
                                        />
                                        {variable.isSecret && (
                                          <button
                                            type="button"
                                            onClick={() => toggleShowSecret(variable.id)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 
                                                     hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                          >
                                            {showSecrets[variable.id] ? 
                                              <EyeOff className="w-3 h-3" /> : 
                                              <Eye className="w-3 h-3" />
                                            }
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {file.variables.length > 1 && (
                                    <button
                                      onClick={() => removeVariable(file.id, variable.id)}
                                      className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 
                                               dark:hover:text-red-300"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Preview */}
                          <div className="mt-4">
                            <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Preview</h5>
                            <div className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
                              <pre>{generateEnvContent(file.variables)}</pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Output */}
              {output.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Output</h3>
                  <div 
                    ref={outputRef}
                    className="bg-gray-900 text-gray-100 p-4 rounded-lg h-48 overflow-y-auto"
                  >
                    <div className="terminal-output text-xs font-mono space-y-0.5">
                      {output.map((line, index) => {
                        const cleanedLine = cleanTerminalOutput(line);
                        const htmlLine = ansiConverter.toHtml(cleanedLine);
                        return (
                          <div 
                            key={index}
                            className="leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: htmlLine || '&nbsp;' }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-500">
              <AlertCircle className="w-4 h-4" />
              <span>Files will be written with restricted permissions (600)</span>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 
                         dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 
                         transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => applyConfigurationMutation.mutate()}
                disabled={applyConfigurationMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center gap-2"
              >
                {applyConfigurationMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent 
                                  rounded-full animate-spin" />
                    Writing...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Write Files
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}