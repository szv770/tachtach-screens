# Unified Announcements + Shabbos/Date Schedule Import — Design

Date: 2026-10-14. Builds on `2026-10-14-messaging-schedule-layout-audit.md` (the audit; all file:line citations live there), `2026-07-21-admin-reorg-design.md` (Announcements compose/active split, mobile rules) and `2026-07-21-schedule-date-overrides-design.md` (per-date override model; never implemented).

Owner's chosen order: **bugs → messages → schedule → look**. Phase 1 (bug batch) is separate work. This doc covers Phase 2 (messages) and Phase 3 (schedule). Phase 4 (visual redesign, "brand-new modern") gets its own spec after the owner picks a mockup direction. Everything here is built so the redesign can restyle it without changing data or behavior.

## Problem (owner's words, condensed)

- Too many places to send a message: New Slide, Banner, Board, Pinned notes (at the bottom of the page), Takeover. Board feels like a duplicate of Slide.
- Can't edit after sending. Expired messages can't be brought back easily.
- Enter doesn't make a new line on the screen. Text is small; a few words should be big.
- Expiry needs a date + time, and messages should be able to show on certain days of the week/month at certain times.
- The schedule is very hard to edit even one detail, and entering a whole Shabbos is impractical. The owner builds the Shabbos schedule with Claude chat and wants to paste it (or upload a file) to set "this Friday + Shabbos", or plan next Shabbos ahead.
- Everything must work fully from a phone.

## Goals

1. **One place to post anything**: an "Announcements" section with a single composer and a "Show as" choice: **Slide · Banner · Side note · Takeover**.
2. **Everything editable after posting**: text, look, timing. Same id, so the screen updates in place.
3. **Re-activate** any expired or paused item with one tap and a new duration.
4. **Timing**: start date/time, end date/time, quick chips (15 min, 1 h, end of day, end of Shabbos), and optional **repeat** rules (days of week, days of month, time windows, date range).
5. **Readable by default**: new announcements auto-fit text to the space (a few words become huge, long text shrinks to fit), and newlines are always kept.
6. **Schedule by date**: any calendar date can have its own schedule that overrides the weekly one. Set it by **pasting text** (from Claude chat) or **uploading a file**, with a preview before applying. Plan weeks ahead.
7. Nothing that works today stops working. Existing data migrates automatically and losslessly.

## Non-goals (this phase)

- Visual redesign of the screen (Phase 4). Phase 2/3 screen components use the current tokens and fonts and will be restyled later.
- Full admin-panel redesign. Only the Announcements and Schedule sections are rebuilt here, mobile-first, following the admin-reorg spec's mobile rules.
- Moving to Vercel/Supabase. All new data goes into `data/*.json` documents that map 1:1 onto the Vercel spec's `tt_documents` table.

---

## Phase 2 — Announcements

### Admin UX (mobile-first)

**Announcements** tab, which replaces the Messages tab and the Pinned section under it:

- Top: a big **"+ New announcement"** button. "+ New Slide → Message" in the Slides tab opens the same composer, with Show as = Slide preselected. The other Slides-tab types (images, video, RSS, Google Photos, built-ins) stay where they are.
- Segmented list: **Live now · Scheduled · Paused · Expired**, with a count badge on each. Each row shows a mini preview, the "Show as" chip, timing summary ("until Thu 9:00 PM", "Mon–Thu 7:00–9:30 AM") and quick actions: **Edit**, **Pause/Resume**, **Again…** (re-activate), **Duplicate**, **Delete** (with confirm and an Undo toast).
- **Composer** (full-screen sheet on phones, side panel on desktop):
  1. **Show as**: Slide / Banner / Side note / Takeover. A one-line explainer under each says what it does ("Takeover covers the whole screen and pauses everything").
  2. **Text**: main line (multi-line) + optional second line (multi-line), each in English and/or Hebrew. Hebrew fields are RTL. Enter = new line, everywhere except Banner, where newlines become " · ".
  3. **Look**: style (the existing Takeover/StyledSlide styles, deduplicated into one list), **Text size: Auto (default) / Fixed**, and **Full screen** (Slide only, hides the sidebar).
  4. **When**: Start now / at date+time; End: never / after (chips) / at date+time; **Repeat** (optional): day chips Sun…Shabbos, days of month, one or more time windows, date range.
  5. **Live preview** using the real screen component at the real aspect ratio.
  6. **Post** / **Save changes**.
- **Again…** offers: same length as last time (`lastDurationMin`), 15 min, 1 h, end of day, end of Shabbos, pick date+time.

### Data model — `data/announcements.json`

As proposed in audit §A.5, unchanged except where noted:

```jsonc
{
  "version": 1,
  "items": [{
    "id": "uuid", "createdAt": "ISO", "updatedAt": "ISO",
    "display": "slide" | "banner" | "note" | "takeover",
    "hold": false,
    "content": { "headlineEn": "", "headlineHe": "", "bodyEn": "", "bodyHe": "", "subtitle": "", "target": "", "attribution": "" },
    "look": { "style": null, "template": "announcement", "fit": "auto", "maxFontPx": null, "fullscreen": false },
    "slide": { "duration": 12 },
    "note": { "icon": null, "order": 0 },
    "when": {
      "startsAt": null, "expiresAt": null, "lastDurationMin": null,
      "recurrence": null | { "days": [], "monthDays": [], "windows": [{ "start": "HH:MM", "end": "HH:MM" }], "from": null, "until": null }
    },
    "enabled": true,
    "priority": 0,
    "legacy": { "file": "…", "type": "…", "extra": {} }
  }]
}
```

- `priority` is new. It's used for takeover precedence: the highest priority wins, then the newest `startsAt`/`createdAt`. Exactly one takeover shows.
- **"Active now"** is one shared pure function, `src/shared/announcements.js`: `isActive(item, now)` plus `nextChange(item, now)`, used by kiosk, admin and server. It replaces the 6 duplicated expiry checks. The kiosk re-evaluates every second, so items appear and disappear on the exact minute without a server round-trip.
- Day codes are the same `DAY_CODES` helper as the schedule (`['Sun','Mon','Tue','Wed','Thu','Fri','Shabbos']`). Phase 1 introduces it in `src/shared/`.
- Times are local wall-clock in `settings.location.timezone` (default `America/New_York`). This matters once the code runs on Vercel (UTC); see the Vercel spec.

### Migration (automatic, idempotent, at server startup)

As in audit §A.5's table. Key points:

- It runs in code at startup, not via committed data files, because `update.sh` restores the Pi's own `data/*.json`.
- Originals are copied to `data/legacy/*.pre-announcements.json` first. Unknown fields go to `legacy.extra`.
- Existing custom text slides keep their place in the rotation. Their `slides.json` row becomes `{ type: "ANNOUNCEMENT", announcementId, … }` with the same id, position, enabled and duration. Migrated items get `look.fit: "fixed"` so they look identical until edited. New items default to `"auto"`.
- Old endpoints (`/api/messages`, `/api/pinned`, custom-slide POST) keep working for one release by translating into announcements, so an open admin tab or the Live Preview doesn't break mid-update.

### API

`GET/POST /api/announcements`, `PUT /api/announcements/:id` (partial merge with a field whitelist; never changes `id`/`createdAt`; doesn't touch `when` unless it's sent), `POST /api/announcements/:id/reactivate { durationMin | expiresAt }`, `POST /api/announcements/:id/duplicate`, `DELETE /api/announcements/:id`. All go behind `requireAuth` + CSRF. One SSE event, `announcements-update`. Announcements are included in `/api/state` (app.js), or the 5 s poll will drop them.

### Screen behavior (rules that must be preserved)

From audit §A.5 "Screen-side rules". Summary:

- **Banner** never pauses rotation. **Takeover** always pauses rotation and covers everything. **Slide** joins rotation and replaces slide content only. **Side note** sits in the sidebar, max 3 visible, cycling.
- **Hold** (Slide only, advanced) replaces the slide area until the item ends. **Decision: the rotation timer also pauses while held**, so the screen resumes where it left off. That's a deliberate change from the never-working old "hold screen" checkbox.
- `<FitText>` is a shared component: it binary-searches the font size within min/max bounds in a ResizeObserver-measured box, uses `white-space: pre-wrap`, and is guarded against callbacks after unmount (GOTCHAS). It's used for Slide headline and body, Takeover primary line, and Side note text. The 600–700 px width caps on announcement slides are removed; the box is the full slide area minus safe padding.

---

## Phase 3 — Schedule by date

### Model

As in the 2026-07-21 overrides spec: `data/schedule-dates.json` is keyed by `YYYY-MM-DD`. A key that's present overrides that date, even if it's empty. When a date has no key, the weekly entries are used, filtered by `days` and `enabled` (Phase 1 adds the filter). One shared resolver, `getEffectiveSchedule(schedule, scheduleDates, dateISO)`, is used by ScheduleSlide, the sidebar "next up"/"starting in", countdown.js, and `preview-state?date=` (audit §B.2 gaps 1–4).

Also new: **saved day blocks**. `data/schedule-blocks.json` holds reusable named day schedules without dates ("Regular Shabbos", "Shabbos Mevarchim", "Erev Shabbos short Friday"). They can be applied to any date in two taps.

### Ways to set a date's schedule

1. **Paste text** (the main path, works on a phone). Admin → Schedule → **Import / Paste** → paste → **Preview** → **Apply**.
2. **Upload a file**: `.txt` or `.md` (same text format), `.json` (same model), or `.xlsx` (the 07-21 spec's template, added after the text path ships; it's lower priority because the text path covers the Claude workflow).
3. **Apply a saved block** to a date ("Next Shabbos → Regular Shabbos"), then tweak.
4. **Edit by hand** in a per-date editor: a day view with inline-editable rows (tap a time to change it, tap a name to rename, swipe or ✕ to delete, "+ add row"), plus duplicate row, copy day → another date, and "save day as block".

### Text format: "TachTach schedule v1"

Exactly as in audit §B.4. In short:

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

- Each `@ date` block fully replaces that date's schedule. `@ date clear` reverts the date to the weekly schedule.
- The parser is forgiving: 12 h or 24 h times, Hebrew/English fields in either order, case-insensitive categories, and `@ this Friday` / `@ next Shabbos` resolved to absolute dates in the preview. It's strict about blocking errors.
- Preview: one card per date with weekday, "replaces N items" or "new", resolved times, category chips (new categories flagged), and errors/warnings with line numbers. **Apply is disabled while there are errors.** Apply is all-or-nothing on the server.
- **"Copy as text"** exports any date (or saved block) in the same format, so last week's Shabbos can be handed back to Claude as a starting point.
- **"Copy Claude prompt"** button: puts a ready prompt on the clipboard (below), pre-filled with this week's dates, the school's category list, the icon list, and the zmanim for those dates (candle lighting, shkia, tzeis, from the cache). The owner pastes it into Claude chat, adds their notes, and pastes Claude's answer back.

#### The Claude prompt (generated by the button)

> You format yeshiva schedules for our TV screen. Output ONLY one code block in this exact format, nothing else:
> ```
> # TachTach schedule v1
> @ YYYY-MM-DD DayName  optional label
> H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
> ```
> Rules: one `@` header per calendar date; Friday-night items go under Friday's date. Categories: {Davening, Learning, Meals, Events, Trips, Breaks}. Options (optional, space-separated): `alert N` (N = 1, 2, 5, 10 or 15 minutes before), `takeover` (full-screen alert), `icon NAME` ({prayer, book, meal, candle, star, bus, …}). Give every item an English and a Hebrew name.
>
> Dates: **Friday {2026-10-16}** and **Shabbos {2026-10-17}** (Parshas {Bereishis}). Candle lighting {6:28 PM}, shkia {6:46 PM}, Shabbos ends {7:36 PM}.
>
> Here's what's happening: …

### API

`GET /api/schedule/dates?from=&to=`, `PUT /api/schedule/dates` (`{ text }` or `{ dates }`; validates and applies all-or-nothing; has its own body limit of 256 kB because the global limit is 16 kB), `DELETE /api/schedule/dates/:date`, `POST /api/schedule/dates/preview` (dry-run parse for the preview), and blocks CRUD. SSE: `schedule-dates-update`. Included in `/api/state`.

### Countdown alerts

Phase 1 makes them work at all. Phase 3 makes them resolve per date, so alerts follow the pasted Shabbos schedule.

---

## Testing

- Pure unit tests (node:test, no new framework) for `isActive`/`nextChange` (recurrence edges: windows crossing midnight, Shabbos day code, DST day), the text parser (each rule, each error), and `getEffectiveSchedule`.
- A migration test: fixture `messages.json`/`pinned.json`/`slides.json`, then migrate, then check snapshot equality of what the screen renders before and after (Playwright screenshots).
- An end-to-end Playwright test on a phone viewport (390×844): create, edit, expire, re-activate an announcement; paste a two-day schedule, preview it, apply it, see it on `/screen?previewDate=`.

## Open questions for the owner

1. **Hold**: should a held slide also pause the rotation timer (proposed: yes)?
2. **Expired items**: keep them forever in "Expired", or auto-delete after N days (proposed: keep 60 days)?
3. **Takeover conflicts**: if two takeovers are live at once, show the higher priority (proposed), or rotate between them?
4. **Schedule categories**: is "Davening, Learning, Meals, Events, Trips, Breaks" right for the yeshiva? Any others (Shiur, Mivtzoim, Farbrengen)?
5. **"End of Shabbos" quick chip**: use tzeis from the zmanim cache (proposed), or a fixed number of minutes after shkia?
