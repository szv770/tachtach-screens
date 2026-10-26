# Spec 5 — Menu slide (weekly meals)

Status: SPEC (not built). Shared rules: [README.md](README.md) (C1-C9).

## 0. What exists today

Nothing for meals. Today a school puts the menu on the screen as an **Image/PDF slide** (a photo of the kitchen's sheet: not readable at distance, not today-aware, replaced by hand every week) or as an Announcement. The schedule has a `Meals` category (`scheduleStore.js` `DEFAULT_CATEGORIES`, kind `meal`) which says **when** a meal is, not **what** is served.

Patterns reused: date-resolution model of `scheduleResolution.js` (weekly + per-date override, an explicit empty day), paste/import with a dry-run preview and an AI-prompt hand-off (`schedulePaste.js`, `ScheduleImport.jsx`, `PROMPT_TYPES`), spreadsheet import with lazy `read-excel-file/browser` (`RosterPanel.jsx`), the "only in rotation when it has something" filter (`App.jsx`), `Paged.jsx` for text that must not be cut.

---

## 1. User story (plain English)

> "The kitchen sends the week's menu every Thursday as a spreadsheet. I open **Screen > Menu**, tap **Import**, paste the cells, and see 'Found 6 days, 17 meals, 54 dishes'. I tap **Use this week**. The screen now shows **Today's menu** with breakfast, lunch and dinner as big cards, today's day highlighted when it shows the week, and small tags (meat, dairy, parve, nuts) next to each dish. If the kitchen changes tomorrow's lunch, I tap Tomorrow > Lunch, edit one dish, and only that date changes. On the trip day I mark the day **No meals - trip** and the screen says so. Friday night and Shabbos lunch have their own cards on Friday and Shabbos."

---

## 2. Data model + file

### 2.1 `data/menu.json`, store `src/server/menuStore.js` (C1). Class **P0** (food, no person)

```json
{ "version": 1,
  "settings": {
    "view": "both",                                  // 'today' | 'week' | 'both'
    "tags": ["meat","dairy","parve","nuts","gluten","egg","fish","sesame"],   // which tags the org uses (subset of the table in 2.2)
    "disclaimer": "", "disclaimerHe": "",            // optional small footer, e.g. 'Ask the kitchen about allergies'. Empty = none
    "cycleWeeks": 1, "cycleStart": null              // N-week rotation: week index = floor((weekStart - cycleStart) / 7) mod N
  },
  "mealTypes": [                                      // data, never hard-coded (C2); default three; the org can rename/add (max 8)
    { "id": "breakfast", "en": "Breakfast", "he": "ארוחת בוקר", "days": ["Sun","Mon","Tue","Wed","Thu","Fri"], "from": "06:00", "to": "10:00", "time": "7:45" },
    { "id": "lunch",     "en": "Lunch",     "he": "ארוחת צהריים", "days": ["Sun","Mon","Tue","Wed","Thu","Fri"], "from": "10:00", "to": "15:00", "time": "12:30" },
    { "id": "dinner",    "en": "Dinner",    "he": "ארוחת ערב",   "days": ["Sun","Mon","Tue","Wed","Thu"],       "from": "15:00", "to": "21:00", "time": "6:00" },
    { "id": "fri-night", "en": "Friday night", "he": "סעודת ליל שבת", "days": ["Fri"],   "from": "18:00", "to": "23:59" },
    { "id": "shabbos-lunch", "en": "Shabbos lunch", "he": "סעודת שבת", "days": ["Shabbos"], "from": "11:00", "to": "16:00" },
    { "id": "seuda-3", "en": "Seudah Shlishis", "he": "סעודה שלישית", "days": ["Shabbos"], "from": "16:00", "to": "20:00" }
  ],
  "weekly": { "Sun": { "breakfast": { "items": [ { "id": "i1", "en": "Oatmeal", "he": "דייסה", "tags": ["dairy"] } ], "note": "" } }, "...": {} },
  "weeks": { "2026-11-01": { "Sun": { "...": {} } } },          // full-week override, key = the Sunday of that week
  "days":  { "2026-11-03": { "closed": true, "note": "No meals - trip", "noteHe": "", "meals": { "lunch": { "items": [ ] } } } }   // one-date override
}
```

The default `mealTypes` above are a **starter set written on first save** (so the menu works on day one and the owner's "breakfast/lunch/dinner" is satisfied); every name, time and day list is editable. No school or kitchen names. The times (`time`) are plain display text ("12:30"), not parsed.

Limits: 8 meal types, 20 dishes per meal, dish `en`/`he` 80 chars each, tags <= 6 per dish (enum), note 120, `days` overrides 120 (older than 14 days pruned on save), `weeks` 60 (older than 8 weeks pruned), file <= 256 kB.

### 2.2 The tag table (ONE table, `src/shared/menuCopy.js`, C2)

`meat` (בשרי), `dairy` (חלבי), `parve` (פרווה), `nuts` (אגוזים), `peanuts`, `gluten`, `egg`, `fish`, `sesame`, `soy`, `vegetarian`. Each: `{ id, en, he, short (<=3 letters, for the chip), kind: 'kosher'|'allergen'|'diet' }`. The org picks which appear (`settings.tags`), and a tag is always drawn as **icon letter + word**, never colour alone (accessibility). The table also holds the generic words ("Today's menu", "Tomorrow's menu", "This week", "No meals today", "Now", "Next"), English + Hebrew, one place.

### 2.3 Pure module `src/shared/menu.js` (tests: section 8)

```js
resolveDay(file, dateISO)  -> { source: 'day'|'week'|'cycle'|'weekly'|'none', closed, note, meals: [ { type, items, note } ] }
//  precedence: days[date] (present = wins, even 'closed' or empty) > weeks[weekStart] > cycle week (cycleWeeks>1) > weekly > none
//  meal types that do not apply to that weekday (mealType.days) are omitted; a meal with no items is omitted
focusDate(file, now, tz)   -> the date the Today view should show: today until the LAST meal of today has ended (to), then tomorrow;
                              a day with no meals shows the next day that has some, labelled with its weekday name
currentMeal(file, now, tz) -> { now: mealId|null, next: mealId|null } from each meal's from/to window (for the 'Now'/'Next' highlight)
parseMenuText(text), formatMenuText(file, range)   // paste format + "Copy as text" (2.4); parseSheet(rows)
normalizeFile(raw), forKiosk(file, now)            // forKiosk = today + tomorrow + this week's resolved days only (small)
```

### 2.4 Paste format ("TachTach menu v1"), forgiving on layout, strict on structure

```
# TachTach menu v1
@ every Sun-Thu                       # weekly template (or @ weekdays, @ Fri, @ Shabbos)
Breakfast: Oatmeal [dairy]; Fresh fruit; Yogurt [dairy]
Lunch: Chicken schnitzel [meat]; Rice; Green salad
Dinner: Pasta [dairy,gluten]; Garden salad

@ 2026-11-03                          # one date
Lunch: No meals - trip day            # 'No meals' / 'closed' marks the day closed with the note
@ week 2026-11-08                     # a whole week override, followed by day blocks
Sunday
 Lunch: ...
```
Items split on `;` or `|` (a comma is NOT a separator because dishes contain commas; commas inside a line are allowed), tags in `[ ]` or `( )` using ids or English/Hebrew names, any day spelling (`Sun`, `Sunday`, `יום א`, `Shabbos`), meal names matched to `mealTypes` case-insensitively in either language. **Spreadsheet paste** (tab-separated, copied from Excel/Sheets): first row = days, first column = meal names, each cell = dishes on separate lines or separated by `;`; also `.xlsx`/`.csv` picked as a file (parsed in the browser, lazy-loaded like the roster import; the server never parses a spreadsheet). All-or-nothing: any error disables Apply and is listed with its line ("Line 7: unknown meal 'Lunsh'. Did you mean Lunch?"). The AI hand-off adds a **Copy Claude prompt** for a PDF/photo of the menu, same pattern as the schedule's `PROMPT_TYPES` (the prompt carries the format and the org's current meal names and tags).

---

## 3. Admin UX

New section **Screen > Menu** (`/admin/menu`), capability `menu.edit` (C3). The slide row `MENU` (off by default) is switched in the Slides list; its pencil opens this page.

### 3.1 Week view (phone: day chips + meal cards; desktop: day columns)

```
┌ Menu ─────────────────────────── [Import] [⋯]┐
│ ‹  Week of Nov 1   ›    [This week's menu ▾]  │   <- source: 'Usual week' | 'Only this week' | 'Week 2 of 4'
│ [Sun][Mon][Tue][Wed•][Thu][Fri][Shabbos]      │   <- • = has a one-date change
│ ── Wednesday Nov 4 ───────── (today)          │
│ ┌ Breakfast · 7:45 ───────────────────── ✎ ┐ │
│ │ Oatmeal [dairy]  · Fresh fruit  · Yogurt [dairy]
│ └──────────────────────────────────────────┘ │
│ ┌ Lunch · 12:30 ──────────────── changed ✎ ┐ │   <- 'changed' chip when this date differs from the usual
│ │ Chicken schnitzel [meat] · Rice · Salad   │ │
│ └──────────────────────────────────────────┘ │
│ ┌ Dinner · 6:00 ──────────────────────── ✎ ┐ │
│ └──────────────────────────────────────────┘ │
│ [Copy day to…] [Mark no meals…] [Back to the usual menu]
│ ▾ Settings: view, tags, meals, rotation, note │
└───────────────────────────────────────────────┘
```

### 3.2 Meal sheet

```
┌ Wednesday · Lunch ──────────────── ✕ ┐
│ Apply to  (•) Only Wed Nov 4   ( ) Every Wednesday   ( ) This whole week
│ ┌ Chicken schnitzel          [meat ✓][dairy][parve][nuts]…  ↑ ↓ ✕
│ │ Hebrew: שניצל עוף
│ ├ Rice                        [..tags..]
│ └ + Add a dish   (type, Enter adds the next)
│ Note (optional)  [ Served in the zal ]
│ [ Save ]  [ Cancel ]
└─────────────────────────────────────────┘
```
Suggestions: dish names typed before in this org appear as chips (`recents`, per org, max 200, frequency-sorted), so a weekly menu is mostly tapping. "Apply to" defaults to **Only this date** on a past/future date edit and to **Every <weekday>** when editing the "Usual week" source. The sheet states in words which of the two will change (fixes the common "I changed it forever by accident" slip); Save shows an Undo toast.

### 3.3 Import

```
┌ Import menu ───────────────────────────┐
│ [Paste text or cells] [Choose .xlsx/.csv] [Copy Claude prompt]
│ ┌ (paste here) ─────────────────────┐  │
│ └───────────────────────────────────┘  │
│ Found: 6 days · 17 meals · 54 dishes · 3 tags not recognised
│ ⚠ Line 9: unknown tag "dairry" - did you mean dairy?
│ Put it in:  (•) Only the week of Nov 8  ( ) The usual week  ( ) Rotation week 2
│ How:        (•) Replace what is there  ( ) Add to it
│ [ Use this menu ]  (disabled while there are errors)
└─────────────────────────────────────────┘
```
Dry-run first (server re-parses authoritatively on apply, like the schedule paste). **Copy as text** from the week menu gives the same format back for sharing with the kitchen.

### 3.4 Settings (closed collapsible)

View (Today / Week / Both), which tags the school uses, meal names + days + times (edit/add/remove, never below one), weekly rotation (1-4 weeks + the start date shown as "This week is week 2 of 4"), optional small footer line. Everything saves with the standard `useSettingsForm` + Undo pattern; help text says "Tags help with allergies. They do not replace asking the kitchen."

Phone rules: 16 px inputs, 44 px targets, sticky Save in sheets.

---

## 4. Kiosk design

`slides/MenuSlide.jsx`. Roles and fonts only; no motion beyond one finite fade between the Today and Week pages when `view: 'both'`; Minimal motion = instant. Graphics follow the setting (a small static plate/leaf ornament, Off = none). The slide is in the rotation only if `focusDate` resolves to a non-empty day or a closed day with a note.

### 4.1 Today view, landscape (panel ~1240x820)

```
┌───────────────────────────────────────────────────────────┐
│  Today's menu · Wednesday           תפריט להיום · יום רביעי │   title 56 (Hebrew 56)
│  ┌── Breakfast 7:45 ──┐ ┌── Lunch 12:30  ◄ NOW ──┐ ┌── Dinner 6:00 ──┐
│  │ Oatmeal    [DAI]   │ │ Chicken schnitzel [MEAT]│ │ Pasta  [DAI][GLU]│   meal title 40, dishes 34 (floor 28)
│  │ Fresh fruit        │ │ Rice                    │ │ Garden salad     │   tag chips 24 min (letters+word at 28+)
│  │ Yogurt     [DAI]   │ │ Green salad             │ │                  │
│  └────────────────────┘ └─────────────────────────┘ └──────────────────┘   current meal = accent border + 'NOW'; next = 'NEXT'
│                                         Ask the kitchen about allergies   │   optional footer 24
└───────────────────────────────────────────────────────────┘
```
Fit rules (canvas px, C6 floors): meal cards are equal-width columns (up to 4; 5+ meals page in groups of 3 or 4); dish text starts at 38 and shrinks uniformly across all cards to a floor of 28; if the longest card still does not fit at 28, the **meal cards split into pages** (e.g., Breakfast+Lunch, then Dinner) and the slide asks the rotation for `pages x 9 s` (`onRequestDuration`, `Paged.jsx` style). **Dishes are never cut off or replaced by "+N more"** on the Today view (allergy safety). Hebrew dish names use the Hebrew role (nikud-safe), English the English role; both shown when both exist (Hebrew right-aligned inside the card, `dir="auto"`). Tag chips: a rounded chip with the short code **and** the word when width allows (>= 28 px text), code only below that; never colour-only.

### 4.2 Week view

```
┌────────────────────────────────────────────────────────────┐
│ This week · השבוע                                           │
│        │ Sun │ Mon │ Tue │[Wed]│ Thu │ Fri │ Shabbos │     │   today's column: accent top bar + soft fill
│ Lunch  │ Schn│ Rice│ ...                                    │   cell text 26-30, up to 3 dishes then '+2 more'
│ Dinner │ ...                                                  │
└────────────────────────────────────────────────────────────┘
```
Columns = days that have any meal (5-7); rows = meal types that appear. Cell text: dish names only (no tags, to stay legible), 30 px shrinking to a floor of 26; a cell with more than 3 dishes shows 3 and "+N more"; the footer line says "Full menu: see Today's menu". Past days are not dimmed; the **today column is highlighted**; closed days show their note in one merged cell. Portrait: days become rows, meals columns (3), same floors.

### 4.3 `both`

One slide: Today view (default 12 s, scales with the page count) then Week view (8 s) with a single cross-fade; total asked from the rotation.

### 4.4 States

| State | Behaviour |
|---|---|
| No menu at all | slide not in rotation; admin preview shows labelled sample dishes |
| Today closed (`closed`) | one big card with the note (e.g. "No meals - trip"), then tomorrow's meals below as a smaller block |
| After the last meal's `to` | Today view switches to **tomorrow** ("Tomorrow's menu"); Friday evening to Saturday uses the Shabbos meal cards (`mealTypes.days`) |
| A day with no meals (e.g. nothing planned) | skip to the next day that has some, titled with that weekday's name |
| One language only | the other is omitted, spacing re-balances |
| Dish with no tags | plain line |
| 20 dishes in one meal | paged (never truncated) |
| Disclaimer set | one footer line (>= 24 px) on the Today view only |
| Live viewer | allowed (P0), same render |

---

## 5. API + permissions

`/api/menu`, mounted after auth + CSRF + limiter, JSON limit 128 kB (import text 64 kB).

| Method + path | Capability |
|---|---|
| `GET /api/menu` | any signed-in |
| `PUT /api/menu/weekly` (whole usual week), `PUT /api/menu/weeks/:weekStart`, `DELETE /api/menu/weeks/:weekStart`, `PUT /api/menu/days/:date`, `DELETE /api/menu/days/:date` | `menu.edit` |
| `PUT /api/menu/settings` (view, tags, mealTypes, cycle, disclaimer) | `menu.edit` |
| `POST /api/menu/import` `{ text | rows, target, mode, dryRun }` | `menu.edit` |
| SSE `menu-update` (`forKiosk`), `/api/state.menu` | n/a |

Granular endpoints (not one big PUT) so two people editing different days cannot overwrite each other (`updateJSON` under the lock). Permissions per C3 (`SECTION_CAPS.menu`, `CONTENT`, RULES `/^\/api\/menu(\/|$)/`); undo kind `menu.save` (shared); search/help entries; `VIEWER_KEYS` + `'menu'` (P0; `forKiosk` already carries no staff ids).

---

## 6. Security and privacy

- P0 content; **do not put student names in dish notes** (a hint under the note field says so; a student's allergy is not data this feature stores). If a school wants "a meal for one student" they use the schedule or a private note outside the system.
- All text is React text; tags are an enum from the table; day/week keys are validated ISO dates; weekdays and meal ids are enums; unknown keys are dropped; sizes capped (2.1); `__proto__`/`constructor` keys rejected by the normaliser (same helper as `settingsMerge.js` FORBIDDEN).
- Import: text only, 64 kB, parsed with bounded loops (no catastrophic regexes: lines <= 400 chars, <= 400 lines); spreadsheets are parsed in the browser, so no file-parsing attack surface on the Pi; the preview is rendered as text.
- Rate: the mutation limiter plus 30 imports/hour/user.
- Accuracy is a safety matter (allergens): the Today view never truncates dishes (4.1); tags are advisory (stated in the admin help and the optional footer); the weekly "usual menu" vs "only this date" wording is explicit (3.2).

---

## 7. SaaS fit

Doc `menu` per org (C1); meal names/times/tags are data per org (a school with Sunday-Thursday and one with Monday-Friday work the same); wording table is one file so an org can change language; time zone from `settings.location.timezone`; `focusDate`/`currentMeal` use the org's zone; flag `menu`; the import runs in the admin browser (no server compute, fine for Vercel). A later multi-**site** org (several campuses) needs one menu per screen group: `forKiosk` already takes a `menuId`-less doc, so the future change is "doc key `menu:<siteId>`" with no model change.

---

## 8. Tests

`test/menu.test.js`: `resolveDay` precedence table (day > week > cycle > weekly > none; closed day; explicit empty day; Shabbos meal applicability; Friday-night meal only on Friday); cycle math (1-4 weeks, start date in the future/past, year boundary, DST weeks); `focusDate` (before/after the last meal, closed day, no-meal day jumps ahead, Friday evening, local midnight, org time zone differing from the server's); `currentMeal` windows incl. overlap/gap; parser table (English/Hebrew day names, `Sun-Thu`, `weekdays`, tags by id/English/Hebrew, brackets vs parentheses, `;`/`|`, commas inside dishes, BOM, CRLF, Windows-1255 pasted junk, 401-line input rejected, "Lunsh" suggestion, tag typos, duplicate days) and **round trip** `parse(format(x)) == x`; spreadsheet rows parser (header detection, merged-looking blanks, quoted cells with newlines); normaliser limits + hostile keys; prune of old overrides; fit/paging model (20 dishes x 8 meals at both orientations never drops a dish and never goes under the floors). `test/permissionsCaps.test.js` (menu.edit matrix), `test/live.test.js` (menu key present, no staff ids), `test/screenDesign.test.js` lint for `MenuSlide.jsx`. Manual: print the kitchen's real sheet through the importer.

---

## 9. Size estimate: **M** (about 3 days)

Pure module + parser + copy table + tests (1 d), store + granular routes + undo/permissions/live (0.5 d), `MenuSlide` today/week/both/portrait/paging/states (1 d), admin week editor + meal sheet + import + settings + registry/search/help/docs (1 d, partly overlapping). The N-week rotation adds 0.25 d; the printable "Copy as text" is included.

---

## 10. Open questions (full text in QUESTIONS-FOR-OWNER.md)

1. Meals shown: breakfast / lunch / dinner as the default three, plus Friday night, Shabbos lunch, Seudah Shlishis (specced as editable meal types). Right defaults?
2. Is a repeating N-week rotation (1-4 weeks) needed, or only "usual week + exceptions"? (Recommended: include, default 1.)
3. How does the kitchen send the menu today (spreadsheet, PDF, WhatsApp text)? That decides which importer to polish first.
4. Allergy/dietary tags: which set? Show the optional "ask the kitchen" footer by default?
5. Today view vs Week view vs Both (recommended: Both).
6. After the last meal of the day, switch to tomorrow's menu (recommended) or keep showing today?
