import { useEffect, useState, useRef } from 'react';
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
  const [progressHistory, setProgressHistory] = useState<VMCreationProgress[]>([]);
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [showScriptOutput, setShowScriptOutput] = useState(false);
  
  // Use refs to store the latest callback functions
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  
  // Update refs when callbacks change
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
          
          // Handle script output separately
          if (progress.stage === 'script-output' && progress.scriptOutput) {
            // Batch script outputs to avoid overwhelming the UI
            setScriptOutput(prev => {
              // Limit to last 1000 lines to prevent memory issues
              const newOutput = [...prev, progress.scriptOutput!.data];
              if (newOutput.length > 1000) {
                return newOutput.slice(-1000);
              }
              return newOutput;
            });
            setShowScriptOutput(true);
            return; // Don't add to progress history
          }
          
          setCurrentProgress(progress);
          
          // Only add non-script-output to progress history
          setProgressHistory(prev => [...prev, progress]);
          
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
                onErrorRef.current?.(progress.error || progress.message);
              }
            }
            
            // If complete, mark all stages as complete
            if (progress.stage === 'complete') {
              newStages.forEach(stage => {
                stage.status = 'complete';
              });
              setIsComplete(true);
              if (progress.vmId) {
                onCompleteRef.current?.(progress.vmId);
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
  }, [trackingId]); // Only depend on trackingId

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

      {/* Progress History */}
      <div className="mt-8">
        <h4 className="text-sm font-semibold text-te-gray-700 dark:text-te-gray-300 mb-3">Progress Log</h4>
        <div className="bg-white dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto">
          {progressHistory.length === 0 && !isConnected && (
            <div className="text-xs text-te-gray-500 text-center py-4">
              Connecting to progress tracker...
            </div>
          )}
          {progressHistory.length === 0 && isConnected && (
            <div className="text-xs text-te-gray-500 text-center py-4">
              Waiting for progress updates...
            </div>
          )}
          <div className="space-y-2">
            {progressHistory.map((progress, index) => {
              const isLatest = index === progressHistory.length - 1;
              const isError = progress.stage === 'error';
              const isComplete = progress.stage === 'complete';
              
              return (
                <div
                  key={`${progress.timestamp}-${index}`}
                  className={`
                    text-xs p-2 rounded transition-all duration-300
                    ${isLatest && !isComplete && !isError ? 'bg-te-yellow/20 border border-te-yellow/40 animate-pulse' : ''}
                    ${isError ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700' : ''}
                    ${isComplete ? 'bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700' : ''}
                    ${!isLatest && !isError && !isComplete ? 'bg-te-gray-50 dark:bg-te-gray-900/50' : ''}
                  `}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-te-gray-500 dark:text-te-gray-400 whitespace-nowrap">
                      {new Date(progress.timestamp).toLocaleTimeString()}
                    </span>
                    <div className="flex-1">
                      <span className={`
                        font-medium
                        ${isError ? 'text-red-700 dark:text-red-400' : ''}
                        ${isComplete ? 'text-green-700 dark:text-green-400' : ''}
                        ${!isError && !isComplete ? 'text-te-gray-900 dark:text-te-gray-100' : ''}
                      `}>
                        {progress.message}
                      </span>
                      {progress.detail && (
                        <div className="text-te-gray-600 dark:text-te-gray-400 mt-0.5">
                          {progress.detail}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Auto-scroll to bottom */}
          <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
        </div>
      </div>

      {/* Script Output Section */}
      {scriptOutput.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-te-gray-700 dark:text-te-gray-300">
              Script Output ({scriptOutput.length} lines)
            </h4>
            <button
              type="button"
              onClick={() => setShowScriptOutput(!showScriptOutput)}
              className="text-xs text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors"
            >
              {showScriptOutput ? 'Hide' : 'Show'}
            </button>
          </div>
          {showScriptOutput && (
            <div className="bg-te-gray-900 dark:bg-black border border-te-gray-700 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                {scriptOutput.join('')}
              </pre>
              {/* Auto-scroll to bottom */}
              <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
            </div>
          )}
        </div>
      )}

      {/* Completion Status - More subtle */}
      {isComplete && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              VM creation process completed
            </span>
          </div>
        </div>
      )}

      {/* Error Status */}
      {error && (
        <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <div className="text-sm font-medium text-red-700 dark:text-red-400">
                VM Creation Failed
              </div>
              <div className="text-sm text-red-600 dark:text-red-300 mt-1">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}