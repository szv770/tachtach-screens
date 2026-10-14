# Gotchas — real incidents, not hypotheticals

Read `CLAUDE.md` first. Every entry here is a bug that actually shipped and got fixed — check this before you re-introduce one of these, and check it first when something that used to work stops working.

## Localhost-gating breaking remote/kiosk access (happened 3 times)

- `0ed54af` — `GET /api/state` was `localhostOnly`, which broke remote admin entirely (the admin SPA runs on a phone/laptop over LAN or the Cloudflare Tunnel, not on the Pi itself). Fixed by introducing `localhostOrAuth` (kiosk OR valid session cookie).
- `ba12d89` — same bug, for `/screen` and `/stream` — broke Live Preview (the admin's iframe of `/screen` is loaded from a remote browser, not localhost).
- `b4bb370` (most recent, 2026-07-20) — `localhostOnly`/`localhostOrAuth` check `req.ip`, which is only correct if Express's `trust proxy` setting matches how the reverse proxy sets `X-Forwarded-For`. Behind the Cloudflare Tunnel, every request looked non-local until `TRUST_PROXY=1` was set. **If admin/kiosk access breaks specifically over the tunnel but works fine on local WiFi, check `TRUST_PROXY` first.**

**Rule of thumb:** any new server-side endpoint the kiosk itself needs (no login) must be `localhostOrAuth`, not `localhostOnly`, unless it is truly meant to be unreachable from a remote admin session too.

## CSRF cookie must be issued before first mutation

`app.js` deliberately runs `csrfProtection` on `GET /api/state` (not just on POST/PUT/DELETE). Removing that means the `_csrf` cookie doesn't exist until the *first failing* mutation response sets it — so the first save after opening the admin panel always 403s with "CSRF validation failed" and looks like the change silently reverted. If you see that symptom, check whether `csrfProtection` still runs on the state-fetch route.

## Session rewrite storm (fixed in `auth.js`)

Rolling the session expiry on *every* validated request rewrote `auth.json` on every single API call. On the Pi this wears the SD card; on Windows dev machines it raced the atomic-rename write, so a `readAuth()` landing mid-rename saw `ENOENT`, got the default empty session, and the request 401'd — surfacing as intermittent "Unauthorized" toasts right after loading the admin panel for no reason. Fix: only rewrite once the remaining session time has drifted by more than an hour. Don't revert to per-request rewriting.

## SSE heartbeat must be a real event

A bare SSE comment (`: keepalive\n\n`) does not fire the browser's `EventSource.onmessage`. The client used that to detect a stale connection, so comment-only heartbeats made it think the stream died every ~20s and reconnect-loop. The heartbeat in `src/server/sse.js` is a real `data:` event with `type: 'heartbeat'` — keep it that way if you touch SSE.

## Windows/OneDrive file locking

`storage.js`'s atomic write (`tmp` file + `rename()`) can throw `EPERM`/`EBUSY` on Windows, especially inside a OneDrive-synced folder (this repo's local path is under OneDrive) if something else has the file open. There's a fallback to a direct non-atomic write — don't remove it or writes will crash instead of degrading gracefully. If you're debugging a "changes don't save" issue on a Windows dev box, check for `[storage] Atomic rename failed` in the console first.

## Fetchers getting blocked by Cloudflare

`626e148` — Chabad.org's Hayom Yom/Tanya pages started getting Cloudflare-blocked for the server's plain-fetch requests. Fixed by routing those specific fetches through `browserFetch.js` (puppeteer-core) instead of a raw HTTP request. If a fetcher that used to work starts silently returning stale/empty data, check whether Chabad.org's WAF rules changed again and whether it needs the same puppeteer-based bypass — check response status/HTML shape before assuming the parser itself is wrong (the parser code is well-tested; the fetch layer is the fragile part).

**Headless Chromium under the systemd sandbox (`browserFetch.js`).** puppeteer's `The browser is already running for <userDataDir>` is misleading. It is printed whenever Chromium logs `Failed to create a ProcessSingleton`, and the real cause was `process_singleton_posix.cc: Failed to create socket directory`: Chromium makes its `SingletonSocket` under `$TMPDIR`, and `/tmp` is read-only under `ProtectSystem=strict` (reproduced with a read-only bind mount). The unit has `PrivateTmp=true`. `browserFetch.js` also falls back to `data/.puppeteer-tmp/t` when the system tmp isn't writable. That fallback path must stay short: a unix socket path is capped at 108 bytes, and past that Chromium dies with SIGTRAP. HOME/XDG dirs point at `data/.puppeteer-tmp/home` because of `ProtectHome=read-only`. Launches are serialized. On a launch failure, Chromium is re-run directly so its stderr reaches the journal. Diagnose on the Pi with `npm run test:hayom-yom`, run as the service user (not root, or `data/.puppeteer-tmp` ends up owned by root). An empty Hayom Yom parse now counts as a failure, so it can't blank the last good cached entry.

## `public/` assets aren't served in production without an explicit route

Vite copies everything in `public/` to the `dist/` root at build time, but `app.js`'s production static-file serving only mounts specific subpaths (`/assets`, `/fonts`, `/uploads`, `/google-photos`) — there was no catch-all for the `dist/` root itself. `public/grain.png` silently 404'd in production (worked fine under `npm run dev`, where Vite's dev server serves `public/` automatically) until a general `express.static(DIST_DIR)` mount was added after the more specific ones. If you add a new file to `public/` and it works in dev but 404s in prod, this is why.

## Chromium GPU-compositor degradation over long kiosk uptime (happened twice in one day, 2026-07-21)

Two separate incidents required a manual `systemctl restart tachtach-kiosk` to recover: first a washed-out, unstyled render (missing frame/grain/gold styling, tiny mis-scaled content — confirmed via `ContextResult::kFatalFailure: CommandBufferHelper::AllocateRingBuffer() failed` spamming the kiosk journal), later a frozen display (theme and slide rotation both stuck, though the clock kept ticking — proving the browser tab itself hadn't fully frozen, just some render/data path had). No code bug was found that independently explains either failure; both are attributed to the Pi 5's GPU degrading under sustained native-4K rendering of this app's heavier effects (the SVG grain filter — since replaced with a static texture — blend modes, box shadows, the whole-canvas scale transform). Mitigation: a nightly 3:15 AM kiosk restart (`deploy/tachtach-kiosk-restart.timer`) so degradation never accumulates long enough to fail during the day. If the kiosk looks broken/frozen again despite that, check `journalctl -u tachtach-kiosk` for the same `AllocateRingBuffer` signature before assuming a new bug.

## Kiosk dead after a power cut: stale clock → restart burst → start-limit-hit (2026-10-13)

The Pi 5's RTC has no battery by default, so after unplugging it boots with the last saved clock (here: weeks behind). Two things followed: (1) every HTTPS fetch at startup failed with `certificate is not yet valid`, so all data fell back to cache; (2) when NTP jumped the clock forward, the `Persistent=true` nightly kiosk-restart timer caught up on "missed" runs and restarted the kiosk 5× in ~20s, tripping `StartLimitBurst=5` → `failed (Result: start-limit-hit)`, with a blank TV until a manual restart. The restart service's `Requisite=` also meant the nightly restart couldn't recover a failed kiosk. Fixes: timer `Persistent=false`, kiosk/server `StartLimitIntervalSec=0`, restart service runs `reset-failed` first and has no `Requisite=`, server `ExecStartPre` waits (≤90s) for NTP sync (`deploy/wait-for-time-sync.sh`), kiosk launches through `deploy/kiosk-launch.sh` (waits for the display and a real `/screen` response, clears Chromium crash-restore state/locks). Same incident: puppeteer's headless Chromium failed with `The browser is already running for <userDataDir>` because `ProtectSystem=strict` left `/tmp` read-only (it needs it for its singleton socket) — fixed with `PrivateTmp=true`. Also: `update.sh`'s `git pull` had been silently aborting because the admin panel edits tracked `data/*.json` files; it now backs them up, pulls, and restores them. `update.sh` re-runs `deploy/install-services.sh` so unit changes actually reach the Pi.

## Schedule countdown alerts were dead end-to-end (fixed 2026-10-14)

Four independent bugs, each enough on its own to stop alerts: (1) `countdown.js` compared lowercase day codes (`'sun'`…`'shabbos'`) with the stored `'Sun'`…`'Shabbos'`, so nothing was ever scheduled; (2) the admin saved `alertDisplay` but the API whitelist kept only `countdownDisplay`, so "Takeover" was silently dropped; (3) the server broadcast `displayMode`/`name`/`secondsRemaining` while the kiosk read `.mode`/`.eventName`/`.targetTime`; (4) slide mode rendered only on a `COUNTDOWN` slide that nothing ever put into rotation. Now: day checks go through `src/shared/scheduleDays.js` (case-insensitive; also used by ScheduleSlide and the sidebar "starting in N min", which now honor `days`/`enabled`); the API accepts `alertDisplay` as an alias but stores `countdownDisplay`; the server sends both `displayMode` and `mode` plus `targetTime`, and `App.jsx` normalizes either shape; slide-mode countdowns take over the slide area (like a board, rotation not paused) and a running countdown is also returned by `/api/state` so a reconnecting kiosk still shows it. **Rules:** never compare day codes with `includes()` directly; use the shared helper. If you change an SSE payload, check the client reads the same field names. A quick check: `[countdown] Scheduled N alert(s) for today (Wed)` in the server log should show N > 0 when the schedule has alerts.

## Admin settings wrote keys the server never read (fixed 2026-10-14)

SettingsPanel wrote top-level `zipCode`, `chabadLocationId`, `trackA`, `trackBTime`, but the server reads only `settings.location.{zip,locationId}` and `settings.scheduler.{trackA,trackBTime}`, so changing the zip in the admin did nothing. The admin now reads/writes the nested keys. `src/server/settings-migrate.js` folds stray top-level keys into the nested ones at startup and on every `PUT /api/settings` (idempotent; the nested value wins if both exist, because that is what was actually in effect). `PUT /api/settings` still writes the whole object with no whitelist, so **any new server-read setting must be written by the admin under the exact key the server reads.** Grep both sides before adding one.

## Kiosk canvas scaling (fragile — several fixes in a row)

`bca8429` → `74be920` → `626e148` (same day) all touched how the kiosk canvas scales to fill the actual TV resolution: scale-to-fill, then pin the scaled canvas to top-left (it was drifting/centering oddly), then a UI zoom pass. This is in `ScreenScaler.jsx`. If the screen looks shifted, cropped, or offset on a real TV after a change, this is the first file to check — it's been touched more than any other single screen-side file recently.

2026-10-13: the scale used to be non-uniform (`scale(vw/1600, vh/900)`), which stretched everything on any non-16:9 viewport (desktop Preview tab ~1920x940, portrait monitors). It's now a single uniform scale = `min(vw/1600, vh/900)` with the canvas's logical width/height grown to `vw/scale` × `vh/scale`, so it fills exactly with no distortion. On a 16:9 TV this is byte-for-byte the old 1600x900 @ 2.4×. Don't reintroduce separate x/y scales. Also: measure slide fit in layout px (`clientHeight`/`scrollHeight`), not `getBoundingClientRect()` — the latter includes this transform.

`74be920` also suppressed a Google Translate prompt that was appearing over the kiosk — Chromium's built-in translate popup, not app code; suppressed via Chromium launch flags / meta tag, not a screen bug.

## Never use `setup.js` to reset credentials

`node setup.js` re-initializes `settings.json`/`slides.json`/etc. from scratch — it is meant for first-time setup only. If the admin forgets their password or loses their TOTP device, the only safe path is `npm run reset-admin` (`scripts/reset-admin-credentials.js`), which touches only the specific `auth.json` field(s) requested. `ff8f8b5` had to fix `setup.js` itself clobbering existing `slides.json` defaults on a second run — evidence this file is not idempotent and shouldn't be treated as one.

## `fast-xml-parser` breaking change

`006f6f1` — an npm audit fix pulled in a `fast-xml-parser` major version with a breaking parsing change; the zmanim RSS parser (`src/fetchers/chabad.js`) had to be guarded against it. If zmanim parsing breaks after a routine `npm audit fix`/dependency bump, check this first — it's the one dependency in this stack with a history of breaking the fetchers on a version bump.

## Announcements: one rule source, migration in code (2026-10-14)

Messages, pinned notes and custom text slides used to have six separate expiry checks and three renderers. They are now one file (`data/announcements.json`) and one pure rule module (`src/shared/announcements.js`). **Never add an expiry/"is it showing" check anywhere else** — call `isActive`/`selectActive`. The legacy-to-announcements migration runs at server start in code (not via committed data) because `update.sh` restores the Pi's own `data/*.json`; it is idempotent (skips ids already migrated) and backs up to `data/legacy/`. `PUT /api/slides` whitelists `announcementId` — drop it and every ANNOUNCEMENT ref row in the rotation silently breaks. Also: the banner strip used to start its text at x=+100% of a very wide repeated string, so a new banner was invisible for ~25 s; it now starts at the left edge — don't reintroduce a right-edge start without accounting for the text width.
