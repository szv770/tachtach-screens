#!/usr/bin/env bash
# ============================================================================
#  TachTach-Screens — Raspberry Pi 5 Kiosk Setup
# ============================================================================
#
#  Run as root:  sudo bash pi-setup.sh
#
#  This script:
#    1. Installs Node.js LTS (via NodeSource)
#    2. Installs Chromium and unclutter (cursor hider)
#    3. Installs npm dependencies and builds the frontend
#    4. Creates systemd services for the server and kiosk
#    5. Disables screen blanking / screensaver
#    6. Enables and starts the services
#
#  Prerequisites:
#    - Raspberry Pi OS (Bookworm or later) with desktop environment
#    - The tachtach-screens project cloned somewhere under your user's home
#      directory (e.g. /home/<your-username>/tachtach-screens) — the exact
#      username doesn't matter, this script detects it automatically.
#    - Internet connection for package installation
#
#  Hidden admin access on kiosk:
#    Tap the top-left corner (10x10px area) 5 times within 2 seconds.
#    A password dialog will appear; enter the admin password to open /admin.
#
# ============================================================================

set -euo pipefail

# ── Preflight checks ──────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run as root (sudo bash pi-setup.sh)"
  exit 1
fi

# ── Detect the real (non-root) user and their home directory ─────────────────
#
# This script must be run with `sudo`, so the invoking user is available via
# $SUDO_USER. We use that (not a hardcoded "pi") to figure out who should own
# and run the app, so this works no matter what username was chosen in
# Raspberry Pi Imager.

if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  PI_USER="$SUDO_USER"
else
  echo "ERROR: Could not detect the invoking user (\$SUDO_USER is unset or 'root')."
  echo "       Run this script with: sudo bash pi-setup.sh"
  echo "       (Do not 'su' to root first and run it from a root login shell.)"
  exit 1
fi

PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
if [ -z "$PI_HOME" ] || [ ! -d "$PI_HOME" ]; then
  echo "ERROR: Could not resolve home directory for user '$PI_USER'."
  exit 1
fi

# Project directory: derived from where this script actually lives
# (repo-root/deploy/pi-setup.sh), so it works regardless of the clone
# location or username — no assumption about /home/pi needed.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: Project directory not found at $PROJECT_DIR"
  echo "       Clone the repo first, e.g.: git clone <repo-url> $PI_HOME/tachtach-screens"
  exit 1
fi

echo "Detected user: $PI_USER (home: $PI_HOME)"
echo "Project dir:   $PROJECT_DIR"
echo ""

echo "============================================"
echo "  TachTach-Screens — Pi 5 Kiosk Setup"
echo "============================================"
echo ""

# ── 1. Install Node.js LTS ────────────────────────────────────────────────────

echo "[1/6] Installing Node.js LTS..."
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  echo "       Node.js already installed: $NODE_VER"
else
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
  echo "       Installed Node.js $(node --version)"
fi

# ── 2. Install Chromium and unclutter ──────────────────────────────────────────

echo "[2/6] Installing Chromium and unclutter..."
apt-get update -qq
apt-get install -y --no-install-recommends chromium-browser unclutter-xfixes

# ── 3. Install dependencies and build ─────────────────────────────────────────

echo "[3/6] Installing npm dependencies and building..."
cd "$PROJECT_DIR"
sudo -u "$PI_USER" npm ci --production=false
sudo -u "$PI_USER" npm run build

# Run initial setup if not already done
if [ ! -f "$PROJECT_DIR/data/auth.json" ]; then
  echo ""
  echo "  No admin password set yet. Running setup..."
  sudo -u "$PI_USER" node setup.js
fi

# ── 4. Install systemd services ───────────────────────────────────────────────

echo "[4/6] Installing systemd services..."

DEPLOY_DIR="$PROJECT_DIR/deploy"

# The .service files in the repo are templates using placeholder tokens
# (__PI_USER__, __PI_HOME__, __PROJECT_DIR__) since systemd unit files can't
# read shell variables at install time. Substitute the real detected
# user/home/project dir here, then write the result into /etc/systemd/system/.
sed \
  -e "s#__PI_USER__#$PI_USER#g" \
  -e "s#__PI_HOME__#$PI_HOME#g" \
  -e "s#__PROJECT_DIR__#$PROJECT_DIR#g" \
  "$DEPLOY_DIR/tachtach-server.service" > /etc/systemd/system/tachtach-server.service

sed \
  -e "s#__PI_USER__#$PI_USER#g" \
  -e "s#__PI_HOME__#$PI_HOME#g" \
  -e "s#__PROJECT_DIR__#$PROJECT_DIR#g" \
  "$DEPLOY_DIR/tachtach-kiosk.service" > /etc/systemd/system/tachtach-kiosk.service

# Nightly kiosk restart timer — no placeholder tokens, installed as-is.
cp "$DEPLOY_DIR/tachtach-kiosk-restart.service" /etc/systemd/system/tachtach-kiosk-restart.service
cp "$DEPLOY_DIR/tachtach-kiosk-restart.timer" /etc/systemd/system/tachtach-kiosk-restart.timer

systemctl daemon-reload
systemctl enable tachtach-server.service
systemctl enable tachtach-kiosk.service
systemctl enable tachtach-kiosk-restart.timer
systemctl start tachtach-kiosk-restart.timer

# ── 5. Disable screen blanking / screensaver ──────────────────────────────────

echo "[5/6] Disabling screen blanking and screensaver..."

# Disable DPMS and screensaver via lightdm config
LIGHTDM_CONF="/etc/lightdm/lightdm.conf"
if [ -f "$LIGHTDM_CONF" ]; then
  # Add xserver-command to disable screen blanking
  if ! grep -q "xserver-command=X -s 0 -dpms" "$LIGHTDM_CONF"; then
    sed -i '/^\[Seat:\*\]/a xserver-command=X -s 0 -dpms' "$LIGHTDM_CONF"
  fi
fi

# Create an autostart entry for unclutter (hide cursor after 0.5s idle)
AUTOSTART_DIR="$PI_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/unclutter.desktop" << 'DESKTOP'
[Desktop Entry]
Type=Application
Name=Unclutter
Exec=unclutter -idle 0.5 -root
NoDisplay=true
DESKTOP
chown -R "$PI_USER:$PI_USER" "$AUTOSTART_DIR"

# Disable screen blanking via xset for current session (if X is running)
if [ -n "${DISPLAY:-}" ]; then
  sudo -u "$PI_USER" xset s off
  sudo -u "$PI_USER" xset -dpms
  sudo -u "$PI_USER" xset s noblank
fi

# ── 6. Start services ─────────────────────────────────────────────────────────

echo "[6/6] Starting services..."
systemctl start tachtach-server.service

# Wait for server to be ready before starting kiosk
echo "       Waiting for server to start..."
for i in $(seq 1 15); do
  if curl -s -o /dev/null http://127.0.0.1:3000/screen 2>/dev/null; then
    break
  fi
  sleep 1
done

systemctl start tachtach-kiosk.service

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  Server:  systemctl status tachtach-server"
echo "  Kiosk:   systemctl status tachtach-kiosk"
echo "  Kiosk restarts nightly at 3:15 AM (systemctl list-timers tachtach-kiosk-restart.timer)"
echo "  Logs:    journalctl -u tachtach-server -f"
echo ""
echo "  Admin access from kiosk:"
echo "    Tap the top-left corner 5 times within"
echo "    2 seconds, then enter the admin password."
echo ""
echo "  Admin access from network:"
echo "    http://<pi-ip>:3000/admin"
echo "    (only if HOST=0.0.0.0 in environment)"
echo ""
echo "  To update the app:"
echo "    cd $PROJECT_DIR"
echo "    git pull"
echo "    npm ci && npm run build"
echo "    sudo systemctl restart tachtach-server"
echo "    sudo systemctl restart tachtach-kiosk"
echo ""
