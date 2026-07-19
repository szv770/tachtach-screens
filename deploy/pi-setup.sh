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
#    - The tachtach-screens project cloned to /home/pi/tachtach-screens
#    - Internet connection for package installation
#
#  Hidden admin access on kiosk:
#    Tap the top-left corner (10x10px area) 5 times within 2 seconds.
#    A password dialog will appear; enter the admin password to open /admin.
#
# ============================================================================

set -euo pipefail

PROJECT_DIR="/home/pi/tachtach-screens"
PI_USER="pi"

# ── Preflight checks ──────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run as root (sudo bash pi-setup.sh)"
  exit 1
fi

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: Project directory not found at $PROJECT_DIR"
  echo "       Clone the repo first: git clone <repo-url> $PROJECT_DIR"
  exit 1
fi

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

cp "$DEPLOY_DIR/tachtach-server.service" /etc/systemd/system/tachtach-server.service
cp "$DEPLOY_DIR/tachtach-kiosk.service"  /etc/systemd/system/tachtach-kiosk.service

systemctl daemon-reload
systemctl enable tachtach-server.service
systemctl enable tachtach-kiosk.service

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
AUTOSTART_DIR="/home/$PI_USER/.config/autostart"
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
