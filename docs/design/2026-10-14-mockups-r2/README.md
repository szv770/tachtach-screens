# TachTach screen redesign: round 2 (one system)

There is one design system and one file: **`tachtach-r2.html`**. It renders on the 1600×900 logical canvas (900×1600 in portrait). Screenshots are taken at deviceScaleFactor 1.2. The content is fixed at **Tue Oct 13 2026, ב׳ חשון תשפ״ז, Parshas Noach, Miami Beach, 12:41 PM**. The repo was not modified.

The direction is A's clarity and big numerals, with C's soft surfaces. The rules are: one subject per page, one accent moment per screen, a rail that holds only what is always true, and no labels or badges that the content already makes obvious.

## How to drive it

`tachtach-r2.html?page=…&theme=…&…`

| Param | Values |
|---|---|
| `page` | `zmanim` (default board) · `zmanim-arc` · `schedule` · `event` · `words` · `list` · `quick` · `quote` · `sicha` · `letter` |
| `day` | `tue` (weekday, default) · `fri` (Erev Shabbos with day label, candle-lighting icon, ranges) |
| `pg` | page number for paged text (sicha/letter), e.g. `pg=2` |
| `theme` | Dark: `dark` `dark-hc` `midnight` `graphite`★ · Light: `parchment` `sepia` `clean-white` `ivory` `sky` `stone`★ (★ = proposed new) |
| `style` | for announcement pages: `classic` `grand` `celebration` `urgent` `emergency` `sleek` `torah` `trip` `phone` `memorial` `hype` |
| `rail` | `left` · `right` |
| `orient` | `landscape` · `portrait` |
| `fonts` | `default` (Rubik + Manrope) · `serif` (owner's FbMazalMedium + EB Garamond) |
| `time` | `HH:MM` 24h, default `12:41`. All past/next/now states and the rail's up-next card are computed from it (`12:56` shows the card) |
| `notes` | `0`–`2` pinned side notes |
| `banner` | `1` shows the bottom banner |
| `items` | `9` · `14` (dense schedule; weekday only) |
| `takeover` | `1`: full-canvas takeover (rail hidden, small clock kept) |
| `words` | `mazeltov` · `drill` |
| `motion` | `smooth` · `minimal` · `lively` |
| `demo` | `pages`: rotates pages every 6 s with the chosen motion mode · `daynight`: crossfades midnight ↔ sky every 7 s |

To re-shoot, run `NODE_PATH=$(npm root -g) node shoot.js` (it reads `shots.json`), then `node shoot-sheets.js` for the sheets.

---

## 1. Color tokens

**Base roles.** The only per-theme inputs are values that `tokens.js` already has:

| Role | Source | Used for |
|---|---|---|
| `--bg` | `bg` | page background (the rail sits directly on it) |
| `--text` | `text` | all primary type |
| `--dim` | `dim` | English secondary lines, AM/PM, dates |
| `--muted` | `muted` | banner separators only |
| `--accent` | `gold` | **the one accent moment**: the next row, the event tile, the up-next card, big-words Hebrew |
| `--onAccent` *(new, computed)* | `bg` or `#FFF`, whichever has more contrast against `gold` | text on an accent fill |
| `--lift` / `--liftPct` *(new, computed)* | dark theme: `text` at 6% · light theme: `#FFF` at 72% | builds the surface |

**Derived roles.** These are never stored per theme. They are CSS `color-mix()` from the base roles, so all 8 existing themes work with no edits:

| Role | Formula | Used for |
|---|---|---|
| `--raised` | `mix(lift liftPct, bg)` | **the single surface**: page panel, rail cards, banner. Dark themes lift toward text; light themes lift toward white, so panels sit *brighter* than the page and don't go muddy. |
| `--hi` | `mix(text 11%, raised)` | neutral highlight: the current schedule item, and the "next" row while the up-next card holds the accent |
| `--line` | `ink` at 15% | timeline track, list rules, arc |
| `--past` | `ink` at 34% | past rows and stops. It is a **color, never `opacity`**: opacity groups showed compositing seams in the first pass and cost more on the Pi. |

**Panel-local roles**, which the announcement styles override: `--panel --ink --inkDim --fill --fillInk --accentText --f-disp-he --f-disp-en --disp-w`. Every page component paints only with these, so a style is just a handful of overrides (§6).

`surface`, `goldBg`, `goldBd`, `copper`, `framePrimary` and `frameSecondary` are no longer used on the display. Keep them for the admin and for back-compat. Copper in particular is gone: round 1 used it as a second accent for "now", which broke the one-accent rule.

### Theme families

| Family | Sub-themes |
|---|---|
| **Dark** | `dark`, `dark-hc`, `midnight` (owner's night theme), **`graphite`** (new: neutral near-black with an amber accent; this is round-1 A's look that the owner liked, done in token form) |
| **Light** | `parchment`, `sepia`, `clean-white`, `ivory`, `sky` (owner's day theme), **`stone`** (new: warm grey-white with a deep green accent; calm, and different from the blue/teal/gold lights) |

New proposed tokens:
- `graphite`: `{bg:#111214, text:#ECEDEF, dim:rgba(236,237,239,.64), muted:rgba(236,237,239,.32), gold:#F0B44C}`
- `stone`: `{bg:#ECEBE6, text:#1B1C1E, dim:rgba(27,28,30,.60), muted:rgba(27,28,30,.28), gold:#2F6B53}`

The other `tokens.js` keys can be filled with the same patterns the existing themes use.

> **Flag: `sepia` is listed under Light by the owner, but its `tokens.js` values are a dark brown page** (`bg #2A2118`, cream text). The system picks the light/dark derivation by **luminance, not family label**, so sepia renders correctly as a dark page (see `sheet-themes.png`). The owner should decide between two options:
> - (a) keep it as is and file it under Dark, or
> - (b) re-spec it as a true light sepia, e.g. `bg #EADCC2`, `text #2A1E10`, `gold #8A5A1A`.

### Auto day/night crossfade

The 8 base roles are registered with `@property` (`<color>`, plus `<percentage>` for `--liftPct`). That makes them interpolable. When the switch fires, `:root.fading` sets a `transition` on just those 8 properties (3 s linear), and the new theme's base values are applied. All derived and panel roles are `color-mix()` of those 8, so they follow automatically in the same frame. Nothing is snapshotted and there is no overlay. `?demo=daynight` demonstrates it: measured `bg` went `rgb(11,17,32)` → `rgb(126,133,143)` → `rgb(237,244,250)`.

Implementation notes:
- **Trigger:** light at `lightAt` ∈ {alos, misheyakir, **netz**} and dark at `darkAt` ∈ {shkia, **tzeis**}, read from the configured zmanim. If zmanim are missing, fall back to a fixed time. The admin also picks the light and dark sub-theme.
- **The `.light` class flips at the switch**, not gradually. It only selects style hue variants (urgent/trip/hype/grand/torah/memorial), so most pages show no jump.
- **Pi cost:** a 3 s repaint of the whole screen, twice a day. If that stutters at 4K, keep the same mechanism but drive it in JS with ~40 steps over 2–3 minutes, one repaint every ~4 s. That is imperceptible and nearly free.

## 2. Fonts

| Role | Default | Serif swap (`fonts=serif`, owner's live setting) |
|---|---|---|
| `hebrewDisplay` / `hebrewPrimary` (`--f-he`) | **Rubik** (500/600) | **FbMazalMedium** → Frank Ruhl Libre fallback |
| `englishDisplay` / `englishBody` (`--f-en`) | **Manrope** (500/600/700) | **EB Garamond** |
| **`numeric`** *(new role)* (`--f-num`) | Manrope, `lining-nums tabular-nums` | EB Garamond, `lnum tnum` (stops Garamond's old-style figures) |
| style display override (`--f-disp-*`) | grand/torah/memorial use Frank Ruhl + EB Garamond for titles only | same |

- **Why Rubik + Manrope:** Rubik's slightly rounded Hebrew gives C's softness while keeping A's weight from across a room. Manrope has very clear, open numerals. Neither is Inter, Roboto or a system font.
- **`hebrewFontScale` becomes a real global multiplier (`--he-scale`).** It multiplies every Hebrew size. FbMazal needs about 1.1.
- **The owner's current `hebrewFontScale` is 1.4.** It was tuned for the old small type and would oversize the new layouts (board Hebrew would be about 60 px). Reset or clamp it to roughly 1.0–1.15 when this ships.

## 3. Type scale (canvas px; ×2.4 at 4K)

| Element | Size | Weight |
|---|---|---|
| Rail clock | **136** (AM/PM 28) | 700 |
| Rail Hebrew date | 58 (busy rail: 52) | 600 |
| Rail English date | 28 | 500 dim |
| Parsha | He 42 / En 26 (busy: one line, 34 / 24) | 500 |
| Weather | 62 temp / 24 text (busy: 52) | 600 / 500 |
| Up-next card | He 38 · countdown **84** | 600 / 700 |
| Side note | 25 (He 28), max 3 lines | 500 |
| Page title | He 36 / En 26 dim | 600 / 500 |
| **Zmanim board** | time **52** (AM 20) · He **43** · En 24 · row ≈ 64 | 700 / 500 / 500 |
| Zmanim board, portrait | time 58 · He 50 · En 25 · row ≈ 100 | |
| Board + arc | time 46 · He 36 · En 20 | |
| **Schedule spotlight** | He name auto-fit, max **68** (58 with a day label) · En 30 · time **76** (66), weight 650, AM/PM ×.36 · countdown 26 | 600 / 500 / 650 |
| Schedule day ribbon | 12 px segments · hour labels 20 | |
| Schedule "later" strip (≤ 6) | time **44** (range end ×.48) · He 32 (one size per strip, floor 80%) · En 21 | 650 / 600 / 500 |
| Schedule "later" strip, dense (7–8) | time 34 · He 26 · En 18; range end moves under the name | |
| Day label (per-date schedules) | 38 / He 38 | 600 |
| Quote | He auto-fit (wraps, balanced), max 150 · En italic max 70 · attribution 30 | Torah-text font |
| Sicha | title 46 / He 40 · body **39** at line-height 1.5 (fixed; never shrinks) · source 26 | |
| Letter | header 28 · salutation 42 · body **35** at line-height 1.6 (fixed) · closing 36 | |
| Event card | titles auto-fit, max He 210 / En 180 · tile time **150** · day 40 · place 42 / 30 | style-dependent |
| Big words | He auto-fit, max 330 · En wraps, auto-fit max 76 | 700 / 600 |
| List | heading 66 / 56 · item 40 (+He 30) · day 34 · time 46 | |
| Quick time | name 80 / He 88 (bold) · **time 340 at weight 300** in accent · place 38 | |
| Banner | 30 | 500 |

The smallest type anywhere is **20 px**: AM/PM, arc labels and dense English names. That is 48 physical px on a 4K panel.

## 4. Grid and spacing

- **Landscape:** 40 px outer margin, `400px rail | 40px gutter | 1fr page` (page ≈ 1080×820). With `rail=right` the columns mirror and rail text aligns to the outer edge.
- **Page panel:** `--raised`, radius 32, padding 30/40 (announcements 48/60). Board rows bleed 22 px into the padding so the next-row fill reaches the panel edges evenly. Other radii: 24 for rail cards and banner, 18 for rows, 30 for tiles.
- **Banner:** a 76 px row *inside the page column* (gap 20). It exists only when a banner is active; otherwise the panel takes the full height. The rail is unaffected, so the clock never moves.
- **Portrait (900×1600):** 36 margin. The rail becomes a **top band**: clock left and dates right, then weather left and parsha right. The up-next card and notes span full width under the band. The page fills the rest.
- **Auto-fit** is a one-shot binary search per render (`fitAll`), never per frame.

## 5. Rail rules

1. **Always shown:** clock · Hebrew date · English date · parsha (He + En) · weather (monochrome line icon, temp, condition, H/L). Weather is anchored to the bottom.
2. **Up-next card:** shown only when a schedule item starts within `rail.upNextMinutes` (default 5). It is an accent-filled card with the Hebrew name, "Lunch at 1:00" and a large minute countdown.
   - **While it is visible, it is the screen's one accent.** The page's own highlight drops to its neutral form (`--hi` fill, text ink). See `04a`, and `04c` where even the event tile goes neutral.
   - **Suppressed on the schedule page**, which already shows the next item and its countdown.
3. **Pinned side notes:** each is a `--raised` card holding one text in the language it was written in, clamped to 3 lines. At most 2 are visible; more rotate in place.
4. **Busy-rail compaction:** when (2) or (3) is showing, the date block tightens and the parsha collapses to one line, so everything fits with no scroll. It was verified with the card plus 2 notes.
5. **Never in the rail:** next zman, schedule lists, slide index or progress, location. Nothing that a page shows.

## 6. Pages

### Zmanim, clean board (default)
- **Rows:** one board of 11 rows. Each row is right-aligned time (tabular, colons line up), small English name, and Hebrew name flush right.
- **States:**
  - Past rows fade via `--past`.
  - The next zman is the only filled row, with "in 16 min" inline.
- **Header:** a quiet title line (`זמני היום` / "Zmanim · Miami Beach").
- **Removed:** no status column, no pills, no column headers.
- **Scaling:** if an admin enables more than 12 zmanim, switch to the two-column layout below.

### Zmanim, board + slim arc
- **Arc:** a 120 px sun path from sunrise to sunset. It shows the elapsed part in `inkDim`, a dot per zman, the next one in accent, and the sun at "now". The only labels are "Sunrise" and "Sunset"; there are **no numbers on the arc**, because the board carries them.
- **Board:** two columns below the arc (morning six, afternoon five).

The C-style "arc + tiles" option can return as a third admin choice with this same arc.

### Schedule (the flagship screen)

The owner said the current schedule "looks nasty". It is a list, and so was my first two-row timeline (dots on a line with labels under them). Equal columns cannot hold long bilingual names ("Kabbalas Shabbos & Maariv") without wrapping into a ragged mess. The redesign borrows the structure premium transit and venue displays use: **zoom levels on one subject**, read top to bottom.

1. **Spotlight: Now | Next** (large).
   - **Now:** Hebrew name auto-fit to 68 px, English with its category dot, then the range "9:30 – 1:00 PM" at 76 px, then a progress bar.
   - **Next:** the time in the accent, then "in 19 min".
   - **When nothing is running** (Friday 6:21), the pair becomes **Next | Then**.
   - **No duplicates:** if Now ends exactly when Next starts, the Now card drops its own countdown so "19 min" isn't said twice.
2. **Day ribbon:** the actual horizontal timeline, on a real time scale (first hour → last hour, hour labels every 3 h).
   - Every item is a 12 px segment at its true position and length. A range spans its range; a point event is a short pill.
   - Each segment is tinted by its **category**.
   - **Past** segments are grey. The **current** segment fills with ink up to a white **now-notch**. The **next** segment is the accent.
   - Gaps in the day show as gaps. You read the shape of the day at a glance.
3. **Later today:** every remaining item as a ruled column: time (with range end, "2:30–6:00 PM"), Hebrew name, and English name with its category dot.
   - All Hebrew names in the strip share one size, so the strip has one rhythm. A name wraps rather than shrinking below 80%.
   - **Short tail:** when fewer than 3 items remain (Friday evening), the strip shows the whole day minus the spotlight, with past items faded, so the page never looks empty.

Each item appears once at full size. The ribbon is the overview, not a second list.

**Data from the per-date schedule model:**
- **Day label** ("Erev Shabbos · Parshas Noach" / "ערב שבת קודש"): sits under the page title at 38 px. The spotlight shrinks one step to make room.
- **Category:** a hue mixed 40% (dark) / 45% (light) into the panel for ribbon segments, and 85% for the 10 px dot. It is never a fill behind text, so it stays subtle.
- **Ranges:** shown as "9:30 – 1:00" in the spotlight, "2:30–6:00 PM" in the strip, and true-length segments on the ribbon.
- **Icons** (from `ScheduleIcons`): replace the category dot, e.g. the candle for Candle Lighting.
- **State logic** matches `ScheduleSlide.getEntryState`: a range is "now" until its end; a point event is "now" for 5 min.

Suggested category hues (admin-editable):

| Category | Hue | Category | Hue |
|---|---|---|---|
| Davening | `#6F9FE0` | Mivtzoim | `#7DBB6C` |
| Shiur | `#A88BDB` | Farbrengen | `#DA8C8C` |
| Seder | `#4FB5A5` | Events | `#D8B65A` |
| Meals | `#DCA45A` | Trips | `#58B6C9` |
| Breaks | `#9AA3AE` | | |

**Scales from 4 to 14 items:**
- The spotlight is always two items.
- The ribbon is proportional, so density doesn't matter.
- The strip goes compact at 7–8 columns (`03c`/`03d` show 14 items). Beyond 8 remaining items it would show the next 8, and the ribbon still shows everything.

### Inspiration (Phase 2b layouts)

All three use a **"Torah text" font option**: Frank Ruhl Libre (Hebrew) + EB Garamond (English) by default, and the owner's FbMazal when `fonts=serif`. They combine with styles like any announcement layout.

| Layout | Composer fields | Rendering |
|---|---|---|
| **Quote** | Hebrew text and/or English text · attribution (free text, e.g. "Hayom Yom, 15 Cheshvan"), optional Hebrew attribution | Hebrew auto-fits up to 150 px with balanced line breaks, then English italic (balanced, max 70), then a 72 px accent rule (the screen's one accent), then the attribution. Centered, nothing else. |
| **Sicha excerpt** | Title (En) + optional Hebrew title · body (paragraphs) · source line | The body is set at a **fixed 39 px, line-height 1.5, about 75 characters per line**, and never shrinks. Text that doesn't fit is **paginated**: a page prefers to break at a paragraph end once it is 60% full, otherwise at a sentence end, never mid-sentence or at a colon. The footer shows the source plus "1 / 2" and a two-bar indicator. The slide's duration multiplies by the page count. |
| **Letter (Igros Kodesh)** | Header date (Hebrew and/or English) and place · salutation · body · closing · source | An RTL letter: "ב״ה" and the date/place in dim at top right, salutation bold, body at a fixed 35 px / 1.6, closing bottom left (as in the letters), source bilingual in the footer. The panel takes a faint paper tint (7% on dark, 60% on light). Long letters page exactly like the sicha. The body is ragged-left: justified Hebrew at this measure produced rivers. |

> **Content note:** the quote is the well-known line from Tanya ch. 12. **The sicha and letter bodies are placeholder texts** I wrote in the appropriate register so the layouts could be judged. They are *not* quotations, and the source lines ("Likkutei Sichos vol. 5 p. 23", "Igros Kodesh vol. 12") are format examples only. Replace them with real text before anyone sees this on a screen.

### Announcements (layout × style)

These are composer layouts. Each one combines with any of the 11 styles (§7).

| Layout | What the composer collects | Rendering |
|---|---|---|
| **Event card** | **Title** He and/or En (one required) · **When**: Today / Tonight / Tomorrow / a weekday / a date (the Hebrew label is auto-derived and editable) · **Time** (optional; without it the tile shows only the day) · **Place** En + optional detail line ("after Maariv") + optional He · style | Titles auto-fit large (He above En). The bottom row is the **time tile** (the distinct look: a solid fill, the day stacked bilingual, time at 150 px) with the place beside it. |
| **Big words** | Hebrew line and/or English line (one required; Hebrew ≤ ~20 chars, English ≤ ~80 chars) · style | Hebrew auto-fits to 330 px in the accent color. English wraps to ≤ 2 lines and auto-fits. Centered. |
| **List** | Heading En + He · 2–6 items, each with **when** label, text En, optional text He, optional time · style | Ruled rows. The soonest item's day label is the accent (computed, not chosen). |
| **Quick time** | Name En and/or He · **time** · optional place (bilingual) · style | Names in bold display, **time at 340 px weight 300 in accent**. The thin, huge numerals against bold names are the distinct treatment. |

**Mapping from today's data:**
- StyledSlide/Takeover `primary`/`secondary`/`primaryIsHe` → titles.
- `subtitle` → place / English line.
- `target` → time.

**Text templates fold in as presets:**
- `headline` → Big words
- `announcement` → Event card (no time)
- `info` → List
- `quote` → Big words plus an attribution line, defaulting to the torah style. This one is not mocked; it is the same layout with one extra 30 px line.

### Takeover
A takeover uses the same layouts and styles at full canvas (1520×820). The rail is hidden and a small 34 px clock stays top-right. It still pauses rotation, and banners still never pause rotation (`09a`).

### Other slides
Limudim, Hayom Yom, Daily Quote, RSS, images, Google Photos and Mivtzah restyle into the same panel with the same type scale, done later.

## 7. Styles (all 11 Takeover styles, which include StyledSlide's 6)

Each style is a few role overrides on the panel. All of them are **static**. The current Takeover's infinite keyframes (emergencyPulse, hypeGlow, celebrationConfetti, phoneRing, memorialFlicker and others) are retired. Energy comes from color and weight, plus the one-shot "lively" entrance if chosen.

| Style | Override |
|---|---|
| classic | theme as is |
| grand | gold accent, serif display titles, thin double inner keyline |
| celebration | panel = accent with a soft static gradient, inverted tile, 800 weight |
| urgent | amber accent, 6 px amber ring, faint amber tint |
| emergency | solid red panel, white ink, white tile |
| sleek | monochrome (no hue), 500 titles, light numerals |
| torah | parchment-tinted panel, serif display, antique gold |
| trip | green accent, faint green tint |
| phone | outlined tile, accent numerals (the tile carries a phone number) |
| memorial | darkened panel, serif, no fill, dim ink (deliberately accent-free) |
| hype | red-orange accent, 800 weight, static corner gradient |

Hue styles carry a light-theme variant, chosen by the `.light` class, so contrast holds on both families. See `sheet-styles-dark.png` and `sheet-styles-light.png`.

## 8. Motion (`motion` setting; page transitions only)

```css
/* smooth (default): out 260ms fade · in 480ms fade + 14px rise */
.m-smooth  .page.enter { animation: smIn 480ms cubic-bezier(.22,.7,.2,1) both; }
.m-smooth  .page.exit  { animation: fadeOut 260ms ease-in both; }
/* minimal: plain crossfade */
.m-minimal .page.enter { animation: fadeIn 500ms linear both; }
.m-minimal .page.exit  { animation: fadeOut 300ms linear both; }
/* lively: children marked [data-s] stagger in (55ms apart, capped at 10) */
.m-lively  .page.enter [data-s] { animation: liIn 520ms cubic-bezier(.2,.9,.25,1.12) both;
                                  animation-delay: calc(min(var(--i),10) * 55ms + 100ms); }
@keyframes smIn { from { opacity:0; transform: translateY(14px); } }
@keyframes liIn { from { opacity:0; transform: translateY(26px) scale(.985); } }
/* "numbers tick softly": the clock digits get a 280ms fade on minute change (smooth/lively) */
```

- **Animated properties:** only `opacity` and `transform`, which are compositor-only.
- **Never:** infinite animations, blur, `backdrop-filter`, blend modes, or the old grain overlay.
- **`prefers-reduced-motion`** disables all of it.
- **Demo:** `?demo=pages&motion=smooth|minimal|lively`. All three were verified to fire (`smIn` / `fadeIn` plus staggered `liIn`).

---

## What I removed versus round 1, and why

| Removed | Why |
|---|---|
| Uppercase micro-labels ("NEXT UP · SCHEDULE", "ZMANIM · HALACHIC TIMES", "NOTICE הודעה", TIME/ZMAN/STATUS headers) | The biggest "AI template" tell. Content identifies itself; titles are sentence case. |
| Status pills (PASSED, IN 16 MIN chips, ✓ marks) | Badge soup. Past is just fainter, and "in 16 min" is plain text inside the one highlighted row. |
| Next-zman card and always-on Up-next card in the rail | Duplicated the pages (the owner's Chatzos complaint). Up-next now appears only within 5 min, and never on the schedule page. |
| Slide index "2 / 7", progress segments and dots | Chrome. Rotation is ambient, and nobody needs to know which slide of 7 this is. |
| Secondary-zmanim footer strip | Two hierarchies on one page. All 11 zmanim are equal rows on one board. |
| Copper "now" color | A second accent. "Now" uses the neutral `--hi`. |
| Split-flap tiles, megaphone badge, colored weather emoji | Decorative. One solid time tile and a monochrome line icon remain. |
| Arc annotations ("day is 48% through", shaah zmanis, time labels) | The arc is now a quiet position indicator; the numbers live on the board. |
| Duplicate day-of-week ("יום שלישי"), repeated location | Said once. |
| Barlow Condensed caps / Assistant | Rubik + Manrope: A's legibility with C's softness. |
| `opacity` fades | Replaced by color (`--past`). This fixed visible compositing boxes and is cheaper on the Pi. |
| Gradient hero as the default announcement (C) | Gradients exist only where they mean something (celebration, hype). |

## Self-review and iterations

**Pass 1 → critique:**
1. "PM" collided with the panel (clock too wide for the 400 px rail).
2. Past rows used `opacity` and showed rectangular compositing seams.
3. Board times were left-aligned, so the colons didn't line up.
4. The rail overflowed with the up-next card plus two bilingual notes.
5. Two accent moments appeared when the up-next card showed.
6. The event tile was a tall, half-empty block.
7. The arc labels sat on the arc.
8. The current schedule item looked identical to future ones.
9. Dense mode jammed "11:00 AM" into "1:00 PM".
10. The banner mock text clipped.

**Pass 2/3 fixes:**
1. Clock reduced to 136.
2. Color-based fading.
3. Right-aligned tabular times.
4. Busy-rail compaction, and notes became single-language.
5. The "up-next borrows the accent" rule.
6. A horizontal time tile with the place beside it.
7. Labels moved below the baseline.
8. A neutral "now" tile.
9. Compact AM/PM.
10. Shorter banner copy.

**Against the brief now:**
- Each page has one subject and one accent.
- No label sits above content that already says what it is.
- The smallest text is 20 px canvas.
- The board, timeline and announcements fill the panel; the remaining whitespace is the rail's middle, which is the reserved slot for up-next and notes.

**Schedule, rounds 3–5 (after the owner said the schedule "looks nasty"):**
1. **Segmented ribbon on equal columns:** better, but names collided and Friday was a thin band.
2. **Column-sized numerals and wrapped names:** this made it ragged, and it overlapped the title. I concluded equal columns can't carry long bilingual names.
3. **Restructured into spotlight → proportional ribbon → later strip.**
4. **Polish:**
   - removed the duplicated "until 1:00" and "19 min left";
   - range ends in the strip, moved under the name in dense mode;
   - the dot aligned to the first line of a two-line name;
   - Friday's short tail filled with the faded past.

**Inspiration, 2 rounds:**
- **Quote:** forced a balanced two-line Hebrew (it was a small single line).
- **Sicha:** the pager now prefers paragraph ends (an orphan line had started paragraph 2).
- **Letter:** was clipping its last line, so it now uses the same pager. This also exposed a real bug: a stale "1 / 2" from the pre-font-load pass, now fixed.

Every PNG was reviewed at 100% after the final render.

**Remaining risks:**
- **Celebration is theme-accent-derived.** On `midnight` it comes out pale blue, which is less festive than on `dark`/`graphite`. An option is a fixed warm hue for celebration.
- **The schedule strip** shows at most 8 later items. A 14-item day viewed at 7 AM would cap there, though the ribbon still shows the whole day.
- **Category colors** are the one place with several hues on screen. They are kept at 40% into the panel and never behind text; if the owner finds them busy, a proposed admin toggle (`schedule.categoryColors`) would fall segments back to a neutral tint.
- **The owner actually runs the serif fonts.** `fonts=serif` should be checked on their TV, especially FbMazal's weight at 43 px on the board.

## Screenshots (`shots/`)

| # | File | Shows |
|---|---|---|
| 1 | `01a-zmanim-dark-midnight.png`, `01b-zmanim-light-sky.png` | Zmanim clean board (default) |
| | `01c-zmanim-rail-right-dark-midnight.png`, `01d-zmanim-rail-right-light-sky.png` | Rail on the right |
| 2 | `02a-zmanim-arc-dark-midnight.png`, `02b-zmanim-arc-light-ivory.png` | Board + slim arc |
| 3 | `03a-schedule-9-dark-midnight.png`, `03b-schedule-9-light-clean-white.png` | Flagship schedule, 9 items |
| | `03c-schedule-14-dense-dark-graphite.png`, `03d-schedule-14-dense-light-sky.png` | Dense, 14 items |
| | `03e-schedule-friday-dark-midnight.png`, `03f-schedule-friday-light-ivory.png` | Friday (Erev Shabbos label, candle icon, 6:40–7:30 range) |
| 4 | `04a-rail-upnext-notes-dark-midnight.png`, `04b-rail-upnext-notes-light-sky.png` | 12:56: Lunch in 4 min + 2 notes |
| | `04c-rail-right-upnext-event-dark-midnight.png` | Right rail; up-next card takes the accent from the page |
| 5 | `05a/05b-event-classic-*`, `05c-event-celebration-dark-classic`, `05d-event-urgent-light-sky` | Event card in 3 styles |
| | `05e/05f-bigwords-*` | Big words |
| | `05g/05h-list-*` | List |
| | `05i/05j-quicktime-*` | Quick time |
| 6 | `06a-banner-on-zmanim-dark-midnight.png`, `06b-banner-on-schedule-light-sky.png` | Banner present; compare with 01a / 03a for banner absent |
| 7 | `07a-portrait-zmanim-dark-midnight.png`, `07b-portrait-zmanim-light-sky.png` | Portrait 900×1600 |
| 8 | `08a-zmanim-serif-dark-midnight.png`, `08b-zmanim-serif-light-ivory.png` | Serif swap |
| | `08c-event-serif-torah-dark-dark-hc.png` | Serif swap with the torah style |
| | `09a-takeover-emergency-dark-midnight.png` | Takeover |
| 10 | `10a/10b-quote-*` | Quote |
| | `10c/10d-sicha-*`, `10d2-sicha-page2-light-sky` | Sicha, page 1/2 and 2/2 |
| | `10e/10f-letter-*`, `10g-letter-serif-light-ivory` | Letter (Igros Kodesh) |
| Sheets | `sheet-themes.png`, `sheet-styles-dark.png`, `sheet-styles-light.png` | All 10 sub-themes on zmanim; all 11 styles on the event card, dark and light |
