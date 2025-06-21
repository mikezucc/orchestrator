import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { sshApi } from '../api/ssh';
import { useToast } from '../contexts/ToastContext';
import type { VirtualMachine } from '@gce-platform/types';

interface SSHTerminalProps {
  vm: VirtualMachine;
  onClose: () => void;
}

export default function SSHTerminal({ vm, onClose }: SSHTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [sshInfo, setSSHInfo] = useState<any>(null);
  const { showError, showSuccess } = useToast();

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

    // Handle window resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    setTerminal(term);

    // Setup SSH connection
    setupSSHConnection(term);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  const setupSSHConnection = async (term: Terminal) => {
    try {
      term.writeln('🔐 Setting up SSH connection...');
      
      // Get or setup SSH keys
      const response = await sshApi.setupSSH(vm.id);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to setup SSH');
      }

      setSSHInfo(response.data);
      setIsConnecting(false);
      
      term.writeln(`✅ SSH keys configured for ${response.data.username}@${response.data.host}`);
      term.writeln('');
      term.writeln('📋 Connection details:');
      term.writeln(`   Host: ${response.data.host}`);
      term.writeln(`   Port: ${response.data.port}`);
      term.writeln(`   Username: ${response.data.username}`);
      term.writeln('');
      term.writeln('🔑 Private key has been generated. You can use it with any SSH client.');
      term.writeln('');
      
      // Since we can't directly SSH from the browser, provide instructions
      term.writeln('To connect via SSH, you have several options:');
      term.writeln('');
      term.writeln('1. Copy the private key below and save it to a file (e.g., ~/.ssh/vm-key):');
      term.writeln('');
      term.write('\x1b[36m'); // Cyan color
      term.writeln('-----BEGIN PRIVATE KEY-----');
      
      // Split private key into lines for better display
      const keyLines = response.data.privateKey.split('\n');
      keyLines.forEach(line => {
        if (line && !line.includes('BEGIN') && !line.includes('END')) {
          term.writeln(line);
        }
      });
      
      term.writeln('-----END PRIVATE KEY-----');
      term.write('\x1b[0m'); // Reset color
      term.writeln('');
      term.writeln('2. Set proper permissions and connect:');
      term.writeln('   chmod 600 ~/.ssh/vm-key');
      term.writeln(`   ssh -i ~/.ssh/vm-key ${response.data.username}@${response.data.host}`);
      term.writeln('');
      term.writeln('3. Or use gcloud CLI (if you have it installed):');
      term.writeln(`   gcloud compute ssh ${response.data.username}@${vm.name} --project=${vm.gcpProjectId} --zone=${vm.zone}`);
      
      // Add copy button functionality
      term.writeln('');
      term.writeln('Press Ctrl+A (or Cmd+A on Mac) then Ctrl+C to copy all text.');
      
      showSuccess('SSH keys have been added to the VM');
    } catch (error: any) {
      setIsConnecting(false);
      console.error('SSH setup error:', error);
      term.writeln(`\x1b[31m❌ Error: ${error.message || 'Failed to setup SSH connection'}\x1b[0m`);
      showError(error.message || 'Failed to setup SSH connection');
    }
  };

  const downloadPrivateKey = () => {
    if (!sshInfo) return;
    
    const blob = new Blob([sshInfo.privateKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${vm.name}-ssh-key.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccess('Private key downloaded');
  };

  const copySSHCommand = () => {
    if (!sshInfo) return;
    
    const command = `ssh -i ~/.ssh/${vm.name}-ssh-key.pem ${sshInfo.username}@${sshInfo.host}`;
    navigator.clipboard.writeText(command);
    showSuccess('SSH command copied to clipboard');
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
            {sshInfo && (
              <>
                <button
                  onClick={downloadPrivateKey}
                  className="btn-secondary text-xs flex items-center space-x-1"
                  title="Download private key"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  <span>Download Key</span>
                </button>
                <button
                  onClick={copySSHCommand}
                  className="btn-secondary text-xs flex items-center space-x-1"
                  title="Copy SSH command"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy Command</span>
                </button>
              </>
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
          <div className="absolute inset-0 flex items-center justify-center bg-te-gray-900 bg-opacity-50">
            <div className="flex items-center space-x-2">
              <svg className="animate-spin h-5 w-5 text-te-yellow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm uppercase tracking-wider">Setting up SSH...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}