# Architecture detail

Read `CLAUDE.md` first. This is the deeper reference for the server internals.

## Request pipeline (`src/server/app.js`, in order)

1. `trust proxy` set if `TRUST_PROXY` env var present (required behind Cloudflare Tunnel — see GOTCHAS.md)
2. Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`)
3. `Cache-Control: no-store` on `/login`, `/admin`, `/api` (prevents a cached auth response looking like a logout)
4. `express.json({ limit: '16kb' })`, `cookie-parser`
5. `setupCheck` — 503 setup page for everything except `/login` + static assets until `data/auth.json` has a password hash
6. Login rate limiter (5/15min) on `POST /login`, `/login/totp`, `/login/totp-setup`
7. `authRouter` (login/logout/TOTP endpoints)
8. `localhostOrAuth` gate on `/screen` and `/stream`
9. `screenRouter` mounted on `/stream` (SSE)
10. `GET /api/state` — `localhostOrAuth` + `csrfProtection` (CSRF middleware runs here specifically to issue the `_csrf` cookie on load, not to validate — see below)
11. A few more `localhostOnly` kiosk-support endpoints: Google Photos album photos, RSS cache reads, screen-state report/read
12. Static file serving (`/assets`, `/fonts`, `/uploads`, `/google-photos`) + SPA `GET /screen`, `/error`, `/admin` (admin route also has `requireAuth` + `csrfProtection`)
13. `requireAuth` + `csrfProtection` + mutation rate limiter (60/min, skips GET/HEAD/OPTIONS) on all of `/api`
14. `apiRouter` — the actual CRUD handlers (`src/server/routes/api.js`, ~1300 lines, one section per admin resource: slides, schedule, messages, pinned, custom-days, media, photos, RSS, style, settings, screen-control)
15. 404 handler, then a global error handler (multer file-size, JSON parse errors, generic 500)

## Auth model (`src/server/auth.js`)

- Single admin user, `data/auth.json`: `{ passwordHash, session, lockouts, totpSecret, totpEnabled, pendingAuth }`.
- Login is **two-step**: password → short-lived `pendingAuth` token (5 min) → TOTP code → real session. Mandatory since 2026-07-18; first login after `setup.js` shows a QR enrollment step instead.
- Session: 256-bit random token, 30-day rolling expiry, 90-day absolute max. Rolling only rewrites the file if the remaining time has dropped by more than an hour — rewriting on every request wore the SD card and raced concurrent requests on Windows (see GOTCHAS.md).
- Lockout: 5 failed attempts per IP → 1 hour lock. Cleared automatically once expired, or explicitly on a successful reset.
- Reset path is `scripts/reset-admin-credentials.js` (`npm run reset-admin`), interactive menu or `--reset-password`/`--reset-totp` flags. Touches only `auth.json` fields, never `setup.js`'s full wipe.

## CSRF (`src/server/middleware.js` → `csrfProtection`)

Double-submit cookie, HMAC-bound to the session token: `_csrf` cookie = `nonce.hmac(nonce, sessionToken)`. Validated via `X-CSRF-Token` header on mutating methods only. The cookie is refreshed (not just validated) on every request where it's missing/invalid — deliberately wired into `GET /api/state` so the token exists before the admin SPA ever attempts a mutation.

## Scheduler (`src/server/scheduler.js`) — three tracks, all broadcast `cache-refresh` over SSE on completion

- **Track A** — one-shot `node-schedule` jobs at today's Chatzot, Plag HaMincha, Sunset, and Tzeit, each re-fetching zmanim so the screen only shows what's left today. The Sunset job additionally pre-fetches **tomorrow's** zmanim. A midnight job (00:01) rebuilds Track A for the new day. Toggle: `settings.scheduler.trackA`.
- **Track B** — one daily recurrence at an admin-configured `HH:MM` (`settings.scheduler.trackBTime`), full `fetchAll()`.
- **Track C** — unconditional `setInterval` full refresh every 30 minutes, always on, not admin-configurable. Acts as a safety net if Track A/B miss a fetch.
- All three are (re)initialized from `src/server/app.js` ~2s after server start, alongside Google Photos sync (`src/server/google-photos.js`), countdown alerts (`src/server/countdown.js`), RSS schedulers (`src/server/rss-scheduler.js`), the Mivtzah scheduler (`src/server/mivtzah-scheduler.js`), and daily storage cleanup (`src/server/cleanup.js`).

## SSE (`src/server/sse.js`, mounted via `src/server/routes/screen.js` on `/stream`)

- Two client pools: kiosk (`broadcast()`, max 20) and preview/admin-iframe (`broadcastToAll()` reaches both, max 10). Oldest-of-type client is evicted once its pool is full.
- 15s heartbeat sent as a real `data:` event (`type: 'heartbeat'`) — a bare SSE comment does **not** fire the client's `onmessage`, which previously made the client think the connection was stale after 20s of no real updates and reconnect-loop.
- Event types in the wild: `connected`, `heartbeat`, `settings-update`, `slides-update`, `messages-update`, `pinned-update`, `cache-refresh`, `screen-command` (`{action: pause|resume|blank|advance}`), `preview` (admin-iframe only, via `broadcastToAll`).

## Data files (`data/*.json`, via `src/server/storage.js`)

Atomic write: JSON → `.tmp` → `rename()`. Existing file copied to `.bak` first, **except** `auth.json` (never backed up — contains password hash/TOTP secret). On Windows/OneDrive, `rename()` can EPERM/EBUSY if the file is locked; falls back to a direct (non-atomic) write rather than crashing. File-level locking (`Map` of pending promises) serializes concurrent writes to the same file within one process.

Files: `auth.json`, `settings.json`, `slides.json`, `messages.json`, `pinned.json`, `custom-days.json`, `schedule.json`, `schedule-templates.json`, `google-albums.json`, `rss-feeds.json`, `fonts.json`, `cache.json`, plus `uploads/`, `fonts/`, `google-photos/`, `rss-cache/` directories.

## Fetchers (`src/fetchers/`)

All server-side, all write into `cache.json`. `chabad.js` (zmanim RSS + Hayom Yom/Chitas/Rambam HTML scrape via `cheerio`), `hebcal.js` (Hebrew date, Omer, parsha), `sefaria.js` (Daily Rambam/Tanya calendar), `rss.js` (generic feed + field mapping), `google-photos.js` (shared-album scrape, no OAuth), `mivtzah.js` (pulls from the co-located SaaS platform), `torahcalc.js`, `browserFetch.js` (puppeteer-core-backed fetch used where a plain HTTP request gets blocked — see GOTCHAS.md re: Cloudflare).
