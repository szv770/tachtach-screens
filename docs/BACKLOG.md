# Backlog — owner requests to fold into upcoming work

Not urgent individually; pick these up when touching the area (next redesign/upgrade pass). Newest first. Move to the CLAUDE.md changelog when shipped.

## Added 2026-10-14 (owner, after seeing the new screen + admin)

### Admin
- [x] **Slide on/off toggles (done 2026-10-14) look stretched** ("nasty"). Fix the shared `ToggleSwitch` (admin `ui.jsx`) so the track/knob keep a fixed aspect ratio (e.g. 44×26 track, 20 knob) at every width and inside flex rows (`flex: none`, no `width: 100%` inheritance). Check mobile.
- [x] **Claude hand-off prompt (done 2026-10-14: prompt menu, category default alerts, optional English name; announcements/quotes prompt types still to add via `PROMPT_TYPES`) (Schedule → Paste/Import) needs rework.**
  - It reads as if the schedule is the ONLY thing Claude should produce. Make it one of several **prompt types** ("Copy Claude prompt for…": a day/Shabbos schedule, announcements, a batch of quotes/sichos/letters, …) so the same button pattern serves each kind of content.
  - **Sensible defaults baked into the prompt:** learning (Seder/Shiur) and davening items get a **5-minute reminder** (`alert 5`) by default; **meals get none**. Owner can still override per line.
  - **English name is optional** — don't force "give every item an English and a Hebrew name". Try Hebrew-only and see whether the screen looks good; add the English line only if it looks nice on the screens.
- [x] **Easy way to make and save a WEEKLY (done 2026-10-14) schedule.** Today: the old Weekly form (one entry at a time) + whole-schedule templates (load = replace everything). Wanted: build/paste a whole week in one go, name it, save it, and swap between saved weeks. Idea: extend the paste format with `@ every Sun-Thu` / `@ weekdays` / `@ Fri` headers (weekly rules instead of dates) + a "Save as weekly template" and a clear "Active weekly schedule" picker; per-date overrides still win.

### Kiosk look (fold into the next screen polish pass)
- [x] *(done 2026-10-14: Sefer → Halachos → perakim cards, `src/shared/limudim.js`)* **Rambam (daily study) page hierarchy.** Today it dumps a lot at once. Make the **Sefer** the most prominent line, then the **Halachos**, then the **perakim** numbers presented cleanly ("Perek 1" / "1 perek" wording; multiple perakim as a range). Rambam 1-perek vs 3-perakim tracks need consistent wording.
- [x] *(done 2026-10-14: daily-quote page + Tanya excerpt on the learning page)* **Tanya page:** the excerpt text is liked, but needs to look sleeker (typography/size/measure/spacing, source line style).
- [x] *(done 2026-10-14: S/M/L/XL, new "Rail — middle" spot, mask-based recolour)* **Logo:** bigger and more prominent (currently an OK spot, too small). Add a size choice (S/M/L/XL) and a better position option, keeping the rail balanced.
- [x] *(done 2026-10-14)* **Rail clock typography:** nicer, bolder, greater presence (weight/size/tabular numerals; AM/PM treatment).
- [x] *(done 2026-10-14: parsha chip)* **Parsha + day/date composition in the rail:** Hebrew date, English date and parsha should read as one cohesive unit that complement each other (shared alignment, rhythm and sizes), not three separate styles.
- [x] **Weather tab (admin) clarity (done 2026-10-14).** Think through what each control does and what the screen will show; rename/regroup so it's obvious (units, location source = zip, rail readout vs Weather page, test button showing the fetched result). Hebrew label: **מזג אוויר** is the correct term for "weather" (definite form on a page title: **מזג האוויר**).

### Done / decided
- Takeover designs approved (26 styles, animated) — being built (phase 5).
- Deferred: Davening takeover + schedule-triggered auto-announcements (Phase 2c in the announcements spec).
