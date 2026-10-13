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

# ── Pull, without letting admin-panel edits block it ─────────────────────────
# Several data/*.json files are tracked in git as starting defaults, and the
# admin panel edits them on the Pi. A plain `git pull` refuses to run over
# those local edits ("would be overwritten by merge") and, with set -e, the
# whole update silently stopped there. So: back up the locally-modified data
# files, reset them, pull, then put the Pi's versions back. The trap restores
# them even if the pull fails, so content is never lost.
BACKUP_ROOT="$HOME/tachtach-data-backups"
BACKUP_DIR="$BACKUP_ROOT/$(date '+%Y%m%d-%H%M%S')"
mapfile -t CHANGED < <(git diff --name-only -- data/)

restore_data() {
  for f in "${CHANGED[@]}"; do
    if [ -f "$BACKUP_DIR/$f" ]; then
      mkdir -p "$(dirname "$f")"
      cp -p "$BACKUP_DIR/$f" "$f"
    fi
  done
  return 0
}

if [ "${#CHANGED[@]}" -gt 0 ]; then
  log "Backing up ${#CHANGED[@]} locally-edited data file(s) to $BACKUP_DIR"
  for f in "${CHANGED[@]}"; do
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    cp -p "$f" "$BACKUP_DIR/$f"
  done
  trap restore_data EXIT
  git checkout -- "${CHANGED[@]}"
fi

log "Pulling latest code..."
git pull --ff-only

if [ "${#CHANGED[@]}" -gt 0 ]; then
  restore_data
  trap - EXIT
  log "Restored the Pi's own data files"
  # keep only the 10 most recent backups
  ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +11 | xargs -r rm -rf
fi

log "Installing dependencies..."
# NOTE: must NOT use --omit=dev — "npm run build" runs `vite build`, and vite
# is a devDependency. Omitting dev deps here means the very next line fails
# with "'vite' is not recognized..." (reproduced during testing). devDeps are
# only needed at build time, not at runtime, but there's no harm leaving them
# installed on the Pi.
npm ci

log "Building frontend..."
npm run build

log "Refreshing systemd units..."
# Re-render + reinstall the units every update so fixes to deploy/*.service
# reach the Pi (previously they only did on a fresh pi-setup.sh run).
sudo bash "$PROJECT_DIR/deploy/install-services.sh"

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
