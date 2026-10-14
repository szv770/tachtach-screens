# TachTach takeovers, round 3b (26 styles)

One file: `takeovers.html` (renders on 1600x900, 1600x1000 (16:10) and 900x1600 (portrait); reuses R2's token derivation, fonts, auto-fit and pager). Screenshots at deviceScaleFactor 1.2 in `shots/`. The repo was not modified.

## Owner decisions recorded here

1. **Looping animation is wanted for takeovers (all except `quiet`).** This relaxes the R2 rule "no infinite animations" **for takeovers only**; the rest of the screen keeps the R2 rules. Discipline kept: only `transform` and `opacity` are animated; no filter / blur / backdrop-filter / blend mode / box-shadow animation (audited, see below); few moving layers (max 10 per style); slow, smooth easing; every loop seamless; everything off under `prefers-reduced-motion`.
2. **Davening family and schedule-triggered auto-takeovers: later.** Not built, not mocked. (Design notes to resume from: one calm full-screen frame for a ~45 min Davening-category window, static graphic, name auto-filled from the schedule item in Hebrew + English, a "starts in 5 min" pre-variant. It fits the stage-role system and the `quiet`-style no-flicker ambient rules below.)

## How to drive it

`takeovers.html?style=&layout=&theme=&fonts=&canvas=&enter=1`

| Param | Values |
|---|---|
| `style` | classic grand emergency sleek celebration urgent torah trip phone memorial hype shabbos yomtov siyum farbrengen mivtzoim welcome simcha schedule quiet chanukah **purim pesach roshchodesh lagbaomer chassidic** |
| `layout` | `bigwords` `event` `list` `quick` `quote` `sicha` `letter` (default = the style's best layout) |
| `theme` | the 10 R2 themes |
| `fonts` | `default` · `serif` (FbMazal + EB Garamond) · `mazal` (FbMazal only in the Hebrew display + Torah roles); `hefont=<uploaded family>&hescale=1.1` drops any uploaded Hebrew font into those roles |
| `canvas` | `land` (1600x900, default) · `16x10` (1600x1000) · `port` (900x1600) |
| `len` | `s` / `m` / `l`: stress text (one word / typical / at the composer limits). Without it the style's realistic sample message is used |
| `enter=1` | play the entrance. `&t=1200` freezes every animation at that time (used for the filmstrips) |
| `anim` | **`full`** (default) · `entrance` · `off`: the per-takeover **Animation** setting |
| `motion` | `smooth` (default) · `minimal` · `lively`: the global motion mode (see Motion) |
| `ts` | loop speed multiplier for testing (`0.5` = twice as fast) |

## Stage roles and font roles (unchanged idea)

Every style is a block of stage roles derived from the base roles with `color-mix()`: `--s-bg --s-ink --s-dim --s-acc --s-onacc --s-accText --s-fill --s-fillInk --s-line --sheet --a1..--a4`, with a `.light` variant chosen by luminance. Fonts are roles only (`--f-he-disp --f-he --f-en-disp --f-en --f-num --f-th-he --f-th-en`, `--he-scale`); torah/grand/memorial/shabbos/yomtov/siyum/welcome/pesach/chassidic route their display type to the Torah-text roles, so they follow whatever the owner assigns there. Checked with FbMazal, 1ShefaClassic, BAWSVenezia, LiaShaharit (`shots/sheet-fonts.png`).

Contrast audit (`verify.js`, computed colours): **26 styles x 10 themes = 260 combinations all pass** (ink 7:1, secondary 4.5:1, accent-as-text 3:1, tile text 4.5:1). Light themes use a 74%-ink secondary floor.

## Fit rules (round 3b item 1)

Every text slot is a one-shot binary search between a **max** and a **min** (canvas px; x `--he-scale` for Hebrew display slots). A slot may wrap (balanced) inside its height budget; if even the min does not fit it is flagged and line-clamped (the audit treats this as a failure, and the composer should refuse that length). No text anywhere is under 20 px.

| Slot | Max | Min | Rule |
|---|---|---|---|
| Big words, Hebrew | 300 | 64 | wraps, up to 3 lines, 44% of box height |
| Big words, English | 84 | 34 | wraps, 26% of box height |
| Big words, sub line | 32 | 22 | wraps, max 110 px high |
| Kicker (small line above a title) | 34 | 22 | one line |
| Event title, Hebrew | 230 | 44 | wraps, 54% of the titles area |
| Event title, English | 170 | 32 | wraps, 38% of the titles area |
| Event time tile (numerals) | 140 (narrow 112) | 72 | shrinks until the tile fits its row; if still too wide the tile stacks (day over time) |
| Event place block | 1.0x | 0.6x | scaled down until it fits beside/under the tile (max 190 px high when stacked) |
| List heading En / He | 64 / 58 | 28 / 28 | wraps, max 2 lines (150 px); stacked in portrait |
| List rows | 44 | 24 | one size for **all** rows (largest that fits the tightest); Hebrew sub-line = max(20, 0.78 x row size); day column 210 (150 narrow) |
| Quick time, name row | 90 He + 78 En | x0.75 on one line, else stacked He over En down to x0.45 | |
| Quick time, big numerals | 330 | 110 | one line; the whole stack then shrinks together if taller than the box |
| Quick time, two times | 170 | 60 | one shared size, fitted to the narrower column; stacked in portrait |
| Quick time, "where" line | 36 | 24 | wraps, max 120 px high |
| Quote, Hebrew / English | 220 / 64 | 48 / 28 | balanced wrap; Hebrew 42% of box, English 22% |
| Quote, attribution | 30 | 22 | wraps, max 84 px |
| Sicha body / letter body | fixed 38 / 35 | - | never shrinks; paginated (1 / 2 ...) at sentence or paragraph ends |
| Sicha / letter headers | 44 / 40 | 28 / 24 | wrap, max 110 px |

**Composer limits that the audit proves** (every style x every layout, 3 canvases): Hebrew title up to ~45 characters, English title up to ~100 characters (2-3 lines), place line up to ~40 characters + a second line + Hebrew, list heading up to ~45 characters, up to 6 list items with long text, quick-time name up to ~30 characters.

**Fit audit** (`stress.js`): 26 styles x 7 layouts x 3 text lengths (one word / typical / at the limits) x 3 canvases = **1,638 renders, 0 failures**. It checks: no text under its slot's min or under 20 px; no stack taller than its box; no text outside the content box; no text touching a side graphic (declared graphic rectangles); no text touching the clock or ב״ה; no content filling less than 22% of its box. Visual sheets of the extremes: `qa/stress-*` were reviewed at 3 canvases x short/long (not shipped, regenerate with `stress.js`/`shootc.js`).

What the audit found and fixed in 3b: Hebrew/English titles shrinking too early in narrow boxes (title heights now shared 54/38 between He and En, min 44/32); list headings clipping (now wrap); nested Hebrew spans that ignored the fitted size (now `em`-relative); quick-time stacks overflowing in arch/menorah styles (height-aware shrink); event tile too wide in portrait scroll (tile stacks); sicha header overflowing in portrait (stacks); a flex-shrink bug that collapsed the "where" line to one line; yom tov title/clock collision; simcha balloon placement.

**16:10 and portrait.** Side graphics (emergency, phone, memorial, shabbos, siyum, schedule, chanukah, purim, lagbaomer) are vertically centred on 16:10 and become a **top band** in portrait (content below, centred). Full-bleed graphics (frames, bunting, frieze, confetti, rays, scroll, arch) regenerate from the canvas size. In portrait the scroll becomes a tall vertical scroll and mivtzoim ripples rise from the bottom. See `shots/sheet-canvases.png`.

## Redesigns requested in 3b

**urgent (the "!" fixed).** There is no floating corner mark any more. A 78 px amber **bar is part of the frame** (it follows the frame's rounded corners, full height, inside the 10 px ring) and the glyph, a 50 px ring with a stem and a dot cut into the bar in the dark ink, sits **on the same line as the kicker** ("Important / חשוב", or the first title line when there is no kicker). The glyph is positioned from the measured kicker after fitting, so it stays aligned at any text size. Entrance: bar grows from the top (scaleY .55 to 1, 520 ms), glyph pops with a small overshoot at 420 ms. Ambient: the ring breathes (opacity .6 to 1, 3.4 s) and the glyph pulses (scale 1 to 1.1, 2.2 s): attention without alarm.

**phone (now unmistakable).** The "phone in a box" is gone. It is the universal **prohibition sign over a phone**: a 18 px ring, a phone silhouette (outline, screen, home bar) and a diagonal slash (cut with a gap through the phone). The headline carries the meaning: **"Phones away / טלפונים בצד"**, "by 9:00 AM", "Hand them in at the office door / מוסרים בדלת המשרד". Entrance: the sign scales in, then the slash drops in diagonally (520 ms). Ambient: the sign breathes (scale 1.025, 6 s) and a thin ring ripples out from it every 4.2 s.

**quiet and farbrengen:** kept as they were (farbrengen now also has an ambient: the lamp swings 1.4 degrees and its glow breathes).

## Motion (entrance + ambient)

**Setting: Animation = full / entrance only / off** (default **full**), per takeover, with this **global motion-mode mapping**: `smooth` = full (entrance + ambient loops); `minimal` = entrance only; `lively` = full + extras (words and digits reveal one by one, tile overshoots, list rows slide in; ambient unchanged).

- **Entrance (all styles, max 1200 ms):** art layers first (frame/bar/ring/graphic), then kicker (slides in from the left), headline, tile (pops: scale .9 to 1 with overshoot), place, staggered 60-90 ms. Text personality per style: calm (fade), rise (16 px), lively (30 px + overshoot), snap (240 ms), drop (from above), slide (from the left).
- **Ambient (full only):** each moving thing is its own small layer; keyframes are shared: `kFlameA/B` (scale + tiny rotate, irregular 5-keyframe flicker), `kBreathe` (opacity), `kTwinkle`, `kPulse`, `kSway` (rotate), `kBob`, `kGlide` (alternate), `kFall` / `kDrift` / `kRise` (period translate, content duplicated one period so there is no seam), `kRipple` / `kRing` / `kPhase` / `kBus` (opacity 0 at both ends), `kSpin` (360 degrees).
- **Audit (`motion.js`, 26 styles x 7 layouts, entrance + ambient):** longest entrance **1200 ms**; animated properties **opacity and transform only**; no filter/blur/backdrop-filter/blend/shadow/clip in any keyframes or on any element; **every loop seamless** (alternating, equal ends, opacity 0 at both ends, translation equal to the content period, or 360 degrees); no entrance over 1.2 s. Real-time clips confirm motion (`shots/motion/*.webm`, frame difference between 3 s and 6 s measured).

Moving layers per style (max over layouts) and animated-layer area at 4K (area x 2.4^2 x 4 bytes):

| Style | Entrance | Ambient loop | Moving layers | Layer area at 4K |
|---|---|---|---|---|
| classic | rise; tick fades | accent tick breathes | 1 | 0 MB |
| grand | frame scales in (900 ms), diamonds fade in turn, calm text | six gold diamonds breathe in turn (corners + centres) | 6 | 0 MB |
| emergency | snap: triangle pops with overshoot (320 ms), text 240 ms | hazard bands scroll (56 px period, 2.6 s) + triangle pulse (1.3 s) | 3 | 5 MB |
| sleek | ruler draws left to right, marker fades in, rise | a small marker glides along the ruler (30 s, alternating) | 1 | 0 MB |
| celebration | lively: confetti drops 36-80 px by region, streamers drop, words reveal one by one | confetti falls in both margins (4 strips, 46-70 s per pass, seamless), streamers sway, sparkles twinkle | 8 | 53 MB |
| urgent | slide: bar grows, glyph pops, text slides from the left | ring breathes, glyph pulses | 2 | 32 MB |
| torah | sheet unrolls while the rollers slide apart, calm text | warm glow on the parchment breathes (7.5 s) | 1 | 16 MB |
| trip | rise; map fades, route fades, bus appears at the start | bus drives the whole route (24 s, fades in at the start and out at the pin), pin ring ripples, contour map breathes | 3 | 6 MB |
| phone | rise; sign scales in, slash drops in diagonally | sign breathes, ring ripple | 2 | 6 MB |
| memorial | calm; the flame lights last (700 ms) | flame flickers, glow breathes (5 s) | 2 | 3 MB |
| hype | lively: sunburst rotates in (-9 degrees), digits rise one by one | one half of the sunburst breathes against the other (3.6 s) + the big number pulses | 1 | 43 MB |
| shabbos | calm; candles, then the flames light in turn (260 ms apart) | both flames flicker (different rhythms), glow breathes, stars twinkle | 5 | 35 MB |
| yomtov | rise; friezes slide in from top and bottom | the two Magen David friezes drift in opposite directions (16 s per period) | 2 | 6 MB |
| siyum | rise; page rises, ribbon drops with overshoot | ribbon sways, the word box glows | 2 | 1 MB |
| farbrengen | rise; lamp drops, table rises, glow fades in | lamp swings 1.4 degrees, glow breathes | 2 | 10 MB |
| mivtzoim | slide; ring groups grow from the core, rows slide from the left | three ripples spread outward (9 s each, a third apart), core pulses | 4 | 19 MB |
| welcome | rise; arch scales up from its base | warm light in the arch breathes | 1 | 14 MB |
| simcha | lively: bunting drops with overshoot, balloons rise in | bunting sways, three balloons drift up the margins | 5 | 16 MB |
| schedule | rise; hands sweep to the new time (minute hand from -180 degrees) | a thin second hand sweeps (60 s per turn) | 1 | 4 MB |
| quiet | calm fade only | none by design | 0 | 0 MB |
| chanukah | calm; shamash first, then flames light right to left (70 ms apart) | all nine flames flicker (4 rhythms), glow breathes | 10 | 4 MB |
| purim | lively: crown drops in, triangles fall in | hamantaschen fall in the margins, the crown floats, sparkles twinkle | 6 | 55 MB |
| pesach | calm; cups rise in turn, vine line drops | four cups bob, glow and the fourth-cup halo breathe | 5 | 11 MB |
| roshchodesh | calm; phases fade in left to right | a slow wave of light passes along the nine moon phases (27 s) | 9 | 1 MB |
| lagbaomer | lively: logs rise, flames kindle in turn | three flames flicker, sparks rise, glow breathes | 10 | 4 MB |
| chassidic | calm; flame lights, halos then rays fade in | the flame flickers, three halos radiate outward, the rays breathe | 6 | 44 MB |

## Styles

Palette lists dark / light. "acc" is the single accent. Every style supports all seven layouts; the "best for" layout is the default.

| Style | Purpose | Palette (dark / light) | Typography | Graphic (static SVG) | Best for |
|---|---|---|---|---|---|
| classic | default | theme (light tile fill deepened 12%) | theme roles | accent tick on the panel | event, any |
| grand | dinners, formal | gold `#D6AF5C` / `#87631A` | Torah roles, 600, square tile | engraved double keyline, notched corners, 6 diamonds, cartouches | event, quote |
| emergency | drills, safety | red `#A3170F` / `#A91F17`, white ink | 800 display | hazard triangle (left), hazard bands | bigwords |
| sleek | modern time notices | monochrome | 500 display, 200 numerals | hairline ruler + marker | quick |
| celebration | mazel tov | plum + gold `#EDBE5E` + pink/teal / cream + raspberry `#A8325A` | 800, gold Hebrew | frozen confetti (static top garland + falling margins), streamers, sparkles | bigwords, event, list |
| urgent | important, calm | amber `#F2A33A` / `#B05C08` | theme | ring + frame bar with the "!" glyph (new) | event |
| torah | pasuk / ma'amar | parchment + gold `#CFA155` / `#7A5520` | Torah roles | open scroll with atzei chaim (vertical in portrait) | quote, sicha, letter |
| trip | trips, buses | teal `#5BBCD0` / `#156E7E` | theme | route, driving bus, pin, contour map | event, list |
| phone | phones away | indigo `#A3AEFF` / `#3E4CC0` | 600 numerals | prohibition sign over a phone (new) | quick |
| memorial | yahrzeit | no accent; flame only | Torah roles, 500 | yahrzeit candle + glow | bigwords, quote |
| hype | countdowns | red-orange `#FF6A45` / `#D23A1A` | 800 | sunburst | quick with a big number |
| shabbos | candle lighting, havdalah | night blue + flame gold / ivory + indigo | Torah roles, thin numerals | two candlesticks, flames, 64 stars | quick (two times) |
| yomtov | chag greetings | teal + gold / cream + teal | Torah roles | Magen David friezes | event, bigwords |
| siyum | siyum, hadran | leather + gold + crimson / cream + oxblood | Torah roles | Gemara page, ribbon | event, list |
| farbrengen | farbrengens | copper `#E39B60` / `#9A4B1C` | theme | lamp, table, sefer, mezonos, cups, bottle | event |
| mivtzoim | outreach | green `#84C273` / `#2E7A3B` | theme | concentric ripples from the edge | list |
| welcome | guests, parents | Jerusalem stone + sand | Torah roles | arched doorway, voussoirs, ashlar | bigwords |
| simcha | birthdays | navy + 4 bunting colours / cream + terracotta | 800 | two bunting strings, balloons | bigwords |
| schedule | time changes | blue `#7AA8EA` / `#2A5AA8` | theme | clock: old time ghosted, new time solid, second hand | quick with "was" |
| quiet | gentle notices | no hue | 500 | none | bigwords |
| chanukah | Chanukah | indigo + gold / ivory + royal blue | theme | straight-armed menorah | event |
| **purim** | Purim | plum `#2B1146` + gold + magenta + teal / cream + plum `#8E2A74` | 800 | crown, hamantaschen (rounded triangle + filling dot) falling in the margins | event, bigwords |
| **pesach** | Pesach | wine `#2A0F18` + gold + sage / ivory + burgundy `#8C2438` | Torah roles | four wine cups (the fourth with Eliyahu's halo), vine line | bigwords |
| **roshchodesh** | Rosh Chodesh | night navy + silver-blue + pale gold / pale grey + blue | 600 | nine moon phases along an arc (the new crescent highlighted) | bigwords |
| **lagbaomer** | Lag BaOmer | charcoal-brown + fire orange + gold / cream + burnt orange | 800 | bonfire (crossed logs, three flames, sparks) | event |
| **chassidic** | Yud-Tes Kislev, chassidic yom tov | burgundy-brown + gold / cream + oxblood | Torah roles | a flame with three halos and fanning rays | bigwords |

## Recommendation: styles to drop or merge

- **hype**: the weakest (a sunburst and a number); celebration/event cover its use. Drop or fold into celebration.
- **sleek** overlaps **quiet** (both minimal); keep quiet (the owner likes it) and drop sleek, or keep sleek only for the large thin-numeral time notice.
- Keep the seasonal five (**chanukah, purim, pesach, roshchodesh, lagbaomer, chassidic**) behind a "seasonal" admin group so they do not clutter the picker.

## Files

- `takeovers.html`, `fonts/` (owner's uploaded TTFs, copied from `data/fonts/`).
- `shots/NNa-style-dark-theme.png` / `shots/NNb-style-light-theme.png` (52 PNGs, 26 styles x dark and light, 01 to 26).
- `shots/sheet-takeovers-dark.png`, `shots/sheet-takeovers-light.png`, `shots/sheet-3x3-announcement-layouts.png`, `shots/sheet-3x3-inspiration-layouts.png`, `shots/sheet-fonts.png`, `shots/sheet-canvases.png`, `shots/sheet-motion-filmstrip.png`; `shots/motion/` (per-style filmstrips at 0 / 0.4 / 1.2 / 3 / 6 s and real-time 8 s clips `*.webm`); `shots/more/` (the frames behind the sheets).
- Tooling: `stress.js` (fit audit), `motion.js` (motion audit), `verify.js` (contrast audit), `shootc.js`, `sheet.js`, `rec.js`.
