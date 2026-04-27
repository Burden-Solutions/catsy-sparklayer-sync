#!/bin/bash

# Catsy → SparkLayer Sync — Service Installation Script

echo "🚀 Installing Catsy → SparkLayer Sync Service..."

SERVICE_NAME="catsy-sparklayer-sync"
SERVICE_FILE="$SERVICE_NAME.service"
TIMER_FILE="$SERVICE_NAME.timer"
INSTALL_DIR="$(pwd)"
CURRENT_USER="${SUDO_USER:-ubuntu}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "💡 Run: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

NODE_PATH=$(which node)
echo "📍 Node.js found at: $NODE_PATH"

# Check .env file exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "❌ .env file not found at $INSTALL_DIR/.env"
    echo "💡 Copy .env.example to .env and fill in your credentials before installing."
    exit 1
fi

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install --omit=dev

# Copy service and timer files to systemd (keep repo files clean)
echo "📁 Copying service and timer files..."
cp $SERVICE_FILE /etc/systemd/system/
cp $TIMER_FILE /etc/systemd/system/

# Patch the installed copies with correct paths and user
sed -i "s|/usr/bin/env node|$NODE_PATH|g"               /etc/systemd/system/$SERVICE_FILE
sed -i "s|WorkingDirectory=.*|WorkingDirectory=$INSTALL_DIR|g" /etc/systemd/system/$SERVICE_FILE
sed -i "s|EnvironmentFile=.*|EnvironmentFile=$INSTALL_DIR/.env|g" /etc/systemd/system/$SERVICE_FILE
sed -i "s|User=ubuntu|User=$CURRENT_USER|g"              /etc/systemd/system/$SERVICE_FILE

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl daemon-reload

# Enable and start the timer
echo "⚡ Enabling timer..."
systemctl enable $SERVICE_NAME.timer

echo "▶️  Starting timer..."
systemctl start $SERVICE_NAME.timer

# Show status
echo ""
echo "📊 Timer status:"
systemctl status $SERVICE_NAME.timer --no-pager

echo ""
echo "⏰ Next scheduled run:"
systemctl list-timers $SERVICE_NAME.timer --no-pager

echo ""
echo "✅ Installation complete! Sync will run daily at 7am AEST."
echo ""
echo "📋 Useful commands:"
echo "  Run now:   sudo systemctl start $SERVICE_NAME.service"
echo "  Logs:      sudo journalctl -u $SERVICE_NAME.service -f"
echo "  Timer:     sudo systemctl status $SERVICE_NAME.timer"
echo "  Next run:  systemctl list-timers $SERVICE_NAME.timer"
