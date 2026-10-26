# Spec 4 — Photo Wall (curated photos with captions)

Status: SPEC (not built). Shared rules: [README.md](README.md) (C1-C9). This spec also defines the **private image store** (2.4) that [03-MAZEL-TOV.md](03-MAZEL-TOV.md) uses for its photos.

## 0. What exists today and why this is different

| Today | Limits for this need |
|---|---|
| **Google Photos album slide** (`GooglePhotosSlide.jsx`, `google-photos.js`, `/api/google-album/:id/photos`): syncs a shared Google album, layouts single / fullscreen / carousel / collage 2-4-6, per-album `maxPhotos`, `photoInterval`, `photoOrder`, optional Ken Burns | No captions, no curation (everything in the album shows), no approval step, photos come from a third party link, files are cached under `data/google-photos/` which is served **ungated** (`app.js` ~426), one album = one slide |
| **Image slide / Media library** (`upload.js` `processImage`, `ImageSlide.jsx`, `MediaLibrary.jsx`): one picture per slide | One photo per slide row, no album, no captions; uploads land in `data/uploads/` which is **also served ungated** under an unguessable name (fine for a menu, wrong for children's faces) |
| Upload pipeline: `multer` memory storage 50 MB, mimetype whitelist from the **client-declared** type, `sharp` resize to the measured screen box, JPEG q85, blur placeholder | No content sniffing for photos, no pixel limit, EXIF is dropped by the re-encode **but orientation is not applied explicitly** (`sharp().rotate()` is not called), no variants (one size for everything), no quota |

So: a **curated** wall (hand-picked photos, captions, albums per event), on a private store, with moderation and automatic expiry.

---

## 1. User story (plain English)

> "After the Purim party I open **Screen > Photo Wall**, tap **New album**, call it 'Purim party', tap **Add photos**, and pick 25 pictures from my phone's gallery. They upload with a progress bar. I tap a few photos to add captions ('The grand prize winner!'), hide two that didn't come out well, and choose **Collage**. I switch the album **On the screen** until next Thursday. The TV shows a few photos at a time, with captions, and picks up where it left off on the next pass. After 30 days the album archives itself and the pictures are deleted from the screen box.
>
> A teacher who is allowed to add photos but not approve them uploads from the trip; I see a **Waiting for approval (6)** badge, look through them, approve four, hide two."

---

## 2. Data model + file

### 2.1 `data/photowall.json`, store `src/server/photoWallStore.js` (C1). Class **P3** (images) + **P2** (a caption that names a student)

```json
{ "version": 1,
  "settings": { "enabled": true, "moderation": false, "paused": false,
                "secondsPerPhoto": 7, "maxSecondsPerVisit": 45, "kenBurns": false,
                "liveView": false, "retentionDays": 30, "quotaPhotos": 1500 },
  "albums": [ {
    "id": "uuid", "title": "Purim party", "titleHe": "מסיבת פורים",
    "layout": "collage",                    // 'single' | 'grid' | 'collage' | 'spotlight'  (4.1)
    "gridCount": 4,                         // for 'grid': 2 | 4 | 6
    "order": "manual",                      // 'manual' | 'newest' | 'random'
    "captions": true,
    "onScreen": true,
    "showFrom": "2026-03-04", "showUntil": "2026-03-11",     // dates, org tz; null = no window
    "retentionDays": null,                  // null = org default; number = this album; 0 = keep (admin only)
    "liveView": false,                      // this album's photos on the public live view (needs settings.liveView too)
    "cover": "photoId" | null,
    "createdAt": "ISO", "createdById": "userId", "archivedAt": null
  } ],
  "photos": [ {
    "id": "uuid", "albumId": "uuid",
    "w": 2400, "h": 1600, "dominant": "rgb(120,90,70)",
    "caption": "The grand prize winner!", "captionHe": "",
    "status": "approved",                   // 'pending' | 'approved' | 'hidden'
    "focus": "center",                      // 'top' | 'center' | 'bottom'  object-position for cover crops
    "position": 3, "addedAt": "ISO", "addedById": "userId", "decidedById": null
  } ] }
```

Limits (shared normaliser, `src/shared/photoWall.js`): 50 albums, 150 photos per album, 1500 per org (configurable down, never above the cap), `title` 60, `caption` 100 per language, `secondsPerPhoto` 3-30, `maxSecondsPerVisit` 15-180, `retentionDays` 1-365 or `0` (admin only), whole file <= 600 kB (a photo row is about 300 bytes). Unknown keys dropped; ids server-made.

### 2.2 Pure module `src/shared/photoWall.js` (tests: section 8)

`normalizeFile`, `liveAlbums(file, dateISO)` (onScreen, not archived, inside window, has >= 1 approved photo), `orderPhotos(album, photos, seed)`, **`planVisit(album, photos, cursor, settings)`** (which photos this pass shows: `count = min(approved, floor(maxSecondsPerVisit / secondsPerPhoto) * perPage)`, returns `{ pages: [[photoId...]], nextCursor, seconds }`; the kiosk keeps the cursor in memory so each pass continues where the last stopped and wraps around), `collageLayout(photos, box)` (2.3), `retentionDue(file, now)`, `forKiosk(file, dateISO)`.

### 2.3 Collage layout (pure, deterministic, no overlap)

Given up to 5 photos with width/height, pick one of a small fixed set of tile templates by the mix of orientations (e.g. `L+L+L` = one big + two stacked; `P+P+P` = three columns; `L+P+P`...). Every tile gets a rectangle inside the panel box with a 12 px gap; tiles crop with `object-fit: cover` using each photo's `focus`; a template is rejected when any crop would hide more than 40% of a photo (then the next template or a plain grid is used). Templates are data in the module, covered by a property test (no overlap, inside the box, area filled >= 92%).

### 2.4 The private image store (shared with Mazel Tov) — `src/server/privateImages.js`

```
saveImage(ctx, buffer, { kind })     -> { id, w, h, dominant, bytes }       // validates, re-encodes, writes variants
deleteImage(ctx, id)                  // unlink all variants; idempotent
imagePath(ctx, id, variant)           // the ONLY path builder (cloud: orgPath(ctx, 'private', ...))
privateFileGate(kind)                 // Express middleware for GET /private/<kind>/<id>-<variant>.jpg
sweepOrphans(ctx, referencedIds)      // cleanup.js hook: files not referenced for 24 h are deleted
```

Pipeline for every photo (one function, tested):
1. **Sniff**: first bytes must be JPEG / PNG / WebP (same style as `logoType.js`); the client's mimetype and file name are ignored. GIF, SVG, HEIC, PDF, video: refused (415, plain message).
2. `sharp(buffer, { limitInputPixels: 60_000_000, failOn: 'error' }).rotate()` (apply EXIF orientation **then** drop all metadata: `withMetadata` is never used, so EXIF, GPS, camera, thumbnails and ICC-embedded text are gone).
3. Variants, all progressive JPEG, written 0600 into a 0700 folder `data/private/<kind>/`: `full` (max edge 2400, q80, enough for a 4K single photo), `tile` (max edge 900, q75, for collages/grids), `thumb` (max edge 320, q70, for the admin grid). Names: `<uuid>-full.jpg` etc.; **no original file name is kept**.
4. Returns width/height of `full` and the dominant colour (for the load placeholder).
5. One process-wide semaphore (1 at a time, ~0.3 s per 12 MP on a Pi 5) so a 25-photo upload cannot exhaust RAM; per-request body cap 25 MB.

Gate (`privateFileGate`): GET only, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; img-src 'self'`, `Cache-Control: private, max-age=86400`, no listing, ids must match `^[0-9a-f-]{36}-(full|tile|thumb)\.jpg$`. Allowed callers: the kiosk (`isLocalRequest`), a signed-in admin, or a live viewer **only** for photos whose album has `liveView` on AND whose settings allow it (index kept in memory, rebuilt on every write). Everything else gets the same 404 as a missing file.

---

## 3. Admin UX

New section **Screen > Photo Wall** (`/admin/photo-wall`), capability `photowall.edit` (uploads, albums, captions, hide, delete) and `photowall.moderate` (approve / hide others' uploads, grantable, admin always). Nav badge = number waiting.

### 3.1 Albums (phone)

```
┌ Photo Wall ─────────────────── [＋ New album]┐
│ [Waiting for approval · 6]                    │  <- only when moderation is on and you may moderate
│ ┌────────┐ Purim party          ON THE SCREEN│
│ │ cover  │ 25 photos · until Thu Mar 11       │
│ └────────┘ Collage · 7 s each           ⋯     │
│ ┌────────┐ Trip to the farm       off         │
│ │ cover  │ 12 photos · archived in 18 days    │
│ └────────┘                              ⋯     │
│ ▾ Settings                                    │
│    ● Photo Wall on        ☐ Pause it right now│
│    ☐ Photos need approval before they show    │
│    Keep photos for [30 days ▾] after the album ends
│    Photos on the live link  (off) ▸           │
└───────────────────────────────────────────────┘
```

### 3.2 One album

```
┌ ‹ Purim party                      [On screen ●]┐
│ [ + Add photos ]  [ Select ]   Layout: [Collage ▾]
│ Shows  [Mar 4 – Mar 11 ▾]   Order [As arranged ▾]
│ ● Show captions            Seconds per photo [7]
│ ┌──┬──┬──┬──┐   tap = caption & options          │
│ │📷│📷│📷│📷│   long-press / Select = multi-pick  │
│ ├──┼──┼──┼──┤   small badges: ✎ caption, 👁 hidden, ⏳ waiting
│ │📷│📷│📷│📷│                                     │
│ └──┴──┴──┴──┘                                    │
│ Preview ▸  (the real kiosk layout with these photos)
│ Delete album…                                    │
└─────────────────────────────────────────────────┘
Select mode bar:  [Hide] [Show] [Move to start] [Move to…] [Delete]   3 selected
```

Reorder on a phone: **Move earlier / Move later / To start** buttons in the photo sheet (no fragile drag on touch), drag handles on desktop (`@dnd` is not added: HTML5 drag events, 30 lines).

### 3.3 Add photos

```
┌ Add photos ────────────────────────────┐
│ [ Take a photo ]  [ Choose from gallery ]   <- 'multiple'
│  IMG_2231.jpg   ████████░░  80%       │
│  IMG_2232.jpg   ✓ done                 │
│  IMG_2233.jpg   ✗ Too big (max 25 MB) [Retry]
│ Pictures are shrunk and cleaned (location and camera info removed) before they are saved.
│ Only add photos families have agreed to.│
└────────────────────────────────────────┘
```
Client downscales to a 2400 px edge (canvas, JPEG q85) before sending when the file is large, three uploads in parallel, each retried twice, order kept. Failures do not stop the others.

### 3.4 Photo sheet

```
┌ Photo ─────────────────────── ✕ ┐
│ [big image]                      │
│ Caption      [ The grand prize winner! ]
│ Hebrew       + add
│ Crop focus   [Top][Center ✓][Bottom]
│ ☐ Hidden          Status: Approved
│ [‹ Earlier] [Later ›] [To start] │
│ [ Delete photo ]                 │
└──────────────────────────────────┘
```
Hint under the caption: "If you write a student's name here, only people signed in and the TV will see it."

### 3.5 Waiting for approval (moderators)

```
┌ Waiting for approval (6) ────────────────┐
│ Purim party · by Mrs. Gold               │
│ [thumb][thumb][thumb]   [Approve all] [Review one by one ▸]
│  one by one:  [ big photo ]  [Approve] [Hide] [Delete]
└──────────────────────────────────────────┘
```
(The uploader's display name is shown to moderators only; never on the kiosk or the live view.)

### 3.6 Slides list

One built-in row `PHOTO_WALL` ("Photo Wall", off by default, `moreSettings` -> this page). It is in the rotation only when at least one album is live (4.1).

---

## 4. Kiosk design

Component `slides/PhotoWallSlide.jsx`. Roles/fonts only; image areas sit on `--panel`/`--panel2` with the photo's `dominant` colour as the loading fill; **no blur, backdrop-filter, blend mode, infinite animation or shadow blur**. Photo changes are one finite cross-fade (opacity, 500 ms); `kenBurns` (off by default, only under "Lively" motion) is one finite slow `transform: scale` over the photo's seconds, never looped. Minimal motion / reduced motion: instant swaps. Images use `loading="eager"` for the next page only (pre-decoded off-screen at tile size), the Pi never holds more than 2 pages in memory.

### 4.1 Layouts (landscape, panel ~1240x820; floors per C6)

```
single                     grid (4)                 collage (L+P+P)         spotlight
┌────────────────────┐    ┌──────────┬─────────┐   ┌───────────┬─────┐    ┌──────────────┬──┐
│                    │    │  photo   │  photo  │   │  big      │ p   │    │              │s1│
│     photo          │    ├──────────┼─────────┤   │  photo    ├─────┤    │  big photo   │s2│
│  (contain, tinted  │    │  photo   │  photo  │   │           │ p   │    │              │s3│
│   background)      │    └──────────┴─────────┘   └───────────┴─────┘    └──────────────┴──┘
│ ▁▁ caption 40px ▁▁ │     caption chip per tile    captions on big tile    caption under big
└────────────────────┘     (>= 28 px, 2 lines max)   + chips on small ones   strip = next 3 (static)
 [Purim party] album chip top-left, 28 px, static (shown the whole time)
```

- **single**: `contain` on a role-coloured background (no blur fill); caption band at the bottom: caption 40 px (floor 30), 2 lines then ellipsis at a word break, scrim = a plain linear-gradient (no blur), caption in `--text` on the scrim.
- **grid** 2/4/6: equal cells, `cover` + `focus`; captions as bottom chips >= 28 px **only when the cell is at least 300 px wide**, otherwise captions are skipped for that tile (never unreadable text). 6 tiles on a 4K TV are fine; on a small panel the layout drops to 4.
- **collage**: `collageLayout` (2.3); captions on the big tile only (>= 32 px) and on small tiles when >= 300 px wide.
- **spotlight**: big photo (about 78% width) with caption; a static strip of the next 3 thumbnails (`tile` variant); the strip advances with each photo (instant, not scrolled).
- Portrait (900x1600): single = full panel; grid = 1x2 / 2x2 / 2x3; collage = one big on top + two below; spotlight = big on top + a strip below. Same floors.
- **Slide time** = pages x `secondsPerPhoto` capped by `maxSecondsPerVisit`; it asks the rotation with `onRequestDuration` (as PDF/Google Photos do) and the cursor continues on the next pass.

### 4.2 States

| State | Behaviour |
|---|---|
| No live album / `paused` / no approved photo | row not in rotation (filter in `App.jsx` like Birthdays); admin preview shows labelled sample photos |
| Photo file missing / 404 | the tile is dropped from the plan and the next photo takes its place (no broken-image icons); if fewer than the layout needs, the layout steps down (collage -> grid -> single) |
| One photo in the album | `single` regardless of layout |
| Caption empty | no caption band at all |
| Caption long Hebrew + English | each language is its own line, shrinks to the floor, then clamps |
| Album window ended | not live; archive sweep after `retentionDays` |
| Many albums live | rotate one album per visit, newest first, each visit shows that album's chip |
| Live view | only photos of albums with `liveView` on and `settings.liveView` on; otherwise the viewer's kiosk simply has no PHOTO_WALL row |

---

## 5. API + permissions

All under `/api/photowall`, mounted after `requireAuth` + CSRF + limiter; JSON bodies 32 kB; photo upload is its own multer instance (memory, 25 MB, one `photo` file).

| Method + path | Capability |
|---|---|
| `GET /api/photowall` (file for admin; `?kiosk=1` is not a thing: the kiosk reads `/api/state`) | any signed-in |
| `POST /api/photowall/albums`, `PUT/DELETE /api/photowall/albums/:id` | `photowall.edit` |
| `POST /api/photowall/albums/:id/photos` (multipart, one file; status = `approved`, or `pending` when moderation is on and the caller lacks `photowall.moderate`) | `photowall.edit` |
| `PUT /api/photowall/photos/:id` (caption, focus, position, hidden) | `photowall.edit` (own `pending` photo always) |
| `POST /api/photowall/photos/:id/decide` `{ status: 'approved'|'hidden' }`, `DELETE /api/photowall/photos/:id` | `photowall.moderate` (delete also `photowall.edit`) |
| `PUT /api/photowall/settings` | `photowall.edit`; `retentionDays: 0` and `liveView` only admins |
| `GET /private/photowall/<id>-<variant>.jpg` | `privateFileGate` (2.4) |

SSE `photowall-update` (kiosk view only: live albums, approved photos, **no** creator ids). `/api/state` gains `photowall`. Permissions per C3; `photowall.moderate` is **not** in any preset (a person is granted it, admins have it). Undo kinds: `photowall.album.save`, `photowall.photo.save` (metadata only; **deleting a photo is not undoable** because the file is gone: the confirm dialog says so, and "Hide" is the reversible choice).

---

## 6. Security and privacy

- **Class P3** everywhere (C4): gated folder, no public path, EXIF/GPS stripped (the single most important step: phone photos carry home/school coordinates), random names, no original names, not in the Google Photos pipeline, never in push, support views, or the shared cache.
- **Student photos**: per-album `liveView` default off; per-album `retentionDays` (default 30 days after `showUntil`) so photos do not live forever; "Delete album" and org delete purge the files; the **admin sees "Photos will be deleted on <date>"** on every album; a one-tap "Pause Photo Wall" hides everything at once (state, not data).
- **Moderation** is optional and role-based; the uploader's name is visible to moderators only; hidden is reversible, delete is final.
- **Upload hardening**: content sniff, pixel limit, size limit, one-at-a-time processing, per-user rate limit (60 uploads / 10 min), org quotas (photos and bytes), polyglot test files rejected, nothing is ever served from the upload directory with a guessed content type, decompression-bomb safe via `limitInputPixels`.
- **XSS**: captions and titles are React text only. No HTML, markdown, links or URL fields. File names never reach the page.
- **Gate correctness**: the same 404 for "missing" and "not allowed"; the viewer-cookie path checks the album's `liveView` per file; tests for each caller type.
- **Logs**: History lines are name-free and photo-free ("Added 25 photos to an album", never file or caption text); the activity row stores counts only.
- Captions that name students are P2: in a Mode L org the whole `photowall.json` stays on the box (7).

---

## 7. SaaS fit

- Doc `photowall` per org (C1); files in `org/<id>/private/photowall/` (never the public `uploads` path, never a path from a request, `orgPath(ctx, ...)` only); quota `tenants.limits.photoWallMb` (default 1000) shown on the page; feature flag `photoWall`.
- **Privacy mode** (new, ties to CLOUD-PLAN 9): photos of identifiable children are not "names", but a school that chose Mode L (names stay on the box) will expect the **same for faces**. Recommendation: P3 follows the org's names mode: Mode L = `photowall.json` and the images stay on the People-box Pi, uploaded through the People page tunnel; Mode C = cloud Storage, private bucket, short-lived signed URLs, per-org encryption at rest. In Mode L, a second screen without the People box skips Photo Wall (same rule as Birthdays/Chazan, CLOUD-PLAN 9.7). This is the biggest open decision (Q6).
- Vercel body limit (~4.5 MB): in the cloud the browser uploads straight to Storage with a signed URL and a `finalize` call runs the same `saveImage` pipeline (CLOUD-PLAN 13.1); the client-side 2400 px downscale keeps files under the limit anyway.
- Retention sweep and orphan sweep become org steps of `/api/cron/tick`.
- No names in code: album titles, captions, wording ("Waiting for approval") live in data/one copy table.

---

## 8. Tests

`test/photoWall.test.js` (pure): normaliser limits and hostile input; `liveAlbums` (window edges, DST, archived, no approved photo); `orderPhotos` manual/newest/random (seeded, stable); `planVisit` (cursor wraps, time cap, per-page counts for each layout, album of 1/2/150); `collageLayout` property test over random orientation mixes (no overlap, inside box, >= 92% coverage, <= 40% crop, falls back to grid); `retentionDue`; moderation state machine (pending -> approved/hidden, uploader cannot self-approve when moderation on); live filter; caption fit model at the C6 floors with 100-char Hebrew+English.
`test/privateImages.test.js` (uses `TACHTACH_DATA_DIR`): accepts JPEG/PNG/WebP; **rejects** GIF, SVG, HEIC, PDF, an HTML file named `.jpg`, a JPEG with trailing script, a 100 MP image, a zero-byte file; output has **no EXIF/GPS** (build a fixture with GPS tags and assert `sharp().metadata()` has none) and orientation is applied; three variants with expected max edges; file names are uuid-based with no original name; modes 0600/0700; semaphore serialises 5 parallel saves; `deleteImage` removes all variants; `sweepOrphans` respects the 24-hour grace.
`test/photoWallRoutes.test.js`: capability matrix incl. `photowall.moderate`; pending vs approved on upload by caller; quota and rate limits; delete cascade; undo kinds; gate: kiosk loopback OK, admin OK, anonymous 404, viewer cookie OK only for a `liveView` album, proxy-header request (`X-Forwarded-For`) is not mistaken for the kiosk.
`test/live.test.js`: `photowall` key absent unless `liveView`; no creator ids. `test/screenDesign.test.js` lint for `PhotoWallSlide.jsx`. Manual: 25 phone photos upload on 4G, real Pi decode of 4K single photos, 4 sizes x 2 orientations screenshot (programmatic fit first).

---

## 9. Size estimate: **XL** (about 8 days) — split into two shippable phases

- **Phase 1 (L, ~5 d)**: private image store + gate + pipeline tests (1.5 d), store/routes/retention/quota (1 d), admin albums + upload + captions + hide + settings (1.75 d), kiosk `single` + `grid` + states + `planVisit` (1 d), registry/permissions/live/search/help/docs (0.5 d, partly overlapping).
- **Phase 2 (M, ~3 d)**: `collage` + `spotlight`, moderation inbox + `photowall.moderate`, Ken Burns (Lively only), org quota UI.
Spec 3 (Mazel Tov) needs only the Phase 1 private image store (1.5 d).

---

## 10. Open questions (full text in QUESTIONS-FOR-OWNER.md)

1. Is a private, curated Photo Wall wanted **in addition** to the Google Photos slide (recommended), or should the Photo Wall be able to import a Google album once (copy, then curate)? (Recommended: additional, no import in v1.)
2. Moderation: build it now (Phase 2) or only the simple "any editor can hide"?
3. Default retention (30 days after the album ends) and the "keep forever" option (admin only)?
4. Which layouts first: single + grid (Phase 1), collage + spotlight (Phase 2)?
5. Captions: English + Hebrew optional (as specced) or one field?
6. **Photos and Mode L**: should student photos follow the "names stay on the box" rule (recommended) or may they sit in the cloud?
7. Guests uploading by QR/link: **not** in v1 (privacy risk). Agree?
