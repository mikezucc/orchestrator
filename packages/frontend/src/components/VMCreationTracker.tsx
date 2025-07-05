import { useEffect, useState, useRef } from 'react';
import type { VMCreationProgress, VMCreationStage } from '@gce-platform/types';
import { getWebSocketBaseURL } from '../utils/api-config';

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
  
  // Game state
  const [selectedGame, setSelectedGame] = useState<'flappy' | 'cubefield'>('flappy');
  const [gameStarted, setGameStarted] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [gameHighScore, setGameHighScore] = useState(0);
  const [birdY, setBirdY] = useState(150);
  const [birdVelocity, setBirdVelocity] = useState(0);
  const [pipes, setPipes] = useState<Array<{x: number, gapY: number}>>([]);
  const [gameOver, setGameOver] = useState(false);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  
  // Cubefield state
  const [playerX, setPlayerX] = useState(200);
  const [cubes, setCubes] = useState<Array<{x: number, z: number, lane: number}>>([]);
  const [gameSpeed, setGameSpeed] = useState(5);
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  const [cubefieldHighScore, setCubefieldHighScore] = useState(0);
  
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

  // Update elapsed time every second
  useEffect(() => {
    if (!isComplete && !error) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [startTime, isComplete, error]);

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
    if (selectedGame === 'flappy') {
      setBirdY(150);
      setBirdVelocity(0);
      setPipes([]);
    } else {
      setPlayerX(200);
      setCubes([]);
      setGameSpeed(5);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  // Start Cubefield game
  const startCubefield = () => {
    setGameStarted(true);
    setGameOver(false);
    setGameScore(0);
    setPlayerX(200);
    setGameSpeed(5);
    // Start with no cubes for a grace period
    setCubes([]);
  };

  // Handle jump
  const handleJump = () => {
    if (selectedGame === 'flappy') {
      if (!gameStarted) {
        startGame();
      } else if (!gameOver) {
        setBirdVelocity(JUMP_STRENGTH);
      } else {
        resetGame();
      }
    }
  };

  // Handle Cubefield click
  const handleCubefieldClick = () => {
    if (!gameStarted) {
      startCubefield();
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
  }, [gameStarted, gameOver, birdY, birdVelocity, gameScore, gameHighScore, selectedGame]);

  // Cubefield game loop
  useEffect(() => {
    if (!gameStarted || selectedGame !== 'cubefield') return;
    
    // Ensure clean state on start
    if (gameScore === 0) {
      setCubes([]);
    }

    const gameLoop = () => {
      // Update player position based on input
      setPlayerX(prevX => {
        let newX = prevX;
        if (leftPressed && newX > 30) newX -= 8;
        if (rightPressed && newX < 370) newX += 8;
        return newX;
      });

      // Update game speed (gradually increases, but slower)
      setGameSpeed(prev => Math.min(prev + 0.002, 15));

      // Update cubes
      setCubes(prevCubes => {
        let newCubes = prevCubes.map(cube => ({
          ...cube,
          z: cube.z - gameSpeed
        }));

        // Remove cubes that passed the player
        newCubes = newCubes.filter(cube => cube.z > -50);

        // Add new cubes with better spacing
        // Only start adding cubes after 2 seconds (score > 120)
        if (gameScore > 120) {
          // Add cubes less frequently and with more spacing
          const minSpacing = 120; // Minimum distance between cubes
          const lastZ = newCubes.length > 0 ? Math.max(...newCubes.map(c => c.z)) : 400;
          
          if (newCubes.length < 8 && (newCubes.length === 0 || lastZ < 500)) {
            // Add 1-2 cubes at a time with spacing
            const numToAdd = Math.random() > 0.7 ? 2 : 1;
            for (let i = 0; i < numToAdd; i++) {
              newCubes.push({
                x: 50 + Math.random() * 300, // Keep cubes more centered
                z: lastZ + minSpacing + (i * 50) + Math.random() * 50,
                lane: Math.floor(Math.random() * 5)
              });
            }
          }
        }

        // No collision detection - let the player enjoy the game!
        // Score continuously increases as a reward for playing

        return newCubes;
      });

      // Update score
      setGameScore(prev => prev + 1);

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameStarted, gameOver, selectedGame, leftPressed, rightPressed, playerX, gameSpeed, gameScore, cubefieldHighScore]);

  // Render game
  useEffect(() => {
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (selectedGame === 'flappy') {
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
    } else {
      // Cubefield rendering
      // Create gradient background for depth effect
      const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      gradient.addColorStop(0, '#001a33');
      gradient.addColorStop(1, '#000033');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Draw horizon line
      ctx.strokeStyle = '#0066cc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GAME_HEIGHT * 0.6);
      ctx.lineTo(GAME_WIDTH, GAME_HEIGHT * 0.6);
      ctx.stroke();

      // Draw perspective grid lines
      ctx.strokeStyle = '#003366';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const x = (i + 1) * GAME_WIDTH / 6;
        ctx.beginPath();
        ctx.moveTo(GAME_WIDTH / 2, GAME_HEIGHT * 0.6);
        ctx.lineTo(x, GAME_HEIGHT);
        ctx.stroke();
      }

      // Sort cubes by Z distance (far to near) for proper rendering
      const sortedCubes = [...cubes].sort((a, b) => b.z - a.z);

      // Draw cubes with 3D perspective
      sortedCubes.forEach(cube => {
        if (cube.z > 0 && cube.z < 500) {
          const perspective = 200 / (cube.z + 200);
          const screenX = GAME_WIDTH / 2 + (cube.x - GAME_WIDTH / 2) * perspective;
          const screenY = GAME_HEIGHT * 0.6 + (GAME_HEIGHT * 0.4) * (1 - perspective);
          const size = 40 * perspective;
          
          // Create gradient for cube faces
          const brightness = Math.floor(255 * perspective);
          const color = `rgb(${brightness}, ${brightness * 0.4}, ${brightness * 0.8})`;
          
          // Draw cube shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(screenX - size/2 + 2, screenY - size/2 + 2, size, size);
          
          // Draw cube
          ctx.fillStyle = color;
          ctx.fillRect(screenX - size/2, screenY - size/2, size, size);
          
          // Draw cube edges for 3D effect
          ctx.strokeStyle = `rgb(${brightness * 1.2}, ${brightness * 0.5}, ${brightness})`;
          ctx.lineWidth = perspective * 2;
          ctx.strokeRect(screenX - size/2, screenY - size/2, size, size);
        }
      });

      // Draw player ship
      const shipY = GAME_HEIGHT - 50;
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.moveTo(playerX, shipY);
      ctx.lineTo(playerX - 15, shipY + 30);
      ctx.lineTo(playerX, shipY + 20);
      ctx.lineTo(playerX + 15, shipY + 30);
      ctx.closePath();
      ctx.fill();
      
      // Ship glow effect
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw score
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(`Score: ${gameScore}`, 10, 30);
      
      if (cubefieldHighScore > 0) {
        ctx.font = '16px Arial';
        ctx.fillText(`Best: ${cubefieldHighScore}`, 10, 50);
      }

      // Draw speed indicator
      ctx.font = '14px Arial';
      ctx.fillText(`Speed: ${Math.floor(gameSpeed * 10)}`, 10, 70);

      // Draw grace period message
      if (gameStarted && gameScore < 120) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Get Ready!', GAME_WIDTH/2, 100);
        ctx.font = '14px Arial';
        ctx.fillText(`Starting in ${Math.ceil((120 - gameScore) / 60)}...`, GAME_WIDTH/2, 120);
        ctx.textAlign = 'left';
      }

      // Draw start message only
      if (!gameStarted) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('CUBEFIELD', GAME_WIDTH/2, GAME_HEIGHT/2 - 20);
        ctx.font = '18px Arial';
        ctx.fillText('Click to Start!', GAME_WIDTH/2, GAME_HEIGHT/2 + 10);
        ctx.textAlign = 'left';
      }
    }
  }, [gameStarted, gameOver, birdY, pipes, gameScore, gameHighScore, selectedGame, playerX, cubes, gameSpeed, cubefieldHighScore]);

  // Add keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedGame === 'flappy') {
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          handleJump();
        }
      } else if (selectedGame === 'cubefield') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          setLeftPressed(true);
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          setRightPressed(true);
        } else if ((e.code === 'Space' || e.key === ' ') && !gameStarted) {
          e.preventDefault();
          startCubefield();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (selectedGame === 'cubefield') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          setLeftPressed(false);
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          setRightPressed(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameStarted, gameOver, selectedGame]);

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

      {/* Mini Games */}
      <div className="mt-6">
        <div className="bg-white dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-te-gray-700 dark:text-te-gray-300">
              Play while you wait!
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedGame('flappy');
                  resetGame();
                }}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  selectedGame === 'flappy'
                    ? 'bg-te-yellow text-te-gray-900 font-semibold'
                    : 'bg-te-gray-200 dark:bg-te-gray-700 text-te-gray-600 dark:text-te-gray-400 hover:bg-te-gray-300 dark:hover:bg-te-gray-600'
                }`}
              >
                Flappy Bird
              </button>
              <button
                onClick={() => {
                  setSelectedGame('cubefield');
                  resetGame();
                }}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  selectedGame === 'cubefield'
                    ? 'bg-te-yellow text-te-gray-900 font-semibold'
                    : 'bg-te-gray-200 dark:bg-te-gray-700 text-te-gray-600 dark:text-te-gray-400 hover:bg-te-gray-300 dark:hover:bg-te-gray-600'
                }`}
              >
                Cubefield
              </button>
            </div>
            <div className="flex justify-center">
              <canvas
                ref={gameCanvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                onClick={selectedGame === 'flappy' ? handleJump : handleCubefieldClick}
                className="border border-te-gray-300 dark:border-te-gray-600 rounded cursor-pointer"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <div className="text-center mt-2 text-xs text-te-gray-600 dark:text-te-gray-400">
              {selectedGame === 'flappy' 
                ? 'Click or press Space to jump!' 
                : 'Use Arrow Keys or A/D to move. Space to start/restart!'}
            </div>
          </div>
        </div>
      </div>

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
            <div className="bg-te-gray-900 dark:bg-black border border-te-gray-700 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                {scriptOutput.join('')}
              </pre>
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