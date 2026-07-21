# TachTach-Screens — Agent Index

Digital signage for a Jewish school on a Raspberry Pi 5. One Node/Express process serves a kiosk display SPA (`/screen`) and a mobile-friendly admin SPA (`/admin`), synced live over SSE. No database — JSON files in `data/`. No Tauri, no TypeScript on this side (plain JS + React 18 + Vite, inline styles, no Tailwind).

**This repo has a second, mostly-independent product**: `saas-admin/` (React+TS+Vite) + `saas-server/` (Express+TS+Drizzle) is the "Mivtzah" SaaS platform, deployed separately to Vercel. TachTach only touches it via one feature: the `MivtzahLiveEmbedSlide` / `MivtzahLeaderboardSlide` iframe-embeds its public `/live` page. Fixing Mivtzah's own look/behavior happens entirely in `saas-admin`/`saas-server`, not here. `.worktrees/saas-build` and `.worktrees/saas-platform` are stale leftover dirs, not registered git worktrees (`git worktree list` doesn't show them) — don't assume they're live.

## Stack & run

Node/Express 4, React 18, Vite 6, Framer Motion, Sharp, node-schedule, bcrypt+otplib (TOTP). `npm run dev` (server :3000 + Vite :5173, proxied), `npm run build && npm start` for prod. `node setup.js` for first-time admin password — **never re-run it to reset a password, it wipes `data/`**; use `npm run reset-admin` instead.

## Directory map

| Path | What's there |
|---|---|
| `server.js` | Entry point — creates app, binds `HOST:PORT` (default `0.0.0.0:3000`) |
| `src/server/app.js` | Express app assembly — middleware order, route mounting, scheduler bootstrap |
| `src/server/routes/{auth,api,screen}.js` | Login/TOTP, all `/api/*` CRUD, SSE `/stream` |
| `src/server/middleware.js` | `requireAuth`, `localhostOnly`, `localhostOrAuth`, CSRF double-submit, setup gate |
| `src/server/{scheduler,countdown,cleanup,rss-scheduler,mivtzah-scheduler,google-photos}.js` | Background jobs (see ARCHITECTURE.md) |
| `src/server/storage.js` | Atomic JSON read/write to `data/*.json`, file-level locking, `.bak` backups |
| `src/fetchers/*.js` | Chabad.org / HebCal / Sefaria / RSS / Google Photos / Mivtzah scrapers — all server-side, cached to `data/cache.json` |
| `src/screen/` | Kiosk SPA — `App.jsx` + `components/slides/*` (one file per slide type) + `components/messages/*` |
| `src/admin/` | Admin SPA — `App.jsx` + `components/*` (one file per admin section) |
| `src/shared/constants.js` | Zmanim key maps, Hebrew numerals, Sefer name translations — shared by fetchers and screen |
| `data/` | Runtime state, JSON files + `uploads/`, `fonts/`, `google-photos/`, `rss-cache/`. Gitignored except committed starting defaults. |
| `deploy/` | Pi provisioning + Cloudflare Tunnel setup (user-facing, see files directly) |
| `docs/ADMIN_GUIDE.md`, `docs/FULL_SETUP_GUIDE.md` | User-facing guides — not needed for code changes |
| `saas-admin/`, `saas-server/` | Separate Mivtzah SaaS product (see above) |

## Non-negotiable rules

- **Fail closed.** Every route is gated: `/admin` + `/api/*` need `requireAuth`; `/screen` + `/stream` + a few kiosk-only `/api/*` endpoints use `localhostOrAuth`/`localhostOnly` (404, not 403, on reject — never leak route existence). See `src/server/middleware.js`.
- **`localhostOnly` checks `req.ip` against `127.0.0.1`/`::1`.** Behind the Cloudflare Tunnel or any reverse proxy, `TRUST_PROXY=1` **must** be set or every request looks non-local and admin/kiosk access breaks. This has broken twice already (see GOTCHAS.md).
- **CSRF**: double-submit cookie, HMAC-bound to the session token. The `_csrf` cookie is deliberately issued on `GET /api/state` (not just on mutation) — removing that breaks the first mutating request after every admin page load.
- **Banners never pause slide rotation; Takeovers always do; Boards replace slide content only.** This is intentional product behavior, not a bug.
- **`data/auth.json` is never backed up or touched by `git pull`.** Password/TOTP reset only via `npm run reset-admin` (`scripts/reset-admin-credentials.js`), never `setup.js`.
- No Tailwind, no Inter/Roboto/system sans-serif on the kiosk display — see the design tokens in `src/screen/styles/tokens.js`. This is a deliberate aesthetic choice from the original spec.

## Need more detail?

- **`docs/claude/ARCHITECTURE.md`** — request/middleware pipeline, scheduler tracks A/B/C, SSE event catalog, auth/CSRF/TOTP flow, data file inventory.
- **`docs/claude/FEATURES.md`** — every slide type, message type, and admin section mapped to its actual component file.
- **`docs/claude/GOTCHAS.md`** — real incidents from git history (localhost-gating breaking remote access, screen-scaling bugs, CSRF cookie timing, Cloudflare blocking fetchers, Windows/OneDrive file-lock quirks). Read this before touching auth, `/screen` scaling, or the fetchers.

## Recent changes log

Append one line per notable fix/feature when you ship it — newest on top. Keep each entry to one line.

- 2026-07-20 — `TRUST_PROXY` required for Cloudflare Tunnel deploy (IP detection was breaking localhost gating behind the tunnel); auth routes now send `Cache-Control: no-store`.
- 2026-07-19 — Hayom Yom/Tanya fetchers bypass Cloudflare block; kiosk canvas scaling overhauled (pinned top-left, fills actual screen resolution, zoomed-in UI); Google Translate prompt suppressed.
- 2026-07-19 — Admin mobile pass: sticky auto-scrolling tab nav, Preview bottom sheet, iOS input-zoom fix, typeable number/text inputs (commit-on-blur), unified mobile design tokens.
- 2026-07-19 — Fixed `/screen`, `/stream`, and `/api/state` being accidentally localhost-only, which broke remote admin/Live Preview.
- 2026-07-18 — Mandatory TOTP 2FA added on login; `npm run reset-admin` script added for password/TOTP recovery without wiping `data/`.
- 2026-07-18 — Initial commit: TachTach kiosk app + Mivtzah SaaS platform.
