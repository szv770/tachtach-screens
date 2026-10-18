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
#    4. Run Chromium (whichever binary name this OS ships) under a tiny GPU
#       watchdog: if Chromium's GPU process falls over (the journal floods with
#       "ContextResult::kFatalFailure ... AllocateRingBuffer() failed" and the
#       TV paints stale/garbled tiles) we kill it and exit, and systemd's
#       Restart=always brings up a clean kiosk within seconds.
#
#  Each wait is capped, then we launch anyway — systemd restarts us if
#  Chromium can't start yet, so the worst case is a retry, never a hang.
# ============================================================================

set -u

SCREEN_URL="${SCREEN_URL:-http://127.0.0.1:3000/screen}"
HTTPS_SCREEN_URL="${HTTPS_SCREEN_URL:-https://127.0.0.1:3443/screen}"
EXTRA_FLAGS=()
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

# Prefer the loopback https address: websites that only let https pages frame
# them (e.g. Charidy) can then be shown by a Web page slide. Self-signed cert,
# accepted for localhost only. Falls back to plain http if it is not answering.
for i in 1 2 3 4 5; do
  if curl -kfs -o /dev/null --max-time 3 "$HTTPS_SCREEN_URL"; then
    SCREEN_URL="$HTTPS_SCREEN_URL"
    EXTRA_FLAGS=(--allow-insecure-localhost)
    log "using local https: $SCREEN_URL"
    break
  fi
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
"$CHROMIUM" \
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
  ${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"} \
  --autoplay-policy=no-user-gesture-required \
  "$SCREEN_URL" \
  2> >(
    # stderr -> journal (as before) + GPU-failure watchdog
    bad=0; since=$(date +%s)
    while IFS= read -r line; do
      printf '%s\n' "$line" >&2
      case "$line" in
        *kFatalFailure*|*"GPU process"*"exited unexpectedly"*|*"GPU process isn't usable"*)
          now=$(date +%s)
          if [ $((now - since)) -gt 60 ]; then bad=0; since=$now; fi
          bad=$((bad + 1))
          if [ "$bad" -ge 10 ]; then
            echo "[kiosk-launch] GPU failure flood ($bad errors) - restarting Chromium" >&2
            pkill -TERM -u "$(id -u)" -x "$(basename "$CHROMIUM")"
            bad=0; since=$now
          fi
          ;;
      esac
    done
  )
rc=$?
log "Chromium exited (code $rc) - systemd will restart the kiosk"
exit "$rc"
