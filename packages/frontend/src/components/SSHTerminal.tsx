import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import type { VirtualMachine } from '@gce-platform/types';

interface SSHTerminalProps {
  vm: VirtualMachine;
  onClose: () => void;
}

export default function SSHTerminal({ vm, onClose }: SSHTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const prevMinimizedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isConnectedRef = useRef(false);
  const { showError, showSuccess } = useToast();
  const { userId, auth, currentOrganizationId } = useAuth();

  const _onClose = () => {
    console.log('Closing SSH terminal');
    if (wsRef.current) {
      wsRef.current.close();
    }
    terminal?.dispose();
    onClose();
  }

  useEffect(() => {
    if (!terminalRef.current) return;

    console.log('Initializing SSH terminal for VM:', vm.id, vm.name, vm.publicIp);

    // Initialize terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      allowProposedApi: true,
      unicode11: true,
      convertEol: true,
      scrollback: 10000,
      wordSeparator: ' ()[]{}\'"',
      cols: 80,
      rows: 24,
      letterSpacing: 0,
      lineHeight: 1.0,
      rendererType: 'canvas',
      windowsMode: false,
      theme: {
        background: '#1a1a1a',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#1a1a1a',
        red: '#f44747',
        green: '#608b4e',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#608b4e',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    
    term.open(terminalRef.current);
    
    // Delay fit to ensure DOM is ready
    setTimeout(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      console.log('Initial terminal size:', { cols, rows });
    }, 50);
    
    fitAddonRef.current = fitAddon;
    
    setTerminal(term);

    // Handle window resize
    const handleResize = () => {
      if (!isMinimized && fitAddon && terminalRef.current) {
        // Use requestAnimationFrame for smoother resizing
        requestAnimationFrame(() => {
          fitAddon.fit();
          // Send new size to backend
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && term) {
            const { cols, rows } = term;
            console.log('Resizing terminal:', { cols, rows });
            wsRef.current.send(JSON.stringify({
              type: 'resize',
              cols,
              rows
            }));
          }
        });
      }
    };
    
    // Debounce resize events
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 100);
    };
    
    window.addEventListener('resize', debouncedResize);

    // Setup WebSocket SSH connection
    setupWebSocketConnection(term);

    return () => {
      console.log('Cleaning up terminal');
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      term.dispose();
    };
  }, []); // Empty dependency to run only once

  // Handle minimize/restore
  useEffect(() => {
    if (prevMinimizedRef.current && !isMinimized && terminal && fitAddonRef.current) {
      // Terminal was just restored from minimized state
      console.log('Restoring terminal from minimized state');
      
      // Force a fit to recalculate dimensions
      setTimeout(() => {
        if (fitAddonRef.current && terminal) {
          fitAddonRef.current.fit();
          
          // Refresh the terminal display
          terminal.refresh(0, terminal.rows - 1);
          
          // Send resize event to backend
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const { cols, rows } = terminal;
            console.log('Sending resize after restore:', { cols, rows });
            wsRef.current.send(JSON.stringify({
              type: 'resize',
              cols,
              rows
            }));
          }
        }
      }, 50);
    }
    
    prevMinimizedRef.current = isMinimized;
  }, [isMinimized, terminal]);

  const setupWebSocketConnection = async (term: Terminal) => {
    try {
      console.log('Setting up WebSocket connection');
      
      // Get authentication token - support both OTP and Google auth
      let token = '';
      let authUserId = userId;
      
      // Check for OTP auth first
      const otpToken = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      
      if (otpToken && userStr) {
        token = otpToken;
        const user = JSON.parse(userStr);
        authUserId = user.id;
        console.log('Using OTP auth');
      } else if (auth?.accessToken) {
        token = auth.accessToken;
        console.log('Using Google auth');
      } else {
        throw new Error('User not authenticated');
      }
      
      console.log('Auth state:', { authUserId, hasToken: !!token, organizationId: currentOrganizationId });

      term.writeln('🔐 Connecting to SSH...');
      
      let wsHost: string;
      let protocol: string | undefined;
      if (import.meta.env.VITE_API_URL === 'https://api.slopbox.dev/api') {
        // In production, check if we're on slopbox.dev
        wsHost = 'api.slopbox.dev';
        protocol = 'wss';
      } else {
        wsHost = 'localhost:3000';
        protocol = 'ws';
      }
      
      const wsUrl = `${protocol}://${wsHost}/ssh-ws?userId=${authUserId}&vmId=${vm.id}&token=${encodeURIComponent(token)}&organizationId=${currentOrganizationId || ''}`;
      
      console.log('WebSocket URL:', wsUrl);
      console.log('VM details:', { id: vm.id, name: vm.name, publicIp: vm.publicIp });
      console.log('Organization ID:', currentOrganizationId);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket opened successfully');
        console.log('WebSocket readyState:', ws.readyState);
        console.log('WebSocket protocol:', ws.protocol);
        console.log('WebSocket extensions:', ws.extensions);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('WebSocket message received:', msg.type, msg.data?.substring ? msg.data.substring(0, 50) + '...' : msg.data);
          
          switch (msg.type) {
            case 'connected':
              setIsConnected(true);
              isConnectedRef.current = true;
              setIsConnecting(false);
              term.clear();
              showSuccess('SSH connection established');
              // Force a fit and send terminal size after connection
              setTimeout(() => {
                if (fitAddonRef.current) {
                  fitAddonRef.current.fit();
                }
                const { cols, rows } = term;
                console.log('Sending terminal size after connection:', { cols, rows });
                ws.send(JSON.stringify({
                  type: 'resize',
                  cols,
                  rows
                }));
                // Force terminal refresh
                term.refresh(0, term.rows - 1);
              }, 200);
              break;
              
            case 'data':
              // Decode base64 data and write to terminal
              // Use proper UTF-8 decoding
              try {
                const binaryString = atob(msg.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const decoder = new TextDecoder('utf-8');
                const text = decoder.decode(bytes);
                term.write(text);
              } catch (e) {
                console.error('Error decoding terminal data:', e);
                // Fallback to simple decoding
                term.write(atob(msg.data));
              }
              break;
              
            case 'status':
              term.writeln(`ℹ️  ${msg.data}`);
              break;
              
            case 'error':
              term.writeln(`\x1b[31m❌ ${msg.data}\x1b[0m`);
              showError(msg.data);
              setIsConnecting(false);
              break;
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error event:', error);
        console.error('WebSocket readyState:', ws.readyState);
        console.error('WebSocket url:', ws.url);
        console.error('Error type:', error.type);
        console.error('Full error object:', error);
        term.writeln('\x1b[31m❌ Connection error\x1b[0m');
        showError('Failed to connect to SSH');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', { 
          code: event.code, 
          reason: event.reason, 
          wasClean: event.wasClean,
          type: event.type,
          timeStamp: event.timeStamp
        });
        console.log('Close event codes: 1000=Normal, 1001=Going Away, 1002=Protocol Error, 1003=Unsupported Data, 1006=Abnormal Closure');
        setIsConnected(false);
        isConnectedRef.current = false;
        if (!isConnecting) {
          term.writeln('\x1b[33m⚠️  Connection closed\x1b[0m');
        }
      };

      // Handle terminal input
      term.onData((data) => {
        console.log('Terminal data event:', {
          data: data,
          wsReadyState: ws.readyState,
          isConnected: isConnectedRef.current,
          wsOpen: ws.readyState === WebSocket.OPEN
        });
        
        if (ws.readyState === WebSocket.OPEN) {
          // Send input to WebSocket with proper UTF-8 encoding
          console.log('Sending data to WebSocket:', data);
          try {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(data);
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
              binaryString += String.fromCharCode(bytes[i]);
            }
            ws.send(JSON.stringify({
              type: 'data',
              data: btoa(binaryString)
            }));
          } catch (e) {
            console.error('Error encoding terminal input:', e);
            // Fallback to simple encoding
            ws.send(JSON.stringify({
              type: 'data',
              data: btoa(data)
            }));
          }
        } else {
          console.warn('WebSocket not open, cannot send data');
        }
      });

      // Handle terminal resize
      term.onResize(({ cols, rows }) => {
        console.log('Terminal resize:', { cols, rows });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols,
            rows
          }));
        }
      });

      // Send initial terminal size when connected
      const sendInitialSize = () => {
        if (ws.readyState === WebSocket.OPEN) {
          const { cols, rows } = term;
          console.log('Sending initial terminal size:', { cols, rows });
          ws.send(JSON.stringify({
            type: 'resize',
            cols,
            rows
          }));
        }
      };
      
      // Try sending size immediately and after a delay
      sendInitialSize();
      setTimeout(sendInitialSize, 500);

      // Ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      // Clean up ping interval on close
      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });

    } catch (error: any) {
      setIsConnecting(false);
      console.error('SSH setup error:', error);
      console.error('Error stack:', error.stack);
      term.writeln(`\x1b[31m❌ Error: ${error.message || 'Failed to setup SSH connection'}\x1b[0m`);
      showError(error.message || 'Failed to setup SSH connection');
    }
  };

  const reconnect = () => {
    console.log('Reconnecting to SSH...');
    if (terminal && wsRef.current) {
      console.log('Closing existing WebSocket connection');
      wsRef.current.close();
      terminal.clear();
      setIsConnecting(true);
      setIsConnected(false);
      setupWebSocketConnection(terminal);
    }
  };

  return (
    <>
      {/* Floating button when minimized */}
      {isMinimized && (
        <div className="fixed bottom-4 right-4 z-50">
          <div 
            className="bg-te-gray-900 dark:bg-te-gray-950 rounded-full shadow-xl p-4 cursor-pointer hover:bg-te-gray-800 transition-colors"
            onClick={() => {
              setIsMinimized(false);
              // Force terminal to be visible immediately
              if (terminal) {
                terminal.focus();
              }
            }}
            title="Click to restore SSH terminal"
          >
            <div className="relative">
              <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {isConnected && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
              )}
            </div>
          </div>
          <div className="absolute bottom-full right-0 mb-2 bg-te-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity">
            SSH: {vm.name}
          </div>
        </div>
      )}

      {/* Terminal window - keep mounted but hidden when minimized */}
      <div 
        className={`fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50 ${isMinimized ? 'invisible' : 'visible'}`}
      >
        <div className="bg-te-gray-900 dark:bg-te-gray-950 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-te-gray-800">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-semibold uppercase tracking-wider text-white">
              SSH Terminal - {vm.name}
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            {isConnected && (
              <span className="text-xs uppercase tracking-wider text-green-500 flex items-center space-x-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span>Connected</span>
              </span>
            )}
            {!isConnecting && !isConnected && (
              <button
                onClick={reconnect}
                className="btn-secondary text-xs flex items-center space-x-1"
                title="Reconnect"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Reconnect</span>
              </button>
            )}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 rounded-md bg-te-gray-800 hover:bg-te-gray-700 text-te-gray-300 hover:text-te-yellow transition-all duration-200"
              title="Minimize"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={_onClose}
              className="p-2 rounded-md bg-te-gray-800 hover:bg-red-600 text-te-gray-300 hover:text-white transition-all duration-200"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-4 overflow-hidden">
          <div 
            ref={terminalRef} 
            className="h-full w-full"
            style={{ 
              opacity: isConnecting ? 0.7 : 1,
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
              fontSize: '14px',
              lineHeight: '1.0'
            }}
          />
        </div>

        {isConnecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-te-gray-900 bg-opacity-50 rounded-b-lg">
            <div className="flex items-center space-x-2">
              <svg className="animate-spin h-5 w-5 text-te-yellow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm uppercase tracking-wider">Connecting to SSH...</span>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}