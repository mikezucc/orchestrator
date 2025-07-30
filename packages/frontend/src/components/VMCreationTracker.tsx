import { useEffect, useState, useRef } from 'react';
import type { VMCreationProgress, VMCreationStage } from '@gce-platform/types';
import { getWebSocketBaseURL } from '../utils/api-config';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

SyntaxHighlighter.registerLanguage('bash', bash);

interface VMCreationTrackerProps {
  trackingId: string;
  onComplete?: (vmId: string) => void;
  onError?: (error: string) => void;
}

// Function to strip ANSI escape sequences
function stripAnsi(str: string): string {
  // Remove various ANSI escape sequences
  return str
    // Remove color codes
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Remove cursor movement
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // Remove other escape sequences
    .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    // Remove remaining escape characters
    .replace(/\x1b/g, '')
    // Remove carriage returns that might cause overwrites
    .replace(/\r(?!\n)/g, '\n');
}

// Function to format elapsed time
function formatElapsedTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
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
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const scriptOutputRef = useRef<HTMLDivElement>(null);
  
  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [gameHighScore, setGameHighScore] = useState(0);
  const [birdY, setBirdY] = useState(150);
  const [birdVelocity, setBirdVelocity] = useState(0);
  const [pipes, setPipes] = useState<Array<{x: number, gapY: number}>>([]);
  const [gameOver, setGameOver] = useState(false);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  
  // Use refs to store the latest callback functions
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  
  // Handle manual scroll detection
  const handleScriptOutputScroll = useRef<any>(null);
  useEffect(() => {
    const scrollContainer = scriptOutputRef.current;
    if (!scrollContainer) return;
    
    handleScriptOutputScroll.current = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      
      // If user scrolled up (not near bottom), disable auto-scroll
      if (!isNearBottom && autoScroll) {
        setAutoScroll(false);
      }
    };
    
    scrollContainer.addEventListener('scroll', handleScriptOutputScroll.current);
    return () => {
      scrollContainer.removeEventListener('scroll', handleScriptOutputScroll.current);
    };
  }, [autoScroll]);
  
  // Update refs when callbacks change
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Update elapsed time every second
  useEffect(() => {
    if (!isComplete && !error) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [startTime, isComplete, error]);
  
  // Auto-scroll script output when new content is added
  useEffect(() => {
    if (autoScroll && scriptOutputRef.current && showScriptOutput) {
      scriptOutputRef.current.scrollTop = scriptOutputRef.current.scrollHeight;
    }
  }, [scriptOutput, autoScroll, showScriptOutput]);

  // Game constants
  const GRAVITY = 0.6;
  const JUMP_STRENGTH = -10;
  const PIPE_WIDTH = 60;
  const PIPE_GAP = 120;
  const PIPE_SPEED = 3;
  const BIRD_SIZE = 30;
  const GAME_WIDTH = 400;
  const GAME_HEIGHT = 300;

  // Start game
  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setGameScore(0);
    setBirdY(150);
    setBirdVelocity(0);
    setPipes([{ x: GAME_WIDTH, gapY: Math.random() * (GAME_HEIGHT - PIPE_GAP - 60) + 30 }]);
  };

  // Reset game
  const resetGame = () => {
    setGameStarted(false);
    setGameOver(false);
    setGameScore(0);
    setBirdY(150);
    setBirdVelocity(0);
    setPipes([]);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  // Handle jump
  const handleJump = () => {
    if (!gameStarted) {
      startGame();
    } else if (!gameOver) {
      setBirdVelocity(JUMP_STRENGTH);
    } else {
      resetGame();
    }
  };

  // Game loop
  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const gameLoop = () => {
      // Update bird physics
      setBirdY(prevY => {
        const newY = prevY + birdVelocity;
        // Check boundaries
        if (newY < 0 || newY > GAME_HEIGHT - BIRD_SIZE) {
          setGameOver(true);
          if (gameScore > gameHighScore) {
            setGameHighScore(gameScore);
          }
          return prevY;
        }
        return newY;
      });

      setBirdVelocity(prev => prev + GRAVITY);

      // Update pipes
      setPipes(prevPipes => {
        const newPipes = prevPipes.map(pipe => ({ ...pipe, x: pipe.x - PIPE_SPEED }));
        
        // Remove off-screen pipes
        const filteredPipes = newPipes.filter(pipe => pipe.x > -PIPE_WIDTH);
        
        // Add new pipes
        if (filteredPipes.length === 0 || filteredPipes[filteredPipes.length - 1].x < GAME_WIDTH - 200) {
          filteredPipes.push({ 
            x: GAME_WIDTH, 
            gapY: Math.random() * (GAME_HEIGHT - PIPE_GAP - 60) + 30 
          });
        }
        
        // Check collisions
        filteredPipes.forEach(pipe => {
          if (pipe.x < 100 && pipe.x + PIPE_WIDTH > 70) {
            if (birdY < pipe.gapY || birdY + BIRD_SIZE > pipe.gapY + PIPE_GAP) {
              setGameOver(true);
              if (gameScore > gameHighScore) {
                setGameHighScore(gameScore);
              }
            } else if (pipe.x + PIPE_WIDTH === 70) {
              setGameScore(prev => prev + 1);
            }
          }
        });
        
        return filteredPipes;
      });

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameStarted, gameOver, birdY, birdVelocity, gameScore, gameHighScore]);

  // Render game
  useEffect(() => {
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw bird
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(85, birdY + BIRD_SIZE/2, BIRD_SIZE/2, 0, Math.PI * 2);
    ctx.fill();

    // Draw pipes
    ctx.fillStyle = '#228B22';
    pipes.forEach(pipe => {
      // Top pipe
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY);
      // Bottom pipe
      ctx.fillRect(pipe.x, pipe.gapY + PIPE_GAP, PIPE_WIDTH, GAME_HEIGHT - pipe.gapY - PIPE_GAP);
    });

    // Draw score
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`Score: ${gameScore}`, 10, 30);
    
    if (gameHighScore > 0) {
      ctx.font = '16px Arial';
      ctx.fillText(`Best: ${gameHighScore}`, 10, 50);
    }

    // Draw game over or start message
    if (!gameStarted || gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      
      if (gameOver) {
        ctx.fillText('Game Over!', GAME_WIDTH/2, GAME_HEIGHT/2 - 20);
        ctx.font = '18px Arial';
        ctx.fillText('Click to play again', GAME_WIDTH/2, GAME_HEIGHT/2 + 10);
      } else {
        ctx.fillText('Click to Start!', GAME_WIDTH/2, GAME_HEIGHT/2);
      }
      ctx.textAlign = 'left';
    }
  }, [gameStarted, gameOver, birdY, pipes, gameScore, gameHighScore]);

  // Add keyboard support
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        handleJump();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [gameStarted, gameOver]);

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
              // Strip ANSI escape sequences from the output
              const cleanedOutput = stripAnsi(progress.scriptOutput!.data);
              // Keep all lines without limitation
              return [...prev, cleanedOutput];
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
      {/* Header with elapsed time */}
      <div className="flex items-center justify-between mb-4">
        {!isComplete && !error && (
          <div className="text-sm text-te-gray-600 dark:text-te-gray-400">
            Elapsed: {formatElapsedTime(elapsedTime)}
          </div>
        )}
      </div>
      
      {/* Stage Tracker (Domino's Pizza Style) */}
      <div className="relative px-4">
        {/* Progress Line Background */}
        <div className="absolute top-6 left-12 right-12 h-1 bg-te-gray-300 dark:bg-te-gray-700 rounded-full" />
        
        {/* Progress Line Fill */}
        <div 
          className="absolute top-6 left-12 h-1 bg-te-yellow rounded-full transition-all duration-500"
          style={{ 
            width: `calc(${Math.max(0, Math.min(100, (currentProgress?.progress || 0)))}%)` 
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

      {/* Mini Game - Flappy Bird */}
      {!isComplete && !error && (
        <div className="mt-6">
          <div className="bg-white dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-te-gray-700 dark:text-te-gray-300 mb-3">
              Play while you wait!
            </h4>
            <div className="flex justify-center">
              <canvas
                ref={gameCanvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                onClick={handleJump}
                className="border border-te-gray-300 dark:border-te-gray-600 rounded cursor-pointer"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <div className="text-center mt-2 text-xs text-te-gray-600 dark:text-te-gray-400">
              Click or press Space to jump!
            </div>
          </div>
        </div>
      )}

      {/* Progress History */}
      <div className="mt-8">
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
            <div className="flex items-center gap-2">
              {!autoScroll && (
                <button
                  type="button"
                  onClick={() => {
                    setAutoScroll(true);
                    if (scriptOutputRef.current) {
                      scriptOutputRef.current.scrollTop = scriptOutputRef.current.scrollHeight;
                    }
                  }}
                  className="text-xs text-te-yellow hover:text-te-yellow-600 transition-colors flex items-center gap-1 animate-pulse"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5 5 5-5M7 5l5 5 5-5" />
                  </svg>
                  Resume Auto-scroll
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const output = scriptOutput.join('');
                  navigator.clipboard.writeText(output).then(() => {
                    // Optional: Show a toast or brief confirmation
                    console.log('Script output copied to clipboard');
                  }).catch(err => {
                    console.error('Failed to copy:', err);
                  });
                }}
                className="text-xs text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
              <button
                type="button"
                onClick={() => setShowScriptOutput(!showScriptOutput)}
                className="text-xs text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-300 transition-colors"
              >
                {showScriptOutput ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showScriptOutput && (
            <div 
              ref={scriptOutputRef}
              className="bg-te-gray-900 dark:bg-black border border-te-gray-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto"
            >
              <SyntaxHighlighter
                language="bash"
                style={atomOneDark}
                customStyle={{
                  fontSize: '0.75rem',
                  padding: '1rem',
                  margin: 0,
                  backgroundColor: 'transparent',
                }}
                showLineNumbers={false}
              >
                {scriptOutput.join('')}
              </SyntaxHighlighter>
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