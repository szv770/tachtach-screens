# Windows PC: risk register

Last updated 2026-10-26. Companion to `AUDIT.md` (what was changed) and `TEST-CHECKLIST.md` (how each risk is
checked on a real PC). **Nothing here has been observed on Windows yet**: likelihoods are judgement, not data.

Scale: likelihood / impact = Low, Medium, High. "Check" = the TEST-CHECKLIST step that proves or disproves it.

## Top 5 (most likely to bite on the first real install)

1. **R1 - The server task does not start as LOCAL SERVICE** (account rights, Node path, Task Scheduler quirks).
2. **R2 - The update path fails somewhere in its four hand-offs** (request owner SID, SYSTEM task, NETWORK SERVICE worker, restart).
3. **R3 - Automatic sign-in / kiosk task does not come up** after a reboot (Windows 11 passwordless setting, Autologon, Edge first-run).
4. **R4 - Windows itself covers or stops the screen** (Windows Update restarts, notifications, sleep, OneDrive/Teams pop-ups).
5. **R5 - Time zone mismatch** between Windows and the screen's setting (timers fire at the wrong hour).

## Register

| ID | Risk | Likelihood | Impact | Mitigation in place | Left open / next step | Check |
|---|---|---|---|---|---|---|
| R1 | Server task fails as `LOCAL SERVICE`: cannot read `C:\Program Files\nodejs`, task principal rejected, or PowerShell blocked by policy. | Medium | High (no screen) | Built-in account (no password), principal name from its SID (any Windows language), supervisor logs every start, installer waits 90 s and prints the log tail. | If LOCAL SERVICE is unusable, switch the task to a dedicated local user (needs a password stored by Task Scheduler). | A5, A8 |
| R2 | Website update fails: the request file's owner is not `S-1-5-19`; Start-ScheduledTask of the worker refused; NETWORK SERVICE cannot write the code or reach GitHub; npm cache path. | Medium | Medium (old version keeps running; the runner always restarts the server) | Each step logs to `updater\state\last-run.log` and the status file; "nothing changed" is detected; automatic rollback; `update.ps1` by hand always works as admin. | Run D1-D5; the log says which hand-off failed. | D1-D5 |
| R3 | Kiosk does not appear after reboot: auto sign-in off (Windows 11 "only Windows Hello"), Interactive task not triggered, Edge first-run/sign-in page, Edge not found. | Medium | High | Autologon guide + Windows 11 note; AtLogOn trigger plus a 5-minute retry; Edge policies (no first-run, no sign-in, no sync); Chrome fallback; watchdog relaunches. | Policies are machine-wide (they affect anyone's Edge on that PC). | C1, C2 |
| R4 | Windows Update forced restart / notifications / sleep / screensaver / OneDrive or Teams sign-in windows over the TV. | High (restarts will happen) | Low-Medium (minutes off) | Everything restarts by itself; active hours 6-23; power plan never sleep, display never off, hibernate (and Fast Startup) off; kiosk keeps display awake; per-account notification/tips off. | Windows Home cannot postpone updates for long; OneDrive/Teams auto-start for the kiosk account must be turned off by hand if installed. | C6, F1, F2 |
| R5 | Windows time zone differs from Look & Settings > Location: schedule alerts, Track A/B refresh and cleanup fire at the wrong time. | Medium | Medium | Installer prints the Windows zone; health check compares it with the screen's zone (FAIL if different); SETUP.md "If it goes wrong". | Not enforced automatically (would change Pi behaviour). | B4, T4 |
| R6 | Native modules (sharp, bcrypt) do not load on this PC (ARM/Snapdragon PC, missing system DLL). | Low | High | Prebuilt win32-x64/arm64 binaries are in the lockfile/package; installer runs a load test and stops with a clear error. 32-bit Windows refused. | ARM PCs untested. | A3 |
| R7 | `npm ci` fails during an update because a file is locked (Defender scanning, an editor open in `C:\TachTach`, a leftover node.exe). | Medium | Medium | Server task is disabled and node.exe is killed (matched by command line) before npm; rollback on failure. | Antivirus other than Defender untested. | D3 |
| R8 | Atomic file writes fail on Windows (`EPERM`/`EBUSY` while Defender/indexer reads a file). | Medium | Low | Retries (25 ms ... 800 ms) then the existing direct-write fallback; `.bak` copy used if a file is damaged. Tested in `test/platform.test.js` with a fake rename. | Real lock lengths unknown. | B7, logs |
| R9 | Defender exclusion temptation: someone excludes `C:\TachTach` to speed things up, giving malware a hiding place in a folder the web server writes. | Low | Medium | Not done by the installer; documented here. | - | - |
| R10 | `LOCAL SERVICE` git checks fail ("dubious ownership") so "Check for updates" always errors. | Medium | Low | `-c safe.directory` on every server git call + system git config set by the installer. | - | D2 |
| R11 | Headless Edge/Chrome for Chabad.org (Cloudflare) and Google Photos does not work from a service account (session 0). | Medium | Low-Medium (Hayom Yom/Tanya may not refresh; long albums may be cut) | Same fallbacks as the Pi; Local data mode + data pack don't need it. | Untested; check Health > Hayom Yom after a day. | B7 |
| R12 | Firewall: network is "Public", so phones cannot reach the admin page; or the first-run "Allow Node.js" prompt is answered "Cancel" by someone. | Medium | Low | Explicit rule for Private networks + local subnet, installer warns about Public networks, health check too. | - | B2 |
| R13 | Local https (`KioskUseHttps`): Edge may refuse the self-signed certificate even with `--allow-insecure-localhost`; openssl from Git may need its config. | Medium | Low (only some web-page slides) | Off by default on Windows (plain http, as before the 2026-10-18 change on the Pi). | Try it once (SETUP.md screen options). | optional |
| R14 | Display scaling / resolution / multi-monitor: kiosk opens on the wrong monitor or a non-native mode looks blurry. | Medium | Low | Uniform scaler already handles any size; SETUP.md: TV as main display, native resolution. | No per-monitor placement option yet. | C3 |
| R15 | GPU driver glitches (the Pi had GPU decay after hours at 4K). | Low | Medium | Daily browser restart at 03:15, stuck-page watchdog, `KioskDisableGpu` switch. | Untested at 4K on Windows. | F3 |
| R16 | Power cut: PC does not switch back on by itself. | Medium | High | BIOS "Restore on AC power loss" note. | Hardware setting, not ours. | C9 |
| R17 | PowerShell 5.1 parsing/behaviour differences in the scripts (nothing was run). | Medium | Medium | ASCII-only, 5.1-only syntax, bracket/definition lint (`test/windowsKit.test.js`), defensive try/finally that always restarts the server. | The first real run is the real test; logs are verbose on purpose. | A1, all |
| R18 | GitHub repository becomes private: the update worker (NETWORK SERVICE) has no credentials. | Low | Medium | Today the repo is public (checked anonymously). | If made private: a read-only deploy token would be needed; plan it then. | D2 |
| R19 | Supply chain: whoever can push to `main` can run code as NETWORK SERVICE and LOCAL SERVICE on the PC. | Low | High | Same as the Pi (where the user usually also has sudo); SYSTEM never runs project files. | Release channel (`stable`) is planned in docs/saas/CLOUD-PLAN.md 12.6. | - |
| R20 | `NETWORK SERVICE` is shared with some Windows services, which could therefore modify `C:\TachTach`. | Low | Medium | Those are Windows' own services; the alternative (a dedicated account) needs a stored password. | Revisit if Windows hardening matters more than simplicity. | - |
| R21 | Cosmetic: some admin texts still say "the Pi". | High | Low | Update card, Health PDF/clock/certificate help, PDF error and "not set up" message are Windows-aware. | Other wording later, with the cloud "player" work. | - |
| R22 | Logs grow: one server log pair per start; a server that runs for months writes one big file. | Low | Low | Newest 20 kept; health check zips only the tail (2 MB) of each. | No size cap inside a single run. | T4 |
