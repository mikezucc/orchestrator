import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { vmApi } from '../api/vms';
import { useToast } from '../contexts/ToastContext';
import type { VirtualMachine } from '@gce-platform/types';

interface SetupInfo {
  vmId: string;
  repository: {
    full_name: string;
    ssh_url: string;
  };
  setupScript: string;
  userScript: string;
}

export function useVMPostCreationSetup() {
  const { showInfo, showSuccess, showError } = useToast();
  const setupInProgressRef = useRef<Set<string>>(new Set());
  const pollIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Query to check for VMs pending setup
  const { data: vms } = useQuery({
    queryKey: ['vms'],
    queryFn: vmApi.list,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const executeSetupMutation = useMutation({
    mutationFn: async ({ vm, setupInfo }: { vm: VirtualMachine; setupInfo: SetupInfo }) => {
      showInfo(`Setting up repository for VM: ${vm.name}`);

      // Execute the setup script with GitHub SSH key injection enabled
      const response = await vmApi.executeScript(vm.id, {
        script: setupInfo.setupScript,
        timeout: 300, // 5 minutes for cloning and setup
        githubSSHKey: {
          registerKey: true, // This will inject the user's GitHub SSH key
          cleanupAfterExecution: false, // Keep the key for future use
        },
      });

      if (!response.success || response.data?.exitCode !== 0) {
        throw new Error('Setup script failed: ' + (response.data?.stderr || response.error));
      }

      return response;
    },
    onSuccess: (_, { vm, setupInfo }) => {
      showSuccess(`VM ${vm.name} setup completed! Repository ${setupInfo.repository.full_name} cloned successfully.`);
      
      // Remove from session storage
      sessionStorage.removeItem(`vm-setup-${vm.id}`);
      
      // Clear setup tracking
      setupInProgressRef.current.delete(vm.id);
    },
    onError: (error: any, { vm }) => {
      showError(`Failed to set up VM ${vm.name}: ${error.message}`);
      
      // Clear setup tracking but keep in sessionStorage for retry
      setupInProgressRef.current.delete(vm.id);
    },
  });

  // Check VMs and initiate setup if needed
  useEffect(() => {
    if (!vms?.success || !vms.data) return;

    vms.data.forEach((vm) => {
      // Skip if setup is already in progress
      if (setupInProgressRef.current.has(vm.id)) return;

      // Check if this VM has pending setup in sessionStorage
      const setupDataStr = sessionStorage.getItem(`vm-setup-${vm.id}`);
      if (!setupDataStr) return;

      // Parse setup info
      let setupInfo: SetupInfo;
      try {
        setupInfo = JSON.parse(setupDataStr);
      } catch (e) {
        console.error('Failed to parse setup info:', e);
        sessionStorage.removeItem(`vm-setup-${vm.id}`);
        return;
      }

      // Only proceed if VM is running
      if (vm.status !== 'RUNNING') {
        console.log(`VM ${vm.name} is not running yet (status: ${vm.status}). Waiting...`);
        return;
      }

      // Check if VM has been running for at least 30 seconds to ensure it's fully booted
      const statusUpdatedAt = new Date(vm.statusUpdatedAt || vm.createdAt);
      const secondsSinceRunning = (Date.now() - statusUpdatedAt.getTime()) / 1000;
      
      if (secondsSinceRunning < 30) {
        console.log(`VM ${vm.name} just started running. Waiting ${Math.ceil(30 - secondsSinceRunning)} more seconds...`);
        
        // Set up a delayed check
        const existingTimeout = pollIntervalsRef.current.get(vm.id);
        if (!existingTimeout) {
          const timeout = setTimeout(() => {
            pollIntervalsRef.current.delete(vm.id);
            // This will trigger a re-check on the next effect run
          }, (30 - secondsSinceRunning) * 1000);
          pollIntervalsRef.current.set(vm.id, timeout);
        }
        return;
      }

      // Mark as in progress and execute setup
      setupInProgressRef.current.add(vm.id);
      executeSetupMutation.mutate({ vm, setupInfo });
    });
  }, [vms, executeSetupMutation, showInfo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all timeouts
      pollIntervalsRef.current.forEach(timeout => clearTimeout(timeout));
      pollIntervalsRef.current.clear();
    };
  }, []);

  return {
    setupInProgress: setupInProgressRef.current.size > 0,
    executeSetupMutation,
  };
}