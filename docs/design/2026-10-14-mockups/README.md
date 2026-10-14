# TachTach kiosk redesign: three directions

These are static mockups on the app's logical 1600×900 canvas, rendered at device scale factor 1.2 so each PNG is 1920×1080. The content is fixed at Tue Oct 13 2026 (ב׳ חשון תשפ״ז, Parshas Noach), Miami Beach, **12:41 PM**. At that time the next zman is Chatzos 12:57 (in 16 min), the Seder block is running until 1:00, and Lunch at 1:00 is next (in 19 min).

Each HTML file is self-contained and renders every screen through query params: `?screen=main|announce|schedule&theme=dark|light&fonts=default|serif`. `fonts=serif` swaps in the owner's fonts: **FbMazalMedium** (copied from `data/fonts/` into `fonts/`) with Frank Ruhl Libre as fallback, plus **EB Garamond**. This shows that each direction still works with the owner's own fonts.

Fonts loaded from Google Fonts through the sandbox proxy, so every font in the shots is the real face (no fallbacks). The repo was not modified.

## Shared system (all three directions)

**Color roles.** All colors use the existing `tokens.js` role names. `gold` is treated as `accent`; the others are `bg, surface, text, dim, muted, goldBg, goldBd, copper, framePrimary, frameSecondary`. Three additions are needed:
- `surface2` is a raised surface for rows, tiles and the banner strip.
- `onAccent` is the text color on solid accent fills. Big solid "next" blocks are what make a screen readable from across the room.
- The current `surface` (4.5% alpha) is too faint for card or row layouts. For the 8 existing themes both surfaces can be derived automatically, so no theme has to be hand-edited:
  - `surface = color-mix(text 6%, bg)`
  - `surface2 = color-mix(text 11%, bg)`
  - `onAccent` = `bg` or white, whichever has more contrast against `gold`

**Status semantics** are the same in every direction:
- **Past** items use `muted`.
- **Next** is a solid `accent` fill with `onAccent` text.
- **Now** (an item that is in progress) uses `copper` as a second accent.

**Font roles.** The existing `fonts.hebrewDisplay / hebrewPrimary / englishDisplay / englishBody` are read at render time, exactly as now. I propose one new role, **`numeric`** (default: `englishDisplay`), always set with `font-variant-numeric: lining-nums tabular-nums`. That setting matters for the owner's fonts: EB Garamond defaults to old-style figures, which look wrong on a clock or a times board. FbMazal renders about 10% smaller than Frank Ruhl at the same px, so `hebrewFontScale` should become a real global multiplier. Right now it only affects LimudimSlide.

**No system fonts.** Inter, Roboto, Arial and Heebo are avoided. Heebo is rejected because its Latin glyphs *are* Roboto. The new faces are all Google Fonts webfonts: Barlow/Barlow Condensed, Rubik, Fraunces, Manrope and Assistant.

**Layout rules:**
- **Space.** The canvas is filled edge to edge with 24–40px safe margins. Content no longer sits in fixed-width 600–720px centered boxes; slide content stretches to its region.
- **Banner.** The banner gets its **own reserved row** (58–64px) instead of overlaying the slide.
- **Aspect ratio.** Grids use `fr` and `minmax()`, and fit text uses container-query units (`cqw`), never `vw`. Other aspect ratios should keep logical height 900 and use logical width = 900 × aspect (a uniform scale), instead of today's non-uniform `scale(x,y)` stretch. The `*-16x10.png` shots are each main frame at 1440×900 to show this. At narrow widths, duplicate-language labels drop first.
- **Auto-fit.** Big messages use a one-shot binary-search fit: the largest font-size that fits the box, computed once per slide render, not every frame.

**Pi 5 / GPU limits:**
- No `backdrop-filter`, blur, `mix-blend-mode` or looping animations. The current grain overlay uses `mix-blend-mode: overlay` and should be removed.
- What remains is solid fills, 1px borders, two small static box-shadow rings (a status ring and an outline) and one static `linear-gradient` (C's announcement).
- The slide-progress bar should animate with `transform: scaleX` once per slide, not loop.

---

## A: "Concourse" (airport FIDS / departures board)

**Concept.** The screen reads like a departures board. A fixed left **rail** holds the always-on facts. The slide panel turns every list into a ruled board with fixed columns (Time · English · Status · Hebrew), so the eye can scan any row. English sits on the left and Hebrew on the right of each line, which gives a bilingual mirror. The next item is a full-width amber bar that can be read from the back of the room, and past rows fade back. The announcement uses static split-flap tiles for the day and time. The condensed grotesk lets very large numerals fit in narrow columns.

**Layout (1600×900).**
- Margin 28px all round. Grid is `31.5% (min 440px) | 1fr` × `1fr | 64px`.
- **Rail** (~490px wide), top to bottom: clock, rule, day line, Hebrew date, parsha row, weather tile, **Next-up schedule card** (accent "starts in" bar), compact **Next zman** card.
- **Panel** (~1040×788): header with title, slide index, location and Hebrew title; segmented progress bar; body.
- **Banner** row spans the full bleed: an accent "NOTICE · הודעה" tag plus the ticker.

**Type scale (px on the canvas):**

| Element | Size |
|---|---|
| Clock | 176 (AM/PM 40) |
| Hebrew date | 50 |
| Rail "next" Hebrew name / time | 44 / 60 |
| Board time | 56 (AM/PM 24) |
| Board Hebrew name | 44 |
| Board English name | 26 caps (30 on schedule) |
| Status pills | 17–20 caps |
| Panel title | 22 caps / Hebrew 32 |
| Footer details | 20 |
| Banner | 27 / Hebrew 30 |
| Announcement | fit to box, max 230 (Hebrew) / 140 (English); flaps 104 |

**Fonts:**
- `englishDisplay` and `numeric` = Barlow Condensed
- `englishBody` = Barlow
- `hebrewDisplay` and `hebrewPrimary` = Rubik

**Tokens:**
- `bg` is the page; `surface` is the rail tiles and panel; `surface2` is the "now" row, flaps and banner.
- `gold`/`accent` is the next row, next card and progress bar; `copper` is "now" and the zman ETA.
- `framePrimary` is row rules; `frameSecondary` is pill borders.
- Dark is a deep navy with amber (a modern take on `midnight`). Light is `sky`-like with amber.

**Messages:**
- **Banner** keeps its reserved bottom row and never covers the board (rotation is still not paused).
- **Side-notes (PinnedNotes)** become rail tiles in the same style. When pinned notes exist they replace the compact Next-zman card and rotate through it.
- **Boards** render inside the panel with the same header and progress bar, replacing the body only.
- **Countdown** (T-minus alerts) turns the rail Next-up card into a solid accent block with large minutes, so the carousel keeps running.
- **Takeovers** cover the panel *and* the rail with a full-canvas board-style layout: header strip with the clock kept small top-right, then auto-fit headline and flaps. They pause rotation, as now.

**Strengths and risks.** It has the clearest across-the-room hierarchy and the densest use of space. It is the closest to today's structure (rail + carousel), so it is the cheapest to build. With the serif swap it still holds together (`A-main-dark-serif.png`), but it reads as "classic board", not "airport".

## B: "Gallery" (museum wall text / editorial poster)

**Concept.** There are no boxes. A full-width header and footer frame a **full-width stage**, so slides get 1520px of width instead of about 1100. Big light-weight serif numerals and hairline grids give a high-end museum or editorial feel. Exactly one solid accent block per screen marks "what's next". Slides are numbered like exhibits ("02 — Zmanim"). This is the direction that carries the owner's serif heritage forward. With FbMazal and EB Garamond swapped in it looks native, not like a fallback.

**Layout:**
- Padding 30/40px. Rows are `auto | 1fr | auto | 58px`.
- **Header** (~170px):
  - Left: clock, then a hairline, then the English date and parsha in italic.
  - Right: Hebrew date block.
  - Below it, a thin progress strip; the current slide's segment fills with accent.
- **Stage** (~1520×560): section title row, then content. Zmanim is a 4×2 hairline grid with cells about 380×240. The schedule is a 7-stop horizontal timeline with a "now" marker. The announcement is a 420px accent date block plus the headline area.
- **Footer** "at a glance" strip (~110px), three cells: Next zman · Up next · Weather.
- **Banner** row at full bleed.

**Type scale:**

| Element | Size |
|---|---|
| Clock | 150 Fraunces 300 (am/pm 26 italic) |
| Hebrew date | 78 / 900 weight |
| English date | 34 |
| Zman time | 86 (300 weight) |
| Zman Hebrew name | 42 |
| Zman English name | 15 caps, tracked |
| Timeline time | 70 |
| Timeline Hebrew | 42 |
| Footer time / Hebrew | 48 / 40 |
| Labels | 15 caps |
| Banner | 26 |
| Announcement | Hebrew fit max 250; English italic fit max 150; date "15" 190; time 76 |

**Fonts:**
- `englishDisplay`, `englishBody` and `numeric` = Fraunces (opsz 144)
- `hebrewDisplay` and `hebrewPrimary` = Frank Ruhl Libre (700/900)
- The owner's FbMazal + EB Garamond pairing is a first-class alternative.

**Tokens:**
- Dark is warm charcoal and gold (a modernized `dark`). Light is ivory paper with a bronze accent (`ivory`/`parchment` family).
- `framePrimary` is cell hairlines; `frameSecondary` is header and footer rules.
- `gold` is the single solid block and italic ETAs; `surface2` is the banner. `surface` is barely used, which suits this direction.

**Messages:**
- **Banner** is the reserved bottom band.
- **Side-notes** rotate into the footer as a fourth "Note" cell; at minimum, the weather cell yields.
- **Boards** take over the stage under the same numbered section title.
- **Countdown** inverts the matching footer cell to a solid accent fill.
- **Takeovers** replace the stage *and* footer with a poster layout (the announcement composition at full height). They keep the header, so time and date stay visible, and pause rotation.

**Strengths and risks.** It is the most "premium" and gives the most room to slide content. It handles the owner's fonts best. The risk is that the light 300-weight numerals are less legible from a distance than A's bold condensed ones. A 400 weight is the safer setting for big rooms.

## C: "Glance" (Apple TV / widget dashboard)

**Concept.** The screen is a bento of rounded, solid cards, like a TV home screen or a phone's widgets: friendly, modern, instantly scannable. The left column holds widgets: Clock, Hebrew date and parsha, Weather, and a large accent **Up Next** widget. The Up Next widget de-duplicates against the current slide: it shows the next schedule item on the zmanim slide and the next zman on the schedule slide. The zmanim slide adds a static **sun-path arc** (Netz → Chatzos → Shkiah, with the sun at "now"), which makes the day's position obvious at a glance. The announcement slide becomes a static accent-gradient hero card.

**Layout:**
- Padding 24px, gap 16px. Grid is `28.5% (min 400px) | 1fr` × `1fr | 64px`.
- **Left column:** Clock card (~230px), Date card (~150), Weather (~105), Up Next (fills the rest, ~330).
- **Slide card** (~1080×775, 28px radius): header row with chip, subtitle, pill progress dots and Hebrew title.
  - Zmanim: arc (216px) above a 4×2 tile grid.
  - Schedule: a Now/Next pair (262px) above a 2-column list.
- **Banner** is a rounded pill row with a megaphone badge.

**Type scale:**

| Element | Size |
|---|---|
| Clock | min(132, 30cqw) Manrope 700 |
| Hebrew date | 54 Assistant 800 |
| Up Next Hebrew / minutes | 48 / 96 |
| Tile Hebrew / time | 34 / 54 |
| Tile English | 17 |
| Schedule pair Hebrew / ETA | 58 / 84 |
| List time / Hebrew | 34 / 34 |
| Chips | 15–20 |
| Banner | 26 / 30 |
| Announcement | Hebrew fit max 300; English fit max 170; pills 50 |

**Fonts:**
- `englishDisplay`, `englishBody` and `numeric` = Manrope
- `hebrewDisplay` and `hebrewPrimary` = Assistant (its Latin glyphs are never used)
- The serif swap works (`C-main-dark-serif.png`) but feels like a "classic app skin".

**Tokens:**
- Dark is neutral near-black with blue accent and teal `copper`. Light is `clean-white`-like.
- `surface` is the cards; `surface2` is the tiles and list rows inside cards; `goldBg` is the chips.
- The announcement gradient is `accent → color-mix(accent, black)`. It is static and derives from the theme accent.

**Messages:**
- **Banner** is the reserved pill row.
- **Side-notes** become an extra widget card that swaps with Weather.
- **Boards** render as the slide card's content.
- **Countdown** reuses the Up Next widget, which is already sized for "19 min".
- **Takeovers** expand the slide card to cover the whole grid (the same card shape at full canvas). A small clock chip stays in the corner. Rotation pauses.

**Strengths and risks.** It is the most "modern consumer" look and very friendly. The many separate cards cost some space, so the clock is smaller than in A and B. Rounded cards and a sans pairing are the furthest from the school's current identity.

---

## Recommendation

**Go with A "Concourse" as the base, and borrow two ideas from the others:**
- B's **footer "at a glance" / numbered-section discipline**: one solid accent element per screen, and a reserved message row.
- C's **context-aware Up Next widget** (de-duplicate against the current slide), and the **sun-path arc** as an optional header on the zmanim slide.

**Why A:**
- It answers all three complaints directly:
  - "Old style": board typography with no ornaments or frames.
  - "Whitespace": the board stretches to fill the panel.
  - "Small text": the clock is 176px, rows are 44–56px, and the next item is a solid bar.
- It keeps the existing rail + carousel structure, so the change to `Layout.jsx` and `App.jsx` is contained.
- It needs only `surface2`, `onAccent` and `numeric` added to the token and font systems.
- It holds up with the owner's fonts and in light mode.

**If the owner wants to keep the serif "yeshiva" character**, choose **B**: it is the most premium, and it is the best fit for FbMazal + EB Garamond.

**Not shown:** Limudim, Hayom Yom and RSS slides follow the same patterns, as rows in A, hairline columns in B and tiles in C.
