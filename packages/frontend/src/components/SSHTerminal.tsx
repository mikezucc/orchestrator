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
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { showError, showSuccess } = useToast();
  const { userId, auth } = useAuth();

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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
    fitAddon.fit();
    fitAddonRef.current = fitAddon;

    // Handle window resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    setTerminal(term);

    // Setup WebSocket SSH connection
    setupWebSocketConnection(term);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, []);

  const setupWebSocketConnection = async (term: Terminal) => {
    try {
      console.log('Setting up WebSocket connection');
      console.log('Auth state:', { userId, hasAuth: !!auth, hasToken: !!auth?.accessToken });
      
      if (!userId || !auth) {
        throw new Error('User not authenticated');
      }

      term.writeln('🔐 Connecting to SSH...');
      
      // Create WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let host = window.location.host; // This will be the frontend host (localhost:3000 in dev)
      if (host.includes(':5173')) {
        host = host.replace(':5173', ':3000'); // Replace dev port with backend port
      }
      const wsUrl = `${protocol}//${host}/ssh-ws?userId=${userId}&vmId=${vm.id}&token=${encodeURIComponent(auth.accessToken || '')}`;
      
      console.log('WebSocket URL:', wsUrl);
      console.log('VM details:', { id: vm.id, name: vm.name, publicIp: vm.publicIp });
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket opened successfully');
        console.log('WebSocket readyState:', ws.readyState);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('WebSocket message received:', msg.type, msg.data?.substring ? msg.data.substring(0, 50) + '...' : msg.data);
          
          switch (msg.type) {
            case 'connected':
              setIsConnected(true);
              setIsConnecting(false);
              term.clear();
              showSuccess('SSH connection established');
              break;
              
            case 'data':
              // Decode base64 data and write to terminal
              const data = atob(msg.data);
              term.write(data);
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
        term.writeln('\x1b[31m❌ Connection error\x1b[0m');
        showError('Failed to connect to SSH');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        setIsConnected(false);
        if (!isConnecting) {
          term.writeln('\x1b[33m⚠️  Connection closed\x1b[0m');
        }
      };

      // Handle terminal input
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN && isConnected) {
          // Send input to WebSocket
          ws.send(JSON.stringify({
            type: 'data',
            data: btoa(data)
          }));
        }
      });

      // Handle terminal resize
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN && isConnected) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols,
            rows
          }));
        }
      });

      // Send initial terminal size
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const { cols, rows } = term;
          ws.send(JSON.stringify({
            type: 'resize',
            cols,
            rows
          }));
        }
      }, 100);

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
    if (terminal && wsRef.current) {
      wsRef.current.close();
      terminal.clear();
      setIsConnecting(true);
      setIsConnected(false);
      setupWebSocketConnection(terminal);
    }
  };

  return (
    <div className="fixed inset-0 bg-te-gray-950 bg-opacity-50 flex items-center justify-center p-4 z-50">
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
              onClick={onClose}
              className="p-1 hover:text-te-yellow transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-4">
          <div 
            ref={terminalRef} 
            className="h-full"
            style={{ opacity: isConnecting ? 0.7 : 1 }}
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
  );
}