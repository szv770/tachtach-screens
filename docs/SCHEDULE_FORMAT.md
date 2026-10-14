# TachTach schedule v1 — format reference

The paste-in text format for date schedules (Admin → Schedule → Paste / Import, and the day editor's Text mode).
Parser/formatter: `src/shared/schedulePaste.js`. Prompt text: `src/shared/scheduleClaudePrompt.js` — the two blocks below were generated from it; if you change that file, regenerate this one.

## Format at a glance

```
# TachTach schedule v1
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening | alert 10
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening | alert 10

@ 2026-10-24 clear
```

- `#` lines, blank lines and code fences are ignored. Leading `- ` bullets are tolerated.
- `@ date [weekday] [label]` starts a day. Each `@` block **fully replaces** that date's schedule. An `@` block with no lines is an explicit empty day. `@ date clear` puts the date back on the weekly schedule.
- Dates: `2026-10-16`, `10/16`, `Fri 10/16`, `10/16/2026`, `this Friday`, `next Shabbos` (= the one after this one), `today`, `tomorrow`. The preview always shows the resolved date; a weekday that doesn't match the date is a warning.
- Entry: `START[ - END] | English | Hebrew | Category | options`. Times: `7:05 AM`, `7:05am`, `7pm`, `19:05`, `noon`; a range can share AM/PM (`6:40-7:30 PM`). End before start → warning. A 1–6 o'clock time without AM/PM → warning.
- English/Hebrew are told apart by script, so order mistakes are fine; either can be left out. Category matches id or name, any case, singular/plural; an unknown category is created on Apply (warning in the preview).
- Options (any order, can be split over several `|` fields): `alert N` (minutes; 1, 2, 5, 10, 15 usual, 0–120 accepted), `takeover` (full-screen countdown), `icon NAME`, `off` (hidden).
- **Errors** (block Apply, shown with line numbers): unreadable date or time, line before any `@`, line without `|`, missing name, too many fields, a date given twice, items under a `clear` header, bad `alert` value.
- JSON is auto-detected when the text starts with `{`: the `data/schedule-dates.json` shape, `{ "2026-10-17": { "label": "", "entries": [ { "time": "09:30", "name": "…", … } ] }, "2026-10-24": null }` (`null` = clear), optionally wrapped in `{ "dates": { … } }`.

## "Copy Claude prompt" (example output)

Generated for Friday 2026-10-16 + Shabbos 2026-10-17 with the default categories. The zmanim here are example values; the real button fills in the cached/fetched Chabad.org zmanim for the chosen dates, or a clearly marked `[… NOT AVAILABLE — please fill in]` placeholder when they can't be had.

````text
You format yeshiva schedules for our TV screen.

Output ONLY one code block in this exact format, nothing else:

```
# TachTach schedule v1
@ YYYY-MM-DD DayName  optional label
H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
```

Rules:
- One "@" header per calendar date, then that day's items, one per line, in time order. Friday-night items (candle lighting, Kabbalas Shabbos, the Friday-night seuda) go under FRIDAY's date.
- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.
- Give every item an English name and a Hebrew name (Hebrew letters), in that order.
- Category must be one of: Davening, Learning, Meals, Events, Trips, Breaks, Shiur, Seder, Mivtzoim, Farbrengen.
- Options are optional, space-separated, at the end of the line:
    alert N      show a countdown N minutes before (N = 1, 2, 5, 10 or 15)
    takeover     make that countdown full-screen (use with alert, e.g. "alert 15 takeover")
    icon NAME    one of: book, prayer, meal, test, bed, bus, sports, bell, megaphone, clock, coffee, music, candle, star, calendar, sparkle
    off          keep the item but hide it
- "@ YYYY-MM-DD clear" (no items) puts a date back on the regular weekly schedule.
- Don't add commentary, notes or extra columns. If something is unclear, make your best guess and I'll fix it.

Example:
```
# TachTach schedule v1
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening | alert 10
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening | alert 10
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening
```

Make the schedule for: Friday, October 16, 2026 (@ 2026-10-16) and Shabbos, October 17, 2026 (@ 2026-10-17) (Parshas Noach), zip code 33139.

Zmanim for these dates (from our zmanim feed — use them for candle lighting, Mincha/Maariv and Havdala):
- Fri 2026-10-16: candle lighting 6:35 PM, shkia 6:53 PM
- Shabbos 2026-10-17: shkia 6:52 PM, Shabbos ends 7:16 PM

Put "alert 15 takeover | icon candle" on candle lighting and "alert 10" on each Shacharis.

Here's what's happening:

````

## "Copy format guide for a Claude Project"

Paste once into a Claude Project's instructions; every chat in that project then knows the format.

````text
You format our yeshiva's schedules for the TV screen in the hallway (the "TachTach" screen). Whenever I ask for a schedule (e.g. "make this Shabbos: …"), answer in the format below so I can paste it straight in.

Output ONLY one code block in this exact format, nothing else:

```
# TachTach schedule v1
@ YYYY-MM-DD DayName  optional label
H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
```

Rules:
- One "@" header per calendar date, then that day's items, one per line, in time order. Friday-night items (candle lighting, Kabbalas Shabbos, the Friday-night seuda) go under FRIDAY's date.
- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.
- Give every item an English name and a Hebrew name (Hebrew letters), in that order.
- Category must be one of: Davening, Learning, Meals, Events, Trips, Breaks, Shiur, Seder, Mivtzoim, Farbrengen.
- Options are optional, space-separated, at the end of the line:
    alert N      show a countdown N minutes before (N = 1, 2, 5, 10 or 15)
    takeover     make that countdown full-screen (use with alert, e.g. "alert 15 takeover")
    icon NAME    one of: book, prayer, meal, test, bed, bus, sports, bell, megaphone, clock, coffee, music, candle, star, calendar, sparkle
    off          keep the item but hide it
- "@ YYYY-MM-DD clear" (no items) puts a date back on the regular weekly schedule.
- Don't add commentary, notes or extra columns. If something is unclear, make your best guess and I'll fix it.

Example:
```
# TachTach schedule v1
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening | alert 10
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening | alert 10
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening
```

If I give you an existing schedule in this format and ask for changes, return the whole changed day(s) in the same format.
````
