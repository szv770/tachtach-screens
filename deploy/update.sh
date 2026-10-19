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
#  The admin website's "Software update" card runs this too, through
#  deploy/run-update.sh (as the app's user, never as root). Then run-update.sh
#  sets these, and only these, from its own code:
#    TT_UPDATE_SPLIT=1       skip the sudo steps (units + restarts); run-update.sh does them as root
#    TT_UPDATE_MODE=rollback go back to TT_ROLLBACK_TO (a full commit hash) instead of pulling
#  It prints "TT_STAGE=<pull|deps|build>" markers so run-update.sh knows how far it got.
#
# ============================================================================

set -e

# Run from a private copy of this file: `git pull` / `git reset` below may rewrite
# deploy/update.sh while bash is still reading it, which can run garbage. The copy
# is unlinked at once (bash keeps its open handle), so nothing is left behind.
if [ -z "${TT_UPDATE_COPY:-}" ]; then
  _real="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  _copy="$(mktemp)"
  cp "${BASH_SOURCE[0]}" "$_copy"
  TT_UPDATE_COPY=1 TT_UPDATE_REAL_DIR="$_real" exec bash "$_copy" "$@"
fi
rm -f -- "$0"

# Project directory: derived from where this script actually lives
# (repo-root/deploy/update.sh), so it works regardless of the clone location
# or username — no assumption about /home/pi needed.
SCRIPT_DIR="${TT_UPDATE_REAL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
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

echo "TT_STAGE=pull"
if [ "${TT_UPDATE_MODE:-update}" = "rollback" ]; then
  # Go back to an exact earlier commit (the same data-file protection as an update applies).
  if ! [[ "${TT_ROLLBACK_TO:-}" =~ ^[0-9a-f]{40}$ ]]; then
    log "Refusing to roll back: not a full commit hash"
    exit 1
  fi
  git cat-file -e "${TT_ROLLBACK_TO}^{commit}"
  log "Putting back version ${TT_ROLLBACK_TO:0:7}..."
  git reset --hard "$TT_ROLLBACK_TO"
else
  log "Pulling latest code..."
  git pull --ff-only
fi

if [ "${#CHANGED[@]}" -gt 0 ]; then
  restore_data
  trap - EXIT
  log "Restored the Pi's own data files"
  # keep only the 10 most recent backups
  ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +11 | xargs -r rm -rf
fi

echo "TT_STAGE=deps"
log "Installing dependencies..."
# NOTE: must NOT use --omit=dev — "npm run build" runs `vite build`, and vite
# is a devDependency. Omitting dev deps here means the very next line fails
# with "'vite' is not recognized..." (reproduced during testing). devDeps are
# only needed at build time, not at runtime, but there's no harm leaving them
# installed on the Pi.
npm ci

echo "TT_STAGE=build"
log "Building frontend..."
npm run build

if [ "${TT_UPDATE_SPLIT:-0}" = "1" ]; then
  log "=== Code and build ready; the units and restarts are done by run-update.sh ==="
  exit 0
fi

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
