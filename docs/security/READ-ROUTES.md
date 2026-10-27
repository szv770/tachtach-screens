# Read routes (every GET under /api)

Status 2026-10-27. Source of truth in code: `READ_ROUTES` in `src/shared/permissions.js` (enforced by `canDo` -> `canRead` in `enforceRole`, budgets by `src/server/readLimiter.js`). `test/readRoutes.test.js` walks the real Express app and fails if a GET route is missing from the table or the table lists one that does not exist.

Why: `canDo` used to say `if (reading) return true`, so every signed-in role (View-only, Messages-only) could call every GET, and the mutation limiter skips GET. That is how red-team F4 (swap-options event-loop freeze) and F6 (preview-state outbound flood) were reachable by the lowest role.

Rules now:
- A GET is allowed to non-admins only if listed. Unlisted = admin-only (also HEAD/OPTIONS).
- `who`: `open` = any signed-in person; or a list of capabilities (holding ANY one is enough).
- `budget`: per person AND per route, fixed one-minute window, in memory (bounded table), 429 with `Retry-After`. `heavy` 12/min, `medium` 30/min, `light` 120/min.
- Every query value is bounded (see "Bounds"); absurd values get a plain 400.

Privacy classes (from `docs/saas/FIT-RULES.md`): public, org, names (student names), secret.

## Inventory

| Route | Who (View / Messages / Full / Admin) | Needs | Cost | Budget | Reveals |
|---|---|---|---|---|---|
| `/api/state` | all (also kiosk, live viewer via its own gate) | open | read 9 files, merge | viewer limiter (existing) | org: what the TV shows (names appear where the TV shows them) |
| `/api/screen/state`, `/api/screen/status`, `/api/freeze` | all | open | memory read | none | org |
| `/api/kiddush-levana/shown`, `/api/rss/cache/:feedId`, `/api/google-album/:id/photos` | all (kiosk gates in app.js run first) | open | file read | none | org (what the TV shows) |
| `/api/me`, `/api/push/status` | all | open | one user lookup | none | own account |
| `/api/history` | all (filtered to what that person may see) | open | reads activity (500) + undo store | medium | names (who did what); non-admins see own + shared only |
| `/api/health` | all (Home + Health page) | open | disk/uploads walk, ntp/poppler exec, album status | medium | org (counts, disk, versions) |
| `/api/preview-state` | all ("Preview a date" on Home) | open | up to 8 outbound fetches, headless browser (Chabad.org) | heavy | org |
| `/api/settings`, `/api/slides`, `/api/custom-days`, `/api/schedule`, `/api/schedule/{templates,dates,blocks}`, `/api/announcements`, `/api/messages`, `/api/pinned`, `/api/media`, `/api/fonts` | all | open | one file read (`dates` filters in memory) | none | org content the TV already shows |
| `/api/announcements/shabbos-end` | all (composer) | open | memoised zmanim, may fetch once | medium | public times |
| `/api/quick-templates`, `/api/saved-letters` | Messages, Full, Admin | any announcements.* | owner-filtered list | none | names (recents, letters) |
| `/api/kiddush-levana`, `/api/kiddush-levana/months` | Messages, Full, Admin | any announcements.* | astronomy table, up to 24 months | medium | public |
| `/api/daily-words`, `/api/daily-stories` | Full, Admin | dailyWord.edit | up to ~20 kB list | none | org |
| `/api/roster` | Full, Admin | roster.edit | list | none | **names** (students, birthdays) |
| `/api/chazan` | Full, Admin | chazan.edit | forecast walk | none | **names** |
| `/api/chazan/swap-options` | Full, Admin | chazan.edit | day loop, capped at 800 days, date must be within 800 days of today | medium | **names** |
| `/api/google-albums` | Full, Admin | feeds.edit / media.* / slides.edit | status look-up per album (polled every 5 s by the admin) | light | secret-ish (shared album links) |
| `/api/google-album/:id/status` | same | same | one status look-up | medium | album status |
| `/api/rss/feeds` | Full, Admin | feeds.edit / slides.edit | file read | none | secret-ish (feed URLs can carry tokens) |
| `/api/embed-probe` | Full, Admin | slides.edit | outbound fetch from the Pi (SSRF-guarded) | heavy | none (probes an address) |
| `/api/weather/preview` | Admin | settings.change / look.change | outbound fetch | heavy | none |
| `/api/candle-preview` | Admin | settings.change / look.change | small calculation | medium | public |
| `/api/schedule/zmanim` | Full, Admin | schedule.edit | up to 14 outbound look-ups | heavy | public |
| `/api/team` | Admin | team.manage (adminOnly) | user list | none | **names + staff data** (usernames, roles, sign-in state) |
| `/api/activity` | Admin | team.manage | up to 500 log rows | medium | **names + staff data** |
| `/api/system/info` | Admin | system.update (adminOnly) | gathers platform, LAN addresses | none | box identity |
| `/api/system/live` | Admin | system.update | config read | none | **secret** (the live-view word) |
| `/api/system/update` (+ `?refresh=1`) | Admin | system.update | git fetch with refresh | medium | version info |
| `/api/system/update/status` | Admin | system.update | memory | none | box state |
| `/api/system/data-pack`, `/download` | Admin | system.update | status / whole pack | medium (download) | org |

## Role behaviour changes (for legitimate use there are none)

Pages a role can open are unchanged. What changed is only reads those roles never use from their pages: View-only and Messages-only can no longer read roster, chazan (+ swap options), daily words/stories, album links, feed URLs, embed probe, zmanim lookups; View-only can no longer read quick messages / saved letters / Kiddush Levana; Full editors can no longer call weather/candle preview (the Location page is admin-only in the UI). Everyone still gets Home, Health, History, "Preview a date", Account.

## Bounds on request values

| Route | Value | Rule |
|---|---|---|
| preview-state | `date` | real date, within 800 days of today |
| chazan/swap-options | `date`, `tefila` | real date within 800 days, known davening |
| schedule/zmanim | `dates` | string up to 300 chars, at most 14 real dates, each within 400 days |
| schedule/dates | `from`, `to` | real dates when present |
| kiddush-levana/months | `count` | whole number 1-24 |
| history | `limit` | whole number 1-200 |
| activity | `limit`, `user` | whole number 1-500, id up to 64 chars |
| health | `clientNow` | digits, a valid time value |
| embed-probe | `url` | string up to 2048 chars |
| candle-preview | `minutes` | whole number 10-60 (existing) |
| weather/preview | `units` | `C` or `F` (existing) |
| google-album/:id/* | `id` | string up to 128 chars |

Helpers: `src/shared/readBounds.js`.

## Adding a GET route

1. Add `readRule('/api/..', who, budget)` to `READ_ROUTES`.
2. Pick `who` by privacy class: names/secret -> a capability; org content the TV shows -> `open`.
3. Anything that fans out, loops on input or builds a report gets a budget.
4. Bound the query values with `readBounds.js`; add them to the 400 cases in `test/readRoutes.test.js`.
5. Add a row to the matrix in `test/readRoutes.test.js` and to this file.
