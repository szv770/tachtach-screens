# Spec 2 — Friday / Shabbos page (Erev Shabbos + Motzei Shabbos)

Status: SPEC (not built). Shared rules: [README.md](README.md) (C1-C9).

## 0. What exists today (so the page fits instead of duplicating)

| Piece | File | Fact used by this spec |
|---|---|---|
| Hide-on-Shabbos switch | `src/shared/shabbosMode.js`, `slides[].hideOnShabbos`, admin `SlideFields.jsx:256` | `isShabbosNow(now, zmanim)` = from candle lighting on the eve (Friday, or the evening before a Yom Tov) until nightfall (`tzeit7083deg`) on the last rest day; fallbacks `sunset - 18` then 17:30 / 19:30 so a failed fetch never shows a slide on Shabbos. Re-checked every minute in `App.jsx` (~line 158-161). Yom Tov from `isYomTov` in `chazan.js` (Chol Hamoed is not Yom Tov). |
| Candle lighting / tzeis | `cache.zmanim.today.candleLighting` (Fridays / eves), `.sunset`, `.tzeit7083deg`; Local mode `zmanim.js` (`candleMinutes` 18) | `candleLighting` only exists on an eve. Rabbeinu Tam / a second tzeis is **not** in the cache. |
| Parsha, Hebrew date, events | `cache.parsha {name, hebrew, date}`, `cache.hebrewDate`, `cache.events` | Parsha is the coming Shabbos's on a Friday. Special Shabbosos (Mevarchim, Shekalim...) come through `events`. |
| Zmanim page | `ZmanimSlide.jsx` | Shows `candleLighting` row with a candle graphic (`graphics.jsx` `CandleIcon`), tomorrow's zmanim after the last one. |
| Rail | `Rail.jsx:~202` | A small `ShabbosMark` / `Ornament` already sits in the rail on Fridays/Shabbos/Yom Tov. Rail has slots for up-next, session, side notes (max 2 notes), and the chazan card pattern. |
| Takeover styles | `takeoverStyles.js` | `shabbos` and `yomtov` styles exist ("Candle lighting, havdalah") for **messages**; this page is a **built-in slide**, not a message. |
| Kiddush Levana | `src/shared/kiddushLevana.js` (`kiddushLevanaState`, `currentOccasion`, `kiddushLevanaItems`) | Rail side note all day while the window is open, banner on each open night (last night says LAST NIGHT), only at night, tzeis to dawn. |
| Day/night theme | `src/shared/dayNight.js` | `themeAuto`: light at netz (default), dark at **tzeis** (default) or shkia. So Friday afternoon is the DAY theme; Motzei Shabbos is the NIGHT theme. |
| Freeze with off-hours | `src/shared/freeze.js`, `FreezeControl.jsx` | Scheduled windows by weekday can blank the TV; this is how a school that switches the screen off on Shabbos does it today. |
| Slide pattern | Birthdays/Chazan/Daily Story: built-in row, only in rotation when it has something (`App.jsx` ~153-155) | Reused. |

---

## 1. User story (plain English)

> "On Friday, from about three hours before candle lighting, the screen has a **Good Shabbos** page in the rotation: this week's parsha, **candle lighting time in huge numbers with 'in 2 h 14 min'**, the Shabbos times (Mincha, Kabbalas Shabbos, Shkia, Shabbos ends), and three short reminders (e.g. 'Light candles - girls and women', 'Tzedakah before candles', 'Wish everyone Good Shabbos'). In the side column a small card counts down to candle lighting. When candle lighting arrives the page leaves by itself, exactly when 'hide on Shabbos' slides leave.
>
> On Motzei Shabbos, from nightfall for an hour and a half (my choice), a **Shavua Tov** page replaces the Shabbos reminders: 'Shabbos ended 7:42 PM', 'Kiddush Levana tonight (last night!)' when it applies, what's next on the schedule (Melave Malka at 8:30), and Sunday's first rows.
>
> The office manager edits the reminder lines and extra times in one place (Screen > Shabbos), sees exactly how Friday and Motzei will look, and can turn the whole thing off with one switch on the Slides list."

---

## 2. Data model + file

### 2.1 One document, `data/shabbos.json`, store `src/server/shabbosStore.js` (C1). Class **P0** (no person is named).

```json
{ "version": 1,
  "erev": {
    "from": { "mode": "hoursBefore", "hours": 3 },        // or { "mode": "time", "time": "08:00" }
    "thursdayTeaser": false,                               // also show Thursday evening / Thursday all day? default off (Friday-only rule)
    "countdown": true, "parsha": true, "times": true, "reminders": true,
    "greeting": "both"                                     // 'shalom' (שבת שלום) | 'gut' (גוט שבת) | 'both' | 'none' ; Yom Tov swaps in its own words
  },
  "motzei": {
    "enabled": true, "minutes": 90,                        // how long after nightfall (15-240)
    "greeting": "shavuaTov",                               // 'shavuaTov' | 'gutVoch' | 'both' | 'none'
    "kiddushLevana": true, "nextUp": true, "reminders": true
  },
  "during": "off",                                         // what the TV does between candle lighting and nightfall: 'off' (= today: hide-on-Shabbos slides drop, everything else keeps rotating) | 'still' (see 4.4)  -- Q3
  "spelling": "shabbos",                                   // 'shabbos' | 'shabbat' : one copy table switch (Shabbos / Shabbat, Parshas / Parashat)
  "rail": { "candleCard": true, "fromHours": 3 },
  "rows": [                                                // extra time rows, max 8
    { "id": "r1", "label": "Mincha", "labelHe": "מנחה", "at": { "base": "candle", "offsetMin": -10 }, "when": "erev" }
    // at = { base: 'candle'|'sunset'|'tzeis', offsetMin: -180..180 }  OR  { fixed: 'HH:MM' }
    // when = 'erev' | 'shabbos' (listed as tomorrow's) | 'motzei'
  ],
  "reminders": [                                           // max 8, 90 chars per language
    { "id": "m1", "en": "Light candles: girls and women", "he": "הדלקת נרות לבנות ולנשים", "when": "erev", "icon": "candle", "enabled": true }
    // when = 'erev' | 'motzei' | 'both' ; icon from a fixed list: candle | heart | coin | star | none
  ]
}
```

Everything has a default, so a missing file works. **Starter content** (seeded once, all editable/removable, no school names): four generic Friday reminders (candles for girls and women; tzedakah before candle lighting; wish everyone a Good Shabbos; "Prepare for Shabbos") and one Motzei reminder (Wish everyone a Good Week). Rows are empty by default: the automatic rows (candle lighting, Shkia, Shabbos ends) cover most schools; the schedule rows (below) cover the rest.

### 2.2 Slide rows

Two built-ins in `LATE_BUILTINS` (`builtin-slides.js`), both **off by default**, orders 106/107: `SHABBOS` ("Good Shabbos", duration 20) and `MOTZEI` ("Shavua Tov", duration 15). One component (`ShabbosSlide.jsx`) renders both from `props.phase`. Two rows (not one) so the owner can order, time and switch them independently in the existing Slides list.

### 2.3 Pure module `src/shared/shabbosPage.js` (+ `shabbosCopy.js`, ONE wording table, C2)

```js
phaseOf(now, zmanim, { tomorrowZmanim, tz })
  -> { phase: 'none'|'erev'|'shabbos'|'motzei', start, end, candleMin, tzeisMin, kind: 'shabbos'|'yomtov'|'both', yomtovName? }
shabbosPageState(now, ctx)        // everything the page needs: phase, rows, countdown seconds, reminders, greeting words, kl card
```

`phaseOf` is added **inside `shabbosMode.js`** (or imports its helpers) so there is exactly one definition of candle lighting, tzeis, rest day and fallback. Hard test: for every minute in 2 years, `phase === 'shabbos'` <=> `isShabbosNow()` (README C9 property test).

Rules:
- `erev`: today is the eve (Friday, or the day before a Yom Tov) AND now is between `from` and candle lighting. `from` default = candle lighting minus 3 h (clamped to not before 06:00). Thursday teaser (off by default): the same page appears on Thursday from 16:00 with "Shabbos is coming" and no countdown.
- `shabbos`: candle lighting to tzeis. The Shabbos/Motzei rows do not show here unless `during: 'still'` (4.4).
- `motzei`: tzeis to tzeis + `minutes`, only when **today is a rest day and tomorrow is not** (so between two Yom Tov days there is no Motzei page; after Yom Tov it says "Gut Yom Tov / Good Yom Tov, Shavua tov" per copy table).
- `kind`: `shabbos` / `yomtov` / `both` decides greeting words (שבת שלום, גוט שבת, גוט יום טוב, חג שמח) and title (Erev Shabbos / Erev Yom Tov / Erev Shabbos and Yom Tov).
- **Second night of Yom Tov**: candles are lit after nightfall (not at `candleLighting`). v1 shows the Erev page only for the first evening; the second night shows "Candles after nightfall (7:42 PM)" taken from tzeis, no countdown to a wrong time. Documented in the admin panel help; see Q4.
- Missing zmanim: the countdown and the candle hero are hidden, never guessed; the greeting, parsha and reminders still show; the admin Health page already flags missing zmanim.

### 2.4 Where times come from (no double entry)

Automatic rows: Candle lighting (`candleLighting`), Shkia (`sunset`), Shabbos ends (`tzeit7083deg`, labelled "Shabbos ends / צאת השבת"). Schedule rows: the Friday **evening** entries and the next day's (**Shabbos**) entries from the weekly schedule via `scheduleResolution` (up to 5 rows, only entries whose category kind is `davening`/`meal`/`seder` and that are **not** hidden by group). Extra rows from `shabbos.json` fill gaps (e.g. "Kabbalas Shabbos = candles + 15"). Rows are de-duplicated by label+time and sorted by time.

---

## 3. Admin UX

New admin section **Screen > Shabbos** (`/admin/shabbos`, `components/ShabbosPanel.jsx`). Section capability `shabbos.edit` (C3). The two slide rows are switched on/off from the Slides list as usual; the panel's top row shows their state with a switch (calls the same slide PUT).

```
┌ Shabbos ───────────────────────────────────────────────┐
│ Good Shabbos page        [ON ●]     Shavua Tov page [ON ●]
│                                                        │
│ ▾ When Friday's page shows                             │
│    Starts      [ 3 hours before candle lighting ▾ ]    │
│                (or a fixed time 8:00 AM)               │
│    Today's candle lighting: 4:52 PM  → page 1:52–4:52  │
│    ☐ Also show on Thursday                             │
│ ▾ What it shows                                        │
│    ● Countdown to candle lighting                      │
│    ● This week's parsha                                │
│    ● Shabbos times        ● Reminders                  │
│    Greeting  (•) Both  ( ) Shabbos Shalom  ( ) Gut Shabbos ( ) None
│    Spelling  (•) Shabbos  ( ) Shabbat                  │
│ ▾ Times (3 automatic · 1 yours)                        │
│    Candle lighting   4:52 PM   automatic               │
│    Mincha            candles −10 min → 4:42   ✎ ✕      │
│    Shkia             5:11 PM   automatic               │
│    Shabbos ends      6:12 PM   automatic               │
│    + Add a time     (fixed time, or before/after candles)
│    ● Also list Friday night and Shabbos from the schedule (4 rows found)
│ ▾ Reminders (4 on · max 8)                             │
│    ● Light candles: girls and women        ✎ ↑ ↓ ✕     │
│    ● Tzedakah before candle lighting       ✎ ↑ ↓ ✕     │
│    + Add a reminder   [English] [עברית] [Show on: Friday ▾]
│ ▾ After Shabbos (Motzei)                               │
│    Shows for [ 90 ] minutes after Shabbos ends         │
│    ● Kiddush Levana note when it's tonight             │
│    ● What's next on the schedule                       │
│ ▾ Side column                                          │
│    ● 'Candle lighting 4:52 · in 2 h 14 min' card, from [3] hours before
│ ▾ During Shabbos (candle lighting to nightfall)        │
│    (•) Nothing special  ( ) Show one still Good Shabbos page   ← Q3
│                                                        │
│ Preview   [ Friday 3:30 PM ]  [ Motzei 7:00 PM ]  [ Now ]  (opens Live Preview at that time)
└────────────────────────────────────────────────────────┘
```

Behaviours: every control saves on change with the standard Undo toast (the `useInstant` pattern in `look/kit.jsx`), except the reminder/time editors which use a Sheet with Save/Cancel (`useDirtyForm`). A reminder sheet has English, Hebrew (rtl), icon, "Show on" (Friday / Motzei / Both) and a live **tiny preview line** at the kiosk's size. Hebrew-only or English-only reminders are allowed. Validation messages are plain ("90 characters at most so it can be read from across the room").

**Preview at a chosen time.** The kiosk preview currently supports `?previewDate=`; the phase depends on time of day, so add `?previewAt=YYYY-MM-DDTHH:MM` (admin preview only, no effect on the real TV; ignored unless `?preview=true`). The three preview buttons compute the next Friday/Saturday from today's real candle and tzeis times.

**Slides list.** Registry rows in `slideTypes.js`: `SHABBOS` ("Good Shabbos", group builtin, `moreSettings: { section: 'shabbos' }`) and `MOTZEI`; popup shows seconds and the existing hide-on-Shabbos switch is **not offered** on these (they manage their own window; see 4.5).

**Phone layout:** the same collapsibles stacked, 44 px targets; preview opens the existing Preview sheet.

---

## 4. Kiosk design

Component `src/screen/components/slides/ShabbosSlide.jsx` (+ `rail` card in `Rail.jsx` / `App.jsx` next to the chazan card). Built from `Panel`, `PageTitle`, `Fit`, `TimeText`, `he()`; **roles only**; all graphics follow `settings.graphics`; entrance is one finite fade/translate (no loops). The candle graphic is static (the existing `CandleIcon`; **no flame flicker animation**).

### 4.1 Erev page, landscape (canvas 1600x900, panel inside the rail layout is about 1240x820)

```
┌────────────────────────────────────────────────────────────┐
│  שבת שלום          Good Shabbos         [Parshas Toldos·פרשת תולדות]│  greeting hero 96-120 px (Torah-text role, Hebrew), English 56, parsha chip 44
│                                                            │
│   🕯 🕯          Candle lighting                הדלקת נרות │  label 36
│          4 : 5 2  PM                                       │  HERO time: Fit, >= 140 px, accent colour, tabular
│          in 2 h 14 min                                     │  countdown 48 px, updates each minute, mm:ss in the last hour
│  ───────────────────────────────────────────────────────── │
│  Mincha            4:42 PM     │  • Light candles: girls & women   │
│  Kabbalas Shabbos  5:15 PM     │  • Tzedakah before candle lighting│  rows 36 px (floor 28); reminders 32 px (floor 26)
│  Shkia             5:11 PM     │  • Wish everyone Good Shabbos     │
│  Shabbos ends      6:12 PM     │                                   │
└────────────────────────────────────────────────────────────┘
```

Fit rules (canvas px; C6 floors): greeting Fit to one line each language, min 64; hero time exactly one line, never below 120; countdown min 40; time rows: all rows fit by shrinking from 40 to a floor of 28, **more than fit at 28 -> only the next 5 are listed** (rest cut by time order, never a scroll); reminders: up to 3 visible at 32 px; if more are enabled they page in groups of 3 every 8 s with a finite cross-fade and the slide asks the rotation for `pages x 8 s` via `onRequestDuration` (same idea as `PinnedNotes` 8 s but finite and fully shown). Hebrew uses the Hebrew role with nikud-safe line boxes; each reminder is one bidi block (`dir="auto"`).

### 4.2 Erev page, portrait (900x1600)

Single column: greeting, parsha chip, candles + hero time (>= 160 px, the width is the limit), countdown, then the time rows (two columns of label/time are not used; one list), then reminders. Same floors. Candle graphic moves above the time.

### 4.3 Motzei page

Hero "Shavua Tov / שבוע טוב" (+ "גוט וואך" per `greeting`), line "Shabbos ended 7:42 PM", optional **Kiddush Levana card** (only if enabled and the window is open tonight; uses `kiddushLevanaState`; text from the existing KL copy; the last night says LAST NIGHT; it adds no new calculation), "Tonight" rows = the schedule's next rows (e.g. Melave Malka) via the same resolver as the up-next card, Motzei reminders. Entirely static after a single fade-in. Theme: whatever the day/night switch gives (by default night after tzeis); **the page never forces a theme**.

### 4.4 `during: 'still'` (needs the owner's answer, Q3)

Between candle lighting and nightfall the TV would show **one** unchanging page: greeting + parsha + "Shabbos ends 6:12 PM" — no countdown, no changing seconds, no rail clock refresh (rail clock shows the minute; if the owner's rabbi wants nothing that changes, the existing **scheduled Freeze window (Logo only / Message)** is the right tool, and this page is not used). So v1 recommendation: `during` stays `'off'` and the admin panel links to Freeze > Scheduled off-hours with a one-tap **"Switch the screen off from candle lighting to nightfall"** preset that creates a weekly window computed from zmanim (a small addition to `freeze.js` windows: `from: 'candle'`, `to: 'tzeis'`). Both choices are listed in the questions.

### 4.5 Rotation rules, hide-on-Shabbos interplay, Friday-only

- The two rows are in the rotation only when `shabbosPageState().phase` is `erev` (SHABBOS) or `motzei` (MOTZEI) and the row is on. Implemented as one more filter next to the Birthdays/Chazan/Daily Story filters in `App.jsx` (or, after Spec 1's extraction, in `rotationNow.js`).
- The Erev page's last minute is the minute candle lighting starts: it uses the **same** `shabbosMinute` memo as `withoutShabbosSlides`, so on the minute that "hide on Shabbos" slides disappear, the Erev page disappears too. No flag is stored on the row (`hideOnShabbos` is not shown for these two types).
- Friday only: nothing on Sunday-Wednesday, none on Thursday unless `thursdayTeaser`, none on Shabbos day unless `during:'still'`. Erev Yom Tov uses the same page with the Yom Tov words.
- When the Erev page shows, the existing **Zmanim** page keeps its candle row (they agree, same source). The Kiddush Levana rail note/banner are untouched; the Motzei card is additive, and the banner keeps showing underneath (a small accepted duplicate).
- Rail card (`rail.candleCard`): "Candle lighting 4:52 PM · in 2 h 14 min" in the same card slot style as the chazan card, shown from `fromHours` before candle lighting until candle lighting, lowest priority (never replaces up-next or an in-session card; hidden when the side notes occupy both slots). The countdown here follows `rail.upNextCountdown` conventions (minutes, then m:ss in the last minutes).
- Freeze/Blank/takeover cover this page like any other.

### 4.6 States

| State | Behaviour |
|---|---|
| Not Friday / Motzei | rows are not in rotation; admin preview with `previewAt` shows a sample |
| Page on but no parsha | parsha chip omitted, nothing else moves |
| No candle lighting yet (fetch failed) | hero and countdown hidden, line "Candle lighting time is not available" **only in the admin preview** (never on the TV); greeting + reminders show; Health flags it |
| Empty reminders | the bottom area is not drawn; times list widens |
| Long reminder (90 chars) | wraps to 2 lines, shrink to the floor, then truncated by the validator before it can be saved |
| Hebrew only / English only | the missing language is simply not drawn; spacing re-balances |
| Many rows (8 + schedule) | 5 shown (4.1) |
| Yom Tov / both | words per `kind` |
| Minimal motion | no entrance, everything just shows |
| Graphics off | no candles / ornaments; text only |

---

## 5. API + permissions

| Method + path | Notes | Capability |
|---|---|---|
| `GET /api/shabbos` | normalised doc | any signed-in (read) |
| `PUT /api/shabbos` | replace whole doc, validated by `shabbosPage.js` `normalize`, 64 kB, SSE `shabbos-update` | `shabbos.edit` (new, `full` preset) |
| `/api/state` | adds `shabbos` = `forKiosk(doc)` (no ids needed beyond row ids) | n/a |

Changes: `permissions.js` (`shabbos.edit`, RULES row `/^\/api\/shabbos(\/|$)/`, `SECTION_CAPS.shabbos`, in `CONTENT`), `undo.js` (`shabbos.save` kind, shared), `live.js` `VIEWER_KEYS` + 'shabbos' (P0, no staff fields) and `kioskGate` untouched, search index + help topic "Good Shabbos page", `undo`/History wording "Changed the Shabbos page". The two slide rows use the existing slides routes and capability.

---

## 6. Security and privacy

- Content is P0; no student or staff names. Reminders are plain text, 90 chars, no URLs (a URL-looking string is stored as text, never linked).
- All fields validated by the shared normaliser: enums, `hours` 0-12, `minutes` 15-240, `offsetMin` -180..180, `HH:MM`, <= 8 rows, <= 8 reminders, control characters stripped, unknown keys dropped.
- Live view: the key is on the allow-list on purpose (a viewer sees the same page as the TV); nothing in it is sensitive.
- Time correctness is a safety matter here (a wrong candle time is a halachic problem): the page shows only times from the zmanim cache / local calculation, never a hand-typed candle time (hand-typed rows are labelled by the owner and the admin shows "yours" next to them), and the countdown uses the org's timezone, not the browser's. The Health page's existing zmanim freshness check covers a stale cache (a candle time older than 36 hours hides the hero).
- Preview param `previewAt` works only with `preview=true` on the loopback/admin path; ignored on a real TV so nobody can fake times by URL.

---

## 7. SaaS fit

- Doc `shabbos` per org (C1); `store.read(ctx)`; flag `shabbosPage`. Zmanim per org location (Live: Chabad.org location id; Local: lat/lon/elevation/`candleMinutes`, today with **no admin control** for `candleMinutes` (18 min Diaspora, 40 Jerusalem): listed in ADMIN-EXPOSURE-AUDIT row E-01 and proposed under Location & weather as part of this work, because Shabbos is where it matters).
- Spelling/wording table lets an Israeli/Sephardi org switch to Shabbat/Parashat or Hebrew-only greetings without code changes; rows and reminders have no built-in names.
- Southern hemisphere / far-north: the phase logic is based on actual candle times and rest days, not clock hours; `from.hoursBefore` is relative.
- Several screens in one org: each screen computes the page from the same doc plus its own state; no per-device data.
- Offline: all computation is on the TV from cached zmanim and doc, so a dropped internet link on Friday does not stop the page (consistent with CLOUD-PLAN 13.11).

---

## 8. Tests

`test/shabbosPage.test.js` (pure): phase table for a Friday (before `from`, in window, at candle minute, after), Thursday with/without teaser, Saturday (during, at tzeis, motzei, after window), Sunday; Yom Tov Tuesday-Wednesday (erev Tuesday, Wednesday evening not erev, Motzei after Wednesday), Yom Tov on Friday, Thursday-Friday Yom Tov + Shabbos chain (no Motzei between); DST start/end Fridays; missing candleLighting (fallback only for the window, not shown as a time); missing tzeis; `from` modes and the 06:00 clamp; relative/fixed rows; schedule row import and de-dup; copy table (shabbos/shabbat, kinds); `normalize` limits and hostile input (huge arrays, long text, control chars, `__proto__`); **property test** `phase==='shabbos'` equals `isShabbosNow` for every minute in two years; countdown formatting (h m / m:ss / under a minute).
`test/permissionsCaps.test.js`: Messages-only denied, Full editor allowed. `test/live.test.js`: `shabbos` present for viewers. `test/screenDesign.test.js` lint for `ShabbosSlide.jsx` (no infinite/blur/hex/fonts). A programmatic fit test renders the pure layout model with the worst content (8 rows, 8 reminders of 90 chars Hebrew + English) and asserts nothing falls below the C6 floors or overflows the canvas box.

---

## 9. Size estimate: **M-L** (3-4 days)

Pure module + copy table + tests incl. the property test (1 d); `ShabbosSlide.jsx` landscape+portrait+Motzei+states (1.25 d); rail card + `App.jsx` filter + `previewAt` (0.5 d); admin panel + slide registry + permissions/live/search/help/docs (1 d); screenshots at 4 sizes (0.25 d). The Freeze "candle -> tzeis" preset (4.4) is +0.5 d if chosen.

---

## 10. Open questions (full text in QUESTIONS-FOR-OWNER.md)

1. Two separate rows (Erev + Motzei) as specced, or one row that changes with the phase?
2. How early on Friday should the page start: 3 hours before candle lighting (recommended), morning, or per school?
3. What should the TV do during Shabbos itself: nothing special (recommended, rely on the existing freeze windows), a still Good Shabbos page, or a scheduled "off" preset?
4. Second night of Yom Tov: ship v1 without a countdown for it (recommended) or compute "after nightfall" fully?
5. Should the page include a Rabbeinu Tam time (needs a new computed zman, `sunset + 72 min`, not in today's cache)?
6. Spelling default: Shabbos / Parshas (recommended for this school) with Shabbat/Parashat as an option?
7. Mivtzah points line on the Friday page (only if the Mivtzah feature is on)? Recommended: no for v1.
