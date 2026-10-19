# Backlog — owner requests to fold into upcoming work

Not urgent individually; pick these up when touching the area (next redesign/upgrade pass). Newest first. Move to the CLAUDE.md changelog when shipped.

## Added 2026-10-19 (owner, after phases 5-6 reports) — next pass

- [x] *(done 2026-10-19)* **Kiddush Levana: upcoming-months view** — show many months ahead (12-24) in a clean sleek list (molad, can start, cutoff, last night) in Announce > Kiddush Levana, with a printable/shareable view for the rabbi, and let the admin EDIT a month (override start/end, or skip/hide a month). Rail note: English by default, Hebrew as an optional extra (not forced). Confirm cutoff/customs with the rabbi (see docs/kiddush-levana-next-14-months.md). Window that opens in the small hours counts from that moment; first real evening is the next night (owner OK'd by not objecting; explain plainly).
- [x] *(done 2026-10-19)* **Seder stages by category kind** — each schedule category gets a kind (Seder / Davening / Break / Meal / Other); Seder-kind gets the full 'Get moving' urgency + 'just started' + in-session badge; Break/Meal get no urgency (or a soft one). Defaults per kind, per-entry override stays. End times matter: owner will enter end times for everything.
- **Long text = sleek auto-scroll instead of pages** for Sicha, Letter and Hayom Yom (and Tanya/long quotes): one slide, smooth slow vertical scroll (transform only, finite per slide, fade-edge overlays, no blur), speed by length; keep pagination as a fallback when motion is Minimal. Upgrade both layouts together.
- [x] *(done 2026-10-19: `כעת: X` just-started, `בעיצומו של` kicker, one table `src/shared/stageStrings.js`; native speaker to confirm)* **Better Hebrew wording for the in-session badge** (currently 'עכשיו: X') — find a natural, gender-neutral line (e.g. 'כעת בסדר: X' / 'בעיצומו: X' — check with a native speaker).
- Banner row holds one strip: the 'just started' banner replacing other banners for a few minutes is accepted.

## Added 2026-10-14 (owner, after seeing the new screen + admin)

### Google Photos
- [x] **"Only doing 200 photos max" (code done 2026-10-15, NOT yet verified against real Google).** Root cause was the one-shot HTML fetch (Google lazy-loads the rest) plus a hard 200 cap. Now browser-scroll fallback + per-album `maxPhotos`. Owner: run `npm run test:google-album -- <album-url>` on the Pi and confirm the browser count exceeds the plain count; if real Google's grid doesn't yield the full album, tell us the output.

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
