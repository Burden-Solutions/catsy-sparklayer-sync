#!/bin/bash

# Catsy → SparkLayer Sync — Service Removal Script

echo "🗑️  Removing Catsy → SparkLayer Sync Service..."

SERVICE_NAME="catsy-sparklayer-sync"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Stop and disable the timer
echo "⏹️  Stopping and disabling timer..."
systemctl stop $SERVICE_NAME.timer 2>/dev/null || true
systemctl disable $SERVICE_NAME.timer 2>/dev/null || true

# Stop the service in case it's mid-run
echo "⏹️  Stopping service..."
systemctl stop $SERVICE_NAME.service 2>/dev/null || true

# Remove service and timer files
echo "🗑️  Removing service and timer files..."
rm -f /etc/systemd/system/$SERVICE_NAME.service
rm -f /etc/systemd/system/$SERVICE_NAME.timer

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl daemon-reload

echo ""
echo "✅ Service removed successfully!"
echo "📋 The sync will no longer run automatically."
echo "💡 Your .env, logs, and exports are untouched."
