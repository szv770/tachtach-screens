#!/usr/bin/env bash
# ============================================================================
#  TachTach-Screens — stop the Pi asking for the Wi-Fi password on the TV
# ============================================================================
#
#  Run on the Pi:   sudo bash ~/tachtach-screens/deploy/wifi-system-wide.sh
#
#  Symptom: a "Wi-Fi Network Authentication Required — Passwords or encryption
#  keys are required to access the Wi-Fi network '…'" window pops up over the
#  kiosk, and the Pi is offline until someone types the password.
#
#  Cause: the saved Wi-Fi password is "agent-owned" — kept in the desktop user's
#  keyring, which is locked when the desktop auto-logs-in, so NetworkManager
#  asks a person. Or the router's password changed.
#
#  Fix: store the password in NetworkManager's own root-only connection file
#  (system-wide, psk-flags 0) so it never needs the keyring, make the connection
#  available to all users, and auto-connect. Safe to re-run any time.
# ============================================================================

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo:  sudo bash $0"
  exit 1
fi
if ! command -v nmcli >/dev/null 2>&1; then
  echo "nmcli not found — this Pi isn't using NetworkManager, so this script doesn't apply."
  exit 1
fi

echo "Saved Wi-Fi networks on this Pi:"
nmcli -t -f NAME,TYPE connection show | awk -F: '$2 ~ /wireless/ {print "  - " $1}'
echo

read -rp "Wi-Fi network name (SSID) [Admin-Only]: " SSID
SSID="${SSID:-Admin-Only}"
read -rsp "Wi-Fi password for \"$SSID\" (typing is hidden): " PSK
echo
if [ -z "$PSK" ]; then
  echo "Empty password — nothing changed."
  exit 1
fi

if nmcli -t -f NAME connection show | grep -Fxq -- "$SSID"; then
  echo "Updating the existing connection \"$SSID\"…"
  nmcli connection modify "$SSID" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk-flags 0 \
    wifi-sec.psk "$PSK" \
    connection.permissions "" \
    connection.autoconnect yes
else
  DEV="$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2=="wifi"{print $1; exit}')"
  if [ -z "$DEV" ]; then
    echo "No Wi-Fi adapter found."
    exit 1
  fi
  echo "Creating the connection \"$SSID\" on $DEV…"
  nmcli connection add type wifi ifname "$DEV" con-name "$SSID" ssid "$SSID" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk-flags 0 \
    wifi-sec.psk "$PSK" \
    connection.autoconnect yes
fi

echo "Connecting…"
if nmcli connection up "$SSID"; then
  echo
  echo "Connected. The password is now stored system-wide, so a reboot or"
  echo "auto-login won't ask for it again."
else
  echo
  echo "Saved, but couldn't connect right now — usually a wrong password or the"
  echo "network is out of range. Re-run this script with the right password."
  exit 1
fi
