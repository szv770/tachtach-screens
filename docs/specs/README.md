# Feature specs (2026-10-26) — index and shared rules

Status: **SPECS ONLY, nothing built.** Written before any code so the owner can answer the open questions in `QUESTIONS-FOR-OWNER.md` and so each feature lands without rough edges. Docs only: no `src/` or `data/` file is touched by this work.

| # | Spec | One line | Size |
|---|---|---|---|
| 1 | [01-MESSAGE-POSTING.md](01-MESSAGE-POSTING.md) | One composer, live preview, "on the screen in under 15 seconds from a phone" | L |
| 2 | [02-SHABBOS-PAGE.md](02-SHABBOS-PAGE.md) | Erev Shabbos page (candles, parsha, countdown, reminders) + Motzei Shabbos | M-L |
| 3 | [03-MAZEL-TOV.md](03-MAZEL-TOV.md) | Simcha slides (engagement, bar mitzvah, birth...), quick-post, takeover option | M |
| 4 | [04-PHOTO-WALL.md](04-PHOTO-WALL.md) | Curated photos with captions, albums per event, moderation | L-XL |
| 5 | [05-MENU.md](05-MENU.md) | Weekly meal menu with today highlight, dietary tags, Shabbos meals | M |
| 6 | [06-SPEAKER-SHIURIM.md](06-SPEAKER-SHIURIM.md) | Guest speaker announcement + weekly shiurim per rebbe | M |
| 7 | [ADMIN-EXPOSURE-AUDIT.md](ADMIN-EXPOSURE-AUDIT.md) | Built features whose options have no admin control | audit |
| - | [QUESTIONS-FOR-OWNER.md](QUESTIONS-FOR-OWNER.md) | The minimum multiple-choice list needed to finalise all of the above | - |

Size scale used everywhere: **S** = under half a day, **M** = 1-2 days, **L** = 3-5 days, **XL** = more than a week (one "day" = one focused agent session including tests, docs and a screenshot check).

Every spec follows the same outline: 1 User story, 2 Data model + file, 3 Admin UX (wireframes), 4 Kiosk design, 5 API + permission, 6 Security + privacy, 7 SaaS fit, 8 Tests, 9 Size, 10 Open questions.

---

## The shared rules every spec points to (read once, referenced as C1...C9)

### C1. Store module, org-scoped (CLOUD-PLAN sections 6.1, 7.3, 8.1)

Today a feature reads and writes `data/<name>.json` through `src/server/storage.js` (`readJSON`, `writeJSON`, `updateJSON`). The cloud plan turns each such file into a row of `org_documents (org_id, key, value, version)` behind the same function names plus a `ctx`. So every new feature gets **one store module** and nothing else touches its file:

```
src/server/<feature>Store.js
  export const FILE = '<feature>.json'            // document key = file name without .json
  export async function read(ctx = LOCAL)         // normalised via the shared pure normaliser
  export async function mutate(ctx, fn)           // updateJSON() under the lock; fn(doc) -> doc
  export function forKiosk(doc, now)              // what /api/state sends (small, no staff ids)
  // ctx = { orgId, actor } ; LOCAL = { orgId: 'local' } on a Pi / self-host
```

Rules: routes never call `readJSON('<feature>.json')` directly (the way `routes/daily-stories.js` does today); they call the store. The store takes `ctx` first even though the file adapter ignores it, so the cloud adapter is a drop-in. Uploaded files go through one path builder (`orgPath(ctx, kind, name)` in the cloud plan; `data/<dir>/` today), never a path from a request. Pure rules (normalise, "what shows today", copy tables) live in `src/shared/<feature>.js` with `node --test` tests, exactly like `roster.js`, `chazan.js`, `dailyStories.js`.

### C2. No hard-coded school names

No Rebbe name, hall name, meal name, school name, campus or minhag-specific text lives in code. Seeds are generic and clearly samples ("Sample: Rabbi Cohen"), or empty. Hebrew/English wording tables are ONE table per feature (like `birthdayCopy.js`, `stageStrings.js`) so a native speaker can fix wording in one place and so an org can later override it. Where the owner's school needs a default, it is data the owner enters.

### C3. Permissions (extend `src/shared/permissions.js`)

A new editable thing needs: a capability in `CAPABILITIES` (with `group`, `label`, `hint`), a line in `RULES` (path regex, first match wins, a catch-all per area so nothing under the prefix is open), a section in `SECTION_CAPS` (so the tab opens), membership in the `CONTENT` array (so "Full editor" gets it), and NOT in "Messages only" unless the spec says so. Capabilities proposed in these specs:

| Capability | Group | Needed by | In `full` preset | In `messages` preset |
|---|---|---|---|---|
| `announcements.post` (exists) | Announcements | composer, Mazel Tov quick-post | yes | yes |
| `shabbos.edit` (new) | Screen | Shabbos page reminders and wording | yes | no |
| `simchas.edit` (new) | Screen | Mazel Tov list (names) | yes | **yes** (Mazel Tov is a "message") - see QUESTIONS Q7 |
| `photowall.edit` (new) | Screen | Photo Wall albums, upload, caption | yes | no |
| `photowall.moderate` (new, grantable) | Screen | approve / hide photos from a shared inbox | no | no |
| `menu.edit` (new) | Screen | Menu | yes | no |
| `shiurim.edit` (new) | Schedule | Shiurim + speakers | yes | no |
| `settings.change` (exists) | Look and settings | the few settings keys each feature adds | admin/overrides | no |

The "feature flags per org" idea (CLOUD-PLAN 13.12) is `tenants.flags.<feature>`: the server answers 404 for a flagged-off feature's routes and the admin hides its section. Flag names: `shabbosPage`, `mazelTov`, `photoWall`, `menu`, `shiurim`.

### C4. Privacy classes (new; one tiny registry, `src/shared/privacy.js`)

The cloud plan only distinguishes "student names" (section 9) from everything else. Photos of students and "who is away when" show that two classes are not enough. Proposal, **one registry** that every store declares itself in and that drives routing, the live view, export/delete and logging:

| Class | What | Examples | Rule |
|---|---|---|---|
| **P0 Org content** | Text and media about the organisation, no person is identified | menu, schedule, Shabbos reminders, hall names, shiur titles | Normal org document. May appear on the live view. |
| **P1 Staff / adult names** | Rebbeim, guest speakers, adult donors, staff in a caption | speaker name and photo, rebbe on a shiur | Normal org document; shown on the TV; live view allowed (default on, switch in Live link card). Logged by name in History is fine. |
| **P2 Student identity** | A student's name, Hebrew birthday, family occasion tied to a student | roster, chazan, birthdays, **Mazel Tov names**, **photo captions that name a student** | Follows the org's **names mode** (CLOUD-PLAN Mode L stays on the Pi, Mode C encrypted). Live view only if the org's "show names on the live view" choice is on (MLMI's today). History/activity lines are **name-free** ("Added a simcha", never the name). Never in push notifications, support-visit screenshots, exports for support, or the shared cache. |
| **P3 Student image** | A photo in which a student can be recognised | **Photo Wall photos, simcha photos of children** | Strictest. Everything P2 has, plus: stored only in a **gated** folder served by `kioskGate` (never the public `/uploads` that is served ungated under an unguessable name), EXIF/GPS stripped by re-encoding, excluded from the public live view unless the org turns "Show photos on the live view" on separately, never sent to a third party (no Google Photos album for these), included in "delete this person" and "delete org" purges, filename is a random id (no original file name kept). |

Each spec states its class per field. A field's class is the max over its content (a caption that names a student is P2 even in a P0 album).

### C5. Live view allow-list (`src/server/live.js` `VIEWER_KEYS`, `viewerState`)

A key added to `/api/state` never reaches live viewers until it is added on purpose. Each spec lists exactly: the new `VIEWER_KEYS` entry (if any), the `viewerState` filter that applies (drop staff ids like `createdBy`, drop P2 names when the org's names-on-live choice is off, drop P3 images when the photos-on-live choice is off, drop anything not active today), and a test in `test/live.test.js` that the key is absent when it should be. Media served to viewers must go through `kioskGate` (localhost, or a viewer cookie), never a public path.

### C6. Kiosk rules checklist (CLAUDE.md "Non-negotiable rules", docs/claude/GOTCHAS.md)

Every new kiosk page: paints only with design roles (`var(--accent)`, `--dim`, `--panel`...) and font roles, no hard-coded colour or font; built on `Panel` / `PageTitle` / `Fit` from `src/screen/design/`; **no infinite animation, blur, backdrop-filter or blend mode**; entrances are FINITE (`translate3d`/opacity, always settle) and are skipped under Minimal motion and `prefers-reduced-motion`; graphics follow `settings.graphics` (off / subtle / full); asks the rotation for more time with `onRequestDuration` rather than scrolling forever; auto-fits text instead of clipping; Hebrew text uses the Hebrew role, `dir="auto"`/`bidiNodes`, nikud-safe line boxes (like Daily Word).

**Readable at distance.** The canvas is 1600x900 (landscape) / 900x1600 (portrait), uniformly scaled by `ScreenScaler` (x1.2 on a 1080p TV, x2.4 on 4K). Design in canvas pixels: **headline >= 56, key fact (a time, a name) >= 44, body >= 30, meta lines >= 24, hard floor 24** (the schedule's own floor is 26). Contrast: text on `--panel` uses `--text`/`--dim` only; `--dim` is never used under 28 px. Every page is checked at 1600x900, 900x1600, and the two scaled sizes with the longest realistic content and with Hebrew-only, English-only and both.

**Every page defines**: empty state (page not in rotation, or a quiet "Nothing today" in the admin preview), long text (fit, then shrink, then ask for time, then paginate as `Paged.jsx` does), Hebrew-only, English-only, one item, many items, portrait.

### C7. Security checklist for new routes and inputs

- Routes mount on `/api` after `requireAuth` + `csrfProtection` + the mutation limiter (see `routes/roster.js`). Any route a kiosk or live viewer must GET uses `kioskGate`, never an open path.
- Body size limit per route (`express.json({ limit })`, the app default is 16 kB): list the number in the spec; keep it tight (names 256 kB at most).
- Every write is validated by a **shared normaliser** (strip control characters, collapse whitespace, cap length, enum-check, date-check), identical on server and admin. Unknown keys are dropped, never stored.
- Text is only ever rendered as React text. No `dangerouslySetInnerHTML`, no markdown/HTML in user text, no `javascript:`/`data:` links. A URL field accepts `https:` only through `parse()` in `src/server/urlRules.js` and is shown as a QR or text, never auto-followed server-side except through `safeFetch`.
- Uploads: allow-list by **sniffed content** (magic bytes, like `logoType.js`), not by the multipart mimetype; images re-encoded with `sharp` (strips EXIF, bounds pixels with `limitInputPixels`), animated GIF/SVG refused for photos; per-file and per-collection limits; random file names; delete = unlink + reference check (`uploadRefs.js`).
- Writes that matter are undoable (add a kind to `UNDO_KINDS` in `src/shared/undo.js`) and appear in History with a name-free line (C4).
- Errors go through `safeError.js` (no stack or path to the client).

### C8. Adding a slide type: the checklist (taken from how `DAILY_STORY` was wired)

`src/admin/components/slides/slideTypes.js` (registry row) + `src/server/builtin-slides.js` `LATE_BUILTINS` (order 106+, `enabled:false` unless the spec says on) + `src/screen/components/SlideCarousel.jsx` (case) + `src/screen/App.jsx` (the "only in rotation when it has something" filter next to the `BIRTHDAYS`/`CHAZAN`/`DAILY_STORY` ones) + `src/screen/components/slides/<Name>Slide.jsx` + `src/admin/components/LivePreview.jsx` and `screen/components/LiveControls.jsx` (preview jump lists) + `src/admin/search/{searchIndex,labels}.js` + `src/admin/help/helpContent.js` + `src/shared/permissions.js` (C3) + `src/shared/undo.js` + `src/server/live.js` (C5) + `docs/claude/FEATURES.md` + `docs/claude/ADMIN_FEATURE_MAP.md` + a CLAUDE.md changelog line. Each spec's size estimate includes this.

### C9. Test convention

Pure rules: `test/<feature>.test.js` with `node --test` (no DOM). Server routes: handler-level tests with `TACHTACH_DATA_DIR` set to a scratch dir (never the real `data/`). Permission rows: add to `test/permissionsCaps.test.js`. Live view: `test/live.test.js`. A kiosk "no forbidden CSS" lint: extend `test/screenDesign.test.js` so the new slide file contains no `infinite`, `blur(`, `backdrop-filter`, `mix-blend-mode`, hex colours or font-family literals. Fit/size checks are programmatic (render the pure model at the extremes), not screenshot sheets; one screenshot per orientation at the end.
