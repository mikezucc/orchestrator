import { useEffect, useState } from 'react';
import type { VMCreationProgress, VMCreationStage } from '@gce-platform/types';
import { getWebSocketBaseURL } from '../utils/api-config';

interface VMCreationTrackerProps {
  trackingId: string;
  onComplete?: (vmId: string) => void;
  onError?: (error: string) => void;
}

export default function VMCreationTracker({ trackingId, onComplete, onError }: VMCreationTrackerProps) {
  const [stages, setStages] = useState<VMCreationStage[]>([
    { id: 'preparing', name: 'Preparing', status: 'pending' },
    { id: 'creating', name: 'Creating VM', status: 'pending' },
    { id: 'configuring', name: 'Configuring', status: 'pending' },
    { id: 'installing', name: 'Installing Software', status: 'pending' },
    { id: 'finalizing', name: 'Finalizing', status: 'pending' },
  ]);
  const [currentProgress, setCurrentProgress] = useState<VMCreationProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const authData = localStorage.getItem('auth');
    
    console.log('VMCreationTracker - Auth check:', {
      hasToken: !!token,
      hasAuthData: !!authData,
      trackingId
    });
    
    if (!trackingId) {
      console.error('No tracking ID provided');
      return;
    }
    
    if (!token) {
      console.error('No auth token found');
      setError('Authentication required');
      return;
    }

    // Get WebSocket URL using the same host as the API
    const wsBaseUrl = getWebSocketBaseURL();
    const wsUrl = `${wsBaseUrl}/vm-progress-ws?trackingId=${trackingId}&token=${encodeURIComponent(token)}`;

    console.log('Connecting to VM progress WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('VM progress WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('WebSocket message received:', message);
        
        if (message.type === 'error') {
          console.error('WebSocket error message:', message.data);
          setError(message.data);
          setIsConnected(false);
        } else if (message.type === 'connected') {
          console.log('WebSocket connection confirmed for tracking ID:', message.trackingId);
        } else if (message.type === 'progress') {
          const progress: VMCreationProgress = message.data;
          setCurrentProgress(progress);
          
          // Update stages based on progress
          setStages(prevStages => {
            const newStages = [...prevStages];
            
            // Map progress stage to our stage IDs
            const stageMapping: Record<string, string> = {
              'preparing': 'preparing',
              'creating': 'creating',
              'configuring': 'configuring',
              'installing': 'installing',
              'finalizing': 'finalizing',
              'complete': 'finalizing', // Map complete to finalizing stage
              'error': progress.stage // Keep error as-is
            };
            
            const mappedStage = stageMapping[progress.stage] || progress.stage;
            const stageIndex = newStages.findIndex(s => s.id === mappedStage);
            
            if (stageIndex !== -1) {
              // Mark current stage as in-progress or complete
              newStages[stageIndex].status = progress.stage === 'complete' ? 'complete' : 'in-progress';
              newStages[stageIndex].message = progress.message;
              
              // Mark previous stages as complete
              for (let i = 0; i < stageIndex; i++) {
                newStages[i].status = 'complete';
              }
              
              // If error, mark current stage as error
              if (progress.stage === 'error') {
                newStages[stageIndex].status = 'error';
                setError(progress.error || progress.message);
                onError?.(progress.error || progress.message);
              }
            }
            
            // If complete, mark all stages as complete
            if (progress.stage === 'complete') {
              newStages.forEach(stage => {
                stage.status = 'complete';
              });
              if (progress.vmId) {
                onComplete?.(progress.vmId);
              }
            }
            
            return newStages;
          });
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('VM progress WebSocket error:', error);
      setIsConnected(false);
      setError(`Connection error: ${error.type || 'Unknown error'}`);
    };

    ws.onclose = () => {
      console.log('VM progress WebSocket closed');
      setIsConnected(false);
    };

    // Cleanup on unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [trackingId, onComplete, onError]);

  return (
    <div className="bg-te-gray-100 dark:bg-te-gray-900 rounded-lg p-6">
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-te-yellow rounded-full animate-pulse opacity-20"></div>
          </div>
          <svg className="w-12 h-12 text-te-yellow relative z-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-6 text-center">Creating Your VM</h3>
      
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="bg-te-gray-300 dark:bg-te-gray-700 rounded-full h-3 overflow-hidden">
          <div 
            className="bg-te-yellow h-full transition-all duration-500 ease-out"
            style={{ width: `${currentProgress?.progress || 0}%` }}
          />
        </div>
        <div className="mt-2 text-center text-sm text-te-gray-600 dark:text-te-gray-400">
          {currentProgress?.progress || 0}% Complete
        </div>
      </div>

      {/* Stage Tracker (Domino's Pizza Style) */}
      <div className="relative px-4">
        {/* Progress Line Background */}
        <div className="absolute top-6 left-12 right-12 h-1 bg-te-gray-300 dark:bg-te-gray-700 rounded-full" />
        
        {/* Progress Line Fill */}
        <div 
          className="absolute top-6 left-12 h-1 bg-te-yellow rounded-full transition-all duration-500"
          style={{ 
            width: `calc(${Math.max(0, Math.min(100, (currentProgress?.progress || 0) * 0.8))}% - 48px)` 
          }}
        />
        
        {/* Stages */}
        <div className="flex justify-between relative">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex flex-col items-center flex-1">
              {/* Stage Circle */}
              <div className={`
                relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold
                transition-all duration-300 border-2
                ${stage.status === 'complete' ? 'bg-green-500 border-green-600 text-white shadow-lg' : ''}
                ${stage.status === 'in-progress' ? 'bg-te-yellow border-yellow-600 text-te-gray-900 animate-pulse shadow-lg scale-110' : ''}
                ${stage.status === 'error' ? 'bg-red-500 border-red-600 text-white shadow-lg' : ''}
                ${stage.status === 'pending' ? 'bg-white dark:bg-te-gray-800 border-te-gray-300 dark:border-te-gray-600 text-te-gray-400 dark:text-te-gray-500' : ''}
              `}>
                {stage.status === 'complete' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : stage.status === 'error' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              
              {/* Stage Name */}
              <div className={`mt-3 text-xs font-semibold text-center transition-all duration-300 ${
                stage.status === 'complete' ? 'text-green-600 dark:text-green-400' : 
                stage.status === 'in-progress' ? 'text-te-yellow dark:text-te-yellow' : 
                stage.status === 'error' ? 'text-red-600 dark:text-red-400' :
                'text-te-gray-500 dark:text-te-gray-400'
              }`}>
                {stage.name}
              </div>
              
              {/* Stage Message */}
              {stage.message && stage.status === 'in-progress' && (
                <div className="mt-1 text-2xs text-te-gray-600 dark:text-te-gray-400 text-center max-w-[120px] animate-pulse">
                  {stage.message}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Current Status Message */}
      {currentProgress && (
        <div className="mt-8 text-center">
          <div className="text-sm font-medium text-te-gray-900 dark:text-te-gray-100">
            {currentProgress.message}
          </div>
          {currentProgress.detail && (
            <div className="text-xs text-te-gray-600 dark:text-te-gray-400 mt-1">
              {currentProgress.detail}
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
          <div className="text-sm text-red-700 dark:text-red-400">
            <span className="font-medium">Error:</span> {error}
          </div>
        </div>
      )}

      {/* Connection Status */}
      {!isConnected && !error && (
        <div className="mt-4 text-center text-xs text-te-gray-500">
          Connecting to progress tracker...
        </div>
      )}
    </div>
  );
}