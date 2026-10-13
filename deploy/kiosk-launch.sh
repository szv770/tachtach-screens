#!/usr/bin/env bash
# ============================================================================
#  TachTach-Screens — Kiosk launcher (run by tachtach-kiosk.service)
# ============================================================================
#
#  Replaces the old fixed "sleep 5 then launch Chromium" with real readiness
#  checks, so a cold boot (power cut, unplug/replug) comes up on its own:
#
#    1. Wait for the desktop's display socket (X11 :0 or Wayland).
#    2. Wait for the TachTach server to actually answer /screen.
#    3. Clear Chromium's "didn't shut down correctly" state and stale profile
#       locks left behind by a power cut — otherwise Chromium can show a
#       restore bubble over the kiosk or refuse to start ("profile in use").
#    4. exec Chromium (whichever binary name this OS ships).
#
#  Each wait is capped, then we launch anyway — systemd restarts us if
#  Chromium can't start yet, so the worst case is a retry, never a hang.
# ============================================================================

set -u

SCREEN_URL="${SCREEN_URL:-http://127.0.0.1:3000/screen}"
UID_NUM="$(id -u)"

log() { echo "[kiosk-launch] $*"; }

# ── 1. Display ──────────────────────────────────────────────────────────────
for i in $(seq 1 120); do
  if [ -S /tmp/.X11-unix/X0 ] || ls "/run/user/$UID_NUM"/wayland-* >/dev/null 2>&1; then
    break
  fi
  [ "$i" -eq 1 ] && log "waiting for desktop display..."
  sleep 1
done

# ── 2. Server ───────────────────────────────────────────────────────────────
for i in $(seq 1 120); do
  if curl -fs -o /dev/null --max-time 2 "$SCREEN_URL"; then
    break
  fi
  [ "$i" -eq 1 ] && log "waiting for TachTach server at $SCREEN_URL..."
  sleep 1
done

# ── 3. Crash-recovery cleanup ───────────────────────────────────────────────
PROFILE_DIR="$HOME/.config/chromium"
rm -f "$PROFILE_DIR"/SingletonLock "$PROFILE_DIR"/SingletonSocket "$PROFILE_DIR"/SingletonCookie
PREFS="$PROFILE_DIR/Default/Preferences"
if [ -f "$PREFS" ]; then
  sed -i \
    -e 's/"exited_cleanly":false/"exited_cleanly":true/' \
    -e 's/"exit_type":"[^"]*"/"exit_type":"Normal"/' \
    "$PREFS"
fi

# ── 4. Launch ───────────────────────────────────────────────────────────────
CHROMIUM=""
for c in /usr/bin/chromium /usr/bin/chromium-browser; do
  if [ -x "$c" ]; then CHROMIUM="$c"; break; fi
done
if [ -z "$CHROMIUM" ]; then
  log "ERROR: no chromium binary found (install with: sudo apt install chromium)"
  exit 1
fi

log "launching $CHROMIUM → $SCREEN_URL"
exec "$CHROMIUM" \
  --kiosk \
  --start-fullscreen \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --disable-features=TranslateUI \
  --disable-restore-session-state \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  --no-first-run \
  --password-store=basic \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  --disable-pinch \
  --disable-dev-shm-usage \
  --autoplay-policy=no-user-gesture-required \
  "$SCREEN_URL"
