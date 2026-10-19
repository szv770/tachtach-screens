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
render tachtach-update.service
render tachtach-update.path

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

# ── "Update from the website" (admin > Health > Software update) ────────────
# The web server may only drop data/update-request.json. tachtach-update.path (root) notices it
# and tachtach-update.service runs a ROOT-OWNED copy of run-update.sh + update-helper.mjs, which
# validate the request and run deploy/update.sh as $PI_USER. Idempotent; copies are swapped in
# atomically because this script is itself run BY that service during a web update.
UPDATE_LIB=/usr/local/lib/tachtach-update
WEB_UPDATE_OK=1
if ! [[ "$PROJECT_DIR" =~ ^[A-Za-z0-9_./-]+$ ]] || ! [[ "$PI_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || ! [[ "$PI_HOME" =~ ^[A-Za-z0-9_./-]+$ ]]; then
  echo "[install-services] WARNING: unusual characters in the user or project path; the update-from-website feature was NOT set up."
  WEB_UPDATE_OK=0
fi
if [ "$WEB_UPDATE_OK" = "1" ]; then
  install -d -o root -g root -m 0755 "$UPDATE_LIB"
  for f in run-update.sh update-helper.mjs; do
    install -o root -g root -m 0755 "$SCRIPT_DIR/$f" "$UPDATE_LIB/$f.new"
    mv -f "$UPDATE_LIB/$f.new" "$UPDATE_LIB/$f"
  done
  install -d -o root -g root -m 0700 /var/lib/tachtach-update
  printf 'TT_PROJECT_DIR="%s"\nTT_OWNER="%s"\nTT_OWNER_HOME="%s"\n' "$PROJECT_DIR" "$PI_USER" "$PI_HOME" > /etc/tachtach-update.env.new
  chmod 0644 /etc/tachtach-update.env.new
  mv -f /etc/tachtach-update.env.new /etc/tachtach-update.env
fi

systemctl daemon-reload
systemctl enable tachtach-server.service tachtach-kiosk.service tachtach-kiosk-restart.timer
systemctl enable systemd-timesyncd.service 2>/dev/null || true
# Clear any leftover "start-limit-hit" so the kiosk can come back now.
systemctl reset-failed tachtach-kiosk.service tachtach-server.service 2>/dev/null || true

if [ "$WEB_UPDATE_OK" = "1" ]; then
  # enable + start only (never restart: this script may be running inside tachtach-update.service)
  systemctl enable tachtach-update.path
  systemctl start tachtach-update.path
  systemctl reset-failed tachtach-update.path tachtach-update.service 2>/dev/null || true
  # The marker the admin page reads to know the website may offer the update button.
  MARK="$PROJECT_DIR/data/update-installed.json"
  printf '{"version":1,"installedAt":"%s"}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$MARK.new"
  chown "$PI_USER:$PI_USER" "$MARK.new"
  chmod 600 "$MARK.new"
  mv -f "$MARK.new" "$MARK"
fi

# ── Boot into the desktop, logged in, with no screen blanking ───────────────
# The kiosk needs a logged-in desktop session to draw on. Both are
# idempotent raspi-config settings; skipped on non-Raspberry-Pi-OS machines.
if command -v raspi-config >/dev/null 2>&1; then
  raspi-config nonint do_boot_behaviour B4 || true   # desktop autologin
  raspi-config nonint do_blanking 1 || true          # disable screen blanking
fi

echo "[install-services] done"
