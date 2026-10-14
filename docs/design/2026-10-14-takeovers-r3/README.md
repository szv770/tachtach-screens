# TachTach takeovers, round 3 (21 styles)

One file: `takeovers.html` (1600x900 canvas, reuses R2's token derivation, fonts, auto-fit and pager). Screenshots at deviceScaleFactor 1.2 in `shots/`. Repo not modified.

## Driving it

`takeovers.html?style=&layout=&theme=&fonts=&enter=1`

| Param | Values |
|---|---|
| `style` | classic grand emergency sleek celebration urgent torah trip phone memorial hype **shabbos yomtov siyum farbrengen mivtzoim welcome simcha schedule quiet chanukah** |
| `layout` | `bigwords` `event` `list` `quick` `quote` `sicha` `letter` (default = the style's best layout) |
| `theme` | the 10 R2 themes (dark, dark-hc, midnight, graphite, sepia(dark brown), parchment, clean-white, ivory, sky, stone) |
| `fonts` | `default` (Rubik/Manrope + Frank Ruhl/EB Garamond for Torah text) · `serif` (FbMazal + EB Garamond) · `mazal` (FbMazal only in the Hebrew display and Torah roles) |
| `hefont`, `hescale` | any uploaded family name dropped into the Hebrew display and Torah roles, e.g. `hefont=1ShefaClassic&hescale=1.1` |
| `enter=1` | plays the entrance. `&t=400` freezes it at 400 ms (used for the filmstrip) |
| `pg` | page for sicha/letter |

Sample messages are per style (`SAMPLES` in the file). A style with no sample for a layout falls back to a generic one.

## How a style works (implementation notes)

Every style is a block of **stage roles** derived from the base roles by `color-mix()`, plus one `ART[style]()` function that returns static SVG layers. No style names a font family.

- Stage roles: `--s-bg --s-ink --s-dim --s-acc --s-onacc --s-accText --s-fill --s-fillInk --s-line --sheet --a1..--a4` (art hues).
- Light-family variants are chosen by luminance (`.light`), as in R2. The family label is not used.
- A hard readability floor: in the light family `--s-dim` is at least 74% ink (tokens.js `dim` is about 58%, too weak across a room). A script (`verify.js`) resolves the real computed colours for **all 21 styles x all 10 themes = 210 combinations**: ink at least 7:1, secondary text at least 4.5:1, accent-as-text at least 3:1, tile text at least 4.5:1. All pass.
- **Font roles** used: `--f-he-disp`, `--f-he`, `--f-en-disp`, `--f-en`, `--f-num`, `--f-th-he`, `--f-th-en`, plus `--he-scale`. A style only re-points its display type to a role, e.g. grand/torah/memorial/shabbos/yomtov/siyum/welcome use the Torah-text roles (`--f-th-*`) for titles and numerals, so they follow whatever the owner assigns to "Torah text". Hebrew auto-fit caps are multiplied by `--he-scale`. Checked with FbMazal, 1ShefaClassic, BAWSVenezia and LiaShaharit (`shots/more/font-*.png`, `sheet-fonts.png`).
- **Pi rules**: no blur, backdrop-filter or blend modes anywhere (grep-verified). Glows are static `radialGradient` stops, never filters. Nothing loops.
- **Entrance motion** is measured, not estimated: `motion.js` reads `getAnimations()` for all 21 styles x 7 layouts (147 pages). Longest end time **1160 ms**, zero infinite animations, animated properties are only `opacity` and `transform`. Art layers animate as small bbox-sized layers, and the text stagger (index capped at 5) uses one of four modes: calm (fade 720 ms), rise (16 px + fade 560 ms), lively (30 px + .98 scale, 560 ms), snap (240 ms scale-in). `prefers-reduced-motion` turns all of it off.
- Chrome: a small 12:41 clock and a ב״ה stay on every takeover (rail hidden, rotation paused as in R2). Their corners move when art needs the corner (urgent, hype, farbrengen, simcha).
- SVG language: one monoline vocabulary (3 px round strokes) with flat fills only where the object needs mass (flames, ribbons, tiles). Static SVG sizes are a few KB each. The only runtime SVG measurement is the trip route's bus position (one `getPointAtLength` at render).

## Styles

Palettes are given as dark / light family. "acc" is the single accent. Every style keeps the R2 rule: **one accent moment**.

### classic
- **Purpose:** the default. Any announcement with no mood.
- **Palette:** the theme exactly: panel = `--raised` inset 28 px, accent = theme gold. Light themes deepen the tile fill 12% so white type holds 4.5:1 on ivory.
- **Type:** theme roles only (Hebrew display, English display, numerals).
- **Graphics:** none except a 104 px accent tick at the top of the panel.
- **Entrance:** rise. **Suits:** all layouts.

### grand
- **Purpose:** dinners, honoured guests, formal evenings.
- **Palette:** darker stage; antique gold `#D6AF5C` on dark, `#87631A` on light (stage becomes a lighter ivory tint).
- **Type:** Torah-text roles for Hebrew and English titles and numerals (weight 600), square 6 px tile with a gold keyline.
- **Graphics:** engraved double keyline with notched quarter-circle corners, four corner diamonds, and a cartouche (diamond + dashes + dots) top and bottom centre. Single SVG layer, strokes only.
- **Entrance:** frame scales .985 to 1 and fades over 900 ms, then calm text. **Suits:** event, bigwords, quote, quick, sicha/letter.

### emergency
- **Purpose:** fire drill, lockdown, safety notices. Not subtle on purpose.
- **Palette:** solid signal red `#A91F17` (dark) / `#A91F17` (light, same, tuned so white gets at least 7:1), white ink, white accent.
- **Type:** weight 800 display, secondary text 92% white.
- **Graphics:** a thick-stroke hazard triangle with an exclamation mark at left; a diagonal hazard band top and bottom (26 px, 30% black dashes).
- **Entrance:** snap. Triangle pops in at 320 ms with a small overshoot, text fades 240 ms. Fast on purpose. **Suits:** bigwords (default), quick, list.

### sleek
- **Purpose:** quiet, modern time announcements (Mincha 1:45).
- **Palette:** monochrome: ink is the accent. Tile is an outlined ghost.
- **Type:** weight 500 display, 200 numerals, so the time is thin and huge.
- **Graphics:** a hairline ruler along the bottom with major/minor ticks (static).
- **Entrance:** ruler draws left to right (scaleX .7 to 1, 800 ms) then rise. **Suits:** quick, event, bigwords.

### celebration
- **Purpose:** mazel tov, engagement, birth, sheva brachos.
- **Palette:** a **fixed** warm palette, not the theme accent (R2 flagged pale blue on midnight). Dark: plum stage `#2A0E22`-mix, gold `#EDBE5E`, pink `#E68C9F`, teal `#6CC7B8`, cream. Light: cream stage, raspberry accent `#A8325A`, gold/pink/teal/blue confetti.
- **Type:** weight 800 Hebrew display in the accent.
- **Graphics:** about 60 frozen confetti pieces (rectangles, dots, squiggles, four-point sparkles) seeded and placed only at the edges, never behind text and clear of the clock and ב״ה; two curled streamers. 4 SVG layers, about 14 KB total.
- **Entrance:** lively. Confetti layers drop 36-80 px and fade (760 ms, staggered by region), text rises with a small overshoot. **Suits:** bigwords, event, list, quick.

### urgent
- **Purpose:** important but calm: early dismissal, schedule emergency, "please read".
- **Palette:** amber `#F2A33A` dark / burnt orange `#B05C08` light, 7-9% amber tint stage.
- **Graphics:** 10 px rounded amber ring and a folded corner flag with an exclamation mark in the top-left; clock moves to the bottom-right.
- **Entrance:** flag scales in from its corner (420 ms), rise. **Suits:** event, bigwords, list.

### torah
- **Purpose:** a Torah thought, pasuk, ma'amar; learning content.
- **Palette:** parchment-tinted sheet on a darker stage, antique gold `#CFA155` / `#7A5520`; light family has a warm parchment stage with a cream sheet.
- **Type:** Torah-text roles throughout.
- **Graphics:** an open scroll: two atzei chaim (finial, rod, caps, handle) and a sheet with double rules. Fills use `--sheet`, strokes use `--a1`. Static SVG, about 3 KB.
- **Entrance:** the sheet unrolls (scaleX .7 to 1) while the rollers slide apart 240 px (900 ms), then calm text. **Suits:** quote, sicha, letter (default quote). The scroll is the only style that frames inspiration layouts as a "document".

### trip
- **Purpose:** trips, buses, departures.
- **Palette:** teal `#5BBCD0` dark / `#156E7E` light, 7-9% teal stage.
- **Graphics:** a dotted route along the bottom (start ring, destination pin) with a side-view bus riding it, rotated to the curve; contour-map lines (7 closed noisy rings, seeded) top right as a map.
- **Entrance:** bus drives in from the left (340 px, 1000 ms); contours fade. **Suits:** event, bigwords, list (list "stops" read as an itinerary).

### phone
- **Purpose:** phone collection ("Phones in the box by 9:00").
- **Palette:** indigo `#A3AEFF` dark / `#3E4CC0` light.
- **Type:** weight 600 numerals; the time sits in an outlined tile on event layouts.
- **Graphics:** an isometric collection box with a phone slightly tilted above its slot, with three small "put it in" ticks. Strokes only, the phone is a separate layer sandwiched between back and front faces of the box so it truly goes in.
- **Entrance:** phone drops 110 px into the slot (900 ms, ease-in-out). **Suits:** quick (default), event, bigwords.

### memorial
- **Purpose:** yahrzeit, lilui nishmas, remembrance. The deliberately accent-free style.
- **Palette:** darkened stage (42% black), ink at 86%. No accent; the only warm colour is the candle flame (`#EDB566`, `#FFF0CC`).
- **Type:** Torah-text roles at weight 500, normal English tracking.
- **Graphics:** one glass yahrzeit candle with a flame and a very soft static glow gradient. A short "לעילוי נשמת" lead line above the name.
- **Entrance:** calm. The flame lights (scale .4 to 1 + fade, 700 ms, after 450 ms). No motion otherwise. **Suits:** bigwords (default), quote, event, quick.

### hype
- **Purpose:** countdowns to events and shabbatonim (big number).
- **Palette:** red-orange `#FF6A45` dark / `#D23A1A` light, weight 800, 6-8% tint stage.
- **Graphics:** a static sunburst from the bottom-right corner (13 wedges at 8% accent) and three speed bars in the top-left corner.
- **Entrance:** lively. The burst rotates in from -9 degrees (1000 ms), bars slide in. **Suits:** quick with a big number (default), event, bigwords.

### shabbos (new)
- **Purpose:** Gut Shabbos, candle lighting and havdalah times, Erev Shabbos.
- **Palette:** night blue stage `#0A1536`-mix, warm cream ink, flame gold `#F2C46A` accent. Light: ivory stage, deep indigo `#2B4796` accent, candle gold `#E3A02E`.
- **Type:** Torah-text roles; numerals thin (weight 300); two labelled columns (Hebrew name over English).
- **Graphics:** two shabbos candlesticks (turned stems, candles, static flames), a soft glow, and a field of 70 faint seeded stars (dark only).
- **Entrance:** calm. Candles are there; the two flames light in turn (360 ms each, 260 ms apart). **Suits:** quick with two times (default), quote (pasuk), event, bigwords.

### yomtov (new)
- **Purpose:** Yom Tov greetings (Sukkos, Simchas Torah, Pesach, Shavuos).
- **Palette:** deep teal `#0B2B2A`-mix stage, gold `#DDB664`; light: warm cream, teal `#1D6B63` accent, bronze `#B58A33` ornament.
- **Type:** Torah-text roles at weight 700, small "חג שמח" kicker.
- **Graphics:** a Magen David frieze top and bottom: hexagram outlines every 76 px with dot spacers between two rules.
- **Entrance:** frieze slides in from top and bottom (50 px, 800 ms), rise. **Suits:** event, bigwords, quote.

### siyum (new)
- **Purpose:** siyum on a masechta, hadran, learning milestones.
- **Palette:** leather `#2B1512`-mix stage, parchment page, gold, with a crimson ribbon `#B8404E`. Light: cream stage, oxblood accent `#8A2A38`.
- **Graphics:** a Gemara page: Rashi/Tosafos/Gemara columns drawn as rule lines (pattern, not text), a word-box at the top, and a hanging ribbon bookmark.
- **Entrance:** page rises 40 px (700 ms), ribbon drops after 380 ms with a small overshoot. **Suits:** event (default), bigwords, list.

### farbrengen (new)
- **Purpose:** farbrengens, kumzitz, warm gatherings.
- **Palette:** copper `#E39B60` dark / `#9A4B1C` light, a brown-black warm stage.
- **Graphics:** a hanging lamp with a static glow, and a farbrengen table line with a sefer, a plate of mezonos, l'chaim cups and a bottle. Strokes only.
- **Entrance:** lamp drops 36 px, table rises 40 px, glow fades (1000 ms). **Suits:** event (default), quick, bigwords.

### mivtzoim (new)
- **Purpose:** Mivtzoim, tefillin tank, outreach (the "ufaratzta" spread).
- **Palette:** green `#84C273` dark / `#2E7A3B` light.
- **Graphics:** six concentric ripples spreading from the right edge with small dots on the rings (the spread of the mivtzoim). Static.
- **Entrance:** three ring groups grow from .94 to 1, 120 ms apart. **Suits:** list (default, the day's stops without a day column), event, bigwords.

### welcome (new)
- **Purpose:** guest, parent and visitor welcome.
- **Palette:** Jerusalem-stone stage (warm dark / warm stone light), sand gold `#D8B983` / `#87602C`.
- **Graphics:** an arched doorway of voussoirs with a keystone, set against faint ashlar courses. The text sits inside the arch.
- **Entrance:** arch scales up from its base (.985 to 1, 900 ms), wall fades. **Suits:** bigwords (default), quote.

### simcha (new)
- **Purpose:** birthday and personal simcha.
- **Palette:** navy `#0F2233`-mix, with four bunting colours (peach `#F4A869`, yellow `#EBCB6A`, teal, rose). Light: cream stage, terracotta accent `#B8492A`.
- **Type:** weight 800 display.
- **Graphics:** two strings of triangular bunting across the top, front string larger. Hebrew-first: no ב״ה in the top bar because bunting occupies it.
- **Entrance:** strings drop 36-80 px with a soft overshoot. **Suits:** bigwords (default), event.

### schedule (schedule change)
- **Purpose:** "Mincha moved to 2:15", the time changed today.
- **Palette:** blue `#7AA8EA` dark / `#2A5AA8` light.
- **Graphics:** an analogue clock with the **old time ghosted** (dotted hands) and the **new time** in solid accent hands, with an arc and arrowhead from old to new. The old time also shows struck-through as text.
- **Entrance:** the clock hands sweep to the new time (900 ms; minute hand from -180 degrees). **Suits:** quick with `was` (default), event.

### quiet (new)
- **Purpose:** the gentlest takeover: quiet please, a soft notice.
- **Palette:** no hue at all: stage = bg + 3% ink, ink at 88%.
- **Graphics:** none (by design).
- **Entrance:** calm fade. **Suits:** bigwords (default), quick, quote.

### chanukah (new)
- **Purpose:** Chanukah and public menorah events. Seasonal, so this is the one style the owner may keep for a few weeks per year.
- **Palette:** indigo `#0D1538`-mix, gold flame `#F7C65A`; light: ivory, royal blue `#24408E` accent.
- **Graphics:** a menorah in the Chabad straight-armed form: eight arms at a 45 degree rise, a taller shamash, eight cups, candles and flames, with a soft glow.
- **Entrance:** shamash first, then the flames light one by one from right to left (300 ms each, 70 ms apart; ends at 1160 ms). **Suits:** event (default), bigwords.

## Layout support (every style supports all of these)

- `bigwords`, `event`, `list`, `quick` (one time, two times, big number, or a changed time with "was"), and inspiration `quote`, `sicha`, `letter` (paged at a fixed reading size, "1 / 2" with page bars, Torah-text roles).
- Styles whose art uses the left or right third narrow the content box (`narrow` class): the event tile shrinks, the footer stacks, the list day column shrinks.
- Dark and light: each style has a dark variant and a `.light` variant, so every sub-theme in both families works.

## Self-review log

**Pass 1** (all 21 x 2): clock and ב״ה colliding with art on classic (accent tick under the clock), torah, farbrengen and celebration; memorial English fell back to the sans display role (the style never passed its serif role to the big-words English line); memorial name broke badly; trip bus hid behind the time tile; shabbos two-times labels wrapped sideways; too much confetti, which crowded the headline; the siyum list day column ran into item text.
**Pass 2/3:** moved the classic tick to centre; clock/ב״ה shifted for torah and farbrengen; English line now uses `--f-disp-en` with a memorial/quiet weight of 500; memorial uses the traditional "ב״ר" so the name fits one balanced line; bus moved to the right part of the route; labels stacked in two columns; confetti reduced from 120 to 64 pieces with a keep-clear zone around text and the clock, streamers shortened; fitted boxes collapse to their content so stacks centre as one unit; narrow list day label 25 px; light-family secondary text floor; emergency light red deepened; classic tile fill deepened on light; quiet secondary text raised.
**Remaining notes:** celebration's list layout still has a streamer tip near the heading on dark (tiny; hides under text only at its end); farbrengen's table graphic is small on the quick layout (intended: a quiet base line); sample texts for yahrzeit names and the sicha/letter bodies are placeholders; hype is the only style intended for large numerals, so on event it behaves like a normal event card.

## Files

- `takeovers.html`, `fonts/` (the owner's uploaded TTFs, copied from `data/fonts/`).
- `shots/NNa-style-dark-theme.png`, `shots/NNb-style-light-theme.png` (42 PNGs, 21 styles x dark and light).
- `shots/sheet-takeovers-dark.png`, `shots/sheet-takeovers-light.png` (contact sheets), `shots/sheet-3x3-announcement-layouts.png`, `shots/sheet-3x3-inspiration-layouts.png`, `shots/sheet-fonts.png`, `shots/sheet-entrance-filmstrip.png`, and `shots/more/` (the individual frames behind those sheets).
- `shoot.js`, `sheet.js`, `verify.js` (contrast audit), `motion.js` (entrance audit).
