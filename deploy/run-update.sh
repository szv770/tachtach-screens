#!/usr/bin/env bash
# ============================================================================
#  TachTach-Screens - run a software update asked for from the admin website
# ============================================================================
#
#  Started as ROOT by tachtach-update.service, which tachtach-update.path starts
#  when the web server drops data/update-request.json. The web server itself
#  never runs this and has no sudo.
#
#  What it does, in order:
#    1. checks the request (update-helper.mjs validate): a real regular file, owned by the
#       app's user, mode 0600, under 10 minutes old, a never-seen nonce, action is exactly
#       "update" or "rollback". Nothing else in the file is used.
#    2. removes the request, remembers the current commit, writes data/update-status.json
#    3. runs deploy/update.sh AS THE APP'S USER (git + npm never run as root), then does the
#       root-only steps itself (install units, restart services)
#    4. if the update fails or the server does not come back, puts the previous version back
#
#  The installed copy lives in /usr/local/lib/tachtach-update/ (root-owned, put there by
#  install-services.sh) so that nothing writable by the app's user is ever run as root.
#
#  Dry run (no git, npm, systemctl or runuser; for testing on a copy):
#    RUN_UPDATE_DRY_RUN=1 TT_PROJECT_DIR=... TT_OWNER=$(id -un) TT_STATE_DIR=... bash deploy/run-update.sh
# ============================================================================

set -euo pipefail
umask 077

: "${TT_PROJECT_DIR:?TT_PROJECT_DIR is not set (see /etc/tachtach-update.env)}"
: "${TT_OWNER:?TT_OWNER is not set (see /etc/tachtach-update.env)}"

DRY="${RUN_UPDATE_DRY_RUN:-0}"
NODE="${TT_NODE:-/usr/bin/node}"
STATE_DIR="${TT_STATE_DIR:-/var/lib/tachtach-update}"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="${TT_HELPER:-$SELF_DIR/update-helper.mjs}"
PROJECT_DIR="$TT_PROJECT_DIR"
DATA_DIR="$PROJECT_DIR/data"
REQUEST="$DATA_DIR/update-request.json"
OWNER_UID="$(id -u "$TT_OWNER")"
OWNER_GID="$(id -g "$TT_OWNER")"
OWNER_HOME="${TT_OWNER_HOME:-$(getent passwd "$TT_OWNER" | cut -d: -f6)}"
RUN_LOG="$STATE_DIR/last-run.log"
JOB="$STATE_DIR/job.json"
HASH_RE='^[0-9a-f]{40}$'

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

# One update at a time. Not getting the lock is not an error: the running one finishes first.
exec 9>"$STATE_DIR/lock"
if ! flock -n 9; then
  echo "[run-update] another update is running; nothing to do"
  exit 0
fi

[ -e "$REQUEST" ] || [ -L "$REQUEST" ] || { echo "[run-update] no request file"; exit 0; }

# ── 1. validate ─────────────────────────────────────────────────────────────
ACTION=""
if ! ACTION="$("$NODE" "$HELPER" validate "$REQUEST" "$STATE_DIR/nonces.json" "$JOB" "$OWNER_UID")"; then
  echo "[run-update] request refused"
  rm -f -- "$REQUEST"
  exit 0
fi
rm -f -- "$REQUEST"
case "$ACTION" in
  update|rollback) ;;
  *) echo "[run-update] unexpected action"; exit 0 ;;
esac

# Belt and braces on the Pi's side too: even a valid request is dropped if a run finished moments ago
# (the web side allows one per 5 minutes; this stops a runaway writer from looping updates).
MIN_GAP="${TT_MIN_GAP_SECONDS:-120}"
if [ -e "$STATE_DIR/last-finished" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$STATE_DIR/last-finished") ))
  if [ "$AGE" -ge 0 ] && [ "$AGE" -lt "$MIN_GAP" ]; then
    echo "[run-update] a run finished ${AGE}s ago; ignoring this request"
    exit 0
  fi
fi

# ── helpers ─────────────────────────────────────────────────────────────────
: > "$RUN_LOG"
say() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$RUN_LOG"; }

as_owner() {
  if [ "$DRY" = "1" ]; then "$@"; return; fi
  runuser -u "$TT_OWNER" -- "$@"
}
git_owner() { as_owner git -C "$PROJECT_DIR" "$@"; }

STARTED="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
FROM=""; TO=""; ROLLED_BACK="0"
PREVIOUS="$(cat "$STATE_DIR/previous-commit" 2>/dev/null || true)"
[[ "$PREVIOUS" =~ $HASH_RE ]] || PREVIOUS=""

write_status() { # <state> [message]
  local finished=""
  case "$1" in success|failed) finished="$(date -u '+%Y-%m-%dT%H:%M:%SZ')" ;; esac
  TT_STATE="$1" TT_MESSAGE="${2:-}" TT_FROM="$FROM" TT_TO="$TO" TT_STARTED="$STARTED" TT_FINISHED="$finished" \
    TT_ROLLED_BACK="$ROLLED_BACK" TT_PREVIOUS="$PREVIOUS" \
    "$NODE" "$HELPER" status "$DATA_DIR" "$OWNER_UID" "$OWNER_GID" "$JOB" "$RUN_LOG" \
    || echo "[run-update] could not write the status file" >&2
}

FINISHED_OK=0
on_exit() {
  touch "$STATE_DIR/last-finished" 2>/dev/null || true
  if [ "$FINISHED_OK" != "1" ]; then
    write_status failed "The update stopped unexpectedly. See the log below."
  fi
  # keep a copy of this run's log next to update.sh's own log
  if [ "$DRY" != "1" ] && [ -n "$OWNER_HOME" ] && [ -d "$OWNER_HOME" ]; then
    { echo "----- web update $(date '+%F %T') -----"; cat "$RUN_LOG"; } >> "$OWNER_HOME/tachtach-update-web.log" 2>/dev/null || true
    chown "$OWNER_UID:$OWNER_GID" "$OWNER_HOME/tachtach-update-web.log" 2>/dev/null || true
  fi
}
trap on_exit EXIT

head_commit() {
  local h
  h="$(git_owner rev-parse HEAD 2>/dev/null || true)"
  [[ "$h" =~ $HASH_RE ]] && printf '%s' "$h" || printf ''
}

# Run deploy/update.sh as the app's user. Mode and target come ONLY from this script.
# Output goes to the run log; the last "TT_STAGE=" marker says how far it got.
run_update_sh() { # <mode> [rollback-target]
  local mode="$1" target="${2:-}"
  if [ "$DRY" = "1" ]; then
    say "DRY RUN: would run deploy/update.sh as $TT_OWNER (mode=$mode target=${target:-none})"
    echo "TT_STAGE=pull" >> "$RUN_LOG"; echo "TT_STAGE=deps" >> "$RUN_LOG"; echo "TT_STAGE=build" >> "$RUN_LOG"
    if [ "$mode" = "rollback" ]; then return "${TT_DRY_ROLLBACK_RC:-0}"; fi
    return "${TT_DRY_UPDATE_RC:-0}"
  fi
  runuser -u "$TT_OWNER" -- env HOME="$OWNER_HOME" TT_UPDATE_SPLIT=1 TT_UPDATE_MODE="$mode" TT_ROLLBACK_TO="$target" \
    bash "$PROJECT_DIR/deploy/update.sh" >> "$RUN_LOG" 2>&1
}

last_stage() { grep -o 'TT_STAGE=[a-z]*' "$RUN_LOG" 2>/dev/null | tail -n 1 | cut -d= -f2 || true; }

# The root-only part of an update: refresh units, restart, and check the server really came back.
finish_privileged() {
  if [ "$DRY" = "1" ]; then
    say "DRY RUN: would run install-services.sh and restart tachtach-server and tachtach-kiosk"
    return "${TT_DRY_RESTART_RC:-0}"
  fi
  say "Refreshing systemd units..."
  PI_USER="$TT_OWNER" bash "$PROJECT_DIR/deploy/install-services.sh" >> "$RUN_LOG" 2>&1 || return 1
  say "Restarting services..."
  systemctl restart tachtach-server >> "$RUN_LOG" 2>&1 || return 1
  systemctl restart tachtach-kiosk >> "$RUN_LOG" 2>&1 || true
  # Healthy = still running after a settle period, twice (a crash loop flips back and forth).
  local i
  for i in 1 2 3 4 5 6 7 8; do
    sleep 5
    if systemctl is-active --quiet tachtach-server; then
      sleep 5
      systemctl is-active --quiet tachtach-server && return 0
    fi
  done
  say "tachtach-server did not stay up"
  return 1
}

# ── 2. start ────────────────────────────────────────────────────────────────
FROM="$(head_commit)"
say "=== software update ($ACTION) requested ==="
say "Current version: ${FROM:0:7}"
write_status running "Starting..."

fail_with() { # <message>
  say "FAILED: $1"
  write_status failed "$1"
  FINISHED_OK=1
  exit 0
}

if [ -z "$FROM" ]; then fail_with "Could not read the current version (is this a git checkout?)."; fi

# What 'Roll back' would go to is the version before the last change, and only ever from this root-owned record.
if [ "$ACTION" = "rollback" ]; then
  [ -n "$PREVIOUS" ] || fail_with "There is no earlier version to go back to."
  [ "$PREVIOUS" != "$FROM" ] || fail_with "The screen is already on the earlier version."
  if ! git_owner cat-file -e "${PREVIOUS}^{commit}" 2>/dev/null; then fail_with "The earlier version is no longer on this Pi."; fi
fi

# Put the previous version back after a failed update (best effort). Echoes nothing; sets ROLLED_BACK.
recover() {
  say "Putting the earlier version back..."
  if run_update_sh rollback "$FROM" && finish_privileged; then
    ROLLED_BACK="1"
    TO="$(head_commit)"
    say "Earlier version restored."
    return 0
  fi
  say "Could not restore the earlier version automatically."
  return 1
}

# ── 3. do it ────────────────────────────────────────────────────────────────
if [ "$ACTION" = "update" ]; then
  if run_update_sh update ""; then
    if finish_privileged; then
      TO="$(head_commit)"
      OK=1
    else
      OK=0; REASON="The new version did not start properly."
    fi
  else
    OK=0; REASON="The update did not finish."
  fi
  if [ "${OK:-0}" = "1" ]; then
    if [ -n "$TO" ] && [ "$TO" != "$FROM" ]; then printf '%s' "$FROM" > "$STATE_DIR/previous-commit"; PREVIOUS="$FROM"; fi
    say "=== update complete: ${FROM:0:7} -> ${TO:0:7} ==="
    write_status success "Updated."
    FINISHED_OK=1; exit 0
  fi
  STAGE="$(last_stage)"
  NOW="$(head_commit)"
  if [ "$STAGE" = "pull" ] && [ "$NOW" = "$FROM" ]; then
    # Nothing was changed (for example no network): no need to rebuild anything.
    fail_with "$REASON Nothing was changed; the screen is still on ${FROM:0:7}."
  fi
  if recover; then
    write_status failed "$REASON The earlier version (${FROM:0:7}) was put back and is running."
  else
    TO="$NOW"
    write_status failed "$REASON The earlier version could not be put back automatically. Run deploy/update.sh by hand."
  fi
  FINISHED_OK=1; exit 0
fi

# rollback
if run_update_sh rollback "$PREVIOUS" && finish_privileged; then
  TO="$(head_commit)"
  printf '%s' "$FROM" > "$STATE_DIR/previous-commit"; PREVIOUS="$FROM"
  say "=== rollback complete: ${FROM:0:7} -> ${TO:0:7} ==="
  write_status success "Rolled back."
  FINISHED_OK=1; exit 0
fi
STAGE_NOW="$(head_commit)"
if [ "$STAGE_NOW" != "$FROM" ] && recover; then
  write_status failed "The rollback did not finish. The version from before it (${FROM:0:7}) was put back."
else
  write_status failed "The rollback did not finish. Run deploy/update.sh by hand."
fi
FINISHED_OK=1
exit 0
