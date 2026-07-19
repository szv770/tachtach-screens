#!/bin/bash
# ============================================================================
#  TachTach-Screens — Pi Update Script
# ============================================================================
#
#  Run from your PC:  ssh pi@tachtach.local 'bash /home/pi/tachtach-screens/deploy/update.sh'
#  Or from the Pi:    bash /home/pi/tachtach-screens/deploy/update.sh
#
# ============================================================================

set -e

PROJECT_DIR="/home/pi/tachtach-screens"
LOG_FILE="/home/pi/tachtach-update.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() {
  echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

log "=== TachTach update started ==="

cd "$PROJECT_DIR"

log "Pulling latest code..."
git pull

log "Installing production dependencies..."
npm ci --omit=dev

log "Building frontend..."
npm run build

log "Restarting services..."
sudo systemctl restart tachtach-server
sudo systemctl restart tachtach-kiosk

log "=== TachTach update complete ==="
echo ""
echo "Updated at: $TIMESTAMP"
echo "Server status:"
sudo systemctl is-active tachtach-server && echo "  tachtach-server: running" || echo "  tachtach-server: NOT running"
sudo systemctl is-active tachtach-kiosk  && echo "  tachtach-kiosk:  running" || echo "  tachtach-kiosk:  NOT running"
echo ""
echo "Full log: $LOG_FILE"
