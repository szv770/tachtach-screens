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

## Kiosk canvas scaling (fragile — several fixes in a row)

`bca8429` → `74be920` → `626e148` (same day) all touched how the kiosk canvas scales to fill the actual TV resolution: scale-to-fill, then pin the scaled canvas to top-left (it was drifting/centering oddly), then a UI zoom pass. This is in `ScreenScaler.jsx`. If the screen looks shifted, cropped, or offset on a real TV after a change, this is the first file to check — it's been touched more than any other single screen-side file recently.

`74be920` also suppressed a Google Translate prompt that was appearing over the kiosk — Chromium's built-in translate popup, not app code; suppressed via Chromium launch flags / meta tag, not a screen bug.

## Never use `setup.js` to reset credentials

`node setup.js` re-initializes `settings.json`/`slides.json`/etc. from scratch — it is meant for first-time setup only. If the admin forgets their password or loses their TOTP device, the only safe path is `npm run reset-admin` (`scripts/reset-admin-credentials.js`), which touches only the specific `auth.json` field(s) requested. `ff8f8b5` had to fix `setup.js` itself clobbering existing `slides.json` defaults on a second run — evidence this file is not idempotent and shouldn't be treated as one.

## `fast-xml-parser` breaking change

`006f6f1` — an npm audit fix pulled in a `fast-xml-parser` major version with a breaking parsing change; the zmanim RSS parser (`src/fetchers/chabad.js`) had to be guarded against it. If zmanim parsing breaks after a routine `npm audit fix`/dependency bump, check this first — it's the one dependency in this stack with a history of breaking the fetchers on a version bump.
