import { useState } from 'react';

interface WormholeSectionProps {
  vmId?: string;
  publicIp?: string;
}

export default function WormholeSection({ vmId, publicIp }: WormholeSectionProps) {
  const [command, setCommand] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [commandHistory, setCommandHistory] = useState<Array<{ command: string; response?: string; timestamp: Date }>>([]);

  const handleConnect = () => {
    setConnectionStatus('connecting');
    // TODO: Implement WebSocket connection to port 8080
    console.log('Connecting to Wormhole service on port 8080...');
    setTimeout(() => {
      setConnectionStatus('connected');
    }, 1000);
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    // TODO: Close WebSocket connection
    console.log('Disconnecting from Wormhole service...');
  };

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    // TODO: Send command via WebSocket
    const newCommand = {
      command: command.trim(),
      timestamp: new Date(),
      response: 'Command sent (placeholder response)'
    };
    
    setCommandHistory([...commandHistory, newCommand]);
    setCommand('');
    console.log('Sending command:', command);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wider">Wormhole Service</h2>
          <p className="text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-500 mt-1">
            WebSocket Command Interface (Port 8080)
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center space-x-2 text-xs uppercase tracking-wider ${
            connectionStatus === 'connected' 
              ? 'text-green-600 dark:text-te-yellow' 
              : connectionStatus === 'connecting'
              ? 'text-yellow-600 dark:text-te-orange'
              : 'text-te-gray-500 dark:text-te-gray-600'
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full ${
              connectionStatus === 'connected' 
                ? 'bg-green-500 dark:bg-te-yellow' 
                : connectionStatus === 'connecting'
                ? 'bg-yellow-500 dark:bg-te-orange animate-pulse'
                : 'bg-te-gray-400 dark:bg-te-gray-600'
            }`} />
            {connectionStatus}
          </span>
          {connectionStatus === 'disconnected' ? (
            <button
              onClick={handleConnect}
              disabled={!publicIp}
              className="btn-primary"
              title={!publicIp ? 'No public IP available' : 'Connect to Wormhole service'}
            >
              Connect
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="btn-secondary"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {connectionStatus === 'disconnected' ? (
          <div className="text-center py-8 text-te-gray-600 dark:text-te-gray-500">
            <p className="mb-2">Not connected to Wormhole service</p>
            <p className="text-xs">Click Connect to establish WebSocket connection on port 8080</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {commandHistory.length === 0 ? (
                <p className="text-xs text-te-gray-600 dark:text-te-gray-500">No commands sent yet</p>
              ) : (
                commandHistory.map((item, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-start space-x-2">
                      <span className="text-xs text-te-gray-600 dark:text-te-gray-500 whitespace-nowrap">
                        {item.timestamp.toLocaleTimeString()}
                      </span>
                      <div className="flex-1">
                        <p className="font-mono text-sm text-green-600 dark:text-te-yellow">$ {item.command}</p>
                        {item.response && (
                          <p className="font-mono text-xs text-te-gray-600 dark:text-te-gray-400 mt-1 pl-2">
                            {item.response}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendCommand} className="flex space-x-2">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter command..."
                className="flex-1 font-mono text-sm"
                disabled={connectionStatus !== 'connected'}
              />
              <button
                type="submit"
                disabled={connectionStatus !== 'connected' || !command.trim()}
                className="btn-primary"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="text-xs text-te-gray-600 dark:text-te-gray-500 space-y-1">
        <p>• WebSocket connection will be established on ws://{publicIp || '<public-ip>'}:8080</p>
        <p>• Commands will be sent to the Wormhole service running on the VM</p>
        <p>• Ensure port 8080 is accessible through firewall rules</p>
      </div>
    </div>
  );
}