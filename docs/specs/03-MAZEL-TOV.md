# Spec 3 — Mazel Tov slide(s)

Status: SPEC (not built). Shared rules: [README.md](README.md) (C1-C9). Photos share the private-image pipeline defined in [04-PHOTO-WALL.md](04-PHOTO-WALL.md) section 2.4 (build that first).

## 0. What exists today

- **Birthdays** is the closest sibling: names come from the roster (`roster.json`, class P2), a built-in slide is only in the rotation when it has something to say (`App.jsx` filter), finite celebration entrance (`BirthdaysSlide.jsx`), live viewers get only the people relevant today (`live.js` `viewerRoster`).
- **Takeover styles** `simcha`, `celebration`, `siyum`, `welcome` (group "Moments") already draw the art (`takeover/art.js` `simcha`); `takeoverStyles.js` lists them.
- **Virtual announcement items**: `kiddushLevana.js` `autoItemsFor()` produces announcement-shaped items that never enter `announcements.json` and flow through `selectActive`/`pickTakeover` like real ones. This is the pattern for a **takeover option without putting names into the announcements document** (which, in the cloud's "Mode L", would leave the school's box).
- Today a simcha is posted by hand as an Announcement (free text, any layout). It works, but there is no photo, no expiry preset by occasion, no one-tap, and the student/family names land in `announcements.json` (synced to the cloud, shown in History).

---

## 1. User story (plain English)

> "Rabbi Cohen's son just got engaged. In the office I tap **＋ > Mazel Tov**, tap the **Engagement** card, type the name ('Moshe Cohen'), and (if the family agreed) pick a photo from my phone. The preview shows a big **מזל טוב / Mazel Tov**, the names, and 'on the engagement'. It will show until Thursday night by itself. I tap **Post**. It is on the TV in the rotation within seconds. If it should stop everything for ten minutes at lunch, I switch on **Also show full screen for 10 minutes**.
>
> Next week there are three simchas at once: the slide shows them together (or in pages of four), each with its photo. When a simcha expires its photo is deleted from the screen box too."

---

## 2. Data model + file

### 2.1 `data/simchas.json`, store `src/server/simchaStore.js` (C1). Class **P2** names, **P3** photo

```json
{ "version": 1,
  "settings": { "photos": true, "takeoverStyle": "simcha", "liveNames": true, "livePhotos": false, "maxShown": 4 },
  "items": [ {
    "id": "uuid", "createdAt": "ISO", "createdById": "userId",        // creator by id only, never shown on the kiosk
    "type": "engagement",                                              // key in the SIMCHA_TYPES table (2.2)
    "names": "Moshe Cohen",                                            // line 1, <= 80 chars, P2
    "namesHe": "משה כהן",                                              // optional Hebrew spelling, <= 80
    "detail": "",  "detailHe": "",                                     // optional second line; empty = the type's phrase
    "from": "", "fromHe": "",                                          // optional "From the whole yeshiva" line, <= 60
    "eventDate": "2026-11-12",                                         // optional, shown as a date line when set
    "showFrom": "2026-10-26", "showUntil": "2026-10-29",               // inclusive dates in the org time zone
    "photo": { "id": "p-uuid", "focus": "top", "w": 1200, "h": 1500 } | null,
    "takeover": { "on": false, "minutes": 10, "at": null } ,           // 'at' = ISO start instant or null = at once
    "banner": false,
    "archivedAt": null
  } ] }
```

Limits: 200 items, `names` 80, `detail` 120, `from` 60, a record over 4 kB is refused, `showUntil - showFrom <= 30 days`, `takeover.minutes` in {5, 10, 15, 30}, one photo per item. Unknown keys dropped. Creator id kept for the "own undo" rule, never serialised to the kiosk (`forKiosk` strips it, like the `STAFF_FIELDS` rule in `live.js`).

### 2.2 The wording table (ONE table, `src/shared/simchaCopy.js`, C2)

```js
SIMCHA_TYPES = {
  engagement:  { en: 'on the engagement',        he: 'לרגל האירוסין',   icon: 'ring',   defaultDays: 3, sample: 'Sample Family' },
  wedding:     { en: 'on the wedding',           he: 'לרגל החתונה',     icon: 'chuppah',defaultDays: 2 },
  barMitzvah:  { en: 'on the Bar Mitzvah',       he: 'לרגל הבר מצוה',   icon: 'torah',  defaultDays: 3 },
  birth:       { en: 'on the birth of a baby',   he: 'להולדת התינוק/ת', icon: 'baby',   defaultDays: 7 },     // gender wording: Q
  bris:        { en: 'on the Bris',              he: 'לרגל הברית',      icon: 'baby',   defaultDays: 2 },
  pidyon:      { en: 'on the Pidyon HaBen',      he: 'לרגל פדיון הבן',  icon: 'baby',   defaultDays: 2 },
  upsherin:    { en: 'on the Upsherin',          he: 'לרגל האופשערניש', icon: 'star',   defaultDays: 2 },
  siyum:       { en: 'on the Siyum',             he: 'לרגל הסיום',      icon: 'book',   defaultDays: 1 },
  graduation:  { en: 'on the graduation',        he: 'לרגל הסיום',      icon: 'star',   defaultDays: 1 },
  other:       { en: '',                         he: '',                icon: 'star',   defaultDays: 3 },
}
```
Phrases are **data in one table** so a native speaker (and, later, an org) can correct wording in one place; Hebrew above is a first draft to confirm (marked for the same native-speaker pass as `stageStrings.js`). `other` = the person types the whole detail line. No type, name, hall or minhag is hard-coded elsewhere.

### 2.3 Pure module `src/shared/simchas.js` (+ tests)

`normalizeSimcha`, `normalizeFile`, `activeOn(items, dateISO)` (inclusive dates, archived excluded, sorted newest first, capped at `maxShown * 3`), `pagesOf(active, perPage)`, `takeoverItems(items, now, tz)` (virtual announcement-shaped items for the ones whose takeover window is open, valid under `announcements-model.js` so `selectActive`/`pickTakeover` accept them, id `simcha:<id>`, **never written to announcements.json**), `forKiosk(file, dateISO, {livePhotos})`, `displayLines(item, lang)` (what each line says).

### 2.4 Photos

Stored by the shared private-image store (Spec 4, 2.4): gated folder `data/private/simchas/<random>.jpg`, served only through `kioskGate`; re-encoded by `sharp` (1200 px longest side, EXIF removed, JPEG q82), random id, no original file name. Deleting or archiving a simcha deletes its photo. **P3** rules from README C4 apply.

---

## 3. Admin UX

New admin section **Screen > Mazel Tov** (`/admin/mazel-tov`), capability `simchas.edit`. Also reachable in one tap from `＋` (Post sheet starter chip "Mazel Tov", Spec 1), and from Home quick actions.

### 3.1 Quick post (the 3-tap path), phone

```
┌ Mazel Tov ────────────────────────── ✕ ┐
│ What's the simcha?                      │
│ [💍 Engagement] [🎊 Wedding] [📜 Bar Mitzvah]
│ [👶 Birth] [✂ Upsherin] [📖 Siyum] [Other…]
│                                         │
│ Names        [ Moshe Cohen            ] │  <- focus after tapping a type; placeholder per type
│ Hebrew       + add (optional)           │
│ Photo        [ + Add photo ]  (camera / gallery)
│ ┌ How it will look ───────────────────┐ │
│ │ (live kiosk preview: hero, names,   │ │
│ │  'on the engagement', photo)        │ │
│ └─────────────────────────────────────┘ │
│ Shows until  [Thu Oct 29 ▾]  (3 days)   │  <- default from the type; chips: Tonight / 3 days / A week / Pick
│ ☐ Also show full screen for [10 min ▾]  │  <- needs announcements.takeover
│ ☐ Also as a banner                      │
│      [ Post to screen ]                 │
└─────────────────────────────────────────┘
```

Defaults: type = last used, dates from `defaultDays`, takeover off, banner off, photo none. `Post` is enabled once `names` has text. Toast: "On the screen until Thu · Undo · Edit". Photo chooser: `<input type="file" accept="image/jpeg,image/png,image/webp" capture>` (phone camera or gallery); client shows the picked picture with **focus chips** [Top] [Center] [Bottom] (keeps heads in frame, since there is no face detection) and a note "Only add a photo if the family is happy for it to be shown." Upload happens on Post (not before), with a progress bar and size error text "That photo is too big (max 10 MB). Try a smaller one."

### 3.2 The page

```
┌ Mazel Tov ───────────────── [+ New] ┐
│ ● On the screen now (2)               │
│  💍 Moshe Cohen · engagement · until Thu       ✎  ⏸  ✕
│  👶 Baby boy, The Levy family · until Mon      ✎  ⏸  ✕
│ ○ Coming up (1)  ·  ○ Past 30 days (4)  [Post again]
│ ─────────────────────────────────────── │
│ ▾ Settings                              │
│   ● Show photos on the screen           │
│   ● Show on the live view   ☐ photos too│   <- live view follows the org's names choice (4.5)
│   Show at most [4] at once (more pages in)
└─────────────────────────────────────────┘
```

Rows have: edit (the same sheet), **Pause** (hides without deleting), delete with Undo toast. "Past" has **Post again** (new dates, same text/photo). Editing a photo replaces the file. Empty state: "No simchas right now. Tap + New to add a Mazel Tov." The Slides list gets a built-in row `MAZEL_TOV` (on by default, like Birthdays, because it is only in the rotation when something is active), pencil goes to this page.

Desktop: two columns (list left, big preview right). All text inputs 16 px, buttons >= 44 px.

---

## 4. Kiosk design

Component `slides/MazelTovSlide.jsx`; row in the rotation only when `activeOn(items, today).length > 0` (filter beside Birthdays in `App.jsx`). Roles/fonts only; finite entrance (hero scales in, content fades up, static ornament; nothing loops); entrance skipped under Minimal motion; confetti is **not** used here (Birthdays owns that look; this page is calmer and works with photos); graphics Off = no ornaments.

### 4.1 One simcha (landscape, panel ~1240x820)

```
┌───────────────────────────────────────────────────────┐
│  ┌─────────────┐   מזל טוב!                           │  hero Hebrew 120 px (Torah-text role), accent
│  │   photo     │   MAZEL TOV                          │  64 px
│  │  (rounded,  │                                      │
│  │  border)    │   Moshe Cohen                        │  names: Fit to 2 lines, 88 -> floor 52
│  │  440 x 560  │   on the engagement                  │  detail 44 (floor 34)
│  └─────────────┘   לרגל האירוסין                      │  Hebrew phrase 44
│                    From the whole yeshiva             │  from line 32 (floor 26)
└───────────────────────────────────────────────────────┘
```
No photo -> the text block centres, the ornament (static, role-coloured) fills the left. Photo is `object-fit: cover` with `object-position` from `focus`, rounded corners, `--line` border, **no shadow/blur**; if the file fails to load the layout silently becomes the no-photo layout (never a broken-image icon).

### 4.2 Two to four simchas

2: two cards side by side (photo 300x380 above names 52 floor 36). 3-4: 2x2 grid (photo 220x220 round-cornered, names 44 floor 32). Each card: names (<= 3 lines then ellipsis at the floor, never mid-word clip), one phrase line (language per `settings.language`, both when there is room). Hero "מזל טוב! / MAZEL TOV" shrinks to a header band (72 px). 5+ -> pages of `maxShown` (default 4), each page 8 s, "1 / 2" as plain text, the slide asks the rotation for `pages x 8 s` with `onRequestDuration` (same as `Paged.jsx`/PDF slide), transitions are finite cross-fades.

### 4.3 Portrait (900x1600)

One column: hero, photo (full width up to 640 px tall), names (Fit, floor 56), phrase, from. 2-4: stacked cards (photo left 220x220, text right). Floors as C6.

### 4.4 Takeover option

`takeoverItems()` yields a virtual announcement (`display: 'takeover'`, `look.style` from `settings.takeoverStyle` default `simcha`, layout "Big words": headline `MAZEL TOV / מזל טוב`, line = names + phrase) for `minutes` from `at` (or from creation). It uses the existing stage, conflict rules (`findTakeoverConflicts`) and the Animation setting, so nothing new is drawn. **v1: no photo in the takeover** (the stage's side-graphic box is for style art; a photo needs a layout change, Q5). Capability `announcements.takeover` required to switch it on.

### 4.5 Live view

`VIEWER_KEYS` + `'simchas'` and the filter `viewerSimchas`: only items active today (`activeOn`), no `createdById`, `photo` removed unless `settings.livePhotos`, and **whole key dropped when `settings.liveNames === false`**. Photo URLs for viewers resolve through `kioskGate` (viewer cookie OK), never a public path.

### 4.6 States

| State | Behaviour |
|---|---|
| None active | not in rotation; admin preview shows a clearly-marked sample |
| Photo missing/failed | no-photo layout |
| Long names (80 chars) / many names | Fit -> floor -> clamp with ellipsis at a word break |
| Hebrew only | Hebrew hero + `namesHe`/phrase only; English omitted, layout recentres |
| English only | the reverse |
| `other` type with no detail | names only, hero stays |
| Banner switched on | a banner line "Mazel Tov Moshe Cohen on the engagement" (virtual banner item, same mechanism) |
| Minimal motion / graphics off | static |

---

## 5. API + permissions

| Method + path | Notes | Capability |
|---|---|---|
| `GET /api/simchas` | the file (admin) | any signed-in (read, like roster) |
| `POST /api/simchas` | create one; JSON <= 8 kB | `simchas.edit` |
| `PUT /api/simchas/:id`, `DELETE /api/simchas/:id`, `POST /api/simchas/:id/pause` | validated by shared normaliser | `simchas.edit` (own record within 30 min also allowed to a poster, `canUndoOwn`-style, Q8) |
| `PUT /api/simchas/settings` | `{photos, liveNames, livePhotos, maxShown, takeoverStyle}` | `simchas.edit` |
| `POST /api/simchas/:id/photo` | multipart `photo` <= 10 MB, one file | `simchas.edit` |
| `DELETE /api/simchas/:id/photo` | | `simchas.edit` |
| `GET /private/simchas/:file` | the gated image | `kioskGate` |
| takeover on | body `takeover.on = true` additionally needs | `announcements.takeover` |

SSE `simchas-update` (kiosk view). `/api/state` gains `simchas = forKiosk(...)`. Permissions edits per C3; **Messages-only preset includes `simchas.edit`** (recommended: a Mazel Tov is a message, Q8). Undo kinds `simcha.create/edit/delete` (shared). The router mounts with `express.json({ limit: '16kb' })`.

---

## 6. Security and privacy

- Classes: names/detail/from/eventDate **P2**, photo **P3** (C4). In History/activity: lines are name-free ("Added a Mazel Tov (engagement)"); undo snapshots of P2 records stay **on the box that holds names** (CLOUD-PLAN 9.6 "local undo on the People page"), never in the cloud `undo_records` in Mode L.
- Not in push notifications, support-visit views, exports for support, or the shared cache.
- Text is React text; no HTML/URL fields exist. Names are never used in file names or log lines.
- Upload: content sniff (JPEG/PNG/WebP only; **no GIF, SVG, HEIC**: the browser converts HEIC from iPhones when `accept` lists only jpeg/png/webp, and the server refuses anything else with a plain message), `sharp` re-encode with `limitInputPixels` (60 MP), max edge 1200, EXIF/GPS stripped, random id, written with 0600 permissions, folder 0700 (`dataPerms.js`). One photo per record; orphan sweep in `cleanup.js` (photo not referenced by any record for 24 h is removed).
- Expiry **is a privacy control**: archive on `showUntil + 1 day`, purge archived records and photos after 30 days (setting later). "Delete" is immediate and also removes the file.
- Rate limit per user: 20 creates / hour. Body limits as 5.
- Live view: allow-list (4.5), photos off by default.
- Consent: the sheet shows the one-line reminder; recording a consent tick is Q4 (recommendation: reminder only, no stored consent, because the school already has its own photo-permission process).

---

## 7. SaaS fit

- Doc `simchas` per org; photos under `org/<id>/private/simchas/` in the cloud (never the public uploads path), served via short-lived signed URL behind the device token / viewer cookie.
- **Names mode**: Mode L: `simchas.json` + photos live on the People-box Pi exactly like `roster.json`/`chazan.json`; the Mazel Tov admin page is served by the Pi's People page (CLOUD-PLAN 9.4) and the cloud sees only "a simcha was added (count)". The Mode L test "no outgoing body contains a roster field" is extended with the simcha fields. Mode C: the doc is stored encrypted like `people` (per-org DEK, associated data `org_id + id`), photos encrypted at rest by Storage, plus the signed-URL rule.
- Other screens of the org in Mode L: skip simchas (same rule as birthdays, CLOUD-PLAN 9.7).
- No names in code: the table in 2.2 has no school names; sample content for previews is "Sample Family".
- Feature flag `mazelTov`; capability per C3; org setting `liveNames` mirrors the org-wide names-on-live-view choice.

---

## 8. Tests

`test/simchas.test.js`: normaliser (limits, control chars, unknown keys, date order, 30-day cap, `takeover.minutes` enum), `activeOn` boundaries (inclusive dates, DST, org tz), pages, `takeoverItems` output accepted by `announcements-model.js` normaliser and by `selectActive`/`pickTakeover` and **absent from `announcements.json`**, `forKiosk` removes creator id, `displayLines` per language/type including `other` and Hebrew-only, copy table has both languages for every type. `test/live.test.js`: viewer state has only active items, no photo when `livePhotos` off, key absent when `liveNames` off. `test/permissionsCaps.test.js`: preset matrix; takeover flag needs the takeover capability. `test/simchaPhoto.test.js` (uses `TACHTACH_DATA_DIR`): rejects GIF/SVG/PDF renamed `.jpg`, re-encoded output has no EXIF/GPS (read with `sharp().metadata()`), size/pixel limits, random file names, delete cascade, orphan sweep, gate (`/private/...` 404 without kiosk/viewer/admin). `test/screenDesign.test.js` lint for `MazelTovSlide.jsx`; fit model test with 4 x 80-char Hebrew+English names asserts floors. Privacy test: after creating a simcha, grep `activity.json` and the SSE payload for admins without `simchas.edit` for the name string (must not appear in activity; must appear only in `/api/simchas` and the kiosk state).

---

## 9. Size estimate: **M** (2.5-3 days) **plus** the shared private-image store (counted in Spec 4)

Pure module + copy + tests (0.75 d), store + routes + photo upload + gate + cleanup (0.75 d), `MazelTovSlide` landscape/portrait/pages/states (1 d), admin page + quick sheet + registry/permissions/live/search/help/docs (0.75 d), checks (0.25 d).

---

## 10. Open questions (full text in QUESTIONS-FOR-OWNER.md)

1. Occasion list: is the list in 2.2 right (add Kiddush, Chanukas HaBayis, "new student welcome", Yahrzeit is NOT a simcha and belongs to the memorial style)?
2. Birth wording: one phrase for a boy/girl ("the birth of a baby"), or boy/girl choices?
3. Take-over at once (default) or at a chosen time (lunch)? Default length 10 minutes OK?
4. Photo consent: reminder text only (recommended) or a tick box stored with the record?
5. Photo inside the takeover version (needs a new layout): later?
6. Which names appear: full names as typed (recommended; free text) or force first name + last initial like birthdays?
7. Should "Messages only" people be able to post Mazel Tov (recommended yes)?
8. Live view: names yes (matches birthdays today), photos no (recommended)?
