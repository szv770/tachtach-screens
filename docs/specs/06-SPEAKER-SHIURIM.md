# Spec 6 — Speaker / Shiurim slides

Status: SPEC (not built). Shared rules: [README.md](README.md) (C1-C9). Photos use the private image store from [04-PHOTO-WALL.md](04-PHOTO-WALL.md) section 2.4.

## 0. What exists today

- The **schedule** knows what happens when (`schedule.json` weekly entries, `schedule-dates.json` per-date, categories incl. `Shiur`/`Seder` of kind `seder`, groups, `tefila` tag, stages/alerts). An entry has name, Hebrew name, time, end time, category, days, groups, alert options. It has **no "who gives it" and no "where"** field.
- The **chazan** feature already shows a person's name on a schedule row (rail card + names on `ScheduleSlide` rows: Whole day measures and drops them if the type would shrink; Timeline/Focus use a character budget; `showOnSchedule` switch). That mechanism is reused for a rebbe's name on a shiur row.
- **Announcements** can announce a guest (Event layout: day, time, place) with no photo and no memory (re-typed each time).
- The takeover style group "Moments" includes `welcome`; virtual announcement items (`kiddushLevana.js`) let a feature raise a takeover without writing to `announcements.json` (used by Mazel Tov, spec 3).
- Staff and speakers are **adults** (class P1, README C4): their names/photos are not student data.

---

## 1. User story (plain English)

> "Every week the same rebbeim give the same shiurim: Rabbi A gives Gemara on Sunday and Tuesday at 8:15 PM in the Beis Medrash, Rabbi B gives Halacha Mon-Thu at 1:30. I enter each shiur **once** (who, what, where, which days, what time), optionally linked to the block in the schedule so the time always matches. The screen shows **Today's shiurim** in time order with the rebbe's photo and room, and a **By rebbe** page for the week. On the schedule page the shiur row says 'Rabbi A · Beis Medrash' under its name.
>
> When a guest speaker is coming Thursday, I tap **＋ > Guest speaker**, type his name and topic, add his photo and the time, and it appears three days ahead as a hero card ('Guest speaker · Thursday 8:15 PM · Beis Medrash'), becomes 'Tonight' on the day, and can take over the whole screen for ten minutes at lunch."

---

## 2. Data model + file

### 2.1 `data/shiurim.json`, store `src/server/shiurimStore.js` (C1). Class **P1** (staff/adult names and photos)

```json
{ "version": 1,
  "settings": { "view": "both", "showOnSchedule": true, "showPhotos": true, "guestLeadDays": 3, "liveView": true },
  "people": [ { "id": "uuid", "name": "Rabbi Sample", "nameHe": "הרב לדוגמה", "photo": { "id": "uuid", "focus": "top" } | null } ],
  "shiurim": [ {
    "id": "uuid", "personId": "uuid",
    "title": "Gemara - Bava Metzia", "titleHe": "גמרא - בבא מציעא",
    "place": "Beis Medrash", "placeHe": "בית המדרש",
    "when": { "kind": "weekly", "days": ["Sun","Tue"], "start": "20:15", "end": "21:00" }
         | { "kind": "linked", "entryId": "<schedule weekly entry id>" },
    "groups": [],                       // schedule group ids (scheduleGroups.js); [] = everyone. Ignored when linked (the block's groups win)
    "season": { "from": "2026-11-01", "until": "2027-03-15" } | null,   // optional "winter zman"
    "enabled": true, "note": ""
  } ],
  "guests": [ {
    "id": "uuid", "name": "Rabbi Guest", "nameHe": "", "title": "Guest speaker", "titleHe": "אורח",   // title is free text so 'Rav', 'Dr.', 'Mr.' work
    "topic": "...", "topicHe": "", "bio": "",                                  // bio <= 200
    "place": "Zal", "placeHe": "", "date": "2026-11-05", "start": "20:15", "end": "21:15",
    "showFrom": null,                    // null = guestLeadDays before `date`
    "photo": { "id": "uuid", "focus": "top" } | null,
    "takeover": { "on": false, "minutes": 10, "at": null }, "banner": false,
    "archivedAt": null
  } ] }
```

Limits: 100 people, 300 shiurim, 100 guests (archived guests older than 60 days pruned, their photos deleted), `name`/`title`/`place` 60, `topic` 100, `bio` 200, `days` from the fixed day-code list, `HH:MM` times with `end > start`, `season.until >= from`, `guestLeadDays` 0-14, file <= 256 kB. Photo: one per person/guest, stored by the private image store as `kind: 'speaker'` (class P1: the gate also allows live viewers when `liveView`).

### 2.2 Pure module `src/shared/shiurim.js` (+ `shiurimCopy.js`, ONE wording table, C2)

```js
shiurimOn(file, dateISO, { schedule, scheduleDates, groupsOn })  -> [{ shiur, person, start, end, linked, cancelled }] sorted by start
//  weekly: today's weekday in days and inside season; linked: the schedule block's time, and if that block is not in the date's
//  EFFECTIVE schedule (a per-date override removed it) -> cancelled:true (not shown) so a cancelled shiur disappears from both places
byRebbe(file, dateISO, ctx)            -> [{ person, lines: [{ days: ['Sun','Tue'], start, end, title, place }] }]   // the week view, collapses equal times
guestsActive(file, now, tz)            -> [{ guest, phase: 'ahead'|'today'|'now'|'over', whenWords }]    // whenWords from the copy table: 'Thursday', 'Tomorrow', 'Tonight', 'Today 8:15 PM'
currentNext(list, now)                 // for Now/Next highlight
rowTag(file, entry, dateISO)           // the short 'Rabbi Sample · Beis Medrash' line for a schedule row (budgeted like chazan names)
guestTakeoverItems(file, now, tz)      // virtual announcement items (valid under announcements-model.js), never stored in announcements.json
parseShiurimText(text), formatShiurimText(file)   // import / 'Copy as text' (2.3)
normalizeFile, forKiosk(file, now)
```

### 2.3 Import format ("TachTach shiurim v1"), all-or-nothing with a dry run

```
# TachTach shiurim v1
Rabbi Sample | Gemara - Bava Metzia | Beis Medrash | Sun, Tue | 8:15 PM - 9:00 PM
Rabbi Other  | Halacha | Room 4 | Mon-Thu | 1:30 PM - 2:00 PM | season 2026-11-01..2027-03-15
Rabbi Linked | Chassidus | Zal | schedule: Seder Chassidus      # link to a weekly schedule block by name
```
Names are matched to existing people (case-insensitive, either language) or created; day ranges and Hebrew day names accepted; a copy-Claude-prompt button like the schedule's.

### 2.4 Slide rows

Two built-ins in `LATE_BUILTINS` (off by default, orders 108/109): `SHIURIM` ("Today's shiurim") and `SPEAKER` ("Guest speaker"). Both open the one admin section. `SHIURIM` is in the rotation only if `shiurimOn(today)` is non-empty (or, for `By rebbe`, any enabled shiur exists); `SPEAKER` only when `guestsActive` is non-empty.

---

## 3. Admin UX

New section **Schedule > Shiurim & speakers** (`/admin/shiurim`), capability `shiurim.edit` (C3), tabs **Shiurim · Guest speakers · People**.

### 3.1 Shiurim (grouped by rebbe)

```
┌ Shiurim & speakers ─────────── [＋ Add] [Import]┐
│ [Shiurim] [Guest speakers · 1] [People · 5]      │
│ ▾ Rabbi Sample  (2 shiurim)                       │
│    Gemara - Bava Metzia   Sun Tue  8:15–9:00 PM  Beis Medrash   ● ✎
│    Halacha                Mon–Thu  linked: 'Seder Halacha' 1:30 PM   ● ✎
│ ▾ Rabbi Other  (1)                                │
│    ...                                            │
│ ⚠ 'Chassidus': the linked schedule block was deleted. Pick a time or link another block.
│ ▾ Settings                                        │
│   View on screen  (•) Both ( ) Today ( ) By rebbe │
│   ● Show the rebbe's name on the schedule rows    │
│   ● Show photos        Guest announced [3] days ahead
└───────────────────────────────────────────────────┘
```

**Shiur sheet:**
```
┌ Shiur ─────────────────────────── ✕ ┐
│ Who      [ Rabbi Sample ▾ ]  + New person
│ What     [ Gemara - Bava Metzia ]   Hebrew +
│ Where    [ Beis Medrash ]  (recent places as chips)
│ When     (•) Own days & time   ( ) Same as a schedule block
│          [Sun][Mon][Tue][Wed][Thu][Fri]   Start [8:15 PM] End [9:00 PM]
│          or: Block [ Seder Gemara — Sun-Thu 8:15 PM ▾ ]  (time follows the schedule)
│ Who is it for?  [Everyone ▾]  (groups, only if the school uses groups)
│ ▸ More: only during [dates]   note
│ [ Save ]   [ Duplicate ]   [ Delete ]
└─────────────────────────────────────┘
```
The sheet's last line shows the sentence the kiosk will use ("Rabbi Sample · Beis Medrash · Sun, Tue 8:15 PM").

### 3.2 Guest speaker (the quick path, 3 taps from `＋`)

```
┌ Guest speaker ──────────────────── ✕ ┐
│ Name   [ Rabbi Guest ]   Hebrew +     │
│ Title  [ Guest speaker ▾ Rav / Dr. / own ]
│ Topic  [ Emunah in hard times ]       │
│ Photo  [ + Add photo ]  focus [Top][Center][Bottom]
│ When   [ Thu Nov 5 ]  [ 8:15 PM ] – [ 9:15 PM ]
│ Where  [ Zal ]                         │
│ ┌ How it will look ───────────────┐   │
│ │ (kiosk preview)                  │   │
│ └──────────────────────────────────┘   │
│ Shows from [3 days before ▾]            │
│ ☐ Full screen for [10 min ▾] at [now ▾]   (needs the takeover permission)
│ ☐ Also as a banner on the day           │
│ [ Post ]                                │
└─────────────────────────────────────────┘
```
Defaults: times from the last guest, place from recents, 3 days ahead. Toast with Undo/Edit.

### 3.3 Pairing with the schedule

- In the shiur sheet: "Same as a schedule block" picks from the weekly entries (search by name; shows days/time). The link is stored **on the shiur**, never on the schedule entry, so the schedule document is untouched (works in both names modes and keeps schedule undo simple).
- In the schedule's block sheet (`BlockSheet.jsx`) a read-only line appears when a shiur is linked: "Given by Rabbi Sample (edit)".
- Per-date change: when a date's schedule no longer contains the linked block, the shiur is **not shown that day** and the admin's Home "Coming up" notes "Shiur 'Halacha' is cancelled on Tue (schedule changed)".
- Risk to check at build time: whether per-date schedule entries keep the weekly entry's id. If not, the link falls back to matching on (name + start time) and the test table covers both.

Phone: sheets, 16 px inputs, 44 px targets. Desktop: two columns (list / live preview).

---

## 4. Kiosk design

`slides/ShiurimSlide.jsx` and `slides/SpeakerSlide.jsx`. Roles/fonts only; finite fade-in; no loops, blur, shadows; photos are circles/rounded rectangles with a `--line` border; **missing photo = a monogram circle** (first letter in the display role on `--panel2`, never a broken image or silhouette). Floors per C6.

### 4.1 Today's shiurim (landscape)

```
┌──────────────────────────────────────────────────────────────┐
│ Today's shiurim · Tuesday                    שיעורים היום · יום שלישי │  title 56
│ 1:30 PM  Halacha                  (●)  Rabbi Other      Room 4         │  time 48 bold tabular | title 40 | photo 72 | name 34 | place 30
│ 8:15 PM  Gemara - Bava Metzia ◄NOW (●) Rabbi Sample     Beis Medrash   │  current row: accent fill; next: accent edge
│ 8:15 PM  Chassidus                (●)  Rabbi Linked     Zal            │
└──────────────────────────────────────────────────────────────┘
```
Columns shrink in a fixed order when width is short (place wraps to 2 lines, then the photo drops, never the time or title); text floors: time 40, title 32, name 28, place 26. Rows that do not fit at the floors **page** (`Paged.jsx`, 8 s per page, `onRequestDuration`), never silently cut. Both languages: Hebrew title on its own line when both exist and there is room, else the language of `settings.language`.

### 4.2 By rebbe (week)

Cards (3 per page landscape, 2 portrait, each page 9 s): photo 140, name 44, then lines `Sun · Tue  8:15 PM  Gemara - Bava Metzia · Beis Medrash` (30, floor 26), equal-time days collapse to `Sun · Tue`. A card with more than 5 lines splits across pages. `view: 'both'` = Today list then By rebbe, one cross-fade between, total time asked from the rotation.

### 4.3 Guest speaker hero

```
┌───────────────────────────────────────────────────────────────┐
│  ┌─────────────┐   GUEST SPEAKER           אורח מכובד          │  kicker 32 accent
│  │   photo     │   Rabbi Guest                                 │  name Fit 96 -> 56
│  │  460 x 560  │   Emunah in hard times                        │  topic 48 (2 lines, floor 34)
│  └─────────────┘   Thursday · 8:15 PM · Zal                    │  when 52 (the key fact), place 40
│                    starts in 2 h 10 min  (on the day)          │  countdown 40, minute-level (reuses quickCountdown)
└───────────────────────────────────────────────────────────────┘
```
`whenWords` comes from the copy table: "Thursday" three days ahead, "Tomorrow", "Tonight 8:15 PM" in the evening, "Today", "Now" while it runs; Hebrew equivalents; dates over a week away show "Thu Nov 12". Bio (<= 200) appears only if it fits at >= 30 px; otherwise omitted. Two guests: two cards side by side (name 56, topic 36). Takeover: `guestTakeoverItems` yields a virtual announcement (style `welcome`, Big words: "Guest speaker tonight: Rabbi Guest, 8:15 PM, Zal") for `minutes`, using the normal stage and conflict rules; no photo in the takeover (v1).

### 4.4 Names on schedule rows

`rowTag()` adds "Rabbi Sample · Beis Medrash" under a linked shiur's name in the Schedule page, using the **same measuring rules as chazan names** (Whole day measures and drops if the type would shrink; Timeline/Focus character budget). Switch `settings.showOnSchedule`.

### 4.5 States

| State | Behaviour |
|---|---|
| No shiur today / no guest in window | the row is not in the rotation; admin preview shows a labelled sample |
| Photo missing | monogram circle |
| Linked block cancelled today | the shiur is not listed |
| Very long titles / names | Fit to 2 lines, floor, clamp at a word break |
| Hebrew only / English only | only that language drawn; layout re-balances |
| Season outside today's date | not listed |
| `showPhotos` off | no photo column, text widens |
| Live view | allowed (P1) incl. photos when `liveView`; no staff ids |

---

## 5. API + permissions

`/api/shiurim`, mounted after auth + CSRF + limiter; JSON 128 kB; photo multipart 10 MB (private image store `kind: 'speaker'`, 800 px max edge, `full` + `thumb` only).

| Method + path | Capability |
|---|---|
| `GET /api/shiurim` | any signed-in |
| `POST/PUT/DELETE /api/shiurim/people[/:id]` | `shiurim.edit` |
| `POST/PUT/DELETE /api/shiurim/shiurim[/:id]` | `shiurim.edit` |
| `POST/PUT/DELETE /api/shiurim/guests[/:id]` | `shiurim.edit` (takeover flag also needs `announcements.takeover`) |
| `POST/DELETE /api/shiurim/people/:id/photo`, `.../guests/:id/photo` | `shiurim.edit` |
| `POST /api/shiurim/import` `{ text, mode, dryRun }` | `shiurim.edit` |
| `PUT /api/shiurim/settings` | `shiurim.edit` |
| `GET /private/speaker/<id>-<variant>.jpg` | `privateFileGate('speaker')` |

SSE `shiurim-update`; `/api/state.shiurim = forKiosk(...)`; `VIEWER_KEYS` + `'shiurim'` with a filter (no ids of creators; photos dropped when `liveView` is off; guests only within their window). Permissions per C3 (`shiurim.edit` in `full`, section `shiurim`, RULES `/^\/api\/shiurim(\/|$)/`); a poster with `announcements.post` may add a **guest** (the quick path) even without `shiurim.edit`? Recommended **yes, via the Post sheet only** (route checks either capability for `POST /guests`); undo kinds `shiurim.save`, `guest.create/delete`.

---

## 6. Security and privacy

- Class P1: adults' names/photos are shown on the TV by design. Guests are outside people: the admin sheet reminds "Only add a photo you have permission to show." Photos follow the private-image rules (sniff, re-encode, EXIF/GPS removed, random names, gated) even though they are P1, so a visitor's photo never sits on a public path.
- All text React-only; no URLs, no HTML; no registration links in v1 (a QR to a signup page is a later, `urlRules.js`-validated addition, see question 5 below).
- Validation: enums (day codes, view), `HH:MM`, ISO dates, id formats, caps (2.1), hostile keys dropped; import is text-only with bounded line count; rate limits as other routes; per-user 30 guest posts / hour.
- Linked ids are checked against the live schedule at read time and **never trusted to exist**; a dangling link degrades to "needs attention" in admin and hidden on the kiosk.
- Retention: archived guests and their photos are purged after 60 days; deleting a person deletes their photo; "Remove photo" is one tap.
- History lines are generic ("Added a guest speaker"); a name is not needed there.

---

## 7. SaaS fit

Doc `shiurim` per org (C1), photos under `org/<id>/private/speaker/`; flag `shiurim`; titles ("Rabbi", "Rav", "Dr.") and all wording are data/one table; schedule groups and weekday set come from the org; time zone from the org's settings; not names-mode dependent (P1 stays in the cloud even in Mode L, because staff are not students; **if the owner wants rebbeim names kept local too, that is a one-line class change**, QUESTIONS Q11). Multi-screen orgs: the same doc, a future `screens` filter like Spec 1's `audience`.

---

## 8. Tests

`test/shiurim.test.js`: `shiurimOn` for weekly/linked/season/groups/cancelled-by-date; **link resolution table** (entry id kept on date override vs not, dangling link, entry disabled); `byRebbe` collapsing; `guestsActive` phases and `whenWords` (Today/Tomorrow/Tonight/weekday/date, Hebrew, org tz vs server tz, DST); `currentNext`; `rowTag` budget; parser table (English/Hebrew days, ranges, `schedule:` link, seasons, errors, hostile input, 401 lines rejected) + round trip; normaliser limits and `end > start`; `guestTakeoverItems` accepted by the announcement model and absent from `announcements.json`; `forKiosk`/live filter (no creator ids, photos dropped when off); prune of old guests deletes photos. `test/permissionsCaps.test.js` (matrix incl. a poster adding a guest via the Post path). Photo pipeline reuses `test/privateImages.test.js` plus a speaker-kind case. Fit model for 12 shiurim and 3 guests at both orientations (floors); `test/screenDesign.test.js` lint for both slide files.

---

## 9. Size estimate: **M-L** (about 4 days)

Pure module + copy + import parser + tests (1.25 d), store + routes + photo hook + purge + permissions/live (0.75 d), `ShiurimSlide` (today + by rebbe + paging) and `SpeakerSlide` (hero + two-up + countdown + takeover items) (1.25 d), schedule-row tag + `BlockSheet` read-only line (0.25 d), admin section (shiurim sheet, guest sheet, people, import, settings) + registry/search/help/docs (1 d). Depends on the private image store (Spec 4, 1.5 d, shared with Spec 3).

---

## 10. Open questions (full text in QUESTIONS-FOR-OWNER.md)

1. One admin section for both shiurim and guest speakers, two slides (as specced)?
2. Link a shiur to a schedule block (recommended) or always give it its own time?
3. Show rebbeim's photos on the TV (recommended, with a monogram when missing)?
4. Should a guest be announced automatically 3 days ahead (recommended), and is a takeover wanted for guests?
5. A QR code to a signup/info page for a guest: later?
6. Who may add a guest from the Post sheet (anyone who can post, recommended) vs only schedule editors?
7. Are rebbeim names allowed in the cloud in the "names stay on our box" mode (recommended yes: they are staff, not students)?
