# Spotlight countdown: plan (2026-11-16)

Status: PLAN, nothing built. Branch `ccr-3acbcd03-qjh6hu`. Reference mock: `mock.html` in this folder (look and motion only:
its fonts, colours and the `40` badge are NOT the target, see section 3).

## What you will see (plain words, for the owner)

- The Countdown slide now has **one star day: the Spotlight**. You choose it (or leave it on Automatic = the nearest big day).
  You can also line up the next ones ("after Yud Shvat, spotlight Purim"), so it moves on by itself when a day is over.
- From the day you choose it until it comes, the screen **builds up the excitement**: calm and elegant when it is far,
  warmer and faster every week, strongest on the last evening, then "Today is ..." on the day, and a short "it was" after.
- **Every time the slide comes round it shows a different kind of countdown**: flip cards, a ring of ticks, a path with
  stops, a big glowing number, a calendar of days, a filling meter, "sleeps", rolling numbers. Never the same one twice
  in a row. Close to the day it picks the ones that tick seconds.
- After the countdown it tells the **day's story**: what happened, a short vort, "this day in history" lines, a photo,
  and for a milestone year a big **seal** ("40 years since Didan Notzach", "entering the 40th year", with Hebrew letters).
- Other upcoming days are only a **small strip at the side**.
- In the admin (from your phone): a **Spotlight card** at the top of Countdown: tap "Change" for a 4-step setup
  (day, kinds of countdown, the story, preview). Everything else is under **More options**, with simple defaults
  (all countdown kinds on, automatic order).
- It uses the screen's own fonts and colours (the theme and fonts you picked in Look), never its own.

---

## 1. Data model

**Decision: no new data file, no new top-level setting.** Everything lives in `data/occasions.json` (store
`src/server/occasionsStore.js`, scope org, class P0 = names of days, never student names). Countdown settings already sit
inside that document (`settings`, `normalizeSettings` in `src/shared/occasions.js`), not in `settings.json`. So
`SETTINGS_KEYS` / `SETTING_SCOPE` / `settingsRules.js` do **not** change; validation goes in `settingsProblem` /
`occasionProblem` like the rest of the Countdown.

### 1a. `settings.spotlight` (new object inside the occasions document)

```js
spotlight: {
  v: 1,                          // migration guard (like categoriesV)
  pick: 'auto' | 'pinned' | 'queue',          // default 'auto'
  queue: [{ id, startISO }],     // max 6 OCCURRENCES (not occasions): pinned = a queue of one. startISO '' = "its next date"
  leadDays: 60,                  // 1-400: how long before its day a chosen spotlight starts (auto uses withinDays as today)
  types: { order: TYPE_IDS, off: [] },        // the countdown kinds, their order, which are switched off
  typeMode: 'auto' | 'order' | 'random' | 'one', oneType: 'flip',
  stages: { announce, month, twoWeeks, week, eve, lastHour, day, after: true },  // stage switches (8 booleans)
  afterHours: 12,                // 0-48: the "it was" stage after the day ends; 0 = straight to the next spotlight
  acts: { specialty: true, years: true, history: true, story: true, vort: true, photo: true },
  depth: 'auto' | 'short' | 'full',          // how many story acts follow the countdown per round (see 2b)
  strip: { on: true, count: 3 /*0-5*/, days: 30 /*7-400*/, small: true },
}
```

Rules (pure, new file `src/shared/spotlight.js`, everything unit-tested):
- **Binding to an occurrence, not an occasion**, fixes the old "Rosh Chodesh Kislev 5788, 365 days" problem for good: a queue
  entry is *spent* once its occurrence ended + `afterHours`; the next entry takes over; an empty queue falls back to auto.
  The admin fills `startISO` on save (it knows the calendar); `''` (migrated rows) = the next date, used only while inside
  `leadDays`, else skipped (today's pinned behaviour).
- Queue ids are compared to stored ids only (`normalizeFile` drops unknown ones, like `pinnedId` today).
- `auto` = today's `pickFor` choice (running big day first, else the soonest big day in its window).

### 1b. Per occasion (new fields on each row in `occasions[]`)

| field | shape | limit | maps onto |
|---|---|---|---|
| `history` | `[{ year: 5747, en, he }]` | 8 lines, 140 chars | new: "this day in history" |
| `vort` | `{ en, he, source }` | 400 / 140 chars | new: a short teaching, separate from the story |
| `spotlight` | `{ types: null \| [ids], leadDays: null \| n }` | | per-day override of the kinds / lead |

Reused as-is: `explainShortEn/He` = **what happened** (the one-liner), `explainEn/He` + `source` = **the story**,
`eventEn/He` = the school's own plan line, `since` + `yearVorts` = **milestone years**, `look.photo` + `look.dim` = photo,
`look.accent`, `hype`, `advent` (feeds the Calendar kind), `stageText` / `milestoneText` (words per stage).
Sources: shows whenever there is text (owner rule 2026-11-13); a source line prints when given.

### 1c. Migration (once, in `normalizeSettings`, guarded by `spotlight.v`)

`pick 'nearest'` -> `auto`; `pick 'pinned'` + `pinnedId` -> `pinned` with `queue [{ id: pinnedId, startISO: '' }]`;
`pick 'cycle'` -> `auto` (the other big days go to the side strip; question 5). `display 'flip'` -> `typeMode 'one', oneType
'flip'`; `display 'classic'` -> `auto`. The old keys stay written for one release (additive, FIT rule 12), the kiosk reads
only `spotlight`. Per-occasion `display` -> `spotlight.types = ['flip']` when it was `'flip'`. `fileBytes` stays under the
240 kB cap: test with 80 occasions each holding full history + vort.

### 1d. Routes, permissions, live view, SaaS fit

- **No new route.** `PUT /api/occasions/settings` takes `spotlight` (validated by `settingsProblem`), `PUT /api/occasions/:id`
  takes `history` / `vort` / `spotlight`. Covered by the existing `rule('occasions.edit', ANY, /^\/api\/occasions(\/|$)/)`.
- **No new GET**, so `READ_ROUTES` is unchanged (`/api/occasions` already listed, `occasions.edit`).
- SSE: existing `occasions-update` nudge (refetch-safe). `/api/state.occasions` + live view (`VIEWER_KEYS` already has
  `occasions`; `forViewer` drops switched-off rows): new fields are org content, fine to show.
- Admin exposure: the existing test only checks `settings.json` keys. **Add `test/occasionsExposure.test.js`**: every key of
  occasions `SETTINGS_DEFAULTS` (incl. each `spotlight` key) and every occasion field must appear in `src/admin/`, same word
  match + dated allow-list.
- FIT walk: data via store (yes) · scope org, class P0 (history may name Rebbeim/places, not students; admin hint says so) ·
  no env · event `occasions-update` · cap `occasions.edit` · files: photo already in `uploads` · fetch none · live view
  already exposed on purpose · isolation stub: "a queue id from another org's document is dropped, the other document is
  byte-identical" in `test/occasionsRoutes.test.js` · CODE-INVENTORY row for `occasions.json` gets one sentence.
- Type rotation memory is **kiosk-only** (which kind showed last on THIS screen): in-memory + `localStorage` in try/catch,
  never stored on the server, never org state.

---

## 2. Lead-up stages, hype ladder, rotation

### 2a. The ladder (one table in `spotlight.js`, `stageOf(row, now)`)

| stage | when | heat | the screen | kinds it prefers |
|---|---|---|---|---|
| announce | lead start to 31 days | 0 | calm, elegant, "Coming: Yud Shvat", big days number | Journey, Calendar, Progress, Glow |
| month | 30-15 days | 0.2 | warmer accent, story acts start | Journey, Calendar, Ring, Glow |
| twoWeeks | 14-8 days | 0.35 | days + hours, kicker "Two weeks to go" | Ring, Flip, Calendar, Sleeps |
| week | 7-2 days | 0.5 | "This week", sleeps count, faster turns | Sleeps, Flip, Ring, Odometer |
| eve | last 24 h / "tonight" | 0.75 | hours:minutes:seconds live, strongest words | Flip, Ring, Odometer, Glow |
| lastHour | last 60 min | 0.9 | minutes:seconds, the slide comes back more (2c) | Flip, Odometer, Ring |
| (final minute, zero) | | 1 | existing **takeovers** (final + zero), unchanged | |
| day | the day itself | - | "Today is" + the story, history, photo; no countdown | (no kind: the Day hero) |
| after | end + `afterHours` | - | quiet "It was ..." card, then the next spotlight | (no kind) |

- `heat` = existing `hypeOf()` level mapped to 0..1, times the Hype choice (calm caps at 0.35, max x1.3). It is ONE CSS
  variable `--heat` on the slide root; it only changes **opacity** of static role-coloured layers and picks words. It changes
  at stage boundaries, never per frame.
- A switched-off stage falls back to the stage before it (words/kinds), never to nothing.
- MAJOR milestone (40, 50, 100...) keeps today's rule: hype forced to max, extra takeover moments (`MAJOR_MILESTONE_DAYS`).

### 2b. One appearance of the slide (one "round")

`countdown kind` (the hero) -> 1 to N **story acts** -> back. Short far away, longer close:
- `depth: auto`: announce/month = hero + 1 story act; twoWeeks/week = hero + 2; eve = hero + 3; day = Day hero + all.
- Story acts take turns across rounds (round 1: what happened; round 2: years seal; round 3: history; round 4: vort...), so
  each round is short (about 20-35 s) and every round shows something new. `full` = all acts every round (today's behaviour).
- Order of story acts: years seal (if milestone) -> what happened -> photo -> history -> story -> vort. The existing
  paper-scroll reveal (`stage/ScrollReveal.jsx`) stays the frame for text acts (style `scroll`/`calm`).
- The slide asks the rotation once for its total (`onRequestDuration`, as today; slide seconds 0 = automatic).

### 2c. How often

- The Countdown slide plays once per round (today). Extra presence comes from what exists: the rail note (railDays), the
  milestone takeovers, the final-minute and zero takeovers. **Recommended addition (question 3):** in eve and lastHour the
  slide comes twice per round. That needs the backlog item "slide frequency"; build it generically (`slides.json`
  `every`/`perRound`) as the last, optional step, not a Countdown hack.
- **Teaser**: when the spotlight is still in `announce`, the rail note says "Coming: Yud Shvat · 41 days"; no new item kind.

### 2d. The countdown kinds library (first-class, `TYPES` registry in `src/shared/spotlightTypes.js`)

| id | name in admin | what it is | seconds | fits stages |
|---|---|---|---|---|
| `flip` | Flip cards | split-flap cards D:H:M:S, real hinge, shadow, pins | yes | twoWeeks..lastHour |
| `ring` | Tick ring | big ring of 120 ticks lit by the way gone, small H/M/S rings | yes | month..lastHour |
| `journey` | The way there | huge number + a path with stops (60/30/14/7/3/1), "you are here" | no | announce..eve |
| `glow` | Big glow | one giant number, lit edge + light rays from a corner | eve only | all |
| `calendar` | Calendar | grid of the days left, today's tile opens, past ones turned | no | <= 60 days (uses `advent` text if set) |
| `meter` | Percent | a meter filling from the day it was chosen, "71% of the way" | no | announce..week |
| `sleeps` | Sleeps | one small moon per night left, tonight's lit | no | <= 14 nights |
| `odometer` | Rolling numbers | digit wheels that roll (translateY) | yes | week..lastHour |

Each registry entry declares `{ id, label, stages, needs (e.g. maxDays), seconds, layers (motion cost), portrait }`.
Existing `TAP_FORMS` (days, hours, percent, sleeps...) become the **tap** cycle over these kinds; `autoForms` is retired
(migrated to `typeMode auto`).

**Rotation rule (pure, `nextType(state, eligible, mode, stage)`, tested):**
1. Eligible = switched on (global `types.off`, per-day `spotlight.types`) AND fits the stage AND its `needs` hold.
2. **Never the same kind twice in a row** (if only one is eligible, it repeats; that is the only exception).
3. `auto` (default): a shuffle bag ordered by the stage's preference (2a): every eligible kind shows once before any repeats,
   preferred ones first; in eve/lastHour only seconds-ticking kinds are eligible unless none is on.
   `order`: the admin's order, skipping ineligible ones. `random`: shuffle bag. `one`: always `oneType` (rule 2 off).
4. The bag resets when the spotlight or the stage changes. Kiosk-local memory (section 1d), so two screens may differ.

---

## 3. Frontend (kiosk)

### 3a. Fonts and colours: the screen's own, never the mock's (owner, 2026-11-16)

- Fonts only through roles (`src/shared/fontRoles.js` via `DesignRoot`): big numbers `look.numeralsFont` -> default
  `CONDENSED_NUMERALS` via `fontStack()`; Hebrew names `--f-he-d`; English names `--f-en-d`; labels / small caps `--f-en`;
  story / vort / history text `--f-th` / `--f-te`. Hebrew sizes through `he(px)`. No family name in any component.
- Colours only through theme roles (`--text --dim --accent --accentText --raised --ink --fill --fillInk --line --past`),
  with `look.accent` as the optional per-day override. The mock's map: gold `--acc` -> `--accentText`; second accent ->
  `color-mix(var(--accentText), var(--fill))`; card faces -> `--raised` (top) / `color-mix(--raised, --ink)` (bottom);
  backgrounds -> the stage background role. Works on every Light and Dark theme and the day/night crossfade (all derived
  from the 8 base roles, GOTCHAS).
- "Real-looking" comes from light, not clip-art: one static top sheen per card, a 1-2 px hinge line, a soft contact shadow
  (static `box-shadow`, never animated), tabular figures, generous space. No 3D fakery, no emoji, no stock icons.

### 3b. Anatomy (landscape 1600x900 canvas; portrait 900x1600)

Common frame (every kind): kicker (stage words) top-start · name (Hebrew big, English under) · **years badge** top-end when
a milestone · the kind in the centre area · footer: "begins Monday evening · shkia 5:32" + side strip at the end edge.
Portrait: the same column stacked; side strip becomes a bottom row of 3 chips.

- **Flip**: 4 groups x 2 cards; far stages show days (3 digits if needed) + hours only; seconds group from eve on (or
  always: question 6). Portrait: 2x2 groups.
- **Ring**: 520 px ring, lit fraction = way gone since the lead started; head tick white; minis H/M/S. Portrait: ring on top,
  minis in a row below.
- **Journey**: number left, path right with stop dots; Hebrew mode mirrors the path (goal on the left). Portrait: path under.
- **Glow**: a single number filling the area, accent edge layer + a static ray fan in the corner (rays move only if the
  owner allows, question 1).
- **Calendar**: grid sized to the days left (<= 60), turned tiles in `--past`, today's tile opens (existing `tt-adv-open`).
- **Meter**: one thick bar + big percent; **Sleeps**: moons in rows of 7; **Odometer**: wheels with 0-9 strips.
- **Day hero**: "Today is" + name + the photo framed at the end edge (pre-dimmed by a static gradient, no blur).
- **Side strip**: up to `strip.count` small chips (name + days), small days included if `strip.small`; never a full act.

### 3c. The milestone YEARS seal (much more hype, owner 2026-11-16)

A full **hero act**, not a badge only:
- A seal/medal drawn in SVG with theme roles: outer ring of 72 fine ticks, an inner engraved ring with text on a circle
  ("YEARS SINCE · DIDAN NOTZACH" / Hebrew `שנה ל...`), the number huge in the numerals role, Hebrew letters under it
  (`מ׳ שנה`, `gematria()` already in `hebrewCalendar.js`), and the two readings: "40 years since" + "entering the 41st year"
  (from `yearsFor`: completed / entering).
- Entrance (finite, <= 1.6 s, transform + opacity only): seal scales 1.12 -> 1 and fades in; inner ring rotates in 18 deg;
  the tick ring appears in **4 quadrant layers** (4 opacity steps, not 72 animations); the number counts up 0 -> 40 over
  1 s (text change, then still); the vort for the number slides up under it.
- **Tier escalation**: `major` = full act 10 s, count-up, rays behind the seal (static unless question 1), seal also as a
  badge on EVERY kind and on the takeovers (existing `YearsBadge`), hype forced max, extra takeover days; `notable` = act 7 s,
  no count-up, badge on the hero only; none = nothing. The milestone vort comes from `yearVorts` / `NUMBER_VORTS` (unchanged).

### 3d. Motion budget (GOTCHAS "Kiosk design system rules" + "Takeover animation rules", Pi 5 at 4K)

- Only `transform` and `opacity` animate. No `filter`, `blur`, `backdrop-filter`, `mix-blend-mode`, animated `box-shadow`,
  animated gradients, `mask` or `width` (the mock's journey fill and glow shadow are rebuilt: fill = `scaleX`, glow = static).
- Flip: one leaf `rotateX` per changing card, 550 ms, finite (same rule as today's `tt-flip`); worst case 8 leaves at a
  rollover. `will-change` only on leaves, only while flipping. Odometer: one `translateY` per changing wheel.
- Ring / meter / calendar / sleeps: **no animation**; values change once a second (ring) or once a day.
- At most 4 animating layers at once on the slide; entrances <= 1.2 s (seal 1.6 s); heat changes are a 800 ms opacity
  transition at stage boundaries only.
- Minimal motion / `prefers-reduced-motion`: digits change in place, no entrances, no count-up; the static picture must
  look complete (checked by the audit).
- **Needs the owner's exception (question 1):** (a) rays slowly swaying in Glow and behind a major seal (one element,
  `rotate` +-2 deg, 30 s alternate); (b) the "you are here" dot and the ring head breathing opacity (2 small layers);
  only from `week` on, never on the far stages. Without a yes these stay still.

---

## 4. Admin (Screen > Occasions, phone first)

### 4a. Spotlight card (top of the panel)

Shows: the spotlight's name, "41 days · begins Monday evening", the stage it is in, a row of small thumbnails of the kinds
it will take turns with, and what comes next in the queue. Buttons: **Change** (wizard), **Edit the story**, **Preview**.

### 4b. The wizard (bottom sheet, 4 steps, sticky Next/Save, 44 px targets)

1. **Which day**: "Automatic (the nearest big day)" (default) or tap a day from the upcoming list (big days first, with
   "in 41 days"). "Then next..." adds more to the queue (drag or up/down arrows).
2. **Kinds of countdown**: 8 thumbnail tiles, all on by default; tap to switch one off. One line under it: "They take turns,
   a different one each time; close to the day, the ones with seconds." (Order and modes live in More options.)
3. **The day's story**: what happened (one line), the story, a vort, "this day in history" lines (year + text), the year it
   started (milestones), a photo. Each with "Copy a Claude prompt" (existing `vortPrompt`, plus a new history prompt that
   asks for sourced lines only) and paste-back parsing. All optional; empty = that act does not show.
4. **Preview**: the real kiosk component in a scaled box (pattern of `letters/PagePreview.jsx`, which imports the screen
   code), with stage chips: "A month out / A week / Tomorrow night / Last hour / The day / After" and a kind picker, plus
   "Open on a full screen" (existing `openPreview` with `previewAt`). Save.

### 4c. More options (collapsed groups, each with a one-line summary when closed)

- **Kinds and order**: per-kind switch, drag order, mode (Automatic / My order / Random / Always one), per-day override.
- **Stages**: the 8 stage switches with their dates for this spotlight, words per stage (existing `WordsEditor`),
  `afterHours`, `leadDays`.
- **Hype**: Calm / Lively / Maximum (existing `HypeSection`), how many story acts per round (Auto / Short / Full).
- **Colours**: "Use my theme" (default) or an accent (existing `LookSection`), photo dim.
- **What the story shows**: act switches + order (extends existing `LayoutSection`).
- **Side strip**: on/off, how many, how far ahead, include small days.
- Existing groups stay: takeovers / milestones, sound, tap on the TV, collections, rail/banner.

Plain words everywhere, no ids; every group has a live summary ("6 of 8 kinds, automatic order").

---

## 5. Build plan (small steps, commit after each; max 1-2 agents at a time)

| # | step | model | done when |
|---|---|---|---|
| 1 | `src/shared/spotlight.js` + `spotlightTypes.js`: pick/queue/spent rule, `stageOf`, heat, `nextType` shuffle bag, act plan per stage (`depth`), migration in `normalizeSettings`, new occasion fields + limits + problems | sonnet | `test/spotlight.test.js` green |
| 2 | Server/admin plumbing: settings + occasion fields through existing routes, `forViewer`, isolation stub, `occasionsExposure.test.js`, CODE-INVENTORY line | sonnet | route tests green |
| 3 | Kiosk shell: SpotlightSlide frame (kicker, name, badge slot, side strip, footer) on the existing Stage + acts, role tokens, `--heat`, landscape/portrait/Hebrew | opus | audit renders 3 orientations |
| 4 | Kinds batch 1: Flip, Ring, Journey (rebuilt from the mock on roles) | opus | audit: animations <= budget |
| 5 | Years seal hero act + tier escalation + badge on every kind | opus | major/notable/none screenshots (sparingly) |
| 6 | Kinds batch 2: Glow, Calendar, Meter, Sleeps, Odometer | opus | registry complete, rotation shows all 8 |
| 7 | Story acts: what happened, history timeline, vort, photo, Day hero, After card | opus | acts in all three layouts |
| 8 | Admin: Spotlight card + wizard + scaled preview with stage chips | sonnet | `occasions-admin-audit.mjs` passes at 390 px |
| 9 | Admin: More options groups | sonnet | exposure test green |
| 10 | Audit + docs: extend `scripts/occasions-audit.mjs` (every kind x stage x orientation x Hebrew, `getAnimations()` count, no forbidden CSS, reduced-motion still frame), FEATURES.md, CHANGELOG, CLAUDE.md line | sonnet | audit green |
| 11 | (optional, after Q3) generic slide frequency from BACKLOG | sonnet | rotation tests |

**Tests to add**: `spotlight.test.js` (auto/pinned/queue, spent after `afterHours`, never jumps to next year, '' entries
outside lead skipped, stage boundaries incl. DST + Shabbos moves, `nextType` never repeats, bag fairness, stage filter,
per-day override, single-kind case, migration of all 3 old picks + `display`), `occasions.test.js` additions (history/vort
normalize + limits, `fileBytes` with 80 full rows), `occasionsRoutes.test.js` (spotlight settings PUT, unknown queue id
dropped, isolation stub), `occasionStage.test.js` (act plan per stage and depth), `occasionsExposure.test.js`, audit checks.

## 6. Questions for the owner

1. **Moving light**: may the big glow and the major-year seal have slowly moving rays, and the "you are here" dot gently
   glow, in the last week only? (Today only messages may move like that; the TV is fine with it in takeovers.)
2. **After the day**: show a short "It was Yud Shvat" card for 12 hours, or go straight to the next day?
3. **More often near the day**: on the last evening and hour, should the countdown come up twice per round of slides?
4. **Kinds by stage**: OK that close to the day it only picks kinds that tick seconds (flip, ring, rolling numbers)?
5. **"A few big days taking turns"** goes away (one spotlight; the others in the side strip). OK?
6. **Seconds far away**: flip cards tick seconds all the time (more alive) or only from the last day (calmer)?
7. **Hebrew words** for the stages, the seal ("שנה ל..." / "נכנסים לשנת ה...") and the kinds: a native speaker to confirm.
