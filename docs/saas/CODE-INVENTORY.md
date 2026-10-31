# Code inventory against the SaaS plan

Status: snapshot of branch `claude/wizardly-ride-bnbtzj` on 2026-10-26 (after commit `02dc09c`). Line numbers drift; the file names and patterns are what matter. Re-run the greps in section 7 to refresh.
Read with: `FIT-RULES.md` (the rules), `STORAGE-INTERFACE.md` (the target API), `CLOUD-PLAN.md` sections 6-8 (where each thing ends up in the cloud). This file says **what has to change in the code**, which CLOUD-PLAN 8.1/8.2 only sketches.

Legend:
- **Scope**: `org` / `box` (one player) / `platform` (shared by all orgs) / `person` (identity across orgs). See FIT-RULES.
- **Class**: `public` / `org` / `names` (student names or named-student facts) / `secret`.
- **Size**: S = under a day, M = 1-3 days, L = a week or more (agent-days, tests included).
- **Access**: `RW` = `readJSON` + `writeJSON` (whole document, **no** read-modify-write lock), `U` = `updateJSON` (locked RMW), `Q` = own in-process queue/lock in the store module, `raw` = `fs` directly, bypassing `storage.js`.

---

## 1. Every `data/` file

| File | Owner module(s) (writers first) | Other readers | Access | Scope | Class | What must change for multi-org (concrete) | Size | Risks |
|---|---|---|---|---|---|---|---|---|
| `users.json` (+ legacy `auth.json`) | `users.js:90` `createUserStore` (one `tx()` queue), `scripts/reset-admin-credentials.js`, `setup.js:67` | `middleware.js` `requireAuth`/`userForRequest` | Q (injectable read/write) | person + org (mixed) | secret | Split into identity (`people`: username, hash, 2-step, trusted devices) and `memberships` (org, role, preset, overrides) + per-org sessions/links/preauth/lockouts (`CLOUD-PLAN.md` 14.4, 6.3). Store gets `ctx`; session lookup returns `{person, membership, orgId}`. File impl: keep the one file with `people[]` + `memberships[]` in it so the Pi stays one-org. | L | The hottest security code. `reset-admin` runs in a second process: the in-process queue does not protect it against the running server (existing behaviour; document, do not worsen). |
| `activity.json` | `activity.js:58` `createActivityLog` | `routes/team.js`, `routes/history.js` | RW via factory, ring 500 | org | org (staff names) | Per-org log; factory per ctx; `actor` becomes membership id + display name; support-visit marker. | S | Lines are plain English, never bodies (keep it: no student names). |
| `undo.json` | `undoStore.js:15`, `undoIo.js` (executors) | `routes/history.js` | RW via factory | org | names (holds before/after copies of announcements, which carry typed names) | Per org; retention like the activity log; executors in `undoIo.js` import the route module (`undoIo.js:14` `apiMod`) and read files by name: give them `ctx`. | M | Undo replays through the same stores, so it inherits isolation if the stores have it. |
| `settings.json` | `routes/api.js:178-262`, `settings-migrate.js`, `setup.js:95` | ~18 modules (`app.js`, `chazanStore.js`, `countdown.js`, `freeze.js`, `kiddush-levana.js`, `fetchers/index.js`, `scheduleStore.js`, `cleanup.js`, `health.js`, `routes/announcements.js`, `routes/daily-words.js`, `routes/dataPack.js`, `schedule-groups.js`, `packRefresh.js`, `undoIo.js`, `announcements-store.js`) | Q (`withSettingsLock`, `routes/api.js:191`, also used by `kiddush-levana.js:79`, `undoIo.js:34`) + RW (`settings-migrate.js:84` at startup) | **mixed** org + box (section 3) | org (zip/location = school address; `public` otherwise) | Tag every key with a scope (NEXT-STEPS B4); split box keys into a `box-settings` document on the player; the 18 readers get settings from `ctx` (one read per request) instead of re-reading the file. | M | A second lock domain next to `storage.js`'s file lock; fine while every writer uses it. The Store's `update` should become the one lock. |
| `slides.json` | `routes/api.js:263-352`, `announcements-store.js`, `builtin-slides.js`, `undoIo.js` | `app.js` state, `cleanup.js`, `countdown.js`, `routes/announcements.js` | U (7) + RW (3 `writeJSON`) | org | org | Mechanical: ctx through; the 3 remaining `writeJSON` sites become `update`. | S | Built-in slide rows added at startup (`builtin-slides.js`) become a per-org migration step. |
| `announcements.json` | `announcements-store.js` (`ensureMigrated`, U for writes) | `routes/announcements.js`, `app.js`, `live.js` reducer | U | org | **names** (free text; quick messages are built to name a student) | Per org; migration flag per org; `migrationPromise` singleton (`announcements-store.js:150`) becomes per ctx. | S-M | Mode L: names in free text DO reach the cloud. Disclose (CLOUD-PLAN 9.1); support visits log views of it. |
| `messages.json`, `pinned.json` | `announcements-store.js`, `setup.js:148-152` | - | RW | org | org | Legacy, emptied. Do not migrate; export keeps originals. Drop writes from `setup.js`. | S | - |
| `custom-days.json` | `routes/api.js:355-418` | `app.js`, `chazanStore.js:33` | U (3) + R | org | org | Mechanical. | S | Chazan reads it: in Mode L the Pi needs the cached cloud copy. |
| `schedule.json` | `routes/api.js:421-637`, `scheduleStore.js:119,140`, `routes/schedule-dates.js`, `undoIo.js` | `app.js`, `countdown.js` | **two lock domains**: U (`routes/api.js:441-527`, storage file lock) and Q (`withScheduleLock`, `scheduleStore.js:49`, used by `routes/schedule-dates.js:140-399` and `scheduleStore.js:116,140`, which do `readJSON` + `writeJSON` inside it) + RW full replace (`routes/api.js:548`) | org | org | One lock per document: route the `withScheduleLock` read-modify-writes through `updateJSON('schedule.json', ...)` (or make `withScheduleLock` take the storage lock); ctx through. | M | **Real lost-update race today**: an entry edit (`updateJSON`, file lock) and a by-date apply (`withScheduleLock`, reads outside the file lock) can interleave and one change is lost. Rare (two editors at once) but silent. |
| `schedule-templates.json` | `routes/api.js:538-637`, `routes/schedule-dates.js` | - | U + RW (1) | org | org | Mechanical. | S | - |
| `schedule-dates.json`, `schedule-blocks.json` | `scheduleStore.js` (own queue, `:56-81`) | `countdown.js`, `routes/api.js` | Q + RW | org | org | Store factory per ctx; `inflight` map (`scheduleStore.js:178`) keyed by org. | S | - |
| `zmanim-dates.json` | `scheduleStore.js:186` (per-date zmanim for the AI prompt) | `kiddush-levana.js:106` | RW | **platform** (depends on place + date) | public | Becomes a shared cache keyed by location + date (`shared_cache`), not an org document. | S | Today implicitly "the school's location"; must key by location. |
| `quick-templates.json` | `quickTemplatesStore.js` via `ownedStore.js:28` (queue, `io` injectable) | - | Q | org (+ per-person recents) | **names** (recents hold student names typed into `{bochur}` blanks, `quickTemplatesStore.js:4,17`) | Move `recents` out to a per-membership, names-class document (or cap + purge); otherwise Mode L leaks names to the cloud. ctx through `io`. | M | Silent Mode L leak if moved as is. |
| `saved-letters.json` | `savedLettersStore.js` via `ownedStore.js` | - | Q | org | org | Mechanical via `io`. | S | - |
| `freeze.json` | `freeze.js:31` (factory, timer) | `app.js` state | RW via factory | org | org | Per org; the re-evaluation timer becomes kiosk-side / tick-side (CLOUD-PLAN 13.11). | M | Module-level timer. |
| `google-albums.json` | `routes/api.js:872-1040` | `app.js`, `cleanup.js`, `health.js`, `google-photos.js` | U (3) + R (11) | org | org (album URLs are capability links) | Mechanical; sync status moves to its own doc/table. | S | Viewer reducer strips URLs (`live.js`); keep. |
| `rss-feeds.json` | `routes/api.js:1123-1300`, `rss-scheduler.js:44` | `app.js`, `health.js` | U (4) + R | org | org | Mechanical; `lastFetched` moves next to the feed cache. | S | - |
| `fonts.json` | `routes/api.js:1042-1120` | `app.js` | U (2) + R | org | public | Mechanical; files move to the blob store. | S | - |
| `cache.json` | `fetchers/index.js` (`fetchAll`), `scheduler.js`, `mivtzah-scheduler.js` | `app.js`, `freeze.js`, `health.js`, `kiddush-levana.js`, `push.js:153`, `routes/announcements.js`, `routes/api.js`, `scheduleStore.js` | RW (2 writers, no lock between fetchAll and the mivtzah merge) | **mixed**: platform (zmanim, Hebrew date, learning texts, weather by place) + org (mivtzah, packInfo) | public | Split: shared part keyed by location + date (one fetch for every org in a city); org part (mivtzah) into its own document. Readers get the combined view from a `readDayData(ctx)` helper. | M-L | Two writers without `updateJSON` can drop each other's keys today. |
| `kiddush-levana.json` | `kiddush-levana.js` (30 s ticker) | `app.js` `/api/kiddush-levana/shown` | RW | org (per screen, really: "shown on this TV") | public | Per org; in the cloud the player reports "shown" (CLOUD-PLAN 13.11). | S | - |
| `daily-words.json`, `daily-stories.json` | `routes/daily-words.js`, `routes/daily-stories.js` | `app.js` | RW (whole-list PUT) | org | org | Mechanical; recorders (`startDailyWordRecorder`) become tick steps. | S | - |
| `menu.json` | `src/server/menuStore.js` (factory `createMenuStore({read, update})`), `routes/menu.js` | `app.js` (`/api/state.menu`, window around today), `routes/api.js` (preview-state) | Q (`updateJSON`, `mutate(ctx, fn)`) | org | **P0** (food + meal names; `menu.edit`, no student names) | Already a store module taking `ctx` first; the SSE `menu-update` is a refetch-safe nudge. | S | - |
| `live.json` | `live.js:33-77` | `app.js` (`stateGate`) | RW | org | secret (cookie HMAC secret, word) | Per org; secret encrypted in the cloud; excluded from history. Cookie is host-only per org. | M | Guess guards are in memory per process (`live.js:228`); cloud needs the shared lockouts table. |
| `push.json` | `push.js:18-29` | `routes/push.js` | RW | **platform** (VAPID key) + org/person (subscriptions) | secret | Key -> platform secret; subscriptions -> per membership. | M | - |
| `roster.json` | `routes/roster.js:16-28` (whole-list PUT + one lock) | `chazanStore.js:33`, `app.js` state, `live.js` reducer | RW | org | **names** | Mode L: stays on the People box (player-side store). Mode C: encrypted rows. Everyone else refers to people by id only. | L (with Mode L/C) | Every new feature that wants names must read through this one module. |
| `chazan.json` | `chazanStore.js:74-86` (`mutate`, own lock) | `app.js`, `live.js` reducer | Q | org | **names** (ids + who-led-when + away dates) | Follows the names mode, like `roster.json`. `context()` (`chazanStore.js:33`) reads settings + roster + custom days: give it `ctx`. | M | - |
| `update-request.json`, `update-status.json`, `update-installed.json`, `update-notified.json`, `update-cache.git/` | `systemUpdate.js:27-144` (raw `fs`, by design), root wrapper | `routes/systemUpdate.js` | raw | **box** | secret-ish (nonce) | Stays on the player, never an org document; in the cloud the trigger is a signed device command (CLOUD-PLAN 12.6). Leave raw: the root helper's file checks depend on exact paths and modes. | - | Do not "fix" this into storage.js. |
| `tls/` | `localTls.js:26` (raw) | - | raw | box | secret | Stays. | - | - |
| `pack/` (data pack), `pack-work/state.json` | `dataPackStore.js:17` (raw, own swap), `packBuilder.js:27-34` (raw) | `fetchers/index.js` | raw (own atomic swap) | **platform** | public (licensed text, credit required) | One shared pack, not per org; in the cloud a read-only platform asset. `TACHTACH_PACK_DIR` already decouples it. Builder is box-only (needs a residential address). | S | Licence (CLOUD-PLAN Q12). |
| `legacy/` | `announcements-store.js:22-73` (raw `writeFile`) | - | raw | org | org | Include in export; move the write behind the blob/area helper. | S | - |
| `uploads/` | `upload.js:12`, `routes/api.js:754,779,795-870`, `cleanup.js:13`, `app.js:416,457` (static) | `health.js` sizes | raw | org | public-by-unguessable-name | One `blobArea(ctx,'uploads')` helper (NEXT-STEPS B3), later the blob store; cleanup per org. | M | Path built in 6+ places today. |
| `fonts/` | `routes/api.js:45` `FONTS_DIR`, `app.js:407,448` (static) | - | raw | org | public | As uploads. | S | - |
| `google-photos/` | `google-photos.js:15,58,71` (manifests + photos), `cleanup.js:14`, `app.js:425,466` | - | raw (manifest writes not atomic) | org | org | As uploads; manifests become documents. | M | - |
| `rss-cache/` | `rss-scheduler.js:10,41` (raw `writeFile`, not atomic), `app.js:361` (raw read), `storage.js:40` (mkdir) | `routes/api.js:1280` | raw | org | public | Documents per feed (`rss-cache/<id>`) through the store, or a blob area. | S | A torn write today shows the kiosk an empty feed. |
| `.puppeteer-tmp/` | `fetchers/browserFetch.js:27` | - | raw | box | - | Stays box-only (headless Chromium). | - | - |
| `device.json`, `player/` (future) | - | - | - | box | secret | New in P3; box scope from day one. | - | - |

---

## 2. Server modules and route groups

| Module / route group | Data it touches | Global state (singletons) | Scope | What must change (concrete) | Size | Risks |
|---|---|---|---|---|---|---|
| `server.js`, `app.js` (552 lines) | 11 direct `readJSON` calls; `/api/state` assembly `app.js:279-333` reads 14 sources | startup jobs block `app.js:76-190` | - | (1) An org-context middleware before every router (one org on the Pi: `ctx = defaultOrg`). (2) `/api/state` built by one `buildState(ctx)` function (also used by preview-state and the future device API). (3) Startup jobs moved to a `jobs` registry run per org. (4) The six static mounts (`:407-466`) go through one `mountBlobAreas(app)` helper. | M | `app.js` is also being edited by other agents right now (system info); coordinate. |
| `storage.js` | all docs | `fileLocks` (`:15`), `permsTightened` | - | Becomes `store/file.js` behind the Store interface; `readJSON`/`writeJSON`/`updateJSON` stay as thin wrappers bound to the default org (STORAGE-INTERFACE). | M | Byte compatibility: keep `JSON.stringify(data, null, 2)`, `.bak`, `.tmp`, fsync, modes. |
| `middleware.js` (`requireAuth :27`, `enforceRole :49`, `logActivity :68`, `isLocalRequest :102`, `csrfProtection :151`, `setupCheck :203`) | users, activity, undo | `undoSvc` (`:60`) | org + box | `requireAuth` checks `session.orgId === req.ctx.orgId` (404 otherwise); `setupCheck` becomes per org ("this org has no admin yet"); `localhostOnly` stays box-only. | M | Fail-closed semantics must not change. |
| `users.js`, `routes/auth.js`, `routes/team.js`, `authPages.js` | users.json | `users` singleton (`users.js:693`), `TOTP_ISSUER` constant (`:31`) | person + org | Identity/membership split (NEXT-STEPS B5); TOTP issuer `TachTach Screens (<org short>)` so authenticator apps show which org (cosmetic, but with one login it becomes "TachTach Screens" once per person). | L | - |
| `activity.js`, `undo*.js`, `routes/history.js` | activity, undo | `undoIo.js:14` lazy route import | org | ctx through; `visibleTo` keeps its rules per membership. | M | - |
| `routes/api.js` (1464 lines: settings, slides, custom days, schedule, templates, weather preview, refresh, cleanup, security, logo, upload/media, albums, fonts, RSS, preview-state) | 12 documents + 3 blob areas | none at module level | org | Mechanical: every handler `readJSON(f)` -> `store.read(req.ctx, doc)`; raw paths `:45,754,779` -> blob helper; RMW writes -> `update`. Split by area while doing it (it is the biggest file). | L | Size; do it area by area with tests green. |
| `routes/announcements.js`, `announcements-store.js`, `announcements-model.js` | announcements, slides, settings, cache | `shabbosEndMemo` (`routes/announcements.js:249`, keyed by date only: **cross-org bug once two orgs share a process**), `migrationPromise` (`announcements-store.js:150`) | org | Memo key `${location}|${date}`; migration per org. | S | - |
| `routes/schedule-dates.js`, `scheduleStore.js`, `schedule-groups.js` | schedule docs, zmanim-dates | `inflight` (`scheduleStore.js:178`) | org (+ platform zmanim) | Store factory per ctx; zmanim-dates to shared cache. | M | - |
| `routes/quick-templates.js`, `routes/saved-letters.js`, `ownedStore.js` | quick-templates, saved-letters | per-store `chain` lock | org | Good shape already (`io` injection, ids never paths). Move recents out (names class). | S | - |
| `routes/roster.js`, `routes/chazan.js`, `chazanStore.js` | roster, chazan, settings, custom days | store lock | org, names | Names-mode aware store (Mode L = player-local implementation). | L (with P3) | - |
| `routes/daily-words.js`, `routes/daily-stories.js` | daily-* docs | recorder timers | org | ctx; recorders -> jobs. | S | - |
| `freeze.js`, `routes/freeze.js` | freeze, settings, cache | re-evaluation timer | org | Factory per ctx; timer -> kiosk-side rule + job. | M | - |
| `kiddush-levana.js` | kiddush-levana, settings, cache, zmanim-dates | `timer` (`:19`) | org | Tick -> job per ctx. | S | - |
| `countdown.js` | schedule, schedule-dates, settings, slides | `alertTimers`, `tickIntervals`, `endTimers`, `activeAlerts` (`:9-24`), `midnightTimer` (`:210`) | org | Countdown already runs on the kiosk clock in the target (CLOUD-PLAN 8.2); short term: key all maps by org id. | M | Today's broadcast of countdown ticks assumes one screen pool. |
| `scheduler.js`, `fetchers/index.js`, `fetchers/*` | cache, settings | `trackAJobs`, `trackBJob`, `trackCJob`, `_fetchAll` (`scheduler.js:6-12`) | platform (zmanim/texts) + org (location) | Fetch by **location** not by org (one fetch per city); `fetchAll(ctx)` only for per-org pieces. | L | Fetchers are the most Pi-dependent (Cloudflare blocks, headless Chromium). |
| `rss-scheduler.js` | rss-feeds, rss-cache | `timers` (`:16`) | org | Jobs per ctx; cache writes through the store. | S | - |
| `google-photos.js` | google-albums, google-photos/ | `activeSyncs`, `syncTimers` (`:36-39`) | org | Jobs per ctx; blob area; batched (CLOUD-PLAN 13.4). | M | - |
| `mivtzah-scheduler.js`, `fetchers/mivtzah.js` | cache.json `mivtzah` key | `_timer` (`:8`) | org | Credentials from org settings (secret), not env; own document. | S | - |
| `cleanup.js` | slides, settings, albums + blob folders, `.bak`/`.tmp` | `cleanupInterval` (`:237`) | org (uploads) + box (`.bak`) | Split: per-org orphan cleanup (blob area) vs box housekeeping. | S | Deleting files across orgs if it lists a global folder: must list per org. |
| `sse.js`, `routes/screen.js` | - | `clients` (`:3`), `kioskLastSeenAt` (`:6`) | box (kiosk pool) / org | Pools keyed by org; `broadcast(ctx, ...)`; cloud swaps the transport for nudges. | M | - |
| `screenState.js`, `routes/status.js` | - | `display` (`:18`) + current slide | box | One state per device (cloud: `devices.last_state`). | S | - |
| `health.js` | cache, settings, albums, feeds + `DATA` (`:23`) statfs, `.bak` ages, TLS, poppler, timedatectl | - | box + org | Split facts: box (disk, clock, TLS, poppler) vs org (feeds, albums, storage used). Already judged by pure `shared/health.js`. | M | - |
| `systemUpdate.js`, `routes/systemUpdate.js` | update-* files (raw) | `monitor` (`:210`) | box | Unchanged on the box; cloud trigger is a signed device command. | - | Root-helper contract (do not touch). |
| `live.js` | live.json | guess guards in memory | org | Per org (host-only cookie, secret per org); `VIEWER_KEYS` stays the allow-list. | M | - |
| `push.js`, `routes/push.js` | push.json, cache.json | `timer` (`:135`) | platform key + org subs | See section 1. | M | - |
| `upload.js`, `pdf.js`, `logoType.js` | uploads/ | `sizeCache` (`upload.js:136`, keyed by filename: fine only while names are UUIDs **within one folder**; key by org+name) | org | Blob helper; PDF in the browser for the cloud (CLOUD-PLAN 13.2). | M | - |
| `dataPackStore.js`, `packBuilder.js`, `packJob.js`, `packRefresh.js`, `routes/dataPack.js` | pack/, pack-work/ | `months` cache (`dataPackStore.js:23`), `signal` (`packJob.js:15`) | platform (pack) + box (builder) | Pack read-only shared; builder stays box-only, admin route becomes platform-owner only in the cloud. | S | - |
| `safeFetch.js`, `urlRules.js`, `routes/embed-probe.js` | - | - | platform | Unchanged. | - | - |
| `csp.js`, `homePage.js`, `clientIp.js`, `localTls.js`, `dataPerms.js`, `platform.js`, `asyncErrors.js`, `safeError.js`, `ownPost.js` | - / box files | - | box / platform | CSP per host later; others unchanged. | S | - |
| `systemInfo.js`, `routes/systemInfo.js` (uncommitted, another agent, in progress) | settings (`siteName`) + OS facts | ? | box | Check when it lands: box scope, admin-only, no org data beyond `siteName`. | ? | Unknown until committed. |

---

## 3. Settings keys by scope (proposal; owner to confirm the box ones)

From `SETTINGS_KEYS` (`src/shared/settingsMerge.js:25-55`).

| Scope | Keys | Notes |
|---|---|---|
| org | `location` (zip, locationId, timezone, displayName), `siteName`, `scheduleGroups`, `announcements`, `kiddushLevana`, `showChabadCredit`, `theme`, `customTheme`, `themeAuto`, `visibility`, `fonts`, `fontRoles`, `announceFonts`, `hebrewFontScale`, `hebrewHeadingScale`, `banner`, `credit`, `language`, `scheduleDisplayMode`, `scheduleScrollSpeed`, `scheduleScrollStart`, `limudimLang`, `limudimItems`, `hayomYomLang`, `zmanimVisible`, `rail`, `layout`, `motion`, `graphics`, `longText`, `weather`, `zmanimLayout`, `scheduleLayout`, `scheduleView` | The content and look an org admin edits. |
| box (candidate) | `orientation`, `portraitLayout`, `clockSide` | Describe the physical TV. Today one TV per org, so org scope works; with a second screen (CLOUD-PLAN Q9) they must become per-device overrides. Decide before P2. |
| org today, platform in the cloud | `scheduler` (`trackA`, `trackBTime`), `dataSource` (`live`/`local`) | In the cloud fetch timing is the platform tick and sources are shared; on a self-hosted box they stay settings. |
| legacy | `dataSources`, `zipCode`, `chabadLocationId`, `trackA`, `trackBTime`, `themeVersion` | Folded by `settings-migrate.js`; never add to. |
| not settings (state elsewhere) | `screenDisplay` (memory, `screenState.js`), touch flags (`live.json`), freeze (`freeze.json`) | `touch.tvIgnoresTouch` is box-ish. |

---

## 4. Every `process.env` read

| Variable | Where | Scope | Verdict |
|---|---|---|---|
| `HOST`, `PORT` | `server.js`, `localTls.js` | box | OK (deployment). |
| `HTTPS_PORT`, `LOCAL_TLS` | `localTls.js` | box | OK. |
| `TRUST_PROXY` | `server.js`, `app.js` | box | OK; meaningless on Vercel (`clientIp.js` gets a Vercel variant). |
| `TACHTACH_DATA_DIR` | `storage.js:12` | box/test | OK, but **only `storage.js` honours it**; ~14 modules build `<root>/data` themselves (section 6). |
| `TACHTACH_PACK_DIR` | `dataPackStore.js:19` | platform/box | OK. |
| `MIVTZAH_SUPABASE_URL`, `MIVTZAH_SUPABASE_ANON_KEY` | `fetchers/mivtzah.js`, `mivtzah-scheduler.js` | **org** | Must move to org settings (secret class). |
| `PUSH_CONTACT` | `push.js` | platform | OK. |
| `CSP_REPORT_ONLY` | `csp.js` | platform/box | OK. |
| `CHROMIUM_PATH` | `fetchers/browserFetch.js` | box | OK. |
| `GPHOTOS_BROWSER_MAX_PASSES`, `GPHOTOS_BROWSER_THRESHOLD`, `GPHOTOS_BROWSER_TIME_MS` | `fetchers/google-photos.js` | platform tuning | OK. |
| `HOME`, `PATH` | `systemUpdate.js:40` | box | OK (git child env). |
| `CHROMIUM`, `PLAYWRIGHT_PATH`, `USER`, `HOME` | `scripts/*` audits/tests | dev | OK. |

`.env` is loaded by dotenv in `app.js` (Windows installer writes it). No secrets of an org are in env today except the Mivtzah pair.

---

## 5. Hard-coded site-specific or single-site values

| Value | Where | Kind | Action |
|---|---|---|---|
| `'America/New_York'` fallback | `src/shared/announcements.js:29` (`DEFAULT_TZ`), `src/server/routes/announcements.js:269`, `src/shared/localData.js:31`, `src/shared/zmanim.js:107`, `setup.js:99` | default timezone of the first school | One `DEFAULT_TZ` import; prefer `ctx.org.timezone`; org creation must always set a timezone. S. |
| "bochurim" / "Bochur" vocabulary | `src/shared/permissions.js:39` (capability label), `src/server/activity.js:21` (area name), `src/shared/undo.js:32` (`SHARED_AREAS`), `src/shared/quickTemplatesSeed.js:8-19`, `src/shared/dailyStories.js:218` (AI prompt: "a Chabad yeshiva"), `src/shared/roster.js:2`, many admin labels | school-type wording (boys' yeshiva) | Org vocabulary setting (`people term`: bochurim / talmidim / talmidos / students / members) used by labels and prompts (NEXT-STEPS B6). Area ids stay stable (`roster`), only labels change. M. |
| `'TachTach-Screens'` | `users.js:31` (TOTP issuer), `authPages.js:307-394`, `middleware.js:212,228,259`, fetcher user agents | platform brand | Fine. Optional: TOTP label with org short name. |
| `setup.js` defaults (`trackBTime '04:00'`, `orientation 'landscape'`, `dataSources`) | `setup.js:95-122` | first-install defaults | Becomes `createOrg(defaults)`; `setup.js` wipes `data/` (CLAUDE.md), must never run in the cloud. |
| Chabad.org credit, Crown Heights sample text, "Brooklyn, N.Y." | `SourceCredit.jsx`, `src/shared/takeoverSamples.js:48`, `src/shared/letterJson.js:12` | content (the Rebbe's letters are dated Brooklyn), samples | Fine: not about the org. |
| MLMI paths | `deploy/pi-combined-setup.md` only (no `mlmi` in `src/`) | deployment doc | Generalise in P1 (CLOUD-PLAN 23). |

---

## 6. Modules that talk to the filesystem directly (bypassing `storage.js`)

All of these ignore `TACHTACH_DATA_DIR` (they compute `<project>/data` themselves), so a test or a second org folder cannot redirect them.

| Module:line | What | Should go through |
|---|---|---|
| `src/server/app.js:361` | reads `data/rss-cache/<id>.json` with `fs/promises` | store (doc `rss-cache/<id>`) |
| `src/server/app.js:407,416,425,448,457,466` | `express.static` on `data/fonts`, `data/uploads`, `data/google-photos` | blob areas helper |
| `src/server/routes/api.js:6,45,754,779` | `mkdir/unlink/readdir` on `data/fonts`, `data/uploads` | blob areas |
| `src/server/upload.js:7,12` | writes uploads, lists media | blob areas |
| `src/server/rss-scheduler.js:1,10,41` | `writeFile` feed cache (not atomic) | store |
| `src/server/google-photos.js:3-4,15,58,71` | photos + manifest (manifest not atomic) | blob area + store |
| `src/server/cleanup.js:3-4,12-14,166-172` | deletes uploads/photos orphans, `.bak`/`.tmp` sweep | blob areas (org) + box housekeeping |
| `src/server/announcements-store.js:11-12,22-23,69-73` | `data/legacy/*.pre-announcements.json` | blob area `legacy` or store |
| `src/server/health.js:7,23` | `statfs`, `readdir`, `stat`, `.bak` ages | box facts helper (stays raw, box scope) |
| `src/server/dataPackStore.js:8,17` | pack read + atomic folder swap | stays raw (platform asset, own swap logic), but derive its default dir from the same data-dir helper |
| `src/server/packBuilder.js:13,27-34` | `pack-work/state.json` | box; same data-dir helper |
| `src/server/systemUpdate.js:13,27-144` | update request/status files, `update-cache.git` | **stays raw on purpose** (root helper contract) |
| `src/server/localTls.js:18,26` | `data/tls` key + cert | stays raw (box) |
| `src/server/dataPerms.js:9` | chmod of data dir + secret files | stays (box), takes the data dir as an argument already |
| `src/server/live.js:3,217` | `existsSync` of the built kiosk HTML | fine (code, not data) |
| `src/fetchers/browserFetch.js:1,27` | `data/.puppeteer-tmp` | box; same data-dir helper |
| `src/server/platform.js:11-12` | rename retries | fine (it is the helper) |
| `setup.js`, `scripts/build-data-pack.js` | CLI | `setup.js` uses `storage.js` (good); never in the cloud |

**Count: 13 runtime modules compute the data folder on their own.** A single `dataDir()` (and later `blobArea(ctx, name)`) helper is the cheapest SaaS-prep win (NEXT-STEPS B3).

---

## 7. How this was gathered (re-run to refresh)
```bash
grep -rnoE "(readJSON|writeJSON|updateJSON)\(\s*['\"][^'\"]+" src server.js scripts      # who touches which document
grep -rnoE "['\"][a-z0-9_-]+\.json['\"]" src/server src/fetchers                          # file-name constants
grep -rnE "from ['\"](node:)?fs(/promises)?['\"]" src server.js                            # raw filesystem users
grep -rnE "DATA_DIR|'data'|data/" src/server src/fetchers                                   # own data-folder paths
grep -rnoE "process\.env\.[A-Z_0-9]+" src server.js scripts                                 # env reads
grep -nE "^(let|const) [a-zA-Z_]+ = (new Map|new Set|null)" src/server/*.js src/server/routes/*.js  # per-process state
grep -rniE "America/New_York|bochur|mlmi" src                                               # site assumptions
```

## 8. Honest unknowns
- Whether every `readJSON('settings.json')` site is a pure read; a few may write back after migrating (only `settings-migrate.js` and `routes/api.js` were confirmed as writers).
- `systemInfo.js` / `routes/systemInfo.js` are uncommitted work of another agent; not inventoried beyond its first lines.
- The admin SPA (`src/admin/*`) and kiosk (`src/screen/*`) were not inventoried line by line; they read everything from `/api/state` and `/api/*`, so they inherit org scoping from the server, but any hard-coded wording there (e.g. "Bochurim" tab labels) is covered only by the vocabulary item.
- Scripts under `scripts/` that touch `data/` in a second process (`reset-admin-credentials.js`, `build-data-pack.js`) bypass the in-process locks by nature; acceptable on a single box, not a pattern for the cloud.
