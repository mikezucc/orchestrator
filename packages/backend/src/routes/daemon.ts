import { Hono } from 'hono';
import { db } from '../db/index.js';
import { daemonBinaries } from '../db/schema-daemon.js';
import { eq } from 'drizzle-orm';

export const daemonRoutes = new Hono();

daemonRoutes.get('/latest', async (c) => {
  try {
    const [latest] = await db.select()
      .from(daemonBinaries)
      .where(eq(daemonBinaries.isLatest, true))
      .limit(1);
    
    if (!latest) {
      return c.text('No daemon binary available', 404);
    }
    
    return c.redirect(latest.publicUrl);
  } catch (error) {
    console.error('Failed to fetch latest daemon binary:', error);
    return c.text('Failed to fetch daemon binary', 500);
  }
});

daemonRoutes.get('/install.sh', async (c) => {
  const script = `#!/bin/bash
set -e

echo "=== Slopbox Daemon Installer ==="
echo ""

# Create directory for the daemon
INSTALL_DIR="/opt/slopbox"
sudo mkdir -p $INSTALL_DIR

# Download the latest daemon binary
echo "Downloading latest daemon binary..."
sudo curl -L -o $INSTALL_DIR/slopbox-daemon https://api.onfacet.dev/daemon/latest

# Make it executable
sudo chmod +x $INSTALL_DIR/slopbox-daemon

# Create systemd service file
echo "Creating systemd service..."
sudo tee /etc/systemd/system/slopbox-daemon.service > /dev/null <<EOF
[Unit]
Description=Slopbox Daemon
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/slopbox-daemon
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=slopbox-daemon
User=root

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start the service
echo "Starting Slopbox daemon..."
sudo systemctl daemon-reload
sudo systemctl enable slopbox-daemon
sudo systemctl start slopbox-daemon

# Check status
if sudo systemctl is-active --quiet slopbox-daemon; then
    echo ""
    echo "✅ Slopbox daemon installed and running successfully!"
    echo ""
    echo "You can check the status with: sudo systemctl status slopbox-daemon"
    echo "View logs with: sudo journalctl -u slopbox-daemon -f"
else
    echo ""
    echo "❌ Failed to start Slopbox daemon"
    echo "Check logs with: sudo journalctl -u slopbox-daemon -n 50"
    exit 1
fi
`;
  
  c.header('Content-Type', 'text/plain');
  c.header('Content-Disposition', 'inline; filename="install.sh"');
  return c.text(script);
});