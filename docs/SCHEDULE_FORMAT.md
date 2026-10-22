# TachTach schedule v1 — format reference

The paste-in text format for date schedules (Admin → Schedule → Paste / Import, and the day editor's Text mode).
Parser/formatter: `src/shared/schedulePaste.js`. Prompt text: `src/shared/scheduleClaudePrompt.js` — the blocks below were generated from it; if you change that file, regenerate this one.

## Format at a glance

```
# TachTach schedule v1
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening

@ 2026-10-24 clear
```

- `#` lines, blank lines and code fences are ignored. Leading `- ` bullets are tolerated.
- `@ date [weekday] [label]` starts a day. Each `@` block **fully replaces** that date's schedule. An `@` block with no lines is an explicit empty day. `@ date clear` puts the date back on the weekly schedule.
- Dates: `2026-10-16`, `10/16`, `Fri 10/16`, `10/16/2026`, `this Friday`, `next Shabbos` (= the one after this one), `today`, `tomorrow`. The preview always shows the resolved date; a weekday that doesn't match the date is a warning.
- Entry: `START[ - END] | English | Hebrew | Category | options`. Times: `7:05 AM`, `7:05am`, `7pm`, `19:05`, `noon`; a range can share AM/PM (`6:40-7:30 PM`). End before start → warning. A 1–6 o'clock time without AM/PM → warning.
- English/Hebrew are told apart by script, so order mistakes are fine. **The English name is optional** (Hebrew-only lines are fine: `7:05 AM | | שחרית | Davening`); either name can be left out, but at least one is needed. Category matches id or name, any case, singular/plural; an unknown category is created on Apply (warning in the preview).
- **Default alerts:** a category can carry a `defaultAlert` (Settings: Schedule → Weekly → Categories). Davening, Shiur, Seder and Learning start at 5 minutes; Meals and the rest at none. A line with no `alert` option gets its category's default (the preview marks it "(default)"); `alert N` overrides it and `alert 0` means none.
- Options (any order, can be split over several `|` fields): `alert N` (minutes; 1, 2, 5, 10, 15 usual, 0–120 accepted), `takeover` (full-screen countdown), `icon NAME`, `started N` ("just started" minutes, 0-30), `badge` / `nobadge` (in-session badge), `kind KIND` (only for a brand-new category: seder, davening, break, meal, other), `tefila NAME` (which davening this row is, so the chazan's name shows on it: Shacharis, Mincha, Maariv or `other`; without it a Davening-kind row is matched by its name), `off` (hidden).
- **Errors** (block Apply, shown with line numbers): unreadable date or time, line before any `@`, line without `|`, missing name, too many fields, a date given twice, items under a `clear` header, bad `alert` value.
- JSON is auto-detected when the text starts with `{`: the `data/schedule-dates.json` shape, `{ "2026-10-17": { "label": "", "entries": [ { "time": "09:30", "name": "…", … } ] }, "2026-10-24": null }` (`null` = clear), optionally wrapped in `{ "dates": { … } }`.


## Weekly schedules (`@ every Sun-Thu`)

The same format also describes the **regular weekly schedule**. Instead of dates, each `@` header names the weekdays its items repeat on:

```
# TachTach schedule v1
@ every Sun-Thu
7:00 AM | Shacharis | שחרית | Davening
9:00 AM - 12:30 PM | First Seder | סדר א' | Seder

@ Fri
7:30 AM | | שחרית | Davening

@ Shabbos
9:30 AM | Shacharis | שחרית | Davening
```

- Headers: `@ daily`, `@ weekdays` (**= Sun–Thu**, the yeshiva school days), `@ every Sun-Thu`, `@ Fri`, `@ Shabbos`, `@ Mon, Wed`, ranges may wrap (`Thu-Sun`). A day can appear under several headers (e.g. `@ daily` for Mincha plus `@ Fri`).
- A paste is **either** dated **or** weekly; mixing them is an error. A bare weekday (`@ Fri`) is weekly; use `@ this Friday` or `@ 2026-10-16` for a date.
- **Applying a weekly paste replaces the whole weekly schedule.** The preview says "Replaces N weekly items", and before saving, the old weekly schedule is stored as a template named `Auto-backup <date> <time>` (the 10 newest are kept), so it is one click to switch back. Per-date schedules are untouched and still win over the weekly one.
- Admin: Schedule → Weekly → **Paste weekly schedule**, **Copy as text**, **Save as weekly template**, **Switch to a saved week**. API: `POST /api/schedule/weekly/preview`, `PUT /api/schedule/weekly` (`{ text }`). Logic: `parseScheduleText` (`mode: 'weekly'`), `formatWeeklyText`, `src/shared/scheduleWeekly.js`.

## "Copy Claude prompt for…" — A day / Shabbos schedule (example output)

The button is a small menu of prompt types (registry `PROMPT_TYPES` in `scheduleClaudePrompt.js`; add a builder there to add a type). Generated for Friday 2026-10-16 + Shabbos 2026-10-17 with the default categories. The zmanim are example values; the real button fills in the cached/fetched Chabad.org zmanim for the chosen dates, or a clearly marked `[… NOT AVAILABLE — please fill in]` placeholder.

````text
You help prepare content for our yeshiva's TV screen (the "TachTach" screen). Right now I need a schedule for specific dates, in the format below.

Output ONLY one code block in this exact format, nothing else:

```
# TachTach schedule v1
@ YYYY-MM-DD DayName  optional label
H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
```

Rules:
- One "@" header per calendar date, then that day's items in time order. Friday-night items (candle lighting, Kabbalas Shabbos, the Friday-night seuda) go under FRIDAY's date.
- Each item is one line: time | English name | Hebrew name | Category | options
- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.
- The Hebrew name (Hebrew letters) is the main name. The English name is OPTIONAL: when there is no natural short English name, leave that field empty (e.g. "7:05 AM | | שחרית | Davening"). Never invent an English name just to fill the column.
- Category must be one of: Davening, Shiur, Seder, Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks.
- Reminders: Davening, Shiur, Seder get a 5-minute reminder; Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks get none. OMIT "alert" unless an item is an exception. "alert N" changes it to N minutes (1, 2, 5, 10 or 15); "alert 0" turns it off.
- Other options are optional, space-separated, at the end of the line:
    takeover     make the item's countdown full-screen (use with an alert, e.g. "alert 15 takeover")
    icon NAME    one of: book, prayer, meal, test, bed, bus, sports, bell, megaphone, clock, coffee, music, candle, star, calendar, sparkle
    started N    show a "just started" message for N minutes (0-30) after the start; "started 0" = none
    badge        show "now in session" from the start until the end time (so give it an end time); "nobadge" = never
    kind KIND    ONLY for a brand-new category: seder, davening, break, meal or other (seder items get the full countdown/just-started/badge treatment; break and meal stay quiet)
    off          keep the item but hide it
- Don't add commentary, notes or extra columns. If something is unclear, make your best guess and I'll fix it.
- "@ YYYY-MM-DD clear" (no items) puts a date back on the regular weekly schedule.

Example:
```
# TachTach schedule v1
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening
12:30 PM | | סעודה | Meals
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening | alert 0
```

Make the schedule for: Friday, October 16, 2026 (@ 2026-10-16) and Shabbos, October 17, 2026 (@ 2026-10-17) (Parshas Noach), zip code 33139.

Zmanim for these dates (from our zmanim feed — use them for candle lighting, Mincha/Maariv and Havdala):
- Fri 2026-10-16: candle lighting 6:35 PM, shkia 6:53 PM
- Shabbos 2026-10-17: shkia 6:52 PM, Shabbos ends 7:16 PM

Put "alert 15 takeover | icon candle" on candle lighting.

Here's what's happening:

````

## "Copy Claude prompt for…" — A weekly schedule

````text
You help prepare content for our yeshiva's TV screen (the "TachTach" screen). Right now I need our regular WEEKLY schedule, in the format below.

Output ONLY one code block in this exact format, nothing else:

```
# TachTach schedule v1
@ every Sun-Thu
H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
```

Rules:
- This is the REGULAR WEEK that repeats every week, not a specific date. Each "@" header names the days its items run on: "@ daily", "@ weekdays" (= Sun-Thu), "@ every Sun-Thu", "@ Fri", "@ Shabbos", "@ Mon, Wed". Day names: Sun, Mon, Tue, Wed, Thu, Fri, Shabbos. Ranges like "Sun-Thu" and lists like "Mon, Wed" work.
- Put items that run on the same days under one header, in time order. A day may appear under several headers (e.g. "@ daily" for Mincha plus "@ Fri" for Friday-only items).
- Don't use calendar dates here, and don't include candle lighting or other times that change every week.
- Each item is one line: time | English name | Hebrew name | Category | options
- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.
- The Hebrew name (Hebrew letters) is the main name. The English name is OPTIONAL: when there is no natural short English name, leave that field empty (e.g. "7:05 AM | | שחרית | Davening"). Never invent an English name just to fill the column.
- Category must be one of: Davening, Shiur, Seder, Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks.
- Reminders: Davening, Shiur, Seder get a 5-minute reminder; Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks get none. OMIT "alert" unless an item is an exception. "alert N" changes it to N minutes (1, 2, 5, 10 or 15); "alert 0" turns it off.
- Other options are optional, space-separated, at the end of the line:
    takeover     make the item's countdown full-screen (use with an alert, e.g. "alert 15 takeover")
    icon NAME    one of: book, prayer, meal, test, bed, bus, sports, bell, megaphone, clock, coffee, music, candle, star, calendar, sparkle
    started N    show a "just started" message for N minutes (0-30) after the start; "started 0" = none
    badge        show "now in session" from the start until the end time (so give it an end time); "nobadge" = never
    kind KIND    ONLY for a brand-new category: seder, davening, break, meal or other (seder items get the full countdown/just-started/badge treatment; break and meal stay quiet)
    off          keep the item but hide it
- Don't add commentary, notes or extra columns. If something is unclear, make your best guess and I'll fix it.

Example:
```
# TachTach schedule v1
@ every Sun-Thu
7:00 AM | Shacharis | שחרית | Davening
8:15 AM | Breakfast | | Meals
9:00 AM - 12:30 PM | First Seder | סדר א' | Seder
1:30 PM | Mincha | מנחה | Davening

@ Fri
7:30 AM | Shacharis | שחרית | Davening
9:00 AM - 11:30 AM | Seder | סדר | Seder

@ Shabbos
9:30 AM | Shacharis | שחרית | Davening
```

Here's our weekly schedule (or what to change):

````

## "Copy format guide for a Claude Project"

Paste once into a Claude Project's instructions; every chat in that project then knows both formats.

````text
You format our yeshiva's schedules for the TV screen in the hallway (the "TachTach" screen). Schedules are one of the things you prepare for that screen. Whenever I ask for a schedule (e.g. "make this Shabbos: …" or "here is our weekly schedule: …"), answer in the matching format below so I can paste it straight in.

=== A schedule for specific dates (a day or Shabbos) ===
Output ONLY one code block in this exact format, nothing else:

```
# TachTach schedule v1
@ YYYY-MM-DD DayName  optional label
H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
```

Rules:
- One "@" header per calendar date, then that day's items in time order. Friday-night items (candle lighting, Kabbalas Shabbos, the Friday-night seuda) go under FRIDAY's date.
- Each item is one line: time | English name | Hebrew name | Category | options
- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.
- The Hebrew name (Hebrew letters) is the main name. The English name is OPTIONAL: when there is no natural short English name, leave that field empty (e.g. "7:05 AM | | שחרית | Davening"). Never invent an English name just to fill the column.
- Category must be one of: Davening, Shiur, Seder, Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks.
- Reminders: Davening, Shiur, Seder get a 5-minute reminder; Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks get none. OMIT "alert" unless an item is an exception. "alert N" changes it to N minutes (1, 2, 5, 10 or 15); "alert 0" turns it off.
- Other options are optional, space-separated, at the end of the line:
    takeover     make the item's countdown full-screen (use with an alert, e.g. "alert 15 takeover")
    icon NAME    one of: book, prayer, meal, test, bed, bus, sports, bell, megaphone, clock, coffee, music, candle, star, calendar, sparkle
    started N    show a "just started" message for N minutes (0-30) after the start; "started 0" = none
    badge        show "now in session" from the start until the end time (so give it an end time); "nobadge" = never
    kind KIND    ONLY for a brand-new category: seder, davening, break, meal or other (seder items get the full countdown/just-started/badge treatment; break and meal stay quiet)
    off          keep the item but hide it
- Don't add commentary, notes or extra columns. If something is unclear, make your best guess and I'll fix it.
- "@ YYYY-MM-DD clear" (no items) puts a date back on the regular weekly schedule.

Example:
```
# TachTach schedule v1
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening
12:30 PM | | סעודה | Meals
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening | alert 0
```

=== The regular weekly schedule ===
Output ONLY one code block in this exact format, nothing else:

```
# TachTach schedule v1
@ every Sun-Thu
H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
```

Rules:
- This is the REGULAR WEEK that repeats every week, not a specific date. Each "@" header names the days its items run on: "@ daily", "@ weekdays" (= Sun-Thu), "@ every Sun-Thu", "@ Fri", "@ Shabbos", "@ Mon, Wed". Day names: Sun, Mon, Tue, Wed, Thu, Fri, Shabbos. Ranges like "Sun-Thu" and lists like "Mon, Wed" work.
- Put items that run on the same days under one header, in time order. A day may appear under several headers (e.g. "@ daily" for Mincha plus "@ Fri" for Friday-only items).
- Don't use calendar dates here, and don't include candle lighting or other times that change every week.
- Each item is one line: time | English name | Hebrew name | Category | options
- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.
- The Hebrew name (Hebrew letters) is the main name. The English name is OPTIONAL: when there is no natural short English name, leave that field empty (e.g. "7:05 AM | | שחרית | Davening"). Never invent an English name just to fill the column.
- Category must be one of: Davening, Shiur, Seder, Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks.
- Reminders: Davening, Shiur, Seder get a 5-minute reminder; Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks get none. OMIT "alert" unless an item is an exception. "alert N" changes it to N minutes (1, 2, 5, 10 or 15); "alert 0" turns it off.
- Other options are optional, space-separated, at the end of the line:
    takeover     make the item's countdown full-screen (use with an alert, e.g. "alert 15 takeover")
    icon NAME    one of: book, prayer, meal, test, bed, bus, sports, bell, megaphone, clock, coffee, music, candle, star, calendar, sparkle
    started N    show a "just started" message for N minutes (0-30) after the start; "started 0" = none
    badge        show "now in session" from the start until the end time (so give it an end time); "nobadge" = never
    kind KIND    ONLY for a brand-new category: seder, davening, break, meal or other (seder items get the full countdown/just-started/badge treatment; break and meal stay quiet)
    off          keep the item but hide it
- Don't add commentary, notes or extra columns. If something is unclear, make your best guess and I'll fix it.

Example:
```
# TachTach schedule v1
@ every Sun-Thu
7:00 AM | Shacharis | שחרית | Davening
8:15 AM | Breakfast | | Meals
9:00 AM - 12:30 PM | First Seder | סדר א' | Seder
1:30 PM | Mincha | מנחה | Davening

@ Fri
7:30 AM | Shacharis | שחרית | Davening
9:00 AM - 11:30 AM | Seder | סדר | Seder

@ Shabbos
9:30 AM | Shacharis | שחרית | Davening
```

If I give you an existing schedule in this format and ask for changes, return the whole changed schedule in the same format.
````

## Category kind and stages

**Category kind and stages.** Every category has a *kind* (Seder / Davening / Break / Meal / Other, set in Schedule > Categories) that decides which attention stages are on by default: Seder = countdown + "just started" 3 min + in-session badge; Davening = countdown (badge optional); Break and Meal = quiet (no countdown, no "just started", no badge; they still show as "up next"); Other = classic. In pasted text a line can carry `started N`, `badge` / `nobadge` (these override the kind for that block), and `kind X` for a category the paste creates (otherwise the kind is guessed from the name). An explicit `alert N` on a Break/Meal line opts that block in to its countdown. "Copy as text" includes `started` / `badge` / `nobadge` so a round trip keeps them; the category's kind itself is not in the text (change it in Categories). The in-session badge needs an end time, so give every block one. Pasting a weekly schedule replaces blocks and therefore their stages; the old week is kept as an Auto-backup.

## Groups (several grades watching one screen)

Optional; with no groups set up everything works exactly as before. The groups are a setting, the times live on the blocks (set in Schedule > Groups and on each block's three-dots menu > Set group times; JSON, structured saves and the paste TEXT format all carry them):

```json
"scheduleGroups": [
  { "id": "aleph",  "name": "Aleph",  "nameHe": "א׳", "short": "Aleph" },
  { "id": "beis",   "name": "Beis" },
  { "id": "gimmel", "name": "Gimmel" }
]
```

A block keeps its normal `time` / `endTime`: those are the times for every group that has no override. A group that runs earlier or later gets its own times, and `groups` limits a block to some groups (absent = everyone):

```json
{ "name": "Night Seder", "nameHe": "סדר לילה", "time": "20:00", "endTime": "22:00", "category": "seder",
  "groupTimes": { "aleph": { "time": "19:15", "endTime": "21:15" } } }
{ "name": "Shiur for Gimmel", "time": "16:00", "endTime": "17:00", "groups": ["gimmel"] }
```

Rules (`src/shared/scheduleGroups.js`): ids are lower-case `a-z 0-9 _ -` (max 32), at most 12 groups; times may be `HH:MM` or `7:15 PM` and are stored as `HH:MM`; an unknown group id is dropped with a warning; a time that is not a time refuses the save. The Schedule page shows such a block once, with its times split by group ("Night Seder — Aleph 7:15–9:15 PM · Beis & Gimmel 8:00–10:00 PM"; the row sorts by the earliest group, and is "now" while any group is in it). The rail's up-next, the "just started" banner, the in-session badge and the countdown run once per distinct time, with the group names in the text ("Night Seder · Aleph").

### Groups in the text format

Groups are known by the names set in Schedule > Groups (case-insensitive; the short label, Hebrew name or id work too). The line's own time is the time for **everyone else**; each different time is one extra field after the Category, before the options:

```
@ every Sun-Thu
8:00 PM - 10:00 PM | Night Seder | | Seder | Aleph 7:15 PM - 9:15 PM | alert 5
10:30 PM | Dorm attendance | | | Bais + Gimmel 11:00 PM | only Bais, Gimmel
4:00 PM - 5:00 PM | Shiur | | Learning | only Gimmel
```

- `<groups> <time range>`: those groups run at that time instead (separate several groups with `+`, `&`, `,` or `and`). Give an end time when the line has one (a warning appears if not). A group not named keeps the line's time.
- `only <groups>`: the block is for those groups only (its own field).
- A field is read as a group field only when the screen has groups and the names match, so old text and screens without groups behave exactly as before. Unknown names give a warning and are ignored. "Copy as text" writes these fields (groups with identical times merged), and the Claude prompts / format guide explain them when groups exist. Code: `parseGroupFields` / `formatGroupFields` in `src/shared/schedulePaste.js`, tests `test/scheduleGroupsText.test.js`.
