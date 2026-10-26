# SaaS prep you can do now (no cloud needed)

Status: prioritized backlog, 2026-10-26. Every item ships to the Pi on its own and must leave MLMI's TV and admin **behaving exactly as before** (unless the item says it fixes a bug). Together these are phase **P1 "org-aware single install"** of `CLOUD-PLAN.md` section 23, broken into agent-sized pieces.

Read first: `FIT-RULES.md`, `CODE-INVENTORY.md`, `STORAGE-INTERFACE.md`.

Common rules for every brief (paste them into the agent prompt):
- Branch off the current working branch; commit early and often (`git add` explicit paths); never push to `main`.
- Never touch the real `data/`; tests set `TACHTACH_DATA_DIR` to a scratch dir (see `test/updateJSON.test.js`).
- `npm test` green before and after; `npx vite build` passes if any `src/` file that the SPA imports changed.
- No behaviour change on the Pi: same files, same bytes, same routes, same responses.
- Keep it small: if the brief grows past its size, stop and report instead of widening scope.
- Add one line to the CLAUDE.md "Recent changes log" when shipping (CLAUDE.md rules).

Order and dependencies:

| # | Item | Size | Model | Depends on | Why this position |
|---|---|---|---|---|---|
| N1 | Fix the `schedule.json` two-lock race | S | sonnet | - | A real lost-update bug today; also the first "one lock domain" step |
| N2 | Store safety net: contract + golden byte tests | S | sonnet | - | Everything after relies on it |
| N3 | One `dataDir()` helper for the 13 modules that build their own `data/` path | S | sonnet | N2 | Cheapest big win; makes raw-fs code testable |
| N4 | Org context object + `attachOrg` | S | sonnet | - | The `ctx` every later step passes around |
| N5 | Document registry + "unregistered file" lint | S | sonnet | N2 | Scope + privacy class become code, not prose |
| N6 | Settings scope tags | S | haiku/sonnet | - | Box vs org vs platform for every setting |
| N7 | Store file implementation behind `storage.js` | M | sonnet | N2, N4, N5 | The adapter seam (CLOUD-PLAN R1) |
| N8 | Small fixes that are cross-org bugs in waiting | S | sonnet | - | `shabbosEndMemo`, `DEFAULT_TZ`, Mivtzah env |
| N9 | Names-class hygiene (quick-message recents) + names lint | M | sonnet | N5 | Keeps Mode L honest |
| N10 | Two-org isolation test harness + route classification test | M | sonnet | N4, N7 | Every later migration step uses it |
| N11 | `buildState(ctx)` out of `app.js` | S-M | sonnet | N4 | One function for kiosk, preview, live view, future device API |
| N12 | Migrate modules to `store.*(ctx, ...)` (rolling, one module per commit) | M-L | sonnet | N7, N10 | The bulk of P1 |
| N13 | Blob store (file impl) for uploads, fonts, photos, legacy | M | sonnet | N3, N4 | Files keyed by org |
| N14 | Jobs take `ctx`; per-process maps keyed by org | M | sonnet | N4, N12 (partly) | No module-level org state |
| N15 | Identity / membership split (design + pure model + file migration, no UI) | M | sonnet (opus for review of the security model) | N4 | "One login across orgs" without a later rewrite |
| N16 | Org vocabulary ("bochurim" vs other words) | M | sonnet | N6 | Second org will not be a boys' yeshiva |
| N17 | `export-org` / `import-org` scripts | M | sonnet | N5, N13 | Stage 3 self-host + the migration diff tool |
| N18 | CI: run `npm test` on every push (GitHub Actions) | S | haiku | - | Isolation tests are only useful if they always run (CLOUD-PLAN risk 22) |

---

## N1. Fix the `schedule.json` two-lock race (bug fix)

**Goal.** `schedule.json` is protected by two different locks: `storage.js`'s per-file lock (`updateJSON` in `src/server/routes/api.js:441-527`) and `withScheduleLock` (`src/server/scheduleStore.js:49`, used by `src/server/routes/schedule-dates.js:140-399` and `scheduleStore.js:116,140`, which `readJSON` then `writeJSON` inside it). An entry edit and a by-date apply / category seeding that run at the same moment can interleave; one change is silently lost.

**Do.** Make every read-modify-write of `schedule.json` take the same lock. Simplest: inside `withScheduleLock` blocks, replace `readJSON('schedule.json')` ... `writeJSON('schedule.json', x)` with one `updateJSON('schedule.json', fn)` (return `SKIP` when nothing changed), keeping the outer `withScheduleLock` for the other files it guards. Check `undoIo.js:21` (schedule undo) uses the same path. Do not change response shapes or broadcasts.

**Acceptance tests** (`test/scheduleLock.test.js`, scratch data dir):
- 10 parallel mixed operations (5 entry adds through the same helper `api.js` uses, 5 by-date applies / `ensureCategoryKinds`-style writes through the scheduleStore helpers) -> all 10 changes present.
- The same test against the old code pattern fails (keep it as the "why" test, like `test/updateJSON.test.js` does).
- Existing schedule tests unchanged and green.

**Out of scope.** Settings lock (`withSettingsLock` is already one domain), any API change.

---

## N2. Store safety net: contract + golden tests

**Goal.** Freeze today's storage behaviour in tests before anything moves (`STORAGE-INTERFACE.md` step 0).

**Do.** `test/storeContract.test.js`: a function `runContract(name, api)` taking `{ read, write, update, SKIP }` and asserting: missing -> null; round trip; `update` with fallback; `SKIP` writes nothing; a throwing `fn` leaves file and lock intact; 10-way parallel `update` loses nothing; a corrupt file falls back to `.bak` (and logs); `.bak` is never replaced by a corrupt file; secret files are 0600 with 0600 `.bak` (skip mode checks on win32); path traversal names throw. Call it once with today's `storage.js`. `test/storeGolden.test.js`: run a fixed script of writes (settings, slides, a secret file, an overwrite, a corrupt-then-read) and assert sha256 of every resulting file equals a recorded value computed in the same test from `JSON.stringify(v, null, 2)` (no checked-in hashes that break on harmless changes).

**Acceptance.** Both files green on unmodified `src/`. No `src/` change.

---

## N3. One `dataDir()` helper

**Goal.** 13 runtime modules compute `<project>/data` themselves and ignore `TACHTACH_DATA_DIR` (`CODE-INVENTORY.md` section 6).

**Do.** New `src/server/dataDir.js`: `export function dataDir() { return process.env.TACHTACH_DATA_DIR ? path.resolve(...) : path.join(PROJECT_ROOT, 'data'); }` plus `dataPath(...parts)`. `storage.js` uses it. Replace the private computations in: `app.js:361,407-466`, `routes/api.js:45,754,779`, `upload.js:12`, `rss-scheduler.js:10`, `google-photos.js:15`, `cleanup.js:12-14`, `announcements-store.js:22`, `health.js:23`, `dataPackStore.js:17` (default only; `TACHTACH_PACK_DIR` still wins), `fetchers/browserFetch.js:27`, `localTls.js:26`. **Leave `systemUpdate.js` alone** (root helper contract; it must keep `<project>/data`), and say so in a comment. Resolve paths at call time or module load, whichever the module does today (do not change timing of `UPLOAD_DIR` exports without checking importers).

**Acceptance.** `test/dataDir.test.js`: with `TACHTACH_DATA_DIR` set, an RSS cache write (`rss-scheduler` helper), a Google Photos manifest write and `UPLOAD_DIR` all land under the scratch dir; unset -> `<project>/data` (string compare only, no writes). Grep test: no `'../../data'` / `'data/uploads'`-style literal left in `src/server` except `systemUpdate.js`.

---

## N4. Org context object

**Goal.** The `ctx` of `STORAGE-INTERFACE.md` section 1, with nothing reading it yet.

**Do.** `src/server/org.js` with `DEFAULT_ORG_ID`, `makeCtx`, `PLATFORM`, `systemCtx`, `requireCtx`, `attachOrg` (sets `req.ctx` to the default org, `org.timezone` from `settings.location.timezone`, `org.namesMode: 'L'`, `org.shortName: 'default'`). Mount `attachOrg` first in `app.js` (coordinate: other agents are editing `app.js`; keep the diff to one import + one `app.use`). `requireAuth` adds `actor` (`{ kind: 'person', id: user.id, name: user.name }`) by creating a new frozen ctx (never mutating).

**Acceptance.** `test/orgCtx.test.js`: ctx is frozen; bad org ids (`'../x'`, `''`, `'A B'`) throw; `requireCtx(undefined)` throws; an Express test app with `attachOrg` + a dummy route sees `req.ctx.orgId === 'default'`; `requireAuth` output ctx carries the actor (use the injectable user store from `test/users.test.js`).

---

## N5. Document registry + lint

**Goal.** Every persistent document declared once with scope + privacy class (`STORAGE-INTERFACE.md` section 2).

**Do.** `src/server/store/docs.js` (pure data) with one row per file in `CODE-INVENTORY.md` section 1 (`file`, `scope`, `cls`, `secretMode`, `namesMode`, `history`). Export `SECRET_FILES_FROM_REGISTRY` and make `dataPerms.js` `SECRET_FILES` equal to it (test that they match rather than changing `dataPerms.js` if that is touchier). `docFromFile(filename)`.

**Acceptance.** `test/docRegistry.test.js`: (1) every string literal ending in `.json` passed to `readJSON`/`writeJSON`/`updateJSON` or assigned to a `FILE`/`*_FILE` constant in `src/server/**` is in the registry (grep-style scan like `test/windowsKit.test.js`); (2) every `secretMode` file is in `SECRET_FILES` and vice versa; (3) every row has a valid scope and class; (4) `roster` and `chazan` are `names` + `namesMode`.

---

## N6. Settings scope tags

**Goal.** FIT-RULES rule 3 for settings.

**Do.** In `src/shared/settingsMerge.js`, next to `SETTINGS_KEYS`, add `export const SETTING_SCOPE = Object.freeze({ location: 'org', siteName: 'org', orientation: 'box', ... })` using the table in `CODE-INVENTORY.md` section 3 (box candidates: `orientation`, `portraitLayout`, `clockSide`; `scheduler`, `dataSource`: `'org'` with a comment "platform in the cloud"; legacy keys: `'legacy'`). No behaviour change: nothing reads it yet except tests.

**Owner decision (2026-10-26): per-screen overrides.** An org can have several screens (TVs). Look settings follow ONE model: an **org default** that every screen follows, plus an optional **per-screen override layer** for the things that can legitimately differ: orientation, portrait layout, clock side, **theme** (e.g. one screen forced dark because its room is dark), **liveliness / motion level**, and similar look options. Default = all screens match; an override is explicit, visible ('this screen differs: Dark theme') and can be cleared with one tap ('follow the others'). So tag these keys scope `'box'`-overridable (`'org+box'`): resolved as `box override ?? org value`. The owner's message was cut off mid-sentence after 'but if there...' (probably 'if there are several screens'): confirm the rest. Design needs: a `screens` list per org (name, role, platform), `resolveSettings(orgSettings, screenOverrides)` pure function shared by kiosk/admin/server, admin UI = 'This screen' picker on the Look pages, live preview per screen.

**Acceptance.** `test/settingScope.test.js`: every key in `SETTINGS_KEYS` has a scope in `{org, box, 'org+box', platform, legacy}`; no extra keys; `LOOK_SETTING_KEYS` and `SCHEDULE_SETTING_KEYS` (`permissions.js:216,223`) contain only `org` or `box` keys. Owner question to raise in the hand-back: confirm the three box keys.

---

## N7. Store file implementation behind `storage.js`

**Goal.** `STORAGE-INTERFACE.md` sections 3-5, step 4: today's `storage.js` code moved into `src/server/store/file.js`, `src/server/store/index.js` wraps it with ctx + registry checks, `storage.js` becomes compatibility wrappers bound to `DEFAULT_CTX`.

**Do.** Move, do not rewrite (keep every comment about audits H2/M4). Lock key becomes `${orgId}:${doc}`. Add `list`, `remove`, `version`, `watch` (in-process emitter). Unregistered file names: warn once per name, still work (ratchet later). Re-entrance detection (L3) with `AsyncLocalStorage`: throw `StoreReentry`.

**Acceptance.** N2 contract suite runs twice (old wrapper API, new `store.*(DEFAULT_CTX)` API) and passes; golden bytes identical; new tests: ctx missing -> throws; org ctx on a `platform` doc -> throws; second org (`orgs/b`) writes land in `data/orgs/b/` and never touch root files; re-entrant update throws instead of hanging (test with a 2 s timeout); full `npm test` green.

---

## N8. Small cross-org bugs in waiting

**Do (three tiny commits).**
1. `shabbosEndMemo` (`src/server/routes/announcements.js:249`) keyed by date only; key it by `${lat},${lon}|${locationId}|${date}` (whatever the value depends on).
2. Replace the repeated `'America/New_York'` literals (`routes/announcements.js:269`, `shared/localData.js:31`, `shared/zmanim.js:107`) with an import of `DEFAULT_TZ` from `src/shared/announcements.js:29` (or a new `src/shared/defaults.js`); same value, one place.
3. Mivtzah credentials: read `settings.mivtzah.{url, anonKey}` first, fall back to `MIVTZAH_SUPABASE_URL` / `MIVTZAH_SUPABASE_ANON_KEY` (no behaviour change for the Pi). Mark `mivtzah` in `SETTINGS_KEYS` with scope `org`, make sure `anonKey` is scrubbed from `/api/state` for live viewers (`live.js:119` `SECRETISH` matches `apikey`/`api_key` but **not** `anonKey`: add `anon` to it or strip the key explicitly) and never stored in undo (`undoStore` secret-key rule). **Ask the owner** before adding an admin UI field; this item only adds the read path.

**Acceptance.** (1) unit test: two different locations, same date -> two different memo entries. (2) grep test: `America/New_York` appears only in the one constant. (3) unit tests: settings value wins over env; env still works; `viewerState` output contains no `anonKey`.

---

## N9. Names-class hygiene

**Goal.** Keep student names in names-class documents only, so Mode L can keep them on the box (`FIT-RULES.md` rule 5).

**Do.** (a) Quick-message recents (`src/server/quickTemplatesStore.js:4,17`) store names typed into `{bochur}` blanks inside `quick-templates.json`. Move `recents` to their own registry document `quick-recents` (class `names`, `namesMode: true`, per person), migrating once at startup (idempotent, `seeded`-style marker), keeping the API identical. (b) A "names lint" test: build a fake roster with distinctive names, exercise the roster/chazan routes and the state builder, and assert no non-names document (registry `cls !== 'names'`) in the scratch dir contains any of those names afterwards; and that `activity.json` lines never do.

**Acceptance.** Existing quick-template tests green; new migration test (old file with recents -> new doc, old key removed, second run no-op); names lint green. Owner note in hand-back: announcements are free text and will still contain names (disclosed in CLOUD-PLAN 9.1).

---

## N10. Two-org isolation harness + route classification

**Goal.** The tooling FIT-RULES rule 11 asks every endpoint to use, before the cloud's full route sweep exists.

**Do.** (a) `test/helpers/twoOrgs.js`: creates a scratch data dir with `default` and `orgs/b`, seeds both with distinct fixture documents, returns `{ ctxA, ctxB, hashOrg(orgId) }` (sha256 over that org's files). (b) `test/routeClassification.test.js`: build the app with `createApp()` in test mode, walk the Express router stack, and assert every route path+method appears in a checked-in table `test/fixtures/routeClasses.js` with a class: `public` (`/`, `/live*`), `auth-page`, `kiosk` (`localhostOnly`/`kioskGate`/`stateGate`), `api` (behind `requireAuth`), `admin-only`, `box` (system update, data pack build). A new route without a row fails the test with a message pointing at FIT-RULES rule 11. (c) One worked example: `ownedStore` (quick templates) called with ctxB and ctxA's ids -> 404-equivalent `StoreError` and `hashOrg('default')` unchanged.

**Acceptance.** All three green; the classification table matches reality (spot-check five routes by hand and say which in the hand-back).

---

## N11. `buildState(ctx)`

**Goal.** One function builds the screen state (today inline in `app.js:279-333`, and again for `/api/preview-state` in `routes/api.js:1301`).

**Do.** `src/server/screenStateBuild.js` (name free) exporting `buildState(ctx, { previewDate } = {})`. `/api/state` becomes `res.json(req.liveViewer ? viewerState(await buildState(req.ctx)) : await buildState(req.ctx))`. Share what preview-state can share without changing its output.

**Acceptance.** Snapshot test: with a fixture data dir, the JSON of `/api/state` before and after the change is deep-equal (record before refactoring in the same commit series); `test/live.test.js` green.

---

## N12. Migrate modules to `store.*(ctx, ...)` (rolling)

**Goal.** `STORAGE-INTERFACE.md` step 6. One module per commit, smallest first: `routes/daily-words.js`, `routes/daily-stories.js`, `kiddush-levana.js`, `freeze.js`, `live.js`, `push.js`, `activity.js`, `undoStore.js`, `ownedStore.js` (via `io`), `routes/roster.js`, `chazanStore.js`, `announcements-store.js`, `scheduleStore.js`, then `routes/api.js` one area at a time (settings, slides, custom days, schedule, templates, media, albums, fonts, RSS).

**Per commit.** Functions gain `ctx` as the first argument (routes pass `req.ctx`, startup/timers pass `systemCtx(DEFAULT_ORG_ID)`); module-level document caches removed or keyed by `ctx.orgId`; an isolation test with the N10 harness (ctxB never reads/changes default org files).

**Acceptance.** Per commit: `npm test` green + its isolation test. Whole item done when `grep -rn "readJSON(\|writeJSON(\|updateJSON(" src/server` lists only `storage.js` and the store.

---

## N13. Blob store (file implementation)

**Goal.** `STORAGE-INTERFACE.md` section 6: uploads, fonts, Google Photos, legacy copies through `blobs.*(ctx, area, name)`.

**Do.** `src/server/store/blobs.js` file impl over `dataDir()`; `mount(app)` reproduces the six static mounts in `app.js:407-466` with identical headers; migrate `upload.js`, `routes/api.js` (logo, upload, media, fonts), `google-photos.js`, `cleanup.js` (orphans per org), `announcements-store.js` legacy writes. `upload.js` `sizeCache` keyed by `orgId:name`.

**Acceptance.** Blob contract tests (put/get/stat/list/remove, bad names refused, Windows device names refused); upload -> serve -> delete round trip through the HTTP app in a scratch dir; response headers of `/uploads/x.jpg` unchanged (compare to a recorded set); cleanup in org B never deletes org A files.

---

## N14. Jobs take `ctx`; per-process maps keyed by org

**Goal.** No module-level org state (`FIT-RULES.md` rule 10).

**Do.** A tiny `src/server/jobs.js` registry: `registerJob(name, { every | at, run: (ctx, now) => ... })`; today's startup block (`app.js:76-190`) registers the existing work and runs it for `systemCtx(DEFAULT_ORG_ID)`. Key the maps in `countdown.js:9-24`, `rss-scheduler.js:16`, `google-photos.js:36-39`, `kiddush-levana.js:19`, `sse.js:3-6` (client pools: `broadcast(ctx, type, data)` with a default-org shim for the old signature), `screenState.js:18` by org id. Timing behaviour unchanged.

**Acceptance.** Per job: running it for two ctxs in one process keeps separate state (timers, caches, last-run); SSE: a broadcast for org B reaches no default-org client; existing countdown / rss / photos tests green.

---

## N15. Identity / membership split (design + pure model, no UI)

**Goal.** `CLOUD-PLAN.md` 14.4 ("one login across orgs") prepared in the data model so `users.js` never needs a rewrite: a person (identity) holds memberships (org, role, preset, overrides); sessions, links, preauth and lockouts are per org.

**Do.** (1) Short design section appended to `docs/saas/CLOUD-PLAN.md` 14.4 or a new `docs/saas/IDENTITY.md`: file shape `users.json v2 = { version: 2, people: [{ id, username, name, passwordHash, totpSecret, totpEnabled, trustedDevices }], memberships: [{ id, personId, orgId: 'default', role, preset, overrides, status }], sessions: [{ tokenHash, personId, orgId, ... }], links, preauth, lockouts }`, plus how `requireAuth` resolves `{ person, membership }` and why a session is bound to one org. (2) Pure functions in `src/shared/identity.js` or `src/server/identityModel.js`: `toV2(v1Doc)`, `toV1(v2Doc)` (for rollback), `membershipFor(doc, personId, orgId)`, `effectiveCapsFor(membership)` (delegates to `permissions.js`). (3) **Do not switch `users.js` over** in this item; that is a follow-up with its own security review.

**Acceptance.** `test/identityModel.test.js`: v1 -> v2 -> v1 round trip is deep-equal for a fixture with an admin with 2-step, an editor with overrides, links, sessions and lockouts; every v1 user becomes exactly one person + one `default` membership; a person with memberships in `default` and `b` gets caps only from the membership of the org asked for; removing a membership never removes the person. Ask an opus reviewer (or the owner's security routine, `docs/security/`) to read the design before the follow-up.

---

## N16. Org vocabulary

**Goal.** The second org may be a girls' school or a shul (`CODE-INVENTORY.md` section 5).

**Do.** `settings.vocabulary = { people: 'bochurim' | 'talmidim' | 'talmidos' | 'students' | 'members' | custom }` (scope `org`, default `bochurim` so MLMI sees no change), pure `src/shared/vocabulary.js` with singular/plural/English/Hebrew forms, used by the admin labels for the roster tab, the capability label (`permissions.js:39`, made a function of vocabulary at display time; the capability id stays `roster.edit`), the activity area label (`activity.js:21`; stored lines keep their text), the quick-message seed blank label (new installs only), the Daily Story AI prompt. Area ids and file names never change.

**Acceptance.** Unit tests for the forms; with default settings every label is byte-identical to today (snapshot of the strings); with `students` the admin roster tab and capability label say "students". Out of scope: kiosk wording that already comes from content.

---

## N17. `export-org` / `import-org`

**Goal.** One zip per org = the self-host format and the migration diff tool (`CLOUD-PLAN.md` 5.3, P1).

**Do.** `scripts/export-org.js [--out file] [--no-names]` walks the registry + blob areas for the default org (secrets: `users.json` included only with `--with-logins`; names-class docs omitted with `--no-names`), writes a zip with a `manifest.json` (doc list, sha256 per file, app commit). `scripts/import-org.js <zip> --into <empty dir>` verifies hashes and writes files byte for byte. Never writes into a non-empty data dir.

**Acceptance.** Round trip on a fixture data dir: export -> import into an empty scratch dir -> every file byte-identical; `--no-names` export contains no `roster.json`, `chazan.json`, `quick-recents`; import refuses a tampered zip (hash mismatch) and a non-empty target.

---

## N18. CI

**Goal.** Tests run on every push, not only when someone remembers.

**Do.** `.github/workflows/test.yml`: Node 20 (match the Pi), `npm ci`, `npm test`, `npx vite build`, `npm audit --omit=dev` (report-only at first). No secrets, no deploy. **Owner approval needed** (it adds a GitHub feature to the repo).

**Acceptance.** Workflow green on the branch; a deliberately failing test in a scratch branch turns it red (then delete the branch).

---

## Not now (needs the cloud or an owner decision)
- Postgres store, Supabase Storage, RLS, the full route sweep against two live orgs (P2).
- Player mode, pairing, device tokens (P3).
- Mode C encryption (P7).
- Per-screen settings (box keys) beyond tagging, until the owner answers CLOUD-PLAN Q9.
- Switching `users.js` to the v2 identity model (follow-up to N15, with a security review).
