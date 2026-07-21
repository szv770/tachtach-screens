# Per-Date Schedule Overrides + Bulk Excel Import — Design

## Problem

TachTach's schedule (`data/schedule.json`) only supports recurring day-of-week entries (`days: ["Sun","Tue",...]`). This school is actually a **camp**, where the schedule is genuinely different every day — the day-of-week model doesn't fit. There is currently no way to define a schedule for one specific calendar date, and editing is one-entry-at-a-time through a form, which doesn't scale to entering/changing an entire day's activities quickly.

## Goals

- Let the admin define a complete, different schedule for any specific calendar date, without touching the recurring day-of-week schedule.
- Let the admin bulk-create/edit several dates at once via a downloadable Excel template (one sheet per date) instead of clicking through a form per entry.
- Keep the existing recurring schedule and its editor working exactly as they do today, as the fallback for any date that has no override.
- Give the Schedule admin page (both the existing recurring editor and the new panel) a visibly more polished look — the rest of the admin panel is out of scope.

## Non-goals

- No changes to the recurring schedule's data model, editing UI, or behavior (Approach A, confirmed).
- No redesign of any other admin section (Slides, Messages, Settings, etc.).
- No support for date *ranges* sharing one sheet (e.g. "all of next week is the same") — each date is its own sheet. Can be a future addition if it turns out to matter.

## Data model

New file `data/schedule-dates.json`:

```json
{
  "2026-07-25": {
    "entries": [
      {
        "id": "uuid",
        "name": "Color War Kickoff",
        "nameHe": "",
        "time": "16:00",
        "endTime": "17:30",
        "category": "activities",
        "alertBefore": 5,
        "alertDisplay": "slide",
        "enabled": true,
        "icon": "sparkle"
      }
    ]
  }
}
```

Entry shape matches today's recurring entries minus `days` (the date key is the day). Categories stay in the **existing shared** `schedule.json.categories` — a per-date entry's `category` references that same list, so colors/icons stay consistent instead of every date needing its own category set. New category names typed into the spreadsheet get auto-created there.

**Resolution rule:** the presence of a date's key in `schedule-dates.json` means "this date has an override — use it, even if `entries` is empty" (e.g. an off-day with nothing scheduled is a valid, explicit override, not a fallback trigger). No key present → fall back to filtering `schedule.json.entries` by day-of-week, unchanged from today.

A shared helper, e.g. `getEffectiveSchedule(schedule, scheduleDates, dateISO)` in `src/shared/` (usable from both server and client code, similar to `pirkeiAvos.js`), implements this rule once. It must be used by both:
- `src/screen/components/slides/ScheduleSlide.jsx` (what's displayed)
- `src/server/countdown.js` (which entries drive the countdown-alert timers) — this file currently reads `schedule.json.entries` directly; it needs to resolve per-date first so countdown alerts fire off the correct schedule on override days.

## Excel template & import

New dependency: **`exceljs`** (pure JS, no native build step).

### Columns (per sheet)

| Column | Type | Notes |
|---|---|---|
| Name (EN) | text | required |
| Name (HE) | text | optional |
| Start Time | text, 24-hour `HH:MM` (e.g. `16:00`, not `4:00 PM`) — matches how times are already stored in `schedule.json` | required |
| End Time | text, 24-hour `HH:MM` | optional |
| Category | text, dropdown | data-validation list of existing category names; typing a new name is allowed (validation is a warning, not a hard block) |
| Icon | text, dropdown | data-validation list of the 16 built-in icon names; optional |
| Alert Before | number | minutes; 0/1/2/5/10/15; blank defaults to 0 (no alert) |
| Alert Display | text, dropdown | `slide` or `takeover`; blank defaults to `slide` |
| Enabled | text, dropdown | `TRUE` / `FALSE`, blank defaults to `TRUE` |

Sheet name = the ISO date (e.g. `2026-07-25`).

### Getting a template — `GET /api/schedule/template`

Query: `dates` (comma-separated ISO dates; defaults to the next 7 days), `mode=blank|export`.

- `blank` — one empty sheet per requested date, with 1-2 example rows and a short instructions note.
- `export` — one sheet per requested date, pre-filled with that date's **current effective** schedule (its override if one exists, else today's recurring fallback for that day-of-week) — editing an already-fine day is tweaking, not retyping.

### Uploading — `POST /api/schedule/import`

Multipart upload (reuses the existing `multer` pattern from font/image upload). Validates the **entire workbook** before writing anything:

- Every sheet name must parse as a valid ISO date.
- Every row's required fields must be present and well-formed (time format, etc.).
- Collects every problem as `{ sheet, row, message }` rather than stopping at the first error.

If there are any errors, nothing is saved — the response includes the full list so the admin can fix everything in one pass instead of a slow fix-one-error-at-a-time loop. On success:

- Any category name not already in `schedule.json.categories` is auto-created (default color from a small rotating palette, no icon).
- Each sheet's date fully **replaces** that date's entry in `schedule-dates.json` (re-uploading a date's sheet is a full overwrite of that date, not a merge — keeps the mental model simple: "this sheet IS that date's schedule now").
- Broadcasts `schedule-dates-update` (new SSE event, entries) and `schedule-update` (existing event, if categories changed) so the live kiosk picks it up immediately, no restart.

## Admin UI

New "Daily Overrides" panel inside the existing Schedule section. Visual bar for this panel (and a cosmetic-only pass over the existing recurring editor in the same section) is explicitly higher than the rest of the admin — richer card depth (subtle shadow/border glow instead of flat 1px borders), a proper animated calendar-strip date picker, a drag-and-drop upload zone with distinct idle/drag-hover/success/error visual states, color-coded status badges ("Override" vs "Recurring (default)"), and Framer Motion transitions on the override list and upload feedback (already a project dependency, underused in the admin today). Still plain inline styles, no Tailwind — consistent with the rest of this codebase.

Panel contents:
- A compact list of upcoming dates, each tagged "Override" or "Recurring (default)".
- Date-range picker + "Download Blank Template" / "Export to Edit" actions.
- Drag-and-drop (or click-to-pick) upload zone.
- Post-upload feedback: a clean success summary (dates updated, entries per date, new categories created) or a precise per-row error list — never a raw dump.
- Per-date "Remove Override" action, reverting that date to the recurring fallback.

### Mobile

Must be fully usable on a phone, matching the mobile-responsive patterns already established elsewhere in this admin (`useIsMobile.js`, the sticky auto-scrolling tab nav, enlarged touch targets — see `docs/claude/GOTCHAS.md`/changelog for the prior mobile pass). Concretely: the upcoming-dates list and date-range picker stack to full-width single-column below the mobile breakpoint; the drag-and-drop zone still works as a plain tap-to-pick file input on touch (drag-and-drop has no mobile equivalent); buttons and the per-date "Remove Override" action stay at a comfortably tappable size (not shrunk to fit); the calendar-strip date picker becomes horizontally scrollable rather than compressing days into illegibility. Since "download a template" / "upload a file" is an awkward flow on a phone (no real filesystem, mail/cloud-drive share sheets), this should still work but the primary expected use is likely from a laptop/desktop browser — the mobile requirement is that the panel is never *broken* or unreadable on a phone, not that the Excel round-trip is the phone's primary workflow.

## Testing

- Unit tests for `getEffectiveSchedule` (override present / no override → fallback / override present but empty entries → blank day, not fallback).
- Unit tests for the import validator (valid file; malformed time; unknown category → auto-create; bad date as a sheet name → rejected with a clear message; partial-file-should-not-partially-commit).
- Unit test for template generation producing the expected headers and data-validation lists.
