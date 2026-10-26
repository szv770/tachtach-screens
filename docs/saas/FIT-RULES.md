# SaaS fit rules (every change)

Status: **binding for every new feature, data file, route, setting, background job and fetcher** (owner request 2026-10-26).
Why: the plan (`docs/saas/CLOUD-PLAN.md`) turns this single-school Pi app into a multi-org cloud brain + thin Pi player, with one login across orgs, a per-org name-privacy mode (Mode L / Mode C) and a platform dashboard. Every change that ignores these rules is code that has to be rewritten later. Following them costs minutes now.

How to use: before you commit, walk the checklist. If a rule does not fit your change, write one line in the commit message saying why (`SaaS-fit: rule 4 n/a, box-only file`). Reviewers (human or agent) reject a change that silently breaks a rule.

Related: `CODE-INVENTORY.md` (where today's code stands against these rules), `STORAGE-INTERFACE.md` (the store API rules 1, 9 and 10 point at), `NEXT-STEPS.md` (the prep work that makes the rules cheaper to follow).

Vocabulary used below:
- **Scope**: `org` (belongs to one school/shul; moves to the cloud), `box` (belongs to one physical player: Pi/PC; never leaves it), `platform` (the same for every org: the data pack, shared caches, the brand), `person` (one human across orgs: identity, password, 2-step).
- **Privacy class**: `public` (fine on the open internet), `org` (the org's own content), `names` (student names or anything tied to a named student: roster, birthdays, chazan history, quick-message recents), `secret` (hashes, tokens, keys, 2-step secrets, API keys).

---

## The checklist

### 1. Data goes through a store module, never a raw path
New persistent data = a named document read and written through `storage.js` (today) / the Store (`STORAGE-INTERFACE.md`, later). Never `fs.readFile(path.join(ROOT, 'data', ...))`, never your own `DATA_DIR`. Read-modify-write uses `updateJSON` (one lock), never `readJSON` then `writeJSON`.

Bad (today, `src/server/app.js:361`, the RSS cache read for the kiosk):
```js
const filePath = path.join(PROJECT_ROOT, 'data', 'rss-cache', `${req.params.feedId}.json`);
const raw = await rf(filePath, 'utf-8');
```
Also bad: `rss-scheduler.js:10,41` (writes the same folder with plain `writeFile`, no atomic rename, no `.bak`), `google-photos.js:15,58,71` (manifests), `announcements-store.js:22,73` (legacy copies). These ignore `TACHTACH_DATA_DIR`, so tests cannot isolate them and an org folder cannot be swapped in.

Good (`src/server/users.js:90-93`, storage injected, default bound to the shared store):
```js
export function createUserStore({
  read = () => readJSON(USERS_FILE),
  write = (doc) => writeJSON(USERS_FILE, doc),
  ...
```
Good (`src/server/rss-scheduler.js:44`): `await updateJSON('rss-feeds.json', (feeds) => { ... })`.

### 2. Every store call can carry an org context
Until the org context exists (`NEXT-STEPS.md` B1), write new store modules as **factories that take their I/O** (`createXStore({ read, write })`, like `users.js`, `activity.js:58`, `undoStore.js:15`, `ownedStore.js:28` `io`), so the factory can later be built per org. Do not add a new module-level `export const thing = await readJSON(...)` or a module-level cache of document contents. Once `ctx` exists: every function that touches org data takes `ctx` first and throws without `ctx.orgId`.

### 3. Every document, setting and env var has a declared scope
- New `data/*.json` file: add a row to `CODE-INVENTORY.md` section 1 (scope + privacy class) in the same commit.
- New top-level setting: add it to `SETTINGS_KEYS` (`src/shared/settingsMerge.js:25`) **and** state its scope in the comment next to it (`// scope: org` / `box` / `platform`). Anything that describes the physical screen (orientation, display size, kiosk touch, local TLS, update channel) is `box`; anything a school admin edits about its content or look is `org`; anything identical for all orgs is `platform` and is not a setting at all (code or platform config).
- New `process.env.X`: only for `box` or `platform` facts (ports, paths, secrets of the deployment). **Never put an org's own choice or credential in an env var.** Bad (today): `MIVTZAH_SUPABASE_URL` / `MIVTZAH_SUPABASE_ANON_KEY` (`src/fetchers/mivtzah.js`, `mivtzah-scheduler.js`) are a per-campaign, per-org fact living in the Pi's environment; in the cloud they become an org setting (secret class, `CLOUD-PLAN.md` 13.6).

### 4. No hard-coded site, school, person or place
No school name, short name, address, zip, coordinates, timezone, person name, phone number or school-type vocabulary in `src/`. Defaults come from the org (`settings`) or are neutral.
- Bad (today): the fallback `'America/New_York'` is repeated in `src/shared/announcements.js:29` (`DEFAULT_TZ`), `src/server/routes/announcements.js:269`, `src/shared/localData.js:31`, `src/shared/zmanim.js:107`. One named constant is acceptable as a last resort; new code imports `DEFAULT_TZ` and prefers `ctx.org.timezone`.
- Watch: yeshiva vocabulary in shared code ("bochurim" in `src/shared/permissions.js:39`, `src/server/activity.js:21`, `src/shared/undo.js:32`, the `Bochur` blank in `src/shared/quickTemplatesSeed.js:8`). A girls' school or a shul says something else. New UI words for "the people on the roster" go through one vocabulary lookup (`NEXT-STEPS.md` B6), not new literals.
- Brand strings ("TachTach Screens") are `platform` and fine; the org's own name is `settings.siteName` (and later `org.name`).
- Seed / sample content (`takeoverSamples.js`, `quickTemplatesSeed.js`) uses placeholders or obviously fictional names, never real students or staff.

### 5. Mark the privacy class; names and secrets get special handling
For every new field, ask: could this hold a student's name, or something about a named student? Could it hold a credential?
- `names`: must be usable in **Mode L** (stays on the People box, never sent to the cloud) and **Mode C** (encrypted per org). Concretely: keep names in `roster.json` / `chazan.json` (or a new file listed in `dataPerms.js` `SECRET_FILES`), refer to people **by roster id** everywhere else, and resolve names at read time (the chazan pattern: `chazanStore.js` stores ids, names come from the roster, `ARCHITECTURE.md` "Chazan rotation"). Do not copy names into another document, an activity line, an undo record, a push message or a log line.
  - Known leak to fix, do not copy it: quick-message **recents** (`src/server/quickTemplatesStore.js:4,17`) store the student names staff typed into `{bochur}` blanks inside `quick-templates.json`, an `org`-class document.
  - Announcements are free text and will contain names (the quick messages are built for it: "{bochur} please call home"). Accept that, but treat `announcements.json` and `undo.json` before/after copies of it as `names` class for retention and support-visit logging.
- `secret`: stored only as a hash (tokens, like `users.js:37` `sha256`) or, where it must be read back (2-step secret, API key, live secret), in a file listed in `SECRET_FILES` (`src/server/dataPerms.js:12`) and never in `/api/state`, history, undo (`undoStore` already drops secret-looking settings keys), push, logs or exports without a re-check.
- Add new secret-looking keys to the live-view scrub regex if they could reach `/api/state` (`src/server/live.js:119` `SECRETISH`).

### 6. Realtime events are org-scoped and carry no secrets
Today `broadcast(type, data)` (`src/server/sse.js:88`) goes to every kiosk of the one install. In the cloud it becomes a content-free nudge on the org's channel (`CLOUD-PLAN.md` 10.3).
- New events: name them `<document>-update` and send only what the kiosk needs; the kiosk must also cope with **re-fetching `/api/state` instead** of using the payload (it already does after a reconnect). That is what makes the nudge model a drop-in.
- Never put names-class or secret data in an event that `/api/state` would not also give the same audience.
- When `ctx` exists, the call becomes `broadcast(ctx, type, data)`; write new broadcast sites so `ctx` is in reach (inside the route or store function, not in a module-level timer).

### 7. Permissions: a capability in `src/shared/permissions.js`, fail closed
- A new `/api/<area>` path needs a `rule(capId, methods, re)` in `RULES` (`src/shared/permissions.js:184`) or it is admin-only (correct default, but say so on purpose).
- A new kind of power gets a capability in `CAPABILITIES` (`:28`). Things only the box owner should do (update the box, local TLS, update channel) are `adminOnly` and later become **device** or **platform** powers, not org capabilities.
- Roles and presets are **per org membership**, not per person (`CLOUD-PLAN.md` 14.4): never read `user.role` from anything other than the membership the request was authenticated for (today: the user record `requireAuth` attached; tomorrow: `req.membership`).

### 8. Files and uploads are keyed by org
- Never build an upload/font/photo path from request input; the server generates the name (today `uuid` + extension, `upload.js`) and the folder comes from **one** helper (`NEXT-STEPS.md` B3, later `orgPath(ctx, 'uploads', name)` in the blob store).
- New file kinds go into an existing blob area (`uploads`, `fonts`, `google-photos`, `rss-cache`, `pack`) or a new one declared in the blob store, never a new hard-coded `data/<folder>`.
- Bad (today): `src/server/routes/api.js:45` (`FONTS_DIR`), `:754`, `:779` (`uploadsDir`), `src/server/upload.js:12` (`UPLOAD_DIR`), the six `express.static(path.join(PROJECT_ROOT, 'data/...'))` mounts in `src/server/app.js:407-466`, `src/server/cleanup.js:12-14`.
- Anything that lists "all files" (cleanup, media library, health sizes) must work per org: it lists the org's blob area, never a global folder.

### 9. Fetchers: decide shared vs per-org, and key caches accordingly
- **Shared** (`platform` scope): depends only on date + place (zmanim, Hebrew date, parsha, weather, Hayom Yom, Rambam, data pack). Key by `date` + location (`lat,lon` or zip), never by org; one fetch serves every org (`CLOUD-PLAN.md` `shared_cache`).
- **Per-org**: depends on the org's own config (RSS feed URLs, Google Photos albums, Mivtzah campaign). Key by org + id.
- Outbound requests to admin-typed URLs go through `safeFetch.js` (SSRF guard). Always.
- Bad (today): `shabbosEndMemo` (`src/server/routes/announcements.js:249`) is keyed by **date only** but the value depends on the org's location. In one process serving two orgs it would hand org B org A's Shabbos end time. New memo/caches: key by everything the value depends on.
- Writing everything into one `cache.json` (`src/fetchers/index.js`) mixes shared and per-org results (mivtzah lives there too, `mivtzah-scheduler.js`). New fetcher output: its own document or a clearly shared/per-org key, not another key in `cache.json`.

### 10. No assumptions of Linux, Pi, one process or one user
- OS differences go through `src/server/platform.js` (Linux, Windows today; Vercel tomorrow has no poppler, no long-lived process, no writable disk outside `/tmp`).
- **No new module-level timers or in-memory state that represents an org** (`setInterval` in a module, `let x = null` holding org data). Background work is a function `runJob(ctx, now)` that a scheduler calls; today's in-process scheduler calls it for the one org, the cloud's `/api/cron/tick` calls it per org. Today's offenders to imitate only in shape, not in kind: `countdown.js:9-24`, `scheduler.js:6-12`, `kiddush-levana.js:19`, `rss-scheduler.js:16`, `google-photos.js:36-39`, `screenState.js:18`, `sse.js:3-6`.
- No "the" user / "the" admin: the code already supports several people per org; also assume one person may hold memberships in several orgs.
- No shelling out for content work in new code (poppler, git, chromium) unless it is a `box`-scope feature behind `platform.js` with a cloud alternative written down.

### 11. Every new endpoint gets a cross-org isolation test stub
Until two orgs can actually run, add a test that pins the rules isolation will rely on. Template (copy into the feature's test file):
```js
// SaaS isolation stub: this route only ever touches ids found in its own org's document.
test('isolation: <route> refuses ids that are not in this org\'s data', async () => {
  // 1. arrange: store A has item a1; store B (a second TACHTACH_DATA_DIR or injected io) has b1
  // 2. act: call the handler/store with A's context and id b1
  // 3. assert: 404 (never 403: do not reveal existence), and B's document is byte-identical afterwards
});
```
Also: a route must never accept a file path, a document name or an org id from the request body or query (`ownedStore.js` header: "ids are only compared to stored ids, never used as paths"). When the route sweep exists (`CLOUD-PLAN.md` 7.6), it covers new routes automatically; the stub is what proves your store/handler is shaped so the sweep can pass.

### 12. Viewer, kiosk and device allow-lists are opt-in
- A new key in `/api/state` (`src/server/app.js:297-328`) does **not** reach live viewers until it is added to `VIEWER_KEYS` (`src/server/live.js:133`) on purpose, with its own reducer if it holds names or staff names (see `viewerRoster`, `viewerChazan`).
- Mode L orgs have no names in the cloud: a new names-bearing key must have a "names kept on your screen box" fallback for the cloud admin and the live view (`CLOUD-PLAN.md` 9.6).
- New kiosk-only endpoints use `kioskGate` / `stateGate` / `localhostOnly` (never `req.ip`), and in the cloud they become device-token endpoints. Write them so the gate is the only thing that changes.
- State changes are **additive**: add keys, keep old ones for a release (`CLOUD-PLAN.md` 10.6), because players and cloud update at different times.

### 13. Exportable and deletable
A new document must survive `export-org` -> `import-org` (it is a JSON file in the org's folder, or a blob in its area), and deleting an org must delete it. If your data cannot be exported as a file, it does not fit stage 3 ("self-hosted", `CLOUD-PLAN.md` 5.3).

---

## Quick self-check (paste into the PR / commit body when the change adds data, routes or settings)
```
SaaS-fit:
- data: <doc name> scope=<org|box|platform> class=<public|org|names|secret>, via <store module>
- settings: <keys> scope=<...>
- env: <none | VAR (box/platform only)>
- events: <event> (refetch-safe: yes)
- caps: <capability / rule added | admin-only on purpose>
- files: <blob area>
- fetch: <shared by date+place | per-org | none>
- live view: <not exposed | added to VIEWER_KEYS with reducer>
- isolation stub: <test name>
```
