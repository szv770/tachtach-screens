#!/usr/bin/env bash
# ============================================================================
#  TachTach-Screens — wait (briefly) for the system clock to be NTP-synced
# ============================================================================
#
#  The Pi 5's RTC has no battery by default, so after a power cut it boots
#  with a stale clock (the last saved time — days or weeks behind). Until NTP
#  corrects it, every HTTPS request fails with "certificate is not yet
#  valid", so the server's startup data fetch (zmanim, Hayom Yom, parsha...)
#  all failed and fell back to cache. This runs as ExecStartPre of
#  tachtach-server.service and holds startup until the clock is synced.
#
#  Capped at 90s: with no internet the clock never syncs, and the server must
#  still start and serve cached data (offline tolerance is a core
#  requirement), so we give up waiting rather than block forever.
# ============================================================================

MAX_WAIT="${MAX_WAIT:-90}"

synced() {
  [ -e /run/systemd/timesync/synchronized ] && return 0
  [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = "yes" ]
}

for i in $(seq 1 "$MAX_WAIT"); do
  if synced; then
    [ "$i" -gt 1 ] && echo "[time-sync] clock synced after ${i}s"
    exit 0
  fi
  [ "$i" -eq 1 ] && echo "[time-sync] waiting up to ${MAX_WAIT}s for NTP clock sync..."
  sleep 1
done

echo "[time-sync] clock not synced after ${MAX_WAIT}s — starting anyway (offline?)"
exit 0
