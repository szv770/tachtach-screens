#!/usr/bin/env bash
# ============================================================================
#  TachTach-Screens — install / refresh the systemd units + boot settings
# ============================================================================
#
#  Run as:  sudo bash deploy/install-services.sh
#
#  Safe to re-run any time (pi-setup.sh and update.sh both call it), so unit
#  fixes in the repo actually reach the Pi on the next update instead of only
#  on a fresh install. Touches nothing in data/.
# ============================================================================

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo: sudo bash $0"
  exit 1
fi

PI_USER="${PI_USER:-${SUDO_USER:-}}"
if [ -z "$PI_USER" ] || [ "$PI_USER" = "root" ]; then
  echo "ERROR: could not detect the non-root user. Run with: sudo bash $0"
  exit 1
fi
PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
PI_UID="$(id -u "$PI_USER")"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[install-services] user=$PI_USER uid=$PI_UID project=$PROJECT_DIR"

render() {
  sed \
    -e "s#__PI_USER__#$PI_USER#g" \
    -e "s#__PI_HOME__#$PI_HOME#g" \
    -e "s#__PI_UID__#$PI_UID#g" \
    -e "s#__PROJECT_DIR__#$PROJECT_DIR#g" \
    "$SCRIPT_DIR/$1" > "/etc/systemd/system/$1"
}

render tachtach-server.service
render tachtach-kiosk.service
render tachtach-kiosk-restart.service
render tachtach-kiosk-restart.timer

# data/ must exist for ReadWritePaths= or the server unit fails to start.
mkdir -p "$PROJECT_DIR/data"
chown "$PI_USER:$PI_USER" "$PROJECT_DIR/data"
# Secrets (password hashes, sessions, 2-step + push keys, TLS key) are owner-only.
chmod 700 "$PROJECT_DIR/data"
for f in users.json auth.json push.json undo.json; do
  [ -f "$PROJECT_DIR/data/$f" ] && chmod 600 "$PROJECT_DIR/data/$f"
done
if [ -d "$PROJECT_DIR/data/tls" ]; then
  chmod 700 "$PROJECT_DIR/data/tls"
  chmod 600 "$PROJECT_DIR/data/tls/"*.key "$PROJECT_DIR/data/tls/"*.pem 2>/dev/null || true
fi

systemctl daemon-reload
systemctl enable tachtach-server.service tachtach-kiosk.service tachtach-kiosk-restart.timer
systemctl enable systemd-timesyncd.service 2>/dev/null || true
# Clear any leftover "start-limit-hit" so the kiosk can come back now.
systemctl reset-failed tachtach-kiosk.service tachtach-server.service 2>/dev/null || true

# ── Boot into the desktop, logged in, with no screen blanking ───────────────
# The kiosk needs a logged-in desktop session to draw on. Both are
# idempotent raspi-config settings; skipped on non-Raspberry-Pi-OS machines.
if command -v raspi-config >/dev/null 2>&1; then
  raspi-config nonint do_boot_behaviour B4 || true   # desktop autologin
  raspi-config nonint do_blanking 1 || true          # disable screen blanking
fi

echo "[install-services] done"
