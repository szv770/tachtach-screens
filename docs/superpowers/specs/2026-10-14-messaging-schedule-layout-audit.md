# TachTach audit: messaging, schedule, screen layout, weather hook-points

Repo state audited: branch `claude/compassionate-mendel-rm7i2p` @ `0e19318` (same as `origin/main`). Read-only audit; all citations are `file:line` against that commit.

---

## 0. TL;DR — what the owner's complaints actually trace to

| Complaint | Root cause (code) |
|---|---|
| "Enter in a message slide doesn't make a new line" | The admin inputs **are** `<textarea>` (SlideManager.jsx:747-791, MessageComposer.jsx:249, 275) so `\n` is saved, and the server keeps it (`pick()` api.js:48-56 does not touch strings). The screen drops it: no `white-space: pre-wrap`/`pre-line` anywhere except the **Info** template's body (TextSlide.jsx:117, 130). The default template for a new slide is `headline` (SlideManager.jsx:89), which collapses newlines. StyledSlide (all 6 styles), Takeover (all 11), BoardDisplay (SlideCarousel.jsx:38-45) and PinnedSlide don't preserve them either. Pinned notes use single-line `<input type="text">` (PinnedManager.jsx:107, 133), so you can't type a newline at all. Subtitle is a single-line `<input>` everywhere (SlideManager.jsx:810, MessageComposer.jsx:291). |
| "Text is small and hard to read; a few words should be big" | Every text size is a fixed px value tuned for a 1600×900 canvas (ScreenScaler.jsx:11). No auto-fit exists for messages. TextSlide caps width at **600 px** (TextSlide.jsx:112, 141) inside a ~1108 px-wide slide area, so text fills about half the space. Body text is 20–22 px, and English drops to 14–15 px when Hebrew is also present (TextSlide.jsx:124, 165). The only shrink-to-fit code is ScheduleSlide FullDayMode (ScheduleSlide.jsx:~300-312) and LimudimSlide; nothing grows text to fill space. |
| "Board duplicates Slide" | Correct. There are **three** ways to put a text card into the rotation: a custom slide (`slides.json`), a non-blocking Board (`messages.json`, injected as `BOARD_SLIDE` at a fixed 12 s, App.jsx:77-86), and a pinned note with `displayMode:'slide'` (`pinned.json`, injected as `PINNED_SLIDE`, App.jsx:64-76). There are also two "styled full card" systems with the same style names: Takeover (11 styles) and StyledSlide (6 styles). |
| "Can't edit after creating" | Custom slides can't be edited at all, only toggled, renamed, re-timed or deleted (SlideManager.jsx rows ~214-440; there's no edit panel for `custom`). Messages have no update endpoint. "Edit" does delete-then-recreate (MessageComposer.jsx:118-122) and resets expiry to "Manual dismiss" (MessageComposer.jsx:158). Pinned has `PUT` (api.js:297) but the UI only edits mode, duration and fullscreen, not the text. Custom Days can only be created or deleted (api.js:339-367). |
| "Schedule is hard to edit / Shabbos is painful" | Covered in §B. There is no per-date concept (the overrides spec isn't implemented). The kiosk ignores `days` and `enabled` entirely. Also, **countdown alerts are completely broken**: there are 4 independent bugs (§B.2). |

### Bugs found along the way (none were known in the docs, as far as I can tell)

1. **Countdown alerts never fire.** `countdown.js:14` uses lowercase day codes `['sun',…,'shabbos']`, but stored `days` are `'Sun'…'Shabbos'`, so `entry.days.includes(today)` (countdown.js:147) is always false. Every entry in `data/schedule.json` has `days`, so zero alerts get scheduled. The 07-21 spec called this an "unrelated inconsistency", but it is fatal.
2. Even if (1) is fixed: the admin saves `alertDisplay` (ScheduleEditor.jsx:101, 541-542, 981, 1004, 1029), but the server whitelist only has `countdownDisplay` (api.js:63). `pick()` strips it, so the "Takeover" choice is silently lost.
3. Even then: the server broadcasts `displayMode` (countdown.js:84), but the client checks `countdown.mode` (App.jsx:504, 578). Neither branch ever renders.
4. Even then: "slide" mode only renders when the current slide has `type === 'COUNTDOWN'` (SlideCarousel.jsx:206), and no COUNTDOWN slide is ever put into rotation (App.jsx:61-88).
5. **"Hold screen on this board" is a no-op.** The admin sends `blocking` (MessageComposer.jsx:130), but `MESSAGE_FIELDS` (api.js:60) doesn't include it, so it's stripped. Per-message `bannerSize/Speed/Repeat` (Banner.jsx:403-405) are also not whitelisted, so they're dead.
6. **The admin's Zip / Chabad-location / Track A / Track B fields write the wrong keys.** SettingsPanel writes top-level `zipCode`, `chabadLocationId`, `trackA`, `trackBTime` (SettingsPanel.jsx:203-213, 427-437). The server reads `settings.location.{zip,locationId}` and `settings.scheduler.{trackA,trackBTime}` (app.js:41-50, api.js:122-128, 581-582). Changing the zip in the admin does nothing. This matters directly for weather (§D).
7. **`fetchAll()` drops any cache key it doesn't know.** It rebuilds `cache.json` from a fixed literal without `...existing` (fetchers/index.js:81-155), so `cache.mivtzah` (written by mivtzah-scheduler.js:24-30) is wiped every 30 min (Track C) until the next 60 s poll. A weather key written the same way would be wiped too. (`fetchZmanimOnly` does spread `...existing`, index.js:195.)
8. **Latent kiosk crash.** SlideCarousel.jsx:268 references `creditOpacity`, which is only defined inside `SlideCreditContent` (line 97). Choosing credit position "On a specific slide" throws a ReferenceError when that slide shows. There's no React error boundary in `src/screen`, so the screen white-screens.
9. `GET /api/state` in `routes/api.js:69-101` is dead code. It's shadowed by `app.js:161-190`, which returns `fonts` but **not** `scheduleTemplates`.
10. The Banner container in Layout.jsx is a fixed `height: 36px` (Layout.jsx:205, 403), but the "Large" banner is 48 px tall (Banner.jsx:389), so it gets clipped. The banner also overlays the bottom 36 px of the slide area and progress dots, because no space is reserved for it.
11. ScheduleSlide shows **every** entry, ignoring both `days` and `enabled` (ScheduleSlide.jsx:520-525). The sidebar "starting in N min" readout (App.jsx:438-481) also ignores `days`/`enabled`, so weekday items announce themselves on Shabbos.
12. `settings.location.timezone` exists but nothing uses it. All "now" logic is browser-local on the kiosk and process-local on the server.
13. `settings.customTheme` / theme `'custom'` is supported on screen (tokens.js:126-131) but has no admin UI (dead). `settings.dataSources` is unused anywhere. `settings.language` is read by ScheduleSlide.jsx:529 but has no admin UI, so it's always `'he'`.
14. Every settings save PUTs the **whole** object, and the server writes it verbatim with no whitelist (api.js:114-121). StylePanel spreads its stale `settings` prop (StylePanel.jsx:146), SettingsPanel saves its whole `local` copy, and the banner bar spreads `state.settings` (admin App.jsx:121). So it's last-writer-wins, and one panel can clobber another's unsaved-elsewhere changes.
15. `express.json({ limit: '16kb' })` (app.js:125) applies to every API body. That's fine today, but bulk paste or import routes need their own limit.

---

## A. Every way to put a message on the screen

### A.1 Inventory table

| # | Mechanism | Data file / schema | Admin UI | Screen component | Rotation effect | Expiry | Edit after create | Expired items | Scheduling | Newlines | Font size |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Custom text slide** (`type:'custom'`, legacy `TEXT_SLIDE`) | `slides.json`; whitelist `SLIDE_FIELDS` api.js:58: `template, titleHe, titleEn, bodyHe, bodyEn, attribution, subtitle, style, duration, enabled, order, label, fullscreen` | Slides → "+ New Slide" form (SlideManager.jsx:663-842); create payload SlideManager.jsx:162-185 | `TextSlide.jsx` (when `style` empty) or `StyledSlide.jsx` (when `style` set); dispatched SlideCarousel.jsx:198-199 | Normal rotation member, own `duration` | **None.** No `expiresAt`/`startsAt` in SLIDE_FIELDS | Only enabled, label, duration, order, delete. **No content edit** | n/a (never expires) | None | Lost except Info-template body (TextSlide.jsx:117,130) | Fixed px, see A.3 |
| 2 | **Banner** message | `messages.json` `{id, timestamp, type:'banner', textEn, textHe, expiresAt, …}`; whitelist `MESSAGE_FIELDS` api.js:60 | Messages tab, type "Banner" (MessageComposer.jsx:14-18, 222-244); global size/speed/repeat saved to `settings.banner` (MessageComposer.jsx:234-237; admin App.jsx:121) | `messages/Banner.jsx`, placed by Layout.jsx:396-412 (bottom strip, fixed 36 px) | **Never pauses** (not referenced in useSlideRotation) | Client-side only: useMessages.js:13-21 (1 s sweep) + App.jsx:535 | Delete+recreate (MessageComposer.jsx:118-132); expiry reset to "Manual" (line 158) | **Kept forever** in messages.json (no server prune; cleanup.js doesn't touch messages). Admin shows them as "Expired" (MessageComposer.jsx:176) | None (relative presets only: 5/15/30/60 min, end-of-day; MessageComposer.jsx:20-37) | `white-space: nowrap` (Banner.jsx:445). Multiple banners are joined with `|` (Banner.jsx:407). Only **one language** shows: `textHe || textEn` | Small/Normal/Large = 14/16/22 px (Banner.jsx:386-390) |
| 3 | **Board** (non-blocking) | `messages.json` `type:'board'`, `target`, `subtitle` | Messages tab, type "Board" (MessageComposer.jsx:302-327) | `BoardDisplay` inside SlideCarousel.jsx:5-76, injected as `BOARD_SLIDE` (App.jsx:77-86, SlideCarousel.jsx:207) | Joins rotation at the **end**, fixed **12 s** (App.jsx:83). "Replaces slide content only": sidebar and banner stay | Client-side (App.jsx:78, 499) | Delete+recreate | Kept forever | None | Lost (no pre-wrap, SlideCarousel.jsx:38-45) | Primary 26 px (Hebrew font even for English-only text), secondary 15 px, subtitle 13 px, target 11 px; card `maxWidth: 640px` (SlideCarousel.jsx:15) |
| 3b | **Board "hold screen"** (blocking) | intended `blocking:true`; **stripped by server** (api.js:60) | Checkbox MessageComposer.jsx:316-326 | SlideCarousel.jsx:180-184 would replace all slides with BoardDisplay | Would not pause the timer (useSlideRotation doesn't look at it) | same | same | same | same | same | same |
| 4 | **Takeover** | `messages.json` `type:'takeover'`, `style`, `subtitle`, `target` | Messages tab, type "Takeover", 6 of 11 styles reachable (MessageComposer.jsx:5-12). Torah/Trip/Phone/Memorial/Hype exist only on screen (Takeover.jsx:1352-1900, list 1966-1978) | `messages/Takeover.jsx`, `position: fixed; inset:0; zIndex:100` (Takeover.jsx:1950-1958), covers sidebar too | **Always pauses**: useSlideRotation.js:25-28 + 192 | Client-side (useSlideRotation.js:27, App.jsx:418-420) | Delete+recreate. A new id re-fires the entrance animation (AnimatePresence key = id, Takeover.jsx:1949) | Kept forever | None | Lost | Primary 80–120 px, secondary 28–60 px depending on style (Takeover.jsx:774-1903). Fixed sizes, **no fit**, so long text overflows. Phone/Hype use `Arial` (Takeover.jsx:1670, 1903), which breaks the "no system sans" rule |
| 5 | **Pinned note** (sidebar) | `pinned.json`; `PINNED_FIELDS` api.js:61: `textHe, textEn, priority, enabled, order, icon, expiresAt, displayMode('note'\|'slide'), duration, fullscreen` | Messages tab, under an `<hr>` (admin App.jsx:113-131) → `PinnedManager.jsx` (embedded). Expiry is "N minutes/hours/days/weeks" (PinnedManager.jsx:11-16, 50-53) | `PinnedNotes.jsx` in the left column (App.jsx:482-486) | None. Max 3 visible, auto-cycles every 4 s when >3 (PinnedNotes.jsx:6-19) | Client-side (App.jsx:483) | `PUT /api/pinned/:id` exists (api.js:297-312), but the UI only edits displayMode, duration and fullscreen, **not text** | Kept forever | None | Can't enter one (single-line `<input>`, PinnedManager.jsx:107, 133) | 15 px primary, 13 px Hebrew secondary (PinnedNotes.jsx:84, 112) |
| 6 | **Pinned as slide** | same, `displayMode:'slide'` | toggle per row (PinnedManager.jsx:76-82) | `PinnedSlide.jsx`, injected (App.jsx:64-76), `fullscreen` hides the sidebar (App.jsx:422, Layout.jsx:298) | Joins rotation after regular slides, before boards; own `duration` (default 10) | Client-side (App.jsx:65) | as above | Kept | None | Lost | 48 px primary, 28 px secondary; `maxWidth 700px` (PinnedSlide.jsx:13, 32, 62) |
| 7 | **Countdown alert** | `schedule.json` entry `alertBefore`, `countdownDisplay` | ScheduleEditor "Alert Before" / "Alert Type" (ScheduleEditor.jsx:~527-550) | `CountdownOverlay.jsx`, as a takeover overlay (App.jsx:578-584) or via SlideCarousel `COUNTDOWN` | Overlay doesn't pause rotation (rendered beside, not via useSlideRotation) | Server timers (countdown.js:58-127) | via schedule entry | n/a | Day-of-week (broken) | n/a | n/a |
| | | | | | | | | | | **Broken end-to-end, see Bugs 1-4** | |
| 8 | **Sidebar "starting in N min"** | derived from `schedule.json` | none (automatic) | inline in App.jsx:438-481 | none | shows 0<Δ≤10 min | n/a | n/a | ignores `days`/`enabled` | n/a | 18/22 px name, 15 px |
| 9 | **Custom Days badge** | `custom-days.json` (`title, titleHe, subtitle, hebrewMonth/Day` or `gregorianMonth/Day`, `recurring` (ignored)) | `CustomDaysEditor.jsx` (create/delete only) | `HebrewDate.jsx:22-40` (match), badge ~lines 222-250 | none | Annual recurrence only. `date` field whitelisted (api.js:62) but unused | **No edit** | n/a | yearly | n/a | 16/12 px |
| 10 | **Styled template slide** | same as #1 with `style` | same form, "Visual Style" (SlideManager.jsx:686-714) | `StyledSlide.jsx` (6 styles; `bodyEn/He/attribution` are repurposed as "target", StyledSlide.jsx:862-866) | rotation | none | none | n/a | none | Lost | Primary 48–52 px, secondary 26–28 px (StyledSlide.jsx:239-861) |
| 11 | Credit line | `settings.credit` | SettingsPanel.jsx:480-700 | Layout.jsx:23-71 / SlideCarousel.jsx:90-139 | — | — | yes | — | — | — | 11/15/20 px |
| 12 | RSS / Image / Video / Google Photos slides | `slides.json` (+ `rss-feeds.json`, `google-albums.json`) | RSSManager, ImageUploader, GooglePhotosManager | RSSSlide, ImageSlide, VideoSlide, GooglePhotosSlide | rotation | none | partial | — | — | — | (not messages; listed for completeness) |
| 13 | Screen commands | none (SSE `screen-command`) | ScreenControls.jsx | App.jsx:197-213 | pause/resume/advance/blank | n/a | n/a | not persisted. Restart = resume | — | — | — |

### A.2 Expiration logic, in detail

- **Server never evaluates message/pinned expiry.** It stores `expiresAt` verbatim (api.js:240-246, 286). `cleanup.js` (whole file) only handles orphan uploads, Google Photos dirs, and `.bak`/`.tmp` files. It never touches `messages.json`/`pinned.json`. Expired items accumulate forever and show as "Expired" in the admin lists (MessageComposer.jsx:176, PinnedManager.jsx:18-33).
- **Kiosk evaluates expiry** in 6 places, with duplicated logic: useMessages.js:13-21 (1 s interval), useSlideRotation.js:25-34, App.jsx:65, 78, 419, 483, 499, 535. The kiosk also re-fetches full state every 5 s (useSSE.js:78-89), which re-introduces expired items that the 1 s sweep then removes again.
- Expiry choices: Messages offer relative presets only (MessageComposer.jsx:20-37). Pinned offers "N units from now" (PinnedManager.jsx:52). There's **no absolute date+time** and **no start time** anywhere.

### A.3 Text size and whitespace on custom slides (TextSlide.jsx)

| Template | Title He | Title En (He present / En only) | Body He | Body En (He present / En only) | Container | pre-wrap |
|---|---|---|---|---|---|---|
| headline (default) | 72 px | 36 / 60 px (lines 14-26) | **not rendered** | **not rendered** | none (width 100%) | no |
| quote | 30 px | 22 / 30 px | 20 px | 15 / 20 px | maxWidth 650 (33) | no |
| info | 36 px | 18 / 36 px | 20 px | 14 / 20 px | maxWidth 600 (112) | **body only** |
| announcement | 42 px | 18 / 42 px | 22 px | 15 / 22 px | maxWidth 600 (141) | no |

Notes:
- The **headline template silently drops the body fields**. The form still shows Body inputs for it (SlideManager.jsx:769-791).
- `subtitle` is **ignored by TextSlide** (it's not destructured at TextSlide.jsx:5). It only appears with a Visual Style (StyledSlide).
- `SLIDE_LABELS` has no `custom` key, so the top-left category chip is empty for custom slides (SlideCarousel.jsx:186, 158-175).

### A.4 Overlaps and redundancy

- **Board vs. custom slide vs. pinned-slide**: all three are text cards in the rotation, with three files, three admin locations, three renderers (BoardDisplay, TextSlide/StyledSlide, PinnedSlide), three different sets of sizes, and three different expiry stories (expiry on board and pinned, none on slide).
- **Takeover vs. StyledSlide**: same visual vocabulary, two copies of the keyframes and style code (StyledSlide.jsx:6-79 "same as Takeover but reused here", plus getPrimarySecondary duplicated at StyledSlide.jsx:209 and Takeover.jsx:1925). The 11 vs. 6 style lists have drifted.
- **Pinned note vs. banner**: both are "persistent small ambient text". The difference is placement (sidebar vs. bottom strip).
- The admin-reorg spec (`docs/superpowers/specs/2026-07-21-admin-reorg-design.md`) proposes `PUT /api/messages/:id` and an Active/Compose split but keeps the three files separate. Nothing in it is implemented (no `PUT /messages/:id` in api.js).

### A.5 Proposed unified "Announcements" composer

**One composer, one list, one file.** The choice is "Display as: **Slide** · **Banner** · **Side note** · **Takeover**", plus an advanced **Slide → "Hold the slide area"** toggle (the fixed blocking Board).

#### Data model — `data/announcements.json`

```jsonc
{
  "version": 1,
  "items": [
    {
      "id": "uuid",                       // preserved from legacy id on migration
      "createdAt": "ISO", "updatedAt": "ISO",
      "display": "slide" | "banner" | "note" | "takeover",
      "hold": false,                      // slide only: replaces the slide area until it ends (old blocking board)
      "content": {
        "headlineEn": "", "headlineHe": "",   // primary text (multi-line allowed)
        "bodyEn": "", "bodyHe": "",           // secondary text (multi-line allowed)
        "subtitle": "", "target": "", "attribution": ""
      },
      "look": {
        "style": null | "classic" | "grand" | "emergency" | "sleek" | "celebration" | "urgent"
                 | "torah" | "trip" | "phone" | "memorial" | "hype",
        "template": "headline" | "quote" | "info" | "announcement" | "board",   // used when style == null
        "fit": "auto" | "fixed",          // auto = grow/shrink to fill the box (default for new items)
        "maxFontPx": null,                // optional cap for auto-fit
        "fullscreen": false               // slide only: hide sidebar
      },
      "slide": { "duration": 12 },        // display == slide
      "note": { "icon": null, "order": 0, "priority": null },   // display == note
      "when": {
        "startsAt": null | "ISO",         // absolute date+time (null = immediately)
        "expiresAt": null | "ISO",        // absolute date+time (null = until removed)
        "lastDurationMin": null,          // remembered so "Re-activate" can offer the same length
        "recurrence": null | {
          "days": ["Sun","Mon","Tue","Wed","Thu","Fri","Shabbos"],   // same codes as schedule (DAY_CODES)
          "monthDays": [1, 15],           // optional Gregorian day-of-month
          "windows": [{ "start": "07:00", "end": "09:30" }],          // local time; empty = all day
          "from": "YYYY-MM-DD" | null, "until": "YYYY-MM-DD" | null
        }
      },
      "enabled": true,                    // manual pause without deleting
      "legacy": { "file": "messages.json" | "slides.json" | "pinned.json",
                  "type": "banner" | "board" | "takeover" | "custom" | "TEXT_SLIDE" | "note" | "slide",
                  "extra": { /* any unknown/unused fields verbatim: priority, bgColor, timestamp, order... */ } }
    }
  ]
}
```

**Rotation position.** `slides.json` stays the rotation spine. A migrated custom slide keeps its slides.json row (same `id`, same array position, same `enabled`/`duration`/`label`) but becomes `{ id, type: "ANNOUNCEMENT", announcementId, enabled, duration, label }`. New slide-type announcements created from the composer get **no** slides.json row and are appended after regular slides, exactly as boards and pinned slides are today (App.jsx:87). The admin can "pin into rotation order" later, which creates the ref row. This keeps every existing ordering intact.

**"Active now?"** One pure shared function, e.g. `src/shared/announcements.js`:
`isActive(a, now) = a.enabled && (!startsAt || now >= startsAt) && (!expiresAt || now < expiresAt) && recurrenceMatches(a.when.recurrence, now)`.
It's used by the kiosk (render), the admin (status badges: Live / Scheduled / Expired / Paused), and the server (optional SSE nudges at boundaries). It runs client-side on the kiosk, which matches the Vercel spec's direction of moving timers to the kiosk (vercel spec §1 row 23). It replaces the 6 duplicated expiry checks listed in A.2.

**Lossless migration** (idempotent, at server startup in code, not via committed data files). This is required because `deploy/update.sh:41-70` restores the Pi's own `data/*.json` after every pull, so a committed `announcements.json` would never reach the Pi.

| Legacy | → Unified |
|---|---|
| messages.json `type:'banner'` | `display:'banner'`; textEn/He→headlineEn/He; expiresAt→when.expiresAt; timestamp→createdAt; priority/bgColor/unknown→legacy.extra |
| `type:'board'` | `display:'slide'`, `look.template:'board'`, `slide.duration:12`, target/subtitle kept; `hold:!!blocking` (always false today because it was stripped) |
| `type:'takeover'` | `display:'takeover'`, `look.style` kept (default 'classic') |
| slides.json `type:'custom'`/`'TEXT_SLIDE'` | `display:'slide'`; titleEn/He→headlineEn/He; bodyEn/He, attribution, subtitle, template, style→look; duration; `look.fit:'fixed'` (so existing slides look identical until the owner opts in); slides.json row rewritten to an `ANNOUNCEMENT` ref with the same id and position |
| pinned.json `displayMode:'note'` (or missing) | `display:'note'`; textEn/He→headlineEn/He; icon/order/priority→note; expiresAt |
| pinned.json `displayMode:'slide'` | `display:'slide'`, `look.template:'pinned'`, duration, fullscreen |

Before rewriting, copy originals to `data/legacy/<name>.pre-announcements.json`, then write `[]` to messages/pinned. Keep the old GET endpoints returning `[]` for one release, and keep accepting old POST shapes by translating them (the Live Preview iframe and any open admin tabs). Add `'announcements'` to the Vercel spec's `tt_documents` key list (vercel spec ~line 269-271).

**API:** `GET/POST /api/announcements`, `PUT /api/announcements/:id` (partial merge that preserves `id`/`createdAt` and does **not** touch `when.expiresAt` unless it's sent; this is the reorg spec's requirement), `POST /api/announcements/:id/reactivate { durationMin | expiresAt }`, `DELETE`. Add a field whitelist. Broadcast a single `announcements-update` SSE event.

**Composer UX features:**
- Edit-after-send: inline expand on the row; same id, so text edits don't re-fire takeover animation.
- Re-activate an expired item with a new duration: "Again for 15 min / 1 h / until 9:00 PM / until date".
- Expiry at date+time: `datetime-local` plus quick chips.
- Recurrence: day chips (Sun…Shabbos), day-of-month, time windows (multiple), optional date range.
- Keep expired items in an "Expired" tab. Optional auto-purge after N days could be added to `cleanup.js`, which today has no such logic.
- Multi-line textareas everywhere, and live preview using the same screen component.

**Screen-side rules that must be preserved**

1. **Banner never pauses rotation.** Today it isn't referenced by useSlideRotation at all; keep it that way. Strip at the bottom of the frame (Layout.jsx:396-412). Multiple active banners are concatenated with a separator (Banner.jsx:407). Global size/speed/repeat stay in `settings.banner`.
2. **Takeover always pauses rotation** (useSlideRotation.js:153-157, 192) and covers the whole canvas, sidebar included (Takeover.jsx:1950-1958, zIndex 100). Today only the **first** active takeover in array order shows (App.jsx:418). Define precedence explicitly (newest or highest priority), but show exactly one.
3. **Board/slide replaces slide content only.** It renders inside SlideCarousel; sidebar, clock, banner and pinned notes stay visible. Non-hold items join rotation. A "hold" item replaces the slide area (SlideCarousel.jsx:180-184). Decide whether hold should also stop the hidden timer; today the timer would keep advancing invisibly. That would be a behavior change, so flag it to the owner.
4. **Side notes**: max 3 visible, 4 s cycle (PinnedNotes.jsx:6-19), hidden by `settings.visibility.pinnedNotes === false`.
5. `fullscreen` slide hides the sidebar (App.jsx:422, Layout.jsx:298-313).
6. Expired items disappear within ~1 s without a server round-trip. "No expiry" means it stays until removed.
7. Countdown takeover overlays without pausing rotation (App.jsx:578-584). Keep this or make it explicit.
8. SSE → state merge pattern (App.jsx:149-220) plus the 5 s full-state poll (useSSE.js:78-89): new data must be in `/api/state` (app.js:161-190) or the poll will drop it.

**Text fit to fix "small text":** a shared `<FitText>` (binary-search font size in a ResizeObserver-measured box, `white-space: pre-wrap`, min/max px). The pattern already exists in ScheduleSlide FullDayMode and LimudimSlide. Per GOTCHAS, guard ResizeObserver callbacks after unmount. Remove the 600–700 px `maxWidth` caps for announcement slides, or make them proportional (≈90% of the slide box). Apply FitText to slide, takeover (primary line) and note.

---

## B. Schedule system

### B.1 What exists

- **Data** `data/schedule.json`: `{ entries: [...], categories: [...] }`. Entry fields whitelisted at api.js:63: `name, nameHe, time ("HH:MM" 24h), endTime, category, days[], enabled, alertBefore, order, countdownDisplay, icon`. Categories: `id, name, color, icon` (api.js:64). The live file has 17 entries, all weekday/Friday, **no Shabbos entries**, and none with `countdownDisplay`. It shows input friction too: Mincha `endTime: "02:30"` (meant 14:30).
- **`schedule-templates.json`**: an array of `{ id, name, entries, categories, createdAt, updatedAt }`, each a full-schedule snapshot (one: "Regular weekday", 16 entries). There's also a code-only built-in "Standard Yeshiva Day" (ScheduleEditor.jsx:33-41, 584-590; note it uses `alertDisplay`). **Loading a template replaces the whole schedule** and regenerates every id (api.js:474-494).
- **Routes**: api.js:371-575. They cover GET, bulk PUT entries, POST, PUT/:id and DELETE/:id entry, PUT categories, POST template (load), and templates CRUD. Each mutation broadcasts `schedule-update` and calls `initCountdowns()`.
- **Admin** `ScheduleEditor.jsx` (1338 lines): TemplateManager (595-923), CategoryManager (208-354), EntryForm (356-~580), list (~1157-1338). `onUpdateEntries` (bulk) is wired but unused. The edit form renders **above the list** (~1132), not inline.
- **Kiosk** `ScheduleSlide.jsx`: modes `full` (auto-shrink, min scale 0.45), `scroll` (ticker), `two-column` (`settings.scheduleDisplayMode`, `scheduleScrollSpeed`, `scheduleScrollStart`). Header language is `settings.language` (no admin UI). maxWidth 720/960 px (ScheduleSlide.jsx:~553). It shows all entries, ignoring `days`/`enabled`.
- **Countdown** `countdown.js`: per-entry setTimeout/setInterval, midnight re-init. Broken (Bugs 1-4).
- **CustomDaysEditor**: unrelated to the timetable (yahrzeit/date badges, §A #9).
- **Date preview** `GET /api/preview-state?date=` (api.js:1206-1346) fetches date-specific zmanim and limudim, but returns the plain `schedule.json` (no per-date resolution) and no `fonts`.

### B.2 Status of the 2026-07-21 schedule-date-overrides spec and plan

**Not implemented.** There is no `src/shared/scheduleResolution.js`, no `data/schedule-dates.json`, no `/api/schedule/dates*` routes, no `exceljs`, and no `test` script in package.json. All plan checkboxes are `- [ ]`. The only commits are docs (`84f3902`, `b470146`, `3d7cecb`, `a0af1ae`). ScheduleEditor/ScheduleSlide/countdown.js haven't changed since `296417d`/`bea408b`. Two locked agent worktrees exist at the same commit with no extra commits.

What the spec proposes (still valid as the target model):
- `data/schedule-dates.json`: `{ "YYYY-MM-DD": { entries: [ …entry minus days… ] } }`. Key present means an override, even if empty. Categories stay shared in `schedule.json`.
- `getEffectiveSchedule(schedule, scheduleDates, dateISO)`, which falls back to recurring entries **filtered by day-of-week** (a deliberate display change).
- Excel template/import (`exceljs`), full-replace per date, all-or-nothing validation with `{sheet,row,message}` errors, auto-create unknown categories, new SSE `schedule-dates-update`.

**Gaps in the plan to fix when implementing:**
1. Also resolve in App.jsx:438-481 (sidebar "starting in") and api.js:1206 (`preview-state`, which should resolve for `?date=`). Plan Tasks 2 and 4 only cover countdown.js and ScheduleSlide.
2. Fix countdown Bugs 1-4. The plan's Global Constraints say to leave the lowercase mapping alone, but with day filtering, alerts stay dead unless it's fixed. Also rename the admin `alertDisplay` → `countdownDisplay` (or whitelist both) and fix `.mode` vs `.displayMode`.
3. The fallback should also respect `enabled`.
4. Add `scheduleDates` to app.js:161 `/api/state` (not the dead api.js:69 copy). Otherwise the 5 s poll will overwrite SSE pushes.

### B.3 Why editing is hard today (click and field counts)

**Change one entry's time** (e.g. Mincha 14:10 → 14:20): open Schedule tab (1) → scroll the time-sorted list → **Edit** (2) → the form appears **above** the list, so scroll back up → change the native `<input type="time">` (segment typing: h, m, AM/PM) (3) → **Update** (4). That's about 4 clicks + 2 scrolls + 3 segment edits. It also silently drops the alert-type choice (Bug 2).

**Enter a whole Shabbos** (Fri night + Shabbos day, realistically 15–22 items):
- Per entry: **+ New Entry** (1) → Name, Hebrew name, Time, End time (4 typed fields) → Category select (1-2) → Days: the default is Sun–Fri (`emptyForm`, ScheduleEditor.jsx:98-103), so you must click "All" and then deselect 6 days, or toggle off 6 and on 1 (≈7) → Alert Before (1) → Alert Type (1) → optional Icon (2) → **Create** (1). That's ≈12–15 clicks + 4 typed fields per entry, so roughly **200–300 clicks and 60–90 typed fields** for one Shabbos.
- **And it still wouldn't display correctly.** ScheduleSlide ignores `days`, so Shabbos entries would show all week and weekday entries on Shabbos. The only workable flow today is template swapping: save weekday as a template, wipe and build "Shabbos", load "Shabbos" on Friday, load "Regular weekday" on Sunday. Each load is a full replace with new ids.
- There's no copy/duplicate entry, no bulk edit, no date concept, no paste, and no undo. Delete has no confirm (ScheduleEditor.jsx ~1264).

### B.4 Proposed paste-in format ("Paste schedule")

Goal: the owner asks Claude chat for "this Friday + Shabbos", pastes the reply into an admin textarea, sees a validated preview, and clicks **Apply**. It maps 1:1 onto `schedule-dates.json` (the planned per-date override model). Each `@` block **fully replaces** that date's override, the same semantics as the Excel import.

#### Format "TachTach Schedule Text v1"

```
# TachTach schedule v1
@ 2026-10-16 Fri   Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening | alert 10
1:30 PM | Mincha | מנחה | Davening | alert 5
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening
8:00 PM | Seudas Shabbos | סעודת שבת | Meals

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening | alert 10
12:15 PM - 1:30 PM | Kiddush & Seuda | קידוש וסעודה | Meals
5:45 PM | Mincha | מנחה | Davening
6:20 PM | Shalosh Seudos | סעודה שלישית | Meals
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening
```

Rules:
- `#` lines and blank lines are ignored.
- **Date header**: `@ YYYY-MM-DD` (required, canonical), followed by optional free text (day name / label, ignored or used as a note). The parser accepts `@ Fri 10/16` or relative `@ this Friday` / `@ next Shabbos`. It always **resolves and displays the absolute date** in the preview, and warns if the written weekday doesn't match the date.
- **Entry line**: `START[ - END] | Name (English) | Name (Hebrew) | Category | options…`
  - Times: `7:05 AM`, `7:05am`, `19:05` are all accepted and normalized to `HH:MM` 24h (what `schedule.json` stores). If END is earlier than START, the preview flags it (catches the "02:30" typo).
  - Hebrew/English fields are detected by script (Hebrew Unicode range), so order mistakes are tolerated. Either name may be omitted (`7:05 AM | Shacharis`).
  - Category matches a category `id` or `name`, case-insensitive. Unknown names produce a warning and are auto-created with a palette color (same as the Excel spec).
  - Options (any order): `alert N` (0/1/2/5/10/15 minutes; default 0), `takeover` (→ `countdownDisplay:'takeover'`, default `slide`), `icon NAME` (one of the 16 in `src/shared/ScheduleIcons.jsx`), `off` (→ `enabled:false`).
- An `@ YYYY-MM-DD` with no lines is an explicit empty day. `@ YYYY-MM-DD clear` removes the override (reverts to recurring).

**JSON alternative** (same model, for programmatic use; identical to the planned `schedule-dates.json`):
```json
{ "2026-10-17": { "entries": [ { "name": "Shacharis", "nameHe": "שחרית", "time": "09:30", "endTime": "", "category": "davening", "alertBefore": 10, "countdownDisplay": "slide", "enabled": true, "icon": "prayer" } ] } }
```
The textarea auto-detects JSON if the first non-space character is `{`.

**Flow / validation:**
1. Admin → Schedule → "Paste schedule" textarea (mobile-friendly; no file needed, so it works on a phone, unlike the Excel round-trip).
2. **Preview** parses client-side with a shared pure parser (`src/shared/schedulePaste.js`, also used server-side). It shows a per-date card with weekday, "Replaces N existing override entries" or "New override (was: recurring)", a table of resolved 24h/12h times, both names, category chip (new ones flagged), alert, plus per-line errors and warnings with line numbers. **Apply is disabled while there are errors.**
3. **Apply** sends `PUT /api/schedule/dates` with `{ text }` (raw text is smaller) or the parsed JSON. The server re-parses and re-validates **all-or-nothing**, auto-creates categories, writes `schedule-dates.json`, broadcasts `schedule-dates-update` (+ `schedule-update` if categories changed), and re-inits countdowns. Give this route its own `express.json({limit:'256kb'})` / `express.text()`; the global limit is 16 kb (app.js:125).
4. "Copy current as text" exports any date's effective schedule in the same format, so Claude can be given last week's Shabbos as a starting point.
5. Optional: "Save these dates as a reusable block" ("Shabbos Mevarchim"), stored like `schedule-templates.json` but per-day (no `days`).

#### Example prompt for Claude chat

> You format yeshiva schedules for our TV screen. Output ONLY a code block in this exact format, nothing else:
>
> ```
> # TachTach schedule v1
> @ YYYY-MM-DD DayName
> H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options
> ```
> Rules: one `@` header per calendar date (Friday-night items go under Friday's date). Categories must be one of: Davening, Learning, Meals, Events, Trips, Breaks. Options are optional, space-separated: `alert N` (N = 1, 2, 5, 10 or 15 minutes before), `takeover` (full-screen alert instead of a small one), `icon NAME` (prayer, book, meal, candle, star, bus, music, sports, calendar…). Give every item both an English and a Hebrew name. Use 12-hour times with AM/PM.
>
> Make the schedule for **this Friday, October 16, 2026, and Shabbos, October 17, 2026** (Parshas Bereishis, Miami Beach 33139). Candle lighting 6:28 PM, Shkiah 6:46 PM, Shabbos ends 7:36 PM. Here is what's happening: [owner's notes…]. Put `alert 15 takeover` on candle lighting and `alert 10` on each Shacharis.

---

## C. Screen-side layout audit

### C.1 Canvas and scaling

- Design canvas is **1600×900** landscape / **900×1600** portrait (ScreenScaler.jsx:11-12), deliberately smaller than 1920×1080 to "zoom in" (comment lines 3-10). It's scaled with **non-uniform** `scale(x, y)` from `window.inner*` (ScreenScaler.jsx:19-23, 39), so non-16:9 displays stretch text. Pinned top-left. GOTCHAS calls this the most-touched fragile file.
- `position: fixed` children inside the transformed div are relative to the canvas (the transform creates a containing block). Takeover, Layout and banner rely on this.
- Clock uses `clamp(80px, 10vw, 128px)` (Clock.jsx:27). `vw` is the **real** viewport, not the canvas, so it's always 128 px on any screen at least 1280 px wide. It's the only viewport-relative unit; avoid adding more.

### C.2 Where the whitespace comes from (landscape)

1. Outer padding 16 px plus two hairline frames at 12/15 px inset (Layout.jsx:272-310).
2. Sidebar column is `min(28%, 380px)` (Layout.jsx:301), so 380 px, with 20 px side padding (≈340 px content).
3. Slide column ≈ 1600−32−380 = **1188 px**. Progress-dots row (8+6+4 px, Layout.jsx:355-359).
4. Every slide's `motion.div` adds **48 px top / 40 px sides / 32 px bottom** padding (SlideCarousel.jsx:251-255), leaving about **1108×~770 px** usable.
5. Then every content slide caps its own width: TextSlide 600–650, PinnedSlide 700, Board card 640 (+32 padding), Zmanim 720, HayomYom 720, Schedule 720/960, DailyQuote 700, PirkeiAvos 700, RSS 700, Limudim 920. Most slides use about 55–65% of the available width, centered.
6. The banner overlays the bottom 36 px instead of reserving space (Layout.jsx:396-412).
7. The category chip is absolute at top-left of the slide area (SlideCarousel.jsx:215-234). The 48 px top padding exists to clear it.

### C.3 Body font sizes in use (px on the 1600×900 canvas; ×2.4 on a 4K TV)

| Area | Sizes |
|---|---|
| Clock | 128 (AM/PM 22) — Clock.jsx:27, 47 |
| Hebrew date | 52; English date 16; parsha 18; omer 22/16; custom-day badge 16/12 — HebrewDate.jsx ~165-275 |
| Pinned notes | 15 / 13 |
| Sidebar "starting in" | 22 (18 if >12 chars) / 15 |
| TextSlide | see A.3 (body 20–22; English secondary 14–15) |
| Board | 26 / 15 / 13 / 11 |
| PinnedSlide | 48 / 28 |
| StyledSlide | 48–52 / 26–28 / subtitle 22 / target 18 |
| Takeover | 80–120 / 28–60 |
| Zmanim | Hebrew name 26, English name 13, time 28 (compact 20/11/22) — ZmanimSlide.jsx:53-55 |
| Schedule | time 24–28, name 23–26, sub 14 (×scale down to 0.45) — ScheduleSlide.jsx:~103-108 |
| HayomYom | 14–26 |
| DailyQuote | 72 / 24 / 16 |
| RSS | 72 / 32–40 / 18–24 |
| Chip label | 13 |
| Banner | 14 / 16 / 22 |

Only `settings.hebrewFontScale` / `hebrewHeadingScale` exist as user scale controls, and they **only affect LimudimSlide** (LimudimSlide.jsx:637-638), even though StylePanel presents them as global "Hebrew Body/Heading Scale" (StylePanel.jsx:~295-350).

### C.4 Customization a redesign MUST keep working

**Themes** (tokens.js:1-131): `dark` (default), `dark-hc`, `midnight`, `sepia`, `parchment`, `clean-white`, `ivory`, `sky`, plus `custom` (`customTheme.{base,primary}`, no admin UI). Token keys every component uses: `bg, text, dim, muted, gold, goldBg, goldBd, surface, copper, framePrimary, frameSecondary`. Note: "gold" is really "accent" (blue in midnight, teal in sky). Light themes are used by **auto day theme** (current settings: day `sky`, night `midnight`). Hard-coded colors in StyledSlide/Takeover, and the background radial gradients in Layout.jsx:93-95/248-250, ignore the theme.

**Fonts** (tokens.js:134-159): the mutable shared `fonts` object `{hebrewPrimary, hebrewDisplay, englishBody, englishDisplay}` is updated in place by `applyFontSettings(settings)` on every render (App.jsx:291). Custom @font-face rules are injected from `state.fonts` (= `data/fonts.json`, App.jsx:302-365). Google Fonts `<link>` covers built-ins (App.jsx:308-337). The owner currently uses custom `FbMazalMedium` (Hebrew) + `EB Garamond`. Any new component must read `fonts.*` **at render time** (not capture it at module load) to keep this working.

**Every settings key the screen reads** (grep of `src/screen`):

| Key | Read at | Written by admin? |
|---|---|---|
| `theme` | App.jsx:274 (+ Layout prop) | SettingsPanel |
| `customTheme` | App.jsx:287, tokens.js:127 | **no UI** |
| `themeAuto.{enabled,dayTheme,nightTheme}` | App.jsx:275-285 (uses `cache.zmanim.today.sunrise/sunset`) | SettingsPanel |
| `orientation` | App.jsx:423 | SettingsPanel |
| `portraitLayout` | App.jsx:510 | SettingsPanel |
| `clockSide` | App.jsx:573 | SettingsPanel |
| `visibility.{clock,hebrewDate,parsha,omer,pinnedNotes}` | App.jsx:288/427, HebrewDate.jsx, PinnedNotes.jsx:21 | SettingsPanel |
| `fonts.{hebrew,hebrewBody,hebrewHeading,english}` | tokens.js:142-149, App.jsx:302-365 | StylePanel |
| `fonts.customFonts` | legacy, ignored now (App.jsx:294-301) | no longer |
| `hebrewFontScale`, `hebrewHeadingScale` | LimudimSlide.jsx:637-638 | StylePanel |
| `banner.{size,speed,repeat}` | Banner.jsx:403-405 | MessageComposer |
| `credit.{enabled,text,size,position(bottom\|under-clock\|slide),slideId,logo.{url,blend,position,size}}` | Layout.jsx:23-71/216-231/326-429, SlideCarousel.jsx:90-139/263-275 | SettingsPanel |
| `scheduleDisplayMode`, `scheduleScrollSpeed`, `scheduleScrollStart` | ScheduleSlide.jsx:533-538 | SettingsPanel |
| `language` | ScheduleSlide.jsx:529 | **no UI** |
| `limudimLang`, `limudimItems` | LimudimSlide.jsx | SlideManager / SettingsPanel |
| `hayomYomLang` | HayomYomSlide.jsx:42 | SettingsPanel |
| `zmanimVisible` | ZmanimSlide.jsx:113-114 | SlideManager |

Server-only keys: `location.{zip,locationId,timezone}`, `scheduler.{trackA,trackBTime}`. The admin writes stray top-level `zipCode`, `chabadLocationId`, `trackA`, `trackBTime` instead (Bug 6). `dataSources.*` is unused.

Other screen behaviors to keep: hidden 5-tap admin gesture (HiddenAccess.jsx, top-left 10×10); `?preview=true` and `?previewDate=` modes (App.jsx:36-41, 99-117, 247-257); kiosk reports slide index (App.jsx:233-245); Pirkei Avos shows **only on Saturday** (useSlideRotation.js:143-146; FEATURES.md says "seasonal", which is wrong or incomplete); Mivtzah embed is excluded from rotation without a URL (useSlideRotation.js:149); video with duration 0 plays full (useSlideRotation.js:167); HayomYom can extend its duration (`onRequestDuration`).

GPU caveat (GOTCHAS): heavy blend modes, shadows, infinite CSS animations and live filters degraded the Pi 5 at 4K. Takeover/StyledSlide keyframes are infinite. Keep new effects static.

---

## D. Weather: where it plugs in

### D.1 Settings

Add `settings.weather = { enabled: false, showInSidebar: true, units: "F", zip: null, lat: null, lon: null, placeName: null }`. Default `zip` to `settings.location.zip` (setup.js:99-101, current value `33139`). **Fix Bug 6 first or at the same time**: the admin's zip field writes `zipCode`, not `location.zip`. Geocode once **when zip changes** (in the `PUT /settings` handler, api.js:114, or lazily in the fetcher) and store lat/lon/placeName, so the 30-min fetch doesn't geocode every time. Also add `settings.weather.slide` options if needed (days to show).

### D.2 Fetcher

Follow the `src/fetchers/*.js` pattern: `node-fetch`, UA header, return `null` on failure so callers keep stale data (see mivtzah.js / torahcalc.js).
- `src/fetchers/weather.js`:
  - `geocodeZip(zip)`. Free, no key. Options: `https://api.zippopotam.us/us/{zip}` (returns `places[0].latitude/longitude/place name`), or Hebcal's zmanim API (`https://www.hebcal.com/zmanim?cfg=json&zip={zip}`), already a trusted dependency (hebcal.js:57 uses `geo=zip`). I couldn't verify response shapes from this sandbox (egress 403), so check them at implementation time.
  - `fetchWeather(lat, lon, tz)` calls Open-Meteo (free, no key, non-commercial terms): `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&hourly=temperature_2m,precipitation_probability,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=4`. Map WMO `weather_code` to a label (EN/HE) and icon in `src/shared/weatherCodes.js`, so screen and admin share it.

### D.3 Caching

**Don't just add a `weather` key with a separate read-modify-write of cache.json.** `fetchAll()` rebuilds cache.json without spreading `existing` (fetchers/index.js:81-155) and would wipe it every 30 min (Bug 7; Mivtzah already suffers from this). Two options:
- (a) Add weather to `fetchAll`'s `Promise.allSettled` list (index.js:35-47) with `weather: weather ? {...} : existing.weather || null` (like every other key). It then rides Tracks B/C for free, every 30 min, which is plenty for weather. Also fix `fetchAll` to start from `{...existing, ...}` so Mivtzah stops disappearing.
- (b) A separate `weather-scheduler.js` (like mivtzah-scheduler.js) writing `data/weather.json`, served in `/api/state` (app.js:161-190) as `weather`, plus an SSE `weather-update` handled in App.jsx `handleSSE` (149-220). Cleaner isolation, but one more data file for the Vercel document table.

Recommendation: (a), plus the `...existing` fix. Also include weather in `preview-state` (api.js:1206), or fall back to cache there.

### D.4 Screen plug points

- **Sidebar readout**: in `leftColumn` (App.jsx:425-488), between `<HebrewDate>` (430-437) and the "starting in" box (438-481). Build it as a new `src/screen/components/WeatherBadge.jsx` taking `cache.weather`, `tokens`, `settings.weather`. Gate it with a new `visibility.weather` (add to SettingsPanel's visibility list, ~SettingsPanel.jsx:460-470). For portrait, also add to `portraitTopBar` (App.jsx:541-560). The sidebar is tight (≈340 px wide; the clock already takes ~176 px of height): one line like "☀ 84°F · H 88 L 77" at 20–22 px, with an inline SVG icon (no emoji font on the Pi; reuse the style of `src/shared/ScheduleIcons.jsx`).
- **Weather slide**: a new built-in type `WEATHER`. Touch points:
  - `SlideCarousel.jsx:188-209` renderSlide case → `slides/WeatherSlide.jsx` (props `cache, tokens, settings`)
  - `SLIDE_LABELS` (SlideCarousel.jsx:158-175)
  - SlideManager `BUILT_IN_TYPES`/`BUILT_IN_LABELS` (SlideManager.jsx:6-20); built-ins can't be deleted
  - default row in `setup.js` (~line 145 list) **and** a startup "ensure built-in slide exists" migration, because existing Pis keep their own slides.json (update.sh:41-70)
  - optionally hide from rotation when `cache.weather` is null (like the Mivtzah embed rule, useSlideRotation.js:149)
- **Admin**: Settings → Location: zip (fixed to write `location.zip`), units, "Show weather in sidebar" toggle, "Test" button that calls a new authed `GET /api/weather/preview?zip=` (under `requireAuth` like the rest of `/api`; the kiosk gets data via `/api/state`, so no new localhost-only endpoint is needed — see the GOTCHAS rule of thumb).
