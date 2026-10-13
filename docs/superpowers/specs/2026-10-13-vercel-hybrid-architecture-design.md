# Vercel Hybrid Architecture (Cloud-Primary, Thin Pi) — Design

## Problem

Today one Raspberry Pi 5 does all of it: the Express server (`server.js` → `src/server/app.js`), JSON-file storage (`data/*.json` via `src/server/storage.js`), every scraper (`src/fetchers/*`), the three-track scheduler, countdown alerts, RSS/Google Photos/Mivtzah pollers, SSE (`src/server/sse.js`), uploads processed with sharp, the admin SPA with bcrypt+TOTP auth, and the Chromium kiosk that points at `http://127.0.0.1:3000/screen` (`deploy/kiosk-launch.sh`). Remote access goes through a Cloudflare Tunnel at `tachtach.szvtech.org` (`deploy/cloudflare-tunnel-setup.md`).

The result: if the Pi is unplugged, rebooting, or its SD card dies, **the admin panel, the live preview, and any web presence are gone too**. Every remote-access bug so far has come from the Pi being both the kiosk and the public server: localhost-gating behind a proxy broke three times (`0ed54af`, `ba12d89`, `b4bb370`, GOTCHAS.md), and `TRUST_PROXY` is a standing trap.

The owner wants:

1. Most of TachTach hosted on Vercel (team `svogel-8234`), and only what can't move left on the Pi.
2. The Pi to boot by itself and simply open the site.
3. A homepage/site that is always up, even when the Pi is unplugged.

## Goals

- Admin panel, API, storage, scrapers, and scheduling run in the cloud and work whether the Pi is on or off.
- The Pi becomes an appliance: Chromium kiosk, a few systemd units, nothing that needs `git pull && npm ci && npm run build` for routine app updates.
- The TV keeps showing the last good content when the school's internet drops. The original spec says "works offline using last cache", and `deploy/wait-for-time-sync.sh` already calls offline tolerance "a core requirement".
- Keep the security model: fail closed, 404 (not 403) on reject, CSRF double-submit, mandatory TOTP, trusted devices. Swap the "localhost is trusted" assumption for an explicit, revocable device credential.
- Every migration phase leaves the school's TV working, with a one-step rollback.

## Non-goals

- No rewrite into Next.js, TypeScript, or Tailwind. The kiosk/admin stay plain JS + React 18 + Vite + inline styles (CLAUDE.md non-negotiables). The server stays Express. Vercel runs Express apps as a single Function, so most of `src/server/routes/api.js` carries over through a storage-adapter swap and needs no rewrite.
- No merging with the Mivtzah SaaS (`saas-admin/`, `saas-server/`). They stay separate products (see "Supabase: reuse or separate?").
- No multi-school or multi-tenant support. Still one admin user, one school. Multiple paired screens fall out of device pairing for free, but nothing beyond that.
- No visual or UX changes to the kiosk or admin, except a new "Screens / Devices" section in Settings.

---

## 1. Inventory of server responsibilities

Vercel facts this table relies on (verify against current Vercel docs before Phase 0; limits change):

- Functions are request-scoped. There is no long-lived process, so `setInterval`/`setTimeout`/`node-schedule` are gone.
- Default max duration with Fluid compute is 300 s. Pro can raise it.
- Request bodies are capped at **4.5 MB**.
- The filesystem is read-only apart from `/tmp`, and `/tmp` is per-instance and ephemeral.
- In-memory state is per-instance. Several instances can run at once.
- Vercel Cron on Hobby runs **once a day at most**, with loose timing. Pro allows per-minute schedules.
- Function IPs are AWS datacenter IPs, which is what Cloudflare-fronted sites challenge hardest.

| # | Responsibility | Where it lives today | Runs on Vercel? | Constraint | Recommended home |
|---|---|---|---|---|---|
| 1 | Admin + kiosk SPA static assets | `dist/` served by `express.static` in `app.js` §7 | Yes | None. `/assets/*` can be public static, same as today. | **Vercel static** |
| 2 | `/screen`, `/error` HTML (gated) | `app.js` §6/§7, `localhostOrAuth` | Yes | Must stay gated, so it's served by the Function, not static. The JS bundle holds no secrets. | **Vercel Function** behind new `kioskOrAuth` |
| 3 | `/admin` HTML + `/login*`, `/logout` | `src/server/routes/auth.js`, `app.js` | Yes | Native `bcrypt` → use `bcryptjs` (pure JS, reads the same `$2b$` hashes). `otplib` works unchanged. | **Vercel Function** |
| 4 | `/api/*` CRUD (slides, messages, pinned, custom-days, schedule + templates, settings, style, RSS, albums, fonts, logo, media) | `src/server/routes/api.js` (~1350 lines) | Yes | `readJSON`/`writeJSON` become DB calls. Read-modify-write handlers lose the per-process file lock (`storage.js` `fileLocks`) and need optimistic concurrency instead (§5). | **Vercel Function** + Supabase Postgres |
| 5 | `GET /api/state` (aggregates 10 JSON files, issues `_csrf`) | `app.js` §6c | Yes | 10 file reads become one `select key, value from tt_documents where key = any(...)`. The `_csrf` issuance on GET must stay (GOTCHAS: CSRF cookie timing). | **Vercel Function** |
| 6 | SSE `/stream` + `broadcast`/`broadcastToAll` | `src/server/sse.js`, `routes/screen.js` | **No (not as built)** | Streaming responses die at max duration, and every open stream bills function time. Worse, `clients` is an in-memory `Map`, so an admin write handled by instance X can't reach a kiosk streaming from instance Y. A pub/sub is required. | **Supabase Realtime "poke" + gated refetch** (§4) |
| 7 | Screen state report/read (`/api/screen/report`, `/api/screen/state`) | `src/server/screenState.js` (in-memory) | Yes, once persisted | In-memory state is lost between instances. | `tt_devices.last_state` row, written by the kiosk via device token |
| 8 | Screen commands (pause/resume/blank/advance) | `api.js` `/screen/*` → `broadcastToAll('screen-command')` | Yes | Needs a fan-out path to the kiosk. | Row in `tt_screen_commands` + Realtime poke |
| 9 | Live-preview `preview` event | `api.js` `POST /preview` → `broadcastToAll` | Doesn't need a server | Admin and its preview iframe (`LivePreview.jsx`, `src="/screen?preview=true"`) are same-origin in the **same browser**. | **`window.postMessage`** admin → iframe. Drops a server round-trip. |
| 10 | Scheduler Track A (one-shot jobs at Chatzot/Plag/Sunset/Tzeit + midnight rebuild + post-sunset fetch of tomorrow) | `src/server/scheduler.js` | Partially | No in-process timers, and Hobby cron is daily. **But the kiosk already works out past/next zmanim client-side** (`ZmanimSlide.jsx` compares against `new Date()`), so the per-zman refetch only adds freshness. Track A's real job is "make sure tomorrow's zmanim exist before sunset". | Fold into one daily job that fetches **today + tomorrow**. Track C covers same-day corrections. |
| 11 | Scheduler Track B (daily `fetchAll` at admin-set `HH:MM`) | `scheduler.js` | Yes | Hobby cron is fixed in `vercel.json`, so an admin-configurable time can't be a static cron. | Supabase `pg_cron` row whose schedule the admin API rewrites (`cron.alter_job`). It calls `POST /api/cron/fetch-all` via `pg_net`. |
| 12 | Scheduler Track C (every 30 min `fetchAll`) | `scheduler.js` `setInterval` | Yes | Needs sub-daily cron, which means Vercel Pro or an external trigger. | `pg_cron` `*/30 * * * *` → `/api/cron/fetch-all` (shared-secret header) |
| 13 | `fetchAll` fan-out (11 parallel fetches) | `src/fetchers/index.js` | Mostly | Fits easily in 300 s. **Timezone:** functions run in UTC, and `fetchHayomYom`/`fetchTanyaExcerpt` build `tdate` from `new Date()` local fields. After ~8 pm Eastern that picks *tomorrow's* Hayom Yom. Don't rely on the `TZ` env var (it's reserved on Vercel). Every "today" must come from `settings.location.timezone` (`America/New_York` in `data/settings.json`). | **Vercel Function**, with explicit-timezone date helpers |
| 14 | Zmanim RSS, Daily-Study RSS (EN/HE), daily quote, parsha tidbits | `src/fetchers/chabad.js` (plain `fetch`) | Probably | These chabad.org endpoints aren't challenged today from a residential IP. A datacenter IP might be. Test in Phase 3. | **Vercel**, with the Pi helper as fallback if blocked |
| 15 | **Hayom Yom + Tanya excerpt (Cloudflare JS challenge)** | `chabad.js` → `src/fetchers/browserFetch.js` (puppeteer-core + the kiosk's own Chromium) | **Doubtful** | Commit `626e148`: a plain fetch gets 403 "Just a moment...". On Vercel you'd need `@sparticuz/chromium` (fits the bundle limit, but slow cold starts and a lot of memory). Cloudflare also scores AWS IPs much worse than a school/home IP, so even a real headless browser may get a challenge it can't pass. | **Pi helper** (§2): a small timer job on the Pi runs the existing `browserFetch.js` + `parseHayomYom`/`parseTanyaExcerpt` from the residential IP and POSTs results to `/api/ingest/chabad`. Vercel tries first; the Pi result wins when fresher. If the Pi is off, the TV is off too, so a stale Hayom Yom costs nothing. |
| 16 | HebCal (Hebrew date, parsha, Omer), Sefaria, TorahCalc | `hebcal.js`, `sefaria.js`, `torahcalc.js` | Yes | Public JSON APIs. Same timezone caveat as #13. | **Vercel** |
| 17 | Date preview `GET /api/preview-state` | `api.js` (fans out to the chabad/hebcal/torahcalc date scrapers) | Mostly | Same Cloudflare problem for arbitrary-date Hayom Yom/Tanya, and the Pi helper can't serve on-demand requests. | **Vercel**. Hayom Yom/Tanya for non-today dates degrade to "unavailable in preview" (already a fallback pattern in that handler). |
| 18 | RSS feeds (hourly / 6 h / daily per feed) | `src/server/rss-scheduler.js`, cache in `data/rss-cache/*.json` | Yes | Per-feed `setInterval` → one dispatcher. | `pg_cron` hourly → `/api/cron/rss` refreshes feeds that are due. Cache in `tt_rss_cache`. |
| 19 | Google Photos album sync (scrape shared album, download ≤200 photos, sharp resize + blur, manifest) | `src/server/google-photos.js`, `src/fetchers/google-photos.js`, `data/google-photos/` | Yes, in batches | The first sync of 200 photos × sharp × 3 concurrency can exceed one invocation, and files can't go on local disk. | `/api/cron/google-photos` (`pg_cron`, every 30 min). Processes ≤25 new photos per invocation and resumes next tick. Files go to the Supabase Storage bucket `google-photos`, manifest to `tt_google_photos`. |
| 20 | Media upload (`POST /api/upload`, 50 MB, multer memory + sharp resize to 1920×1080 + 64×36 blur) | `src/server/upload.js`, `api.js` | Not as built | 4.5 MB body cap blocks multer uploads. | **Direct-to-Storage upload:** the API issues a signed upload URL (`createSignedUploadUrl`), the browser PUTs straight to Supabase Storage, then `POST /api/upload/finalize` runs the existing `processImage`/`processGif` logic (sharp works on Vercel) from the stored original. Video is stored as-is, as today. Supabase's 50 MB free-tier file cap matches today's limit. |
| 21 | Font upload (5 MB) + logo upload (2 MB) | `api.js` `/fonts`, `/logo` | Font no, logo yes | 5 MB > 4.5 MB. | Same signed-upload path for both, for consistency |
| 22 | Static `/uploads`, `/fonts`, `/google-photos` | `app.js` `express.static` (**not auth-gated today**, unguessable UUID names only) | Yes | Same exposure as today. Fonts need `Access-Control-Allow-Origin: *` (set today). | Public-read Storage buckets, reached through **Vercel rewrites** (`/uploads/:p*` → `https://<ref>.supabase.co/storage/v1/object/public/media/:p*`). Stored URLs in `slides.json` stay valid unchanged, and the kiosk's service worker sees same-origin URLs. |
| 23 | Countdown alerts (T-minus `countdown-start`/`tick`/`end` from in-process timers) | `src/server/countdown.js` | No (timers) | Ticks every 10 s per entry. Can't run without a process. | **Move to the kiosk.** A new `useCountdowns(schedule, now)` hook ports `initCountdowns`/`scheduleEntryAlert` (day filter, `alertBefore`, `countdownDisplay`). The kiosk already holds `schedule` in state and has a clock. This also makes countdowns work offline, which they don't today. |
| 24 | Mivtzah leaderboard (60 s poll of the Supabase RPC `kiosk_get_leaderboard`) | `src/server/mivtzah-scheduler.js`, `src/fetchers/mivtzah.js` | Yes | A 60 s cron needs Pro or pg_cron, and the poll writes all of `cache.json` every minute. | **Lazy refresh:** `/api/state` returns `mivtzah` from a `tt_documents` row and, if it's >60 s old, refreshes it after responding (`waitUntil`). No cron. The leaderboard lives in its own row, so it never rewrites the zmanim cache. |
| 25 | Storage cleanup (orphan uploads, orphan album caches, `.bak`/`.tmp`) | `src/server/cleanup.js` | Yes | Orphan scan lists Storage instead of `readdir`. `.bak`/`.tmp` no longer exist. | Daily Vercel Cron → `/api/cron/cleanup`. Also prunes `tt_document_history` older than 30 days. |
| 26 | Atomic JSON storage + `.bak` backups + file locks | `src/server/storage.js` | No (no persistent disk) | — | **Supabase Postgres** document table + history trigger (§5) |
| 27 | Auth: password, 2-step TOTP, pending-auth, 30/90-day session, IP lockouts, trusted devices | `src/server/auth.js`, `data/auth.json` | Yes | All state moves to tables. The "rewrite the session only after >1 h drift" rule (GOTCHAS: session rewrite storm) stays, to cut DB writes. | **Vercel Function** + `tt_auth`, `tt_sessions`, `tt_trusted_devices`, `tt_login_lockouts` |
| 28 | Rate limiting (`express-rate-limit`, 5/15 min login, 60/min mutations) | `app.js` §4, §8 | Not as built | The in-memory store is per-instance, so limits multiply with instance count. | The persistent IP lockout in `tt_login_lockouts` (already the real protection) plus a Vercel Firewall rate-limit rule on `/login*` where the plan allows. Keep the in-memory limiter as a cheap first layer. |
| 29 | `setupCheck` 503 page until `auth.json` has a hash | `middleware.js` | Yes | — | Checks `tt_auth`. Setup becomes a one-time migration (§5), not `setup.js` on the Pi. |
| 30 | `npm run reset-admin` | `scripts/reset-admin-credentials.js` | — | Today it must run on the Pi. | Same script pointed at Supabase via `DATABASE_URL`, run from any trusted laptop |
| 31 | Chromium kiosk, nightly restart, unclutter, screen-blanking off, time sync | `deploy/tachtach-kiosk.service`, `kiosk-launch.sh`, `tachtach-kiosk-restart.timer`, `wait-for-time-sync.sh`, `pi-setup.sh` | **No (physical)** | — | **Pi** (§2) |

**Doc discrepancy found while checking:** FEATURES.md says the admin's `useAdminState.js` subscribes to SSE. It doesn't (no `EventSource` in `src/admin/`). Only the kiosk (`src/screen/hooks/useSSE.js`) and the Live Preview iframe use `/stream`. The admin re-fetches after its own mutations, and `GooglePhotosManager.jsx` polls every 5 s. So the realtime replacement only has to serve the kiosk and the preview iframe.

**Existing safety net worth keeping:** `useSSE.js` already polls `/api/state` every 5 s as well as listening to SSE, and force-reconnects after 20 s of silence. The kiosk is already built to recover from missed events by refetching full state. That makes "poke + refetch" (§4) a small change, not a redesign.

---

## 2. What must stay on the Pi

### Required

1. **Chromium kiosk.** `tachtach-kiosk.service` → `kiosk-launch.sh`. Changes:
   - `SCREEN_URL` default becomes `https://tachtach.szvtech.org/screen` (the script already reads `SCREEN_URL` from env).
   - Step 2 ("wait for the TachTach server") becomes "wait for network-online and NTP, up to 90 s, then launch anyway". The service worker handles the offline case.
   - Keep the persistent profile at `~/.config/chromium`. It now holds the device cookie and the offline cache, so **never** launch with `--incognito` or a temp profile.
   - Keep the crash-recovery cleanup in step 3.
   - Remove `After=/Wants=tachtach-server.service`.
2. **Nightly kiosk restart** (`tachtach-kiosk-restart.timer`, 03:15). The GPU-compositor degradation (GOTCHAS) is on the Pi's side, not the server's. Keep it.
3. **Clock correctness.** The Pi 5 RTC has no battery by default (`wait-for-time-sync.sh` header). Today a stale clock only broke the server's fetches. In the cloud design it also blocks the kiosk's HTTPS (cert "not yet valid"), and with no internet the TV clock would show a stale time. The service worker still serves cached content when TLS fails, because it answers before the network. **Recommendation:** fit the official Pi 5 RTC battery (~$5) so the clock survives power cuts even with no internet.
4. **Offline cache.** It now lives in the browser, not a local server (see Architecture A, §3).

### Optional (recommended)

5. **Pi helper for Cloudflare-challenged pages** (`tachtach-pi-helper.timer`).
   - Runs `node pi-helper/chabad-ingest.js` at 04:30, then every 2 h until 22:00, local time.
   - Reuses `src/fetchers/browserFetch.js` and the pure parsers `parseHayomYom` / `parseTanyaExcerpt` from `chabad.js` unchanged, with the system Chromium. `PROFILE_ROOT` moves to a writable `~/.cache/tachtach-helper` (same EROFS lesson as `63824a0`).
   - POSTs `{date, hayomYom, tanyaExcerpt}` to `https://tachtach.szvtech.org/api/ingest/chabad`, authenticated by the same device token the kiosk uses (§4), read from a `0600` file.
   - Deps: `puppeteer-core`, `cheerio`, `node-fetch`. No build step, no `data/`, no Express.
   - If it's down, Vercel's own attempt (or yesterday's value) is used.
6. **cloudflared for SSH only.** Keep the tunnel but change ingress from `service: http://localhost:3000` to `ssh://localhost:22`, behind Cloudflare Access, so the Pi stays reachable for maintenance. The app hostname moves to Vercel.

### Leaves the Pi

`tachtach-server.service`, `data/`, `node setup.js`, `npm run build` on the Pi, `update.sh`'s app-update role, `TRUST_PROXY`, `HOST=0.0.0.0`, and the `localhostOnly` / `localhostOrAuth` middleware.

---

## 3. Candidate architectures

### A — Cloud-primary, thin kiosk with a service-worker offline cache (**recommended**)

```
 phone/laptop ──HTTPS──►  Vercel (tachtach.szvtech.org)
                          ├─ /            public homepage (static)
                          ├─ /admin, /login, /api/*   Express Function (auth+CSRF)
                          ├─ /screen, /api/state      Express Function (kioskOrAuth)
                          ├─ /api/cron/*  ◄── pg_cron/pg_net (30 min, hourly, admin-set daily)
                          ├─ /api/ingest/chabad ◄── Pi helper (device token)
                          └─ rewrites /uploads,/fonts,/google-photos ─► Supabase Storage
                                     │
                          Supabase (new project "tachtach")
                          ├─ Postgres: tt_documents (+history), tt_auth, tt_sessions, tt_devices, ...
                          ├─ Storage: media, fonts, google-photos (public-read, UUID keys)
                          ├─ Realtime: broadcast channel "pokes" (no data)
                          └─ pg_cron + pg_net (scheduler)
                                     ▲  poke
 Pi 5 ── Chromium kiosk ─────────────┘  fetches /screen, /api/state with device cookie
          └─ Service worker: app shell + last /api/state + media cache-first
          └─ (optional) pi-helper timer → /api/ingest/chabad
```

- **Offline:** the SW precaches the app shell (`/screen` HTML + hashed `/assets/*`).
  - `/api/state` is network-first with a 4 s timeout, then falls back to the last good response.
  - `/uploads/*`, `/fonts/*`, `/google-photos/*` are cache-first, keyed by the immutable UUID filename. All same-origin thanks to the rewrites, so there are no opaque-response quota problems.
  - Call `navigator.storage.persist()` and log the result.
  - Content goes stale after midnight while offline. That's the same as today, where fetches fail and `cache.json` stays as-is. Countdowns keep working offline because they move client-side (#23).
- **Pros:**
  - The Pi runs no server. App updates are just Vercel deploys, and the kiosk picks them up via SW update on the next poke or the nightly restart.
  - The homepage and admin are up regardless of the Pi.
  - Removes the localhost/`TRUST_PROXY` failure class entirely.
  - Supports a second screen at no extra cost.
- **Cons:**
  - SW lifecycle bugs (a stale build stuck in cache) are a new failure mode. Mitigation: versioned cache names, `skipWaiting` + `clients.claim`, and a kill switch (a `?nosw=1` launch flag in `kiosk-launch.sh` that unregisters the SW).
  - A cold boot with no internet works only if the SW was installed on an earlier online run. It always is after pairing.
  - Hayom Yom/Tanya depend on the Pi helper if Vercel is blocked.
  - Adds two vendors (Vercel + Supabase).

### B — Cloud front door + Pi edge server (local synced cache)

Vercel and Supabase as in A for admin, API, storage, and cron. The Pi keeps a slimmed `server.js` in "edge mode":

- subscribes to Supabase Realtime (or polls a `/api/sync?since=version` endpoint),
- mirrors `tt_documents` into local `data/*.json` and media into `data/uploads/`,
- serves `/screen` + local SSE to Chromium at `127.0.0.1:3000`,
- runs puppeteer locally.

- **Pros:** strongest offline story (cold boot with no internet always works, media sits on disk), the kiosk code barely changes (SSE stays local), and puppeteer runs naturally on the residential IP.
- **Cons:**
  - The Pi still runs Node, still needs `npm ci` + build on every update, and still has the SD-wear and systemd-hardening issues. That's the opposite of what the owner asked for.
  - Two server code paths (cloud and edge) drift.
  - Sync bugs (missed versions, partial media mirrors) are a whole new class of failure.
  - When the Pi is on and the cloud is unreachable, admin edits made "locally" have nowhere to go, so the edge must be read-only, which is confusing.

### C — Minimal: Vercel landing page + status only

Everything stays on the Pi as today. Vercel serves a static homepage on the apex or `www`. The Pi POSTs a heartbeat every few minutes to a tiny Vercel function storing `lastSeen` in Edge Config or a Supabase row, and the homepage shows "Screen online/offline".

- **Pros:** about a day of work, zero risk to the TV.
- **Cons:** doesn't meet the request. The admin is still dead when the Pi is off, all the localhost/tunnel gotchas remain, and every update still means SSH + `update.sh`.

### Recommendation

**Go with Architecture A.** It's the only option that delivers "Pi just opens the site" and "site always up" without keeping a second server alive on the Pi.

The offline requirement is met by the service worker. That gets an explicit go/no-go test before cutover (Phase 4 soak: router unplugged for 2 h mid-day, plus a cold boot with the WAN cable out).

If the soak fails in ways SW tuning can't fix, fall back to **B's edge server as a contained add-on**. Phases 0–3 are identical for A and B, so no work is lost.

---

## 4. Realtime and security translation

### Realtime: replacing SSE

| Option | Verdict |
|---|---|
| Keep SSE on a Vercel Function | **Reject.** Streams end at max duration, bill function time while idle, and in-memory `clients` can't fan out across instances. |
| **Supabase Realtime Broadcast, used as a "poke" only** | **Recommend.** One persistent WebSocket per kiosk to Supabase, which is built for that. No per-connection function cost. Same vendor as storage. |
| Pure polling with an ETag/version endpoint | **Keep as the safety net.** It replaces today's 5 s `/api/state` poll with a 30 s `GET /api/state/version` (returns the max `tt_documents.version` + latest command id). Full refetch only on change. |
| Pusher/Ably | Works, but adds a third vendor for no gain over Supabase. |
| Upstash Redis pub/sub + SSE | Still has the SSE-on-Function cost problem. |

**Design:**

1. **Channel.** Every API mutation that today calls `broadcast(...)` / `broadcastToAll(...)` instead bumps the document `version` (a DB trigger does this) and sends a Realtime broadcast `{type: 'poke', keys: ['slides']}` server-side with the service-role key.
2. **Payloads are deliberately empty of content.** The kiosk reacts to a poke by refetching the gated `/api/state` (or `/api/rss/cache/:id`, `/api/screen/commands?after=<id>`) from Vercel.
   - **Integrity:** a public broadcast channel can be *sent to* by anyone holding the (public) anon key and the channel name. So the channel must never carry trusted instructions. A spoofed poke causes at most a refetch; the kiosk debounces pokes to ≤1 refetch per 2 s.
   - **Confidentiality:** a leaked channel name reveals only "something changed".
   - Channel name: `tt-pokes-<random 128-bit>`, delivered inside the gated `/api/state`. Upgrading to Supabase private channels with RLS on `realtime.messages` is a possible hardening step later. It isn't needed for safety given the content-free payloads.
3. **Screen commands** (`pause`/`resume`/`blank`/`advance`) become rows in `tt_screen_commands(id bigserial, action, created_at)`.
   - The kiosk fetches commands newer than the last applied id, ignores any older than 60 s (so a reboot doesn't replay "blank"), and applies them in order.
   - `blank` today is a client-side toggle (`App.jsx` `_blank: !prev._blank`). Changing it to explicit `blank-on`/`blank-off` makes replays idempotent. The admin's `ScreenControls.jsx` button already knows which state it wants.
4. **`useSSE.js` → `useRealtime.js`.** Same signature `(onEvent, onFullState)`, so `App.jsx`'s `handleSSE` switch keeps working. The hook maps pokes to the existing event types after refetching:
   - `slides` poke → refetch → `onFullState`
   - `rss:<id>` → `rss-update`
   - command → `screen-command`

   The `countdown-*` cases are removed (client-side now, #23). The `preview` case moves to `postMessage` (#9). The 20 s stale-reconnect logic becomes the Supabase client's built-in reconnect plus the 30 s version poll.
5. **Live Preview.** `LivePreview.jsx`'s iframe uses `/screen?preview=true` with the admin session cookie (same as today). It gets content via the same pokes, and draft previews via `postMessage` from the admin window, origin-checked against `location.origin`.

### Security rules, translated

| Rule today | In the cloud |
|---|---|
| Fail closed; `/admin` + `/api/*` behind `requireAuth` | Unchanged. Same middleware order in `app.js`. The session lookup reads `tt_sessions`. |
| `/screen`, `/stream`, `/api/state` behind `localhostOrAuth`; 404 on reject | **`kioskOrAuth`**: a valid `tachtach_device` cookie (paired, not revoked) **or** a valid admin session. Anything else gets an empty **404**, exactly like `localhostOrAuth`'s reject branch. |
| `localhostOnly` kiosk endpoints (`/api/google-album/:id/photos`, `/api/rss/cache/:feedId`, `/api/screen/report`, `/api/screen/state`) | `kioskOrAuth` for the reads. `/api/screen/report` becomes **device-only** (an admin session shouldn't be able to overwrite the screen's reported state). `localhostOnly` is deleted. Over the internet, "localhost" means nothing. |
| `TRUST_PROXY=1` | Gone. On Vercel, client IP comes from `x-vercel-forwarded-for` / `x-real-ip`, read explicitly by the lockout code and never trusted from a raw `x-forwarded-for` chain. Set `app.set('trust proxy', true)` only so `req.secure` is correct. Cookies are always `Secure` (HTTPS everywhere). |
| CSRF double-submit HMAC'd with the session token; `_csrf` issued on `GET /api/state` | Unchanged code (`middleware.js` `csrfProtection` is stateless). Keep it on `GET /api/state`. Device-cookie requests are GET-only except `/api/screen/report` and `/api/ingest/chabad`. Those are authenticated by a header-borne device token (not a cookie), so CSRF doesn't apply to them. |
| TOTP mandatory, trusted-device cookie (2026-07-21 spec) | Unchanged flow. Token storage changes (next row). |
| Tokens stored plaintext, `timingSafeEqual` compared | Store **SHA-256 hashes** of session, trusted-device, device, and pairing tokens, and look up by hash. The data now lives in a hosted DB with dashboard access and backups. A leaked DB snapshot shouldn't be a working session. This deliberately departs from the trusted-device spec's "follow the existing plaintext pattern" note. |
| `auth.json` never backed up (`NO_BACKUP_FILES`) | `tt_auth` and the token tables are **excluded from the history trigger**. |
| Supabase access | **RLS enabled with zero policies on every `tt_*` table** (deny-all to anon/authenticated). Only the Vercel Function, with the service-role key in Vercel env (never in a `VITE_*` var), touches the DB. The kiosk bundle ships only the anon key + Realtime URL. |
| Cron endpoints | `/api/cron/*` require `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this; `pg_net` calls set it). They return 404 otherwise. |

### Kiosk device pairing (replaces "localhost is trusted")

1. `kiosk-launch.sh` opens `https://tachtach.szvtech.org/kiosk`. This **public bootstrap** page has no data and only does two things:
   - if `tachtach_device` is valid, redirect to `/screen`;
   - otherwise call `POST /api/pair/start`. That endpoint is public, rate-limited to 5/h/IP, and returns `{code: "K7Q-4MX", pollSecret}` with a 10-minute TTL, storing hashes of both.
2. The TV shows the 6-character code (large, kiosk typography) plus a QR linking to `/admin#pair=K7Q-4MX`.
3. The admin opens **Settings → Screens → Pair a screen**, enters or scans the code, and names it ("Main hallway TV"). This is `POST /api/devices/pair` behind `requireAuth` + `csrfProtection`.
4. The kiosk polls `POST /api/pair/poll {pollSecret}` every 3 s. Once the code is claimed, the response sets `tachtach_device=<256-bit token>` with `httpOnly; Secure; SameSite=Lax; Path=/; Max-Age=400d` and redirects to `/screen`.
   - Chrome caps cookie lifetime at 400 days, so `kioskOrAuth` **re-issues the cookie on each `/api/state` hit**, at most once a day, to keep it rolling.
5. The admin's **Screens** list shows name, paired-at, `last_seen_at`, and current slide (from `tt_devices.last_state`), with **Revoke** and **Rename**. A revoked device's next request gets a 404, its `/kiosk` bootstrap shows a new pairing code, and the TV shows the code instead of content. That's fail-closed, and visible.
6. **Pi helper token.** At pairing, the admin can tick "this screen runs the Pi helper". The poll response then also returns a separate **ingest-scoped** token. The kiosk page shows it once in a `<details>`, and `pi-setup.sh` asks for it and writes it to a `0600` file.
   - Alternative: `pi-setup.sh` runs its own CLI pairing against the same endpoints.
   - The token is scoped so a stolen helper token can only POST `/api/ingest/chabad`. It can't read state.

Why not bake a token into the Chromium URL (`/screen?token=...`)? URLs end up in history, logs, and Referer headers. Code pairing keeps the secret in an httpOnly cookie only.

---

## 5. Data migration

### Schema (Supabase Postgres, one new project)

```sql
-- One row per former data/*.json file. Mirrors readJSON/writeJSON exactly.
create table tt_documents (
  key        text primary key,           -- 'settings','slides','messages','pinned','custom-days',
                                         -- 'schedule','schedule-templates','google-albums',
                                         -- 'rss-feeds','fonts','cache','mivtzah', ('schedule-dates' once that spec ships)
  value      jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table tt_document_history (        -- replaces *.bak, but keeps every version for 30 days
  id bigserial primary key, key text not null, value jsonb not null,
  version bigint not null, changed_at timestamptz not null default now()
);
-- trigger on tt_documents: bump version, copy OLD row into history

create table tt_auth (id int primary key check (id = 1), password_hash text, totp_secret text,
                      totp_enabled boolean not null default false, pending_auth jsonb);
create table tt_sessions        (token_hash text primary key, created_at timestamptz, expires_at timestamptz, absolute_expires_at timestamptz);
create table tt_trusted_devices (token_hash text primary key, created_at timestamptz, expires_at timestamptz);
create table tt_login_lockouts  (ip text primary key, attempts int, locked_until timestamptz);
create table tt_devices         (id uuid primary key, name text, token_hash text unique, ingest_token_hash text unique,
                                 created_at timestamptz, last_seen_at timestamptz, last_state jsonb, revoked_at timestamptz);
create table tt_pairing_codes   (code_hash text primary key, poll_secret_hash text, expires_at timestamptz, device_id uuid);
create table tt_screen_commands (id bigserial primary key, action text not null, created_at timestamptz default now());
create table tt_rss_cache       (feed_id text primary key, value jsonb, fetched_at timestamptz);
create table tt_google_photos   (album_id text primary key, value jsonb, updated_at timestamptz);
-- RLS enabled on all of the above, no policies.
```

**Why a document table and not a normalized schema:** `api.js` is written entirely around "read whole file → mutate array → write whole file". A `key → jsonb` table makes `storage.js` a drop-in adapter: `readJSON('slides.json')` maps to `select value from tt_documents where key = 'slides'`. Each `/api` handler can then be ported mechanically and diffed against the current file. Normalizing (a `slides` table, etc.) can happen later, one resource at a time, if ever needed. At this data size (every file is ≤8 KB, see `du data/`) jsonb documents cost nothing.

**Concurrency:** `writeJSON` gains an optional `expectedVersion`. Read-modify-write handlers use `update ... where key=$1 and version=$2` and retry up to 3 times on a 0-row update. Realistic conflicts today:

- the RSS refresher updating `rss-feeds.json` `lastFetched` while the admin edits a feed;
- the Google Photos sync while the admin edits an album.

Moving machine-written fields out of admin-edited documents (`lastFetched`/`itemCount` → `tt_rss_cache`, sync status → `tt_google_photos`) removes most of these conflicts outright.

**Why Supabase over other Vercel-side stores:**

- **Edge Config:** built for rarely-written config, with write propagation delay and write limits. Wrong for an admin CRUD store.
- **Vercel Blob:** good for media, but still needs a DB alongside it.
- **Neon via the Vercel Marketplace:** Postgres only.
- **Supabase:** Postgres, Storage, Realtime, and `pg_cron` in one project. That covers #4, #6, #11/#12, and #20 in one place.

### Supabase: reuse or separate?

**Separate project, same vendor.** Reasons:

- Mivtzah is a different product with its own users, auth (`express-session` + `connect-pg-simple` against `DATABASE_URL` in `saas-server/src/app.ts`), and migrations (`saas-server/drizzle/`). Sharing a database couples their migrations and widens what a leaked service-role key can reach.
- TachTach only reads Mivtzah's public `kiosk_get_leaderboard` RPC with the anon key (`src/fetchers/mivtzah.js`). That keeps working across projects with `MIVTZAH_SUPABASE_URL`/`MIVTZAH_SUPABASE_ANON_KEY` set in Vercel env.

Finding from checking the connected accounts: the Supabase account connected here shows only one project, `printio`, which is **INACTIVE/paused**. The Vercel team `svogel-8234` shows only `printerio-web`. So the Mivtzah Supabase project either lives under another account or isn't created yet (see Open Questions).

**Free-tier note:** Supabase free projects **pause after ~7 days of inactivity**. A kiosk polling every 30 s will keep it awake, but if the TV is off over a long break (summer), the project may pause, and the admin and homepage data go with it. Either upgrade to Supabase Pro (~$25/mo) or add a daily keep-alive from Vercel Cron.

### Migration script

New file `scripts/migrate-to-cloud.js`. It runs on the Pi once, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in env.

1. Requires `--dry-run` first, which prints row counts, total media bytes, and any slide `imageUrl`/`videoUrl` that points at a file missing on disk.
2. Upserts each `data/<name>.json` → `tt_documents(key=<name>)`. `cache.json`'s `mivtzah` key is split into its own row.
3. `data/rss-cache/*.json` → `tt_rss_cache`. `data/google-photos/<albumId>.json` manifests → `tt_google_photos`. Photo files are uploaded under the same relative paths.
4. `data/uploads/*` → bucket `media`, `data/fonts/*` → bucket `fonts`, **keeping the exact filenames**. Because of the `/uploads/:p*` and `/fonts/:p*` rewrites (#22), no URL in `slides.json` or `fonts.json` has to change.
5. `auth.json` → `tt_auth` (`passwordHash` and `totpSecret` copied as-is, so **no password reset or TOTP re-enrollment**). Sessions, trusted devices, and lockouts are **not** migrated: one fresh login after cutover.
6. Idempotent. Re-running upserts, and it skips files whose Storage object already exists with the same size. This allows a final re-sync right before cutover.

`setup.js` is never part of this. CLAUDE.md: it wipes `data/`.

---

## 6. Phased migration (the TV works after every phase)

Each phase has a single rollback step, and the Pi's current stack stays installed until Phase 5.

| Phase | What happens | TV during phase | Rollback |
|---|---|---|---|
| **0. Foundations** | Create Supabase project `tachtach` + schema + buckets. Create Vercel project in `svogel-8234` linked to this repo (root dir = repo root, `saas-*` ignored via `vercel.json` / `.vercelignore`). Deploy the **public homepage** to `www.szvtech.org` or a temporary `tachtach-home.vercel.app`. Add a timezone date helper and route all fetchers through it (fixes #13 for the Pi too, harmless there). | Untouched (Pi as today) | Delete projects |
| **1. Storage adapter on the Pi** | Add `STORAGE_BACKEND=file\|supabase` to `src/server/storage.js` (same `readJSON`/`writeJSON` signatures). Run `migrate-to-cloud.js`. Flip the **Pi's own server** to `supabase`. The Pi now reads and writes the cloud DB but still serves everything, SSE included. Keep writing a local `data/cache.json` snapshot so a WAN drop still serves cached data. | Served from Pi; data from cloud | `STORAGE_BACKEND=file` + restart `tachtach-server` (local JSON files are still there) |
| **2. Cloud admin + API (staging host)** | Deploy the Express app to Vercel at `tachtach-cloud.szvtech.org` with: `bcryptjs`, DB-backed auth tables, direct-to-Storage uploads, and the Vercel rewrites. Schedulers are **disabled on Vercel** (a `RUN_SCHEDULERS=false` guard around the `setTimeout` block in `createApp`). The Pi server subscribes to the Realtime poke channel and re-broadcasts locally over its existing SSE, so an edit made on the cloud admin reaches the TV within seconds. Owner uses the cloud admin for a week. | Served from Pi; edits from either admin | Keep using the tunnel admin; stop using staging |
| **3. Move jobs to the cloud** | Enable `/api/cron/*` with `pg_cron` schedules (30 min fetch-all, admin-set daily, hourly RSS, 30 min photos, daily cleanup). Disable the same jobs on the Pi, **except** the chabad Hayom Yom/Tanya fetch. Measure whether Vercel's plain fetch / `@sparticuz/chromium` gets past chabad.org's Cloudflare. If not, install the Pi helper (§2) and turn off the Pi server's own puppeteer path. Countdown logic moves into the kiosk bundle (`useCountdowns`) and the server `countdown.js` is retired. | Served from Pi; data produced by cloud | Re-enable Pi schedulers (env flag), disable `pg_cron` jobs |
| **4. Kiosk cutover (staging host)** | Ship the SW, `/kiosk` pairing, `useRealtime`, `kioskOrAuth`, and `postMessage` preview. On the Pi: `SCREEN_URL=https://tachtach-cloud.szvtech.org/kiosk`, pair it. **Soak test for go/no-go:** (a) normal school day, (b) WAN unplugged 2 h mid-day, (c) cold boot with WAN unplugged, (d) nightly 03:15 restart, (e) admin edits from a phone reach the TV within 5 s, (f) revoke → TV shows pairing code. | Served from Vercel | `SCREEN_URL=http://127.0.0.1:3000/screen` + restart kiosk (Pi server still running) |
| **5. Domain move + decommission** | Point `tachtach.szvtech.org` at Vercel (Cloudflare DNS: CNAME → Vercel, **DNS-only/grey-cloud**, as Vercel recommends). Move the kiosk to the final hostname (one re-pair: cookies are per-host). Change cloudflared ingress to SSH-only. `systemctl disable tachtach-server` but **leave it installed for 30 days**. Update `pi-setup.sh` with a `--thin` mode (no npm build, no `setup.js`, installs only the kiosk units + helper), and update CLAUDE.md / ARCHITECTURE.md / GOTCHAS.md. | Served from Vercel | DNS back to the tunnel CNAME; re-enable `tachtach-server`; `SCREEN_URL` back to localhost |

### Rough cost and quota check (assumes one screen)

- **Function invocations:**
  - kiosk version poll every 30 s ≈ 2.9k/day;
  - screen reports on slide change ≈ 4–6k/day;
  - poke-driven refetches + admin use: low hundreds/day.

  That's roughly 200–300k/month, within Hobby's included invocations. Cron work runs on `pg_cron`, so it doesn't need Vercel Pro.
- **Vercel Hobby is for non-commercial personal use.** Whether a school counts is a plan question for the owner. Pro is ~$20/mo.
- **Supabase free tier:** 500 MB DB is plenty. 1 GB Storage is tight if many videos are uploaded. The SW media cache keeps egress low because each file is fetched once per device.

---

## Testing

- **Storage adapter:** run the existing API behavior against both backends (`file`, `supabase` on a local Supabase via `supabase start`). Same requests, same JSON out.
- **Auth:**
  - migrated bcrypt hash verifies under `bcryptjs`;
  - migrated TOTP secret verifies;
  - lockout persists across two different Function instances (simulate with two app instances sharing a DB);
  - session rewrite only after >1 h drift (regression for the GOTCHAS rewrite storm).
- **`kioskOrAuth`:** no cookie → 404 with an empty body; revoked device → 404; admin session → 200; device cookie on `/api/settings` (admin-only) → 401/redirect as today.
- **CSRF:** first mutation after loading `/admin` succeeds (GOTCHAS regression).
- **Timezone:** `fetchHayomYom` at 23:30 `America/New_York` (03:30 UTC next day) requests *today's* `tdate`.
- **Countdown parity:** `useCountdowns` driven by a fake clock emits start/tick/end at the same instants `countdown.js` would for the same `schedule.json`.
- **SW:** offline reload serves the last `/api/state`; a new deploy is picked up on the next poke or the nightly restart; the `?nosw=1` kill switch unregisters it.
- **Phase 4 soak checklist** (above) is the cutover go/no-go.

---

## Open questions for the owner

1. **Homepage content.** What should `tachtach.szvtech.org/` show publicly: just the school name and a logo, or also public info such as today's zmanim, the Hebrew date, or announcements? Anything beyond static needs a public read endpoint that deliberately exposes only those fields. Does it need a visible "Admin login" link, or should that stay hidden as today?
2. **Hostnames.** Keep the kiosk and admin at `tachtach.szvtech.org` with the homepage at `/`, or split them (e.g. `szvtech.org` / `www` = homepage, `tachtach.` = app)?
3. **Plans and cost.** Comfortable with Vercel Hobby given its non-commercial clause, or go Vercel Pro (~$20/mo)? Supabase free (pauses after ~7 idle days, e.g. summer) or Pro (~$25/mo)?
4. **Mivtzah's Supabase.** Which account and project does Mivtzah actually use? The connected Supabase account only shows a paused `printio` project, and the Vercel team only `printerio-web`. Confirm that TachTach gets its **own** project (recommended), and that the `kiosk_get_leaderboard` RPC URL/anon key will be available as Vercel env vars.
5. **Offline expectations.** Is "keeps showing the last content when the internet drops, and survives a reboot while offline" enough (Architecture A), or does it have to come up after a reboot with no internet even on a freshly reflashed Pi (pushes toward B)?
6. **RTC battery.** OK to add the ~$5 Pi 5 RTC battery so the clock is right after power cuts with no internet?
7. **Pi helper.** OK to keep one small scheduled job on the Pi for the Cloudflare-blocked Hayom Yom/Tanya pages, if the Phase 3 test shows Vercel can't get them? Or is "Hayom Yom may be stale or missing when the Pi is off" acceptable with no helper at all?
8. **Cloudflare Access.** Today's tunnel doc recommends Access in front of the admin. Vercel works best with the record DNS-only (grey cloud), which removes Access. Is mandatory TOTP + IP lockout + Vercel Firewall enough, or should Access stay on SSH only?
9. **Multiple screens.** Device pairing supports several TVs for free. Should they all show the same content (default), or is per-screen content (different slide sets per TV) wanted later? That would change the data model, so better to know now.
10. **Live Preview fidelity.** The preview iframe will get draft edits by `postMessage` instead of a server round-trip. It will no longer "jump to the slide the real TV is on" faster than the report interval (~one slide). Acceptable?
