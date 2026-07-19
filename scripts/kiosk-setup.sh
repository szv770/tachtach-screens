#!/usr/bin/env bash
set -euo pipefail
echo "=== TachTach-Screens Kiosk Setup ==="

echo "[1/5] Installing systemd service..."
cp tachtach-screens.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tachtach-screens
systemctl start tachtach-screens

echo "[2/5] Configuring Chromium kiosk autostart..."
AUTOSTART_DIR="/etc/xdg/lxsession/LXDE-pi"
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/autostart" << 'AUTOSTART'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@unclutter -idle 0.5
@chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-translate --no-first-run --check-for-update-interval=31536000 --overscroll-history-navigation=0 --disable-pinch --disable-features=TranslateUI --disable-dev-shm-usage http://localhost:3000/screen
AUTOSTART

echo "[3/5] Installing unclutter..."
apt-get install -y unclutter

echo "[4/5] Disabling USB auto-mount..."
systemctl mask udisks2 2>/dev/null || true

echo "[5/5] Configuring SSH on port 2222..."
if ! grep -q "^Port 2222" /etc/ssh/sshd_config; then
  sed -i 's/^#\?Port .*/Port 2222/' /etc/ssh/sshd_config
  sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl restart sshd
fi

echo ""
echo "=== Setup Complete ==="
echo "Run 'node setup.js' to set admin password."
