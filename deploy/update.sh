#!/bin/bash
# ============================================================================
#  TachTach-Screens — Pi Update Script
# ============================================================================
#
#  Run from your PC:  ssh <your-user>@tachtach.local 'bash ~/tachtach-screens/deploy/update.sh'
#  Or from the Pi:    bash ~/tachtach-screens/deploy/update.sh
#
#  (Replace <your-user> with whatever username you chose in Raspberry Pi
#  Imager — this script does not assume the username is "pi".)
#
# ============================================================================

set -e

# Project directory: derived from where this script actually lives
# (repo-root/deploy/update.sh), so it works regardless of the clone location
# or username — no assumption about /home/pi needed.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$HOME/tachtach-update.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() {
  echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

log "=== TachTach update started ==="

cd "$PROJECT_DIR"

log "Pulling latest code..."
git pull

log "Installing dependencies..."
# NOTE: must NOT use --omit=dev — "npm run build" runs `vite build`, and vite
# is a devDependency. Omitting dev deps here means the very next line fails
# with "'vite' is not recognized..." (reproduced during testing). devDeps are
# only needed at build time, not at runtime, but there's no harm leaving them
# installed on the Pi.
npm ci

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
