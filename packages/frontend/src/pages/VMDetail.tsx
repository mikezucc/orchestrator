import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { firewallApi } from '../api/firewall';
import FirewallRules from '../components/FirewallRules';
import VMStatusBadge from '../components/VMStatusBadge';
import PortSelectorModal from '../components/PortSelectorModal';
import WormholeSection from '../components/WormholeSection';
import VMRepositoriesSection from '../components/VMRepositoriesSection';
import WormholeDebugPanel from '../components/WormholeDebugPanel';
import DuplicateVMModal from '../components/DuplicateVMModal';
import SSHTerminal from '../components/SSHTerminal';
import ExecuteScriptModal from '../components/ExecuteScriptModal';
import ScriptExecutionsList from '../components/ScriptExecutionsList';
import AddFavoritePortModal from '../components/AddFavoritePortModal';
import { SSLSettingsModal } from '../components/vm/SSLSettingsModal';
import { NginxConfigModal } from '../components/vm/NginxConfigModal';
import { EnvConfigModal } from '../components/vm/EnvConfigModal';
import { useToast } from '../contexts/ToastContext';
import { useOrganization } from '../contexts/OrganizationContext';

export default function VMDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const { currentOrganization } = useOrganization();
  const [showPortSelector, setShowPortSelector] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showSSHTerminal, setShowSSHTerminal] = useState(false);
  const [showExecuteScriptModal, setShowExecuteScriptModal] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [showVMInfo, setShowVMInfo] = useState(false);
  const [showAddFavoritePortModal, setShowAddFavoritePortModal] = useState(false);
  const [showSSLSettingsModal, setShowSSLSettingsModal] = useState(false);
  const [showNginxConfigModal, setShowNginxConfigModal] = useState(false);
  const [showEnvConfigModal, setShowEnvConfigModal] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<{ stdout: string; stderr: string; exitCode: number; sessionId?: string; timestamp?: Date } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'executions'>('overview');

  console.log('showSSHTerminal', showSSHTerminal);

  const { data: vmResponse, isLoading: vmLoading, error: vmError } = useQuery({
    queryKey: ['vm', id],
    queryFn: () => vmApi.get(id!, true), // Sync VM data on load
    enabled: !!id,
  });

  // Handle error separately
  if (vmError) {
    showError((vmError as any).response?.data?.error || 'Failed to load VM details');
  }

  const { data: rulesResponse } = useQuery({
    queryKey: ['firewall-rules', id],
    queryFn: async () => {
      // Sync firewall rules from GCP on page load
      const response = await firewallApi.listByVM(id!, true);
      // Check if sync had partial errors
      if (response.error) {
        showError(response.error);
      }
      return response;
    },
    enabled: !!id,
  });

  const startMutation = useMutation({
    mutationFn: () => vmApi.start(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM started successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vm', id] });
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to start VM');
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => vmApi.stop(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM stopped successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vm', id] });
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to stop VM');
    },
  });

  const suspendMutation = useMutation({
    mutationFn: () => vmApi.suspend(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm', id] });
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      showSuccess('VM suspended successfully');
      // Refresh after 500ms to get updated state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['vm', id] });
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }, 500);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to suspend VM');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => vmApi.delete(id!),
    onSuccess: () => {
      showSuccess('VM deleted successfully');
      navigate('/vms');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Failed to delete VM');
    },
  });

  if (vmLoading || !vmResponse?.data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xs uppercase tracking-wider text-te-gray-500 dark:text-te-gray-600">
          Loading...
        </div>
      </div>
    );
  }

  const vm = vmResponse.data;
  const rules = rulesResponse?.data || [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <h1 className="text-xl font-bold uppercase tracking-wider">{vm.name}</h1>
            <VMStatusBadge status={vm.status} />
          </div>
          {vm.publicIp && (
            <div className="flex items-center space-x-3">
              <p className="font-medium font-mono text-te-gray-700 dark:text-te-gray-300">{vm.publicIp}</p>
              <button
                onClick={() => setShowPortSelector(true)}
                className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                title="Open in browser"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
              <button
                onClick={() => setShowSSHTerminal(true)}
                className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-yellow transition-colors"
                title="SSH Terminal"
                disabled={vm.status !== 'running'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          {vm.status === 'stopped' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="btn-primary flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{startMutation.isPending ? 'Starting...' : 'Start VM'}</span>
            </button>
          )}
          {vm.status === 'suspended' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="btn-primary flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{startMutation.isPending ? 'Resuming...' : 'Resume VM'}</span>
            </button>
          )}
          {vm.status === 'running' && vm.publicIp && (
            <>
              <button
                onClick={() => setShowSSHTerminal(true)}
                className="btn-secondary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Connect SSH</span>
              </button>
              <button
                onClick={() => {
                  setShowExecuteScriptModal(true);
                  // Optionally switch to executions tab
                  // setActiveTab('executions');
                }}
                className="btn-secondary flex items-center space-x-2"
                title="Execute bash script on VM"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Run Script</span>
              </button>
            </>
          )}
          <button
            onClick={() => setShowDuplicateModal(true)}
            className="btn-secondary flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>Duplicate</span>
          </button>
          
          {/* Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowActionsDropdown(!showActionsDropdown)}
              className="btn-secondary flex items-center space-x-2"
            >
              <span>Actions</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showActionsDropdown && (
              <>
                {/* Backdrop to close dropdown when clicking outside */}
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowActionsDropdown(false)}
                />
                
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-te-gray-900 rounded-lg shadow-lg border border-te-gray-200 dark:border-te-gray-800 py-1 z-20">
                  {vm.status === 'running' && (
                    <>
                      <button
                        onClick={() => {
                          stopMutation.mutate();
                          setShowActionsDropdown(false);
                        }}
                        disabled={stopMutation.isPending}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 9.5h-5m0 0h-5m5 0v5m0-5v-5M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                        </svg>
                        <span>{stopMutation.isPending ? 'Stopping...' : 'Stop VM'}</span>
                      </button>
                      <button
                        onClick={() => {
                          suspendMutation.mutate();
                          setShowActionsDropdown(false);
                        }}
                        disabled={suspendMutation.isPending}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{suspendMutation.isPending ? 'Suspending...' : 'Suspend VM'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowExecuteScriptModal(true);
                          setShowActionsDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Execute Script</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSSLSettingsModal(true);
                          setShowActionsDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>SSL Settings</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowNginxConfigModal(true);
                          setShowActionsDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                        <span>NGINX Config</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowEnvConfigModal(true);
                          setShowActionsDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Environment Config</span>
                      </button>
                      <div className="border-t border-te-gray-200 dark:border-te-gray-800 my-1" />
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Delete VM "${vm.name}"?`)) {
                        deleteMutation.mutate();
                      }
                      setShowActionsDropdown(false);
                    }}
                    disabled={deleteMutation.isPending}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center space-x-2 text-red-600 dark:text-red-400"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>{deleteMutation.isPending ? 'Deleting...' : 'Delete VM'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-te-gray-200 dark:border-te-gray-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-6 py-3 text-sm font-medium uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-te-yellow text-te-gray-900 dark:text-te-yellow'
              : 'border-transparent text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-300'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('executions')}
          className={`px-6 py-3 text-sm font-medium uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'executions'
              ? 'border-te-yellow text-te-gray-900 dark:text-te-yellow'
              : 'border-transparent text-te-gray-600 dark:text-te-gray-400 hover:text-te-gray-900 dark:hover:text-te-gray-300'
          }`}
        >
          Script Executions
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          <div className="card">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowVMInfo(!showVMInfo)}
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider">VM Information</h3>
              <svg 
                className={`w-4 h-4 text-te-gray-600 dark:text-te-gray-400 transform transition-transform ${
                  showVMInfo ? 'rotate-180' : ''
                }`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            
            {showVMInfo && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4">
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                      Project ID
                    </p>
                    <p className="font-medium">{vm.gcpProjectId}</p>
                  </div>
                  
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                      Zone
                    </p>
                    <p className="font-medium">{vm.zone}</p>
                  </div>
                  
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                      Machine Type
                    </p>
                    <p className="font-medium">{vm.machineType}</p>
                  </div>
                  
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                      Created
                    </p>
                    <p className="font-medium tabular-nums">
                      {new Date(vm.createdAt).toLocaleString()}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-1">
                      Updated
                    </p>
                    <p className="font-medium tabular-nums">
                      {new Date(vm.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                {vm.initScript && (
                  <div className="mt-6 pt-6 border-t border-te-gray-200 dark:border-te-gray-800">
                    <p className="text-2xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mb-2">
                      Init Script
                    </p>
                    <pre className="bg-te-gray-100 dark:bg-te-gray-950 p-3 text-xs overflow-x-auto font-mono">
                      {vm.initScript}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider">Ports & Services</h3>
              <button
                onClick={() => setShowAddFavoritePortModal(true)}
                className="btn-secondary text-xs flex items-center space-x-1"
                title="Add a favorite port without wormhole connection"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Add an App</span>
              </button>
            </div>
            {/* VM Repositories from database */}
            <VMRepositoriesSection vmId={id!} publicIp={vm.publicIp} />
            
            {/* Wormhole ports and status */}
            <WormholeSection vmId={id!} publicIp={vm.publicIp} autoConnect={true} />
          </div>

          {/* Debug panel for slopboxprimary members */}
          <WormholeDebugPanel organizationSlug={currentOrganization?.slug} />

          <div>
            <FirewallRules vmId={id!} rules={rules} />
          </div>
        </>
      )}

      {activeTab === 'executions' && (
        <ScriptExecutionsList vmId={id!} title="Script Execution History" />
      )}

      {showPortSelector && vm.publicIp && (
        <PortSelectorModal
          publicIp={vm.publicIp}
          vmId={id!}
          firewallRules={rules}
          onClose={() => setShowPortSelector(false)}
        />
      )}

      {showDuplicateModal && (
        <DuplicateVMModal
          vm={vm}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}

      {showSSHTerminal && (
        <SSHTerminal
          vm={vm}
          onClose={() => setShowSSHTerminal(false)}
        />
      )}

      {showExecuteScriptModal && (
        <ExecuteScriptModal
          vm={vm}
          onClose={() => {
            setShowExecuteScriptModal(false);
            // Refresh script executions list when modal is closed
            if (activeTab === 'executions') {
              queryClient.invalidateQueries({ queryKey: ['script-executions'] });
            }
          }}
          output={consoleOutput}
          setOutput={setConsoleOutput}
        />
      )}

      {showAddFavoritePortModal && (
        <AddFavoritePortModal
          vmId={id!}
          onClose={() => setShowAddFavoritePortModal(false)}
        />
      )}

      {showSSLSettingsModal && (
        <SSLSettingsModal
          isOpen={showSSLSettingsModal}
          onClose={() => setShowSSLSettingsModal(false)}
          vmId={id!}
          vmName={vm.name}
          onSuccess={() => {
            showSuccess('SSL certificates uploaded successfully');
          }}
        />
      )}

      {showNginxConfigModal && (
        <NginxConfigModal
          isOpen={showNginxConfigModal}
          onClose={() => setShowNginxConfigModal(false)}
          vmId={id!}
          vmName={vm.name}
          onSuccess={() => {
            showSuccess('NGINX configuration applied successfully');
          }}
        />
      )}

      {showEnvConfigModal && (
        <EnvConfigModal
          isOpen={showEnvConfigModal}
          onClose={() => setShowEnvConfigModal(false)}
          vmId={id!}
          vmName={vm.name}
          onSuccess={() => {
            showSuccess('Environment files written successfully');
          }}
        />
      )}
    </div>
  );
}