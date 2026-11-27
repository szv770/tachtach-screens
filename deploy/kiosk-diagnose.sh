#!/usr/bin/env bash
# ============================================================================
#  TachTach-Screens: why did the TV freeze?  (read-only, changes nothing)
#
#  Run on the Pi (over SSH) right after a freeze, or any time:
#      bash ~/tachtach-screens/deploy/kiosk-diagnose.sh
#  Then send the output. It looks at the usual suspects: power / heat, memory,
#  the browser's graphics errors, the disk, the clock, and the restart schedule.
# ============================================================================
set -u
hr() { printf '\n== %s ==\n' "$1"; }

hr "Time"
date; timedatectl 2>/dev/null | grep -E "Local time|synchronized|NTP service|Time zone" || true

hr "Power and heat (throttled=0x0 is healthy; any other value: power supply or heat problem)"
if command -v vcgencmd >/dev/null 2>&1; then vcgencmd get_throttled; vcgencmd measure_temp; else echo "vcgencmd not found (not a Raspberry Pi?)"; fi

hr "Memory and swap"
free -m; uptime

hr "Disk"
df -h / "$(dirname "$0")/../data" 2>/dev/null | sort -u

hr "Kernel messages about memory, storage, power, graphics (last 40)"
dmesg -T 2>/dev/null | grep -i -E "out of memory|oom-killer|killed process|mmc|i/o error|under-voltage|throttl|drm|v3d|gpu" | tail -40 || echo "(dmesg needs sudo on this system: run it with sudo)"

hr "Kiosk service"
systemctl status tachtach-kiosk --no-pager 2>/dev/null | head -12
echo; systemctl list-timers tachtach-kiosk-restart.timer --no-pager 2>/dev/null | head -4
echo; systemctl is-active tachtach-kiosk-request.path 2>/dev/null | sed 's/^/restart-from-website path unit: /'

hr "Browser (Chromium) processes: age and memory"
ps -eo pid,etimes,rss,pcpu,comm --sort=-rss 2>/dev/null | awk 'NR==1 || /chrom/' | head -8

hr "Kiosk journal, last 24 h: graphics / crash / kill lines (last 40)"
journalctl -u tachtach-kiosk --since "24 hours ago" --no-pager 2>/dev/null | grep -i -E "kFatalFailure|GPU process|AllocateRingBuffer|crash|killed|SIGKILL|SIGSEGV|out of memory|restarting Chromium|Chromium exited" | tail -40 || true

hr "Server journal, last 24 h: errors (last 25)"
journalctl -u tachtach-server --since "24 hours ago" --no-pager 2>/dev/null | grep -i -E "error|freeze|watchdog|restart" | tail -25 || true

hr "Freeze watchdog and restart-request lines (last 20)"
journalctl --since "24 hours ago" --no-pager 2>/dev/null | grep -i -E "kiosk-watchdog|tachtach-kiosk-request" | tail -20 || true

echo; echo "Done. Nothing was changed."
