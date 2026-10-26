# Store interface: one API for the Pi files today and Postgres tomorrow

Status: **proposal, nothing built**. Builds on `CLOUD-PLAN.md` 6.1, 6.6, 7.3 (the `ctx`-first adapter) and is the target for `FIT-RULES.md` rules 1, 2, 8, 10. Current state of the code: `CODE-INVENTORY.md`.

Goals, in order:
1. **The single-school Pi stays byte-compatible**: same files, same names, same JSON formatting, same `.bak`/`.tmp`/fsync/0600 behaviour, so `deploy/update.sh`, backups, `npm run reset-admin`, export and every existing test keep working unchanged.
2. **Every call carries an org context**, and calling without one fails closed.
3. **One lock domain per document**, with the semantics of today's `updateJSON` (`src/server/storage.js:112-126`).
4. A Postgres implementation can be dropped in behind the same calls (`org_documents`, RLS), proven by one shared contract test suite.

---

## 1. The org context (`ctx`)

```js
// src/server/org.js (new)
/** @typedef {{ orgId: string, kind: 'org'|'platform', actor: Actor|null, org: OrgInfo }} Ctx */
/** @typedef {{ kind: 'person'|'device'|'system'|'support', id: string|null, name: string|null }} Actor */
/** @typedef {{ id: string, shortName: string, timezone: string|null, namesMode: 'L'|'C', flags: object }} OrgInfo */

export const DEFAULT_ORG_ID = 'default';           // the one org of a single-school install
export function makeCtx({ orgId, actor = null, org = {} }) { /* validates /^[a-z0-9-]{1,40}$/ or uuid, returns Object.freeze(...) */ }
export const PLATFORM = makeCtx({ orgId: '_platform', kind: 'platform' }); // shared docs only (zmanim-dates, data pack, shared cache)
export function systemCtx(orgId) { /* actor = { kind: 'system' } for background jobs */ }
export function attachOrg(req, _res, next) { req.ctx = makeCtx({ orgId: DEFAULT_ORG_ID, org: defaultOrgInfo() }); next(); } // P1: always the default org
export function requireCtx(ctx) { if (!ctx || !Object.isFrozen(ctx) || !ctx.orgId) throw new Error('store: no org context'); return ctx; }
```

Rules:
- `ctx` is created **only** by `attachOrg` (requests), `systemCtx` (jobs, one per org per run) and tests. Never from a request body or query.
- `actor` is filled in by `requireAuth` once the person is known (`{ kind: 'person', id: membershipId, name }`), so the store can stamp `updatedBy` and the activity log does not need its own lookup.
- `ctx.org` is a small cached copy (60 s) of the org row: timezone, names mode, flags. On the Pi it is derived from `settings.json` (`location.timezone`, `siteName`) and constants (`namesMode: 'L'`).

## 2. The document registry (pure data)

```js
// src/server/store/docs.js (new) -- every persistent document, with its scope and privacy class
export const DOCS = Object.freeze({
  settings:            { file: 'settings.json',            scope: 'org',      cls: 'org' },
  slides:              { file: 'slides.json',              scope: 'org',      cls: 'org' },
  announcements:       { file: 'announcements.json',       scope: 'org',      cls: 'names', history: true },
  'custom-days':       { file: 'custom-days.json',         scope: 'org',      cls: 'org' },
  schedule:            { file: 'schedule.json',            scope: 'org',      cls: 'org' },
  // ... one row per file in CODE-INVENTORY section 1
  roster:              { file: 'roster.json',              scope: 'org',      cls: 'names', secretMode: true, namesMode: true },
  chazan:              { file: 'chazan.json',              scope: 'org',      cls: 'names', secretMode: true, namesMode: true },
  users:               { file: 'users.json',               scope: 'person',   cls: 'secret', secretMode: true, history: false },
  live:                { file: 'live.json',                scope: 'org',      cls: 'secret', secretMode: true, history: false },
  'zmanim-dates':      { file: 'zmanim-dates.json',        scope: 'platform', cls: 'public' },
  'rss-cache/*':       { dir: 'rss-cache', ext: '.json',   scope: 'org',      cls: 'public' }, // a family: rss-cache/<feedId>
});
export function docSpec(name) { /* exact match, else family match with id /^[A-Za-z0-9_-]{1,64}$/ and not a Windows device name; else throw */ }
```

What the registry buys:
- An **unknown document name throws** (today any `readJSON('anything.json')` works). New data cannot appear without a registry row, which is where FIT-RULES rule 3 is enforced.
- `secretMode` replaces the separate `SECRET_FILES` list (`src/server/dataPerms.js:12`) (kept as a derived export so `dataPerms.js` does not change).
- `scope` is checked against `ctx.kind`: an org ctx cannot touch a `platform` doc and vice versa (fail closed).
- `namesMode` docs are the ones Mode L keeps on the People box; `cls: 'names'` docs are the ones support visits log views of, and the ones export treats specially.
- Export/import walk the registry, not the folder.

## 3. The Store interface

```js
// src/server/store/index.js (new): createStore(impl) wraps an implementation with ctx + registry checks.
export const SKIP = Symbol('skip-write');           // same symbol storage.js exports today (re-exported, identical)

/** Read one document. null when it does not exist (today's readJSON). */
read(ctx, doc)                      // -> Promise<any|null>

/** Read several at once (the /api/state assembly does 14 reads). */
readMany(ctx, docs)                 // -> Promise<{ [doc]: any|null }>

/** Locked read-modify-write; exactly today's updateJSON semantics (section 4). */
update(ctx, doc, fn, { fallback } = {})   // -> Promise<next | SKIP>

/** Replace the whole document (today's writeJSON). Implemented as update(ctx, doc, () => value). */
write(ctx, doc, value)              // -> Promise<void>

/** Delete a document (rss-cache/<id> when a feed is removed). */
remove(ctx, doc)                    // -> Promise<boolean>

/** Members of a family: list(ctx, 'rss-cache/*') -> ['rss-cache/abc', ...]. */
list(ctx, family)                   // -> Promise<string[]>

/** Opaque version for ETags and conflict checks (file: mtimeMs+size; pg: version bigint). */
version(ctx, doc)                   // -> Promise<string|null>

/** After-commit notifications for this org: fn({ doc, version, actor }). In-process for files; Realtime/NOTIFY for pg. */
watch(ctx, fn)                      // -> unsubscribe()
```

Compatibility wrappers (so nothing has to change on day one):
```js
// src/server/storage.js keeps its exports, now thin wrappers bound to the default org:
export const readJSON   = (filename)             => store.read(DEFAULT_CTX, docFromFile(filename));
export const writeJSON  = (filename, data)       => store.write(DEFAULT_CTX, docFromFile(filename), data);
export const updateJSON = (filename, fn, fb)     => store.update(DEFAULT_CTX, docFromFile(filename), fn, { fallback: fb });
export { SKIP, ensureDataDir };
```
`docFromFile('settings.json')` looks the file up in the registry; an unregistered name logs a warning in P1 (so nothing breaks) and throws once the lint ratchet (section 7, step 8) reaches zero.

## 4. Locking semantics (must match `updateJSON` exactly)

Today (`storage.js:17-30, 94-126`): one in-process promise lock **per file name**; `readJSON` takes no lock; `writeJSON` and `updateJSON` take it; `fn(current)` may be async and may mutate `current`; it returns the new value or `SKIP`; a throw leaves the file and the lock intact; calling `writeJSON`/`updateJSON` for the **same** file inside `fn` deadlocks.

The Store keeps all of that, keyed by `(orgId, doc)` instead of file name, and adds four guarantees:

| # | Rule | File impl | Postgres impl |
|---|---|---|---|
| L1 | Writes to one document are serialised | in-process lock per `(orgId, doc)` (today's `Map`) | `update ... where version = $expected`; 0 rows = conflict -> re-read, re-run `fn`, up to 3 times, then `StoreConflict` (409 "Someone else just changed this") |
| L2 | `fn` must be **pure** (no broadcasts, no fetches, no other store writes) because the pg impl may run it up to 3 times | true by convention today; a quick grep shows broadcasts happen after the `updateJSON` call, but each of the 27 call sites must be checked once (step 5) | same |
| L3 | Re-entrant `update` on the same `(orgId, doc)` from inside `fn` **throws** `StoreReentry` instead of hanging | `AsyncLocalStorage` marks the held lock | same check |
| L4 | **One lock domain per document**: no module may wrap a document in its own lock (`withSettingsLock`, `withScheduleLock`, `ownedStore` `chain`, `chazanStore` lock) unless that lock *is* `store.update` | today schedule.json has two domains and a real lost-update race (CODE-INVENTORY row `schedule.json`); step 5 fixes it | n/a |

Multi-document consistency: none promised today (e.g. `chazanStore.js:33` reads settings + roster + custom days outside any lock, then writes `chazan.json`). The Store keeps that: single-document atomicity only. A `transaction(ctx, docs, fn)` is **not** in v1; add it only if a real case needs it (the pg impl can do it in one SQL transaction; the file impl would take the locks in sorted order).

## 5. File implementation (`src/server/store/file.js`)

Built by **moving** today's `storage.js` internals, not rewriting them.

```js
export function createFileStore({ root = dataDir(), orgDir = (orgId) => orgId === DEFAULT_ORG_ID ? root : path.join(root, 'orgs', orgId) } = {}) { ... }
```

- **Layout.** The default org lives at the data root exactly as today (`data/settings.json`, ...). Another org (tests, or a future multi-org self-host) lives at `data/orgs/<orgId>/`. Platform docs live at the root too (`data/zmanim-dates.json`, `data/pack/`) so nothing moves on the Pi.
- **Bytes.** `JSON.stringify(data, null, 2)`, utf-8, `.tmp` + fsync + `renameWithRetry` (`platform.js`), EPERM/EBUSY direct-write fallback, `.bak` copy of the previous good file, `.bak` fallback on a parse error, `0600` for `secretMode` docs and their `.bak`/`.tmp`, `ensureDataDir` once. All copied line for line from `storage.js:36-165`.
- **Families** (`rss-cache/<id>`): `root/<dir>/<id><ext>`; ids validated by the registry; this replaces the raw reads/writes in `app.js:361` and `rss-scheduler.js:41` and makes them atomic for free.
- **version()**: `${mtimeMs}-${size}` (good enough for an ETag on one box).
- **watch()**: an in-process `EventEmitter` per org, fired after a successful rename. SSE stays explicit at first (FIT-RULES 6); later `sse.js` can subscribe instead of every route calling `broadcast`.
- **Data dir**: one `dataDir()` helper (`src/server/dataDir.js`) that honours `TACHTACH_DATA_DIR`; every module that builds `<root>/data` itself (13 of them, CODE-INVENTORY section 6) imports it.

Byte-compatibility proof (the safety net, written **before** the move):
```js
// test/storeGolden.test.js
// 1. scratch dir A: write a fixed sequence of documents with today's storage.js (writeJSON/updateJSON, incl. a secret file and a corrupt-file .bak fallback).
// 2. scratch dir B: same sequence through store.write/update(DEFAULT_CTX, ...).
// 3. assert: same file list, same bytes (sha256 per file), same modes for secret files (skip modes on win32), same .bak contents.
```

## 6. Blob store (`src/server/store/blobs.js`)

Files that are not JSON documents: uploads, fonts, Google Photos copies, PDF page images, legacy copies.

```js
export const AREAS = Object.freeze({
  uploads:         { scope: 'org',      serve: '/uploads',       maxBytes: 50 * 1024 * 1024 },
  fonts:           { scope: 'org',      serve: '/fonts',         maxBytes: 5 * 1024 * 1024 },
  'google-photos': { scope: 'org',      serve: '/google-photos' },
  legacy:          { scope: 'org',      serve: null },
  pack:            { scope: 'platform', serve: null },
});
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/; // server-generated names only; no dots-only, no Windows device names

put(ctx, area, name, data, { contentType })   // Buffer | Readable -> { name, bytes }
get(ctx, area, name)                          // -> Readable | null
stat(ctx, area, name)                         // -> { bytes, mtimeMs } | null
list(ctx, area)                               // -> [{ name, bytes, mtimeMs }]   (cleanup, media page, health sizes)
remove(ctx, area, name)                       // -> boolean
urlFor(ctx, area, name)                       // -> '/uploads/<name>' (same origin, CSP 'self')
localPath(ctx, area, name)                    // file impl only: for sharp / poppler / express.static. Pg/Storage impl throws.
mount(app, { gate })                          // file impl: express.static per area for the default org, with today's headers (app.js:407-466)
```

- File impl: `orgDir(ctx.orgId)/<area>/<name>` (default org = `data/uploads/...`, unchanged).
- Supabase impl: object key `org/<org_id>/<area>/<name>`; `urlFor` stays same-origin and the cloud app rewrites to Storage (`CLOUD-PLAN.md` 13.1); `put` for big files becomes the signed-upload + finalize flow.
- No route ever passes a path; `name` always comes from the server (`uuid` + extension, as `upload.js` does today).

## 7. Postgres implementation sketch (`src/server/store/pg.js`, phase P2)

```sql
create table org_documents (
  org_id uuid not null references tenants(id) on delete cascade,
  key text not null,                       -- registry name, e.g. 'settings', 'rss-cache/abc'
  value jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (org_id, key)
);
alter table org_documents enable row level security;
alter table org_documents force row level security;
create policy org_isolation on org_documents
  using (org_id = current_setting('app.org_id', true)::uuid)
  with check (org_id = current_setting('app.org_id', true)::uuid);
create table shared_documents (key text primary key, value jsonb not null, version bigint not null default 1, updated_at timestamptz not null default now()); -- platform docs
```

```js
async function update(ctx, doc, fn, { fallback } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await sql.begin(async (tx) => {
      await tx`select set_config('app.org_id', ${ctx.orgId}, true)`;            // transaction-local (pooler safe)
      const [row] = await tx`select value, version from org_documents where org_id = ${ctx.orgId} and key = ${doc}`;
      const current = row ? row.value : (typeof fallback === 'function' ? fallback() : fallback);
      const next = await fn(structuredClone(current));                          // L2: fn must be pure
      if (next === SKIP) return { done: SKIP };
      if (!row) {
        const ins = await tx`insert into org_documents (org_id, key, value, updated_by) values (${ctx.orgId}, ${doc}, ${tx.json(next)}, ${ctx.actor?.id ?? null}) on conflict do nothing returning version`;
        return ins.length ? { done: next } : { retry: true };
      }
      const upd = await tx`update org_documents set value = ${tx.json(next)}, version = version + 1, updated_at = now(), updated_by = ${ctx.actor?.id ?? null}
                           where org_id = ${ctx.orgId} and key = ${doc} and version = ${row.version} returning version`;
      return upd.length ? { done: next } : { retry: true };
    });
    if (!res.retry) { if (res.done !== SKIP) notify(ctx, doc); return res.done; }
  }
  throw new StoreConflict(doc);
}
```
- History (`org_document_history`) by trigger, skipped for registry rows with `history: false` (secrets).
- `watch()` = Supabase Realtime broadcast on the org's channel, content-free (`CLOUD-PLAN.md` 10.3).
- `users` (scope `person`) is **not** an `org_documents` row in the cloud: the user store gets its own pg implementation on the `people` / `memberships` / `sessions` tables (`CLOUD-PLAN.md` 6.3, 14.4). The registry marks it so `pg.js` refuses it.
- Mode L `namesMode` docs: `pg.js` refuses them for an org whose `namesMode` is `L` (fail closed: a bug that tries to write names to the cloud throws instead of leaking).

## 8. Refactor order (small commits, each with its safety net)

Each step is one or two commits, ships to the Pi on its own, and changes **no behaviour** unless it says so. Run `npm test` before and after every step; never touch the real `data/` (tests use `TACHTACH_DATA_DIR`).

| Step | Change | Safety net (tests first) | Size |
|---|---|---|---|
| 0 | Contract test suite `test/storeContract.test.js` written against **today's** `storage.js` API: read missing -> null, write/read round trip, `updateJSON` 10-way parallel (exists in `test/updateJSON.test.js`), SKIP, throw keeps file + lock, `.bak` fallback, secret modes; plus `test/storeGolden.test.js` byte snapshot | green on today's code | S |
| 1 | `src/server/dataDir.js`; replace the 13 private `<root>/data` computations (CODE-INVENTORY section 6) with it | new test: with `TACHTACH_DATA_DIR` set, an upload / rss-cache write / photo manifest lands in the scratch dir; static mounts serve from it | S |
| 2 | Registry `store/docs.js` + lint test: every `'<x>.json'` literal passed to `readJSON`/`writeJSON`/`updateJSON` in `src/` is registered | lint test (grep-based, like `test/windowsKit.test.js`) | S |
| 3 | `org.js` (`DEFAULT_CTX`, `makeCtx`, `attachOrg` mounted first in `app.js`); nothing reads `req.ctx` yet | unit tests: frozen, bad ids throw, no-ctx throws | S |
| 4 | `store/file.js` by moving `storage.js` internals; `storage.js` becomes the wrappers of section 3 | step-0 suites run against both the wrappers and `store.*(DEFAULT_CTX, ...)`; golden bytes identical | M |
| 5 | **One lock domain per document**: `withScheduleLock` / `withSettingsLock` / `chazanStore` / `ownedStore` locks re-expressed as `store.update`; audit the 27 `updateJSON` callbacks for purity (L2) | new race test: entry edit via `updateJSON` + by-date apply in parallel -> both changes present (fails today for `schedule.json`) | M |
| 6 | Migrate callers to `store.read(req.ctx, ...)` / `store.update(req.ctx, ...)`, smallest first: `daily-words`, `daily-stories`, `kiddush-levana`, `freeze`, `live`, `push`, `activity`, `undoStore`, `ownedStore` (`io`), `roster`, `chazanStore`, `announcements-store`, `scheduleStore`, then `routes/api.js` one area per commit, then `/api/state` as `buildState(ctx)` | per module: an **isolation test** with two file stores (`default` and `orgs/b`): the module called with ctx B never reads or changes A's files (FIT-RULES 11 template) | M-L total |
| 7 | Blob store file impl + `mount`; migrate `upload.js`, `routes/api.js` media/fonts/logo, `google-photos.js`, `cleanup.js`, `announcements-store.js` legacy copies | blob contract tests; static serving headers unchanged (`test/` for CSP/headers of `/uploads`) | M |
| 8 | Lint ratchet: no `readJSON(`/`writeJSON(`/`updateJSON(` and no `fs` import outside an allow-list (`store/*`, `dataDir.js`, box modules: `systemUpdate.js`, `localTls.js`, `dataPerms.js`, `health.js`, `platform.js`, `dataPackStore.js`, `packBuilder.js`, `browserFetch.js`, `pdf.js` temp dir). The allow-list only shrinks | lint test | S |
| 9 | Jobs take `ctx`: `runFetchJob(ctx)`, `runRssJob(ctx)`, ... called by today's timers with `systemCtx(DEFAULT_ORG_ID)`; module-level `Map`s keyed by `ctx.orgId` (`countdown.js`, `sse.js` pools, `shabbosEndMemo` by location) | per job: two ctxs in one process do not share state | M |
| 10 | (P2, cloud) `store/pg.js` + `blobs/supabase.js`; contract suite runs against a throwaway Postgres in Docker | same suites, pg flavour; RLS tests from `CLOUD-PLAN.md` 7.6 | L |

Stop points: after step 4 the code is Store-backed with zero behaviour change; after step 6 every org read carries `ctx`; after step 8 new raw access cannot sneak in. Steps 0-9 need no cloud and are all in `NEXT-STEPS.md`.

## 9. Unknowns and open choices
- `version()` on files uses mtime; two writes inside the filesystem's timestamp granularity could share a version. Fine for ETags on one box; the pg impl is exact. If the player needs exact versions from the file store, add a counter file.
- `AsyncLocalStorage` overhead on the Pi for re-entrance detection (L3) is expected to be negligible but is unmeasured; it can be dev/test-only if it shows up.
- Whether `users` should go through the Store at all in P1, or keep its own injected `read/write` until the identity split (recommendation: keep `createUserStore({read, write})`, just bind its default to `store.read(DEFAULT_CTX, 'users')`).
- Multi-org on the **file** store (`data/orgs/<id>/`) is for tests and a possible "two schools on one box" self-host; nobody asked for the latter. Do not build an admin UI for it.
