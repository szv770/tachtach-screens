# Per-Date Schedule Overrides + Bulk Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin define a completely different schedule for any specific calendar date (a camp's schedule genuinely differs day to day), editable in bulk via a downloadable Excel template (one sheet per date), while the existing recurring day-of-week schedule keeps working unchanged as the fallback for any date without an override.

**Architecture:** A new `data/schedule-dates.json` keyed by ISO date, resolved against the existing recurring `data/schedule.json` by one shared pure function (`getEffectiveSchedule`) used identically by the kiosk display and the countdown-alert scheduler. Excel generation/parsing via `exceljs` (new dependency, pure JS, no native build step). New routes live under `/api/schedule/dates/*` — the existing `/api/schedule/template(s)` paths are a *different*, unrelated feature (saved JSON schedule snapshots) and must not be touched.

**Tech Stack:** Node/Express (plain JS, ES modules), React 18, `exceljs` (new), Node's built-in `node:test` + `node:assert/strict` test runner (no new test-framework dependency — this project has no test infrastructure yet; `node --test` ships with Node, and this repo requires Node 18+, so it's always available).

## Global Constraints

- No TypeScript, no Tailwind/CSS framework — this codebase uses plain JS + inline styles + Framer Motion throughout. Follow that.
- No native-compile dependencies (matches this project's existing constraint) — `exceljs` is pure JS, confirmed safe.
- Day codes are the full capitalized names already used throughout this codebase: `['Sun','Mon','Tue','Wed','Thu','Fri','Shabbos']` (see `src/admin/components/ScheduleEditor.jsx`'s `DAYS` constant). Do **not** use `countdown.js`'s internal lowercase `sun`/`mon`/`shabbos` codes for anything new — that's a separate, pre-existing, out-of-scope inconsistency.
- The persisted field name for a schedule entry's countdown display mode is `countdownDisplay` (`'slide'` or `'takeover'`), not `alertDisplay` — confirmed against `countdown.js:84` and `SCHEDULE_ENTRY_FIELDS` in `src/server/routes/api.js`.
- Existing schedule entry fields (mirror exactly for per-date entries, minus `days`): `id`, `name`, `nameHe`, `time` (24-hour `HH:MM`), `endTime`, `category`, `enabled`, `alertBefore`, `countdownDisplay`, `icon`.
- Full spec: `docs/superpowers/specs/2026-07-21-schedule-date-overrides-design.md`.

---

### Task 1: Shared schedule-resolution helper

**Files:**
- Create: `src/shared/scheduleResolution.js`
- Create: `src/shared/scheduleResolution.test.js`
- Modify: `package.json:7-16` (add `"test": "node --test src/**/*.test.js"` to `scripts`)

**Interfaces:**
- Produces: `export function getEffectiveSchedule(schedule, scheduleDates, dateISO, now = new Date())` → `{ entries: Array, categories: Array, isOverride: boolean }`. `schedule` is the raw `schedule.json` shape (`{ entries, categories }`); `scheduleDates` is the raw `schedule-dates.json` shape (`{ [dateISO]: { entries } }`); `dateISO` is `'YYYY-MM-DD'`. `categories` in the result is always `schedule.categories` (categories are never per-date). Also produces `export function todayISO(now = new Date())` → `'YYYY-MM-DD'` in the local timezone, and `export const DAY_CODES = ['Sun','Mon','Tue','Wed','Thu','Fri','Shabbos']`.
- Consumes: nothing from other tasks — this is the foundation everything else builds on.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/scheduleResolution.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveSchedule, todayISO, DAY_CODES } from './scheduleResolution.js';

const CATEGORIES = [{ id: 'davening', name: 'Davening', color: '#gold' }];

test('todayISO returns YYYY-MM-DD for a given date', () => {
  const d = new Date(2026, 6, 25, 14, 30); // July 25, 2026, local time
  assert.equal(todayISO(d), '2026-07-25');
});

test('DAY_CODES matches the codes used throughout the codebase', () => {
  assert.deepEqual(DAY_CODES, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos']);
});

test('no override present: falls back to recurring entries filtered by day-of-week', () => {
  const schedule = {
    entries: [
      { id: '1', name: 'Shacharis', time: '07:00', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
      { id: '2', name: 'Shabbos Kiddush', time: '12:00', days: ['Shabbos'] },
    ],
    categories: CATEGORIES,
  };
  const now = new Date(2026, 6, 27); // Monday, July 27, 2026
  const result = getEffectiveSchedule(schedule, {}, todayISO(now), now);
  assert.equal(result.isOverride, false);
  assert.deepEqual(result.entries.map(e => e.id), ['1']);
  assert.equal(result.categories, CATEGORIES);
});

test('override present with entries: uses override entries, ignores recurring entirely', () => {
  const schedule = {
    entries: [{ id: '1', name: 'Shacharis', time: '07:00', days: ['Mon'] }],
    categories: CATEGORIES,
  };
  const scheduleDates = {
    '2026-07-27': { entries: [{ id: 'x', name: 'Color War Kickoff', time: '16:00' }] },
  };
  const result = getEffectiveSchedule(schedule, scheduleDates, '2026-07-27', new Date(2026, 6, 27));
  assert.equal(result.isOverride, true);
  assert.deepEqual(result.entries.map(e => e.id), ['x']);
});

test('override present with EMPTY entries: a deliberately blank day, does not fall back', () => {
  const schedule = {
    entries: [{ id: '1', name: 'Shacharis', time: '07:00', days: ['Mon'] }],
    categories: CATEGORIES,
  };
  const scheduleDates = { '2026-07-27': { entries: [] } };
  const result = getEffectiveSchedule(schedule, scheduleDates, '2026-07-27', new Date(2026, 6, 27));
  assert.equal(result.isOverride, true);
  assert.deepEqual(result.entries, []);
});

test('missing/null scheduleDates and schedule are handled without throwing', () => {
  const result = getEffectiveSchedule(null, null, '2026-07-27', new Date(2026, 6, 27));
  assert.equal(result.isOverride, false);
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.categories, []);
});

test('recurring entry with no days field is treated as applying every day', () => {
  const schedule = {
    entries: [{ id: '1', name: 'Always On', time: '09:00' }],
    categories: [],
  };
  const now = new Date(2026, 6, 27); // any day
  const result = getEffectiveSchedule(schedule, {}, todayISO(now), now);
  assert.deepEqual(result.entries.map(e => e.id), ['1']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/shared/scheduleResolution.test.js`
Expected: FAIL — `Cannot find module './scheduleResolution.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/shared/scheduleResolution.js`:

```javascript
export const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];

/**
 * Local-timezone YYYY-MM-DD for a given Date.
 * @param {Date} now
 * @returns {string}
 */
export function todayISO(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Resolve which schedule entries are in effect for a given date: a per-date
 * override if one exists (even if empty — an explicit blank day), otherwise
 * the recurring day-of-week schedule filtered to today's day code.
 *
 * @param {{entries?: object[], categories?: object[]}|null} schedule — raw schedule.json shape
 * @param {Record<string, {entries: object[]}>|null} scheduleDates — raw schedule-dates.json shape
 * @param {string} dateISO — 'YYYY-MM-DD'
 * @param {Date} [now] — only used to resolve the day-of-week code for the fallback path
 * @returns {{entries: object[], categories: object[], isOverride: boolean}}
 */
export function getEffectiveSchedule(schedule, scheduleDates, dateISO, now = new Date()) {
  const categories = schedule?.categories || [];
  const override = scheduleDates?.[dateISO];

  if (override) {
    return { entries: override.entries || [], categories, isOverride: true };
  }

  const recurringEntries = schedule?.entries || [];
  const todayCode = DAY_CODES[now.getDay() === 6 ? 6 : now.getDay()];
  const filtered = recurringEntries.filter(e => !e.days || e.days.includes(todayCode));

  return { entries: filtered, categories, isOverride: false };
}
```

Note: `now.getDay()` returns `0=Sunday..6=Saturday`; `DAY_CODES[6]` is `'Shabbos'`, so `DAY_CODES[now.getDay()]` already lines up directly — the `=== 6 ? 6 :` is a no-op clarifying the Saturday→Shabbos mapping explicitly rather than relying on index coincidence being obvious to a reader.

Add to `package.json`'s `"scripts"` block (after `"reset-admin"`):

```json
    "test": "node --test src/**/*.test.js"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/shared/scheduleResolution.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/scheduleResolution.js src/shared/scheduleResolution.test.js package.json
git commit -m "feat(schedule): add getEffectiveSchedule resolution helper"
```

---

### Task 2: Wire resolution into countdown alerts

**Files:**
- Modify: `src/server/countdown.js:133-159` (`initCountdowns` function)

**Interfaces:**
- Consumes: `getEffectiveSchedule(schedule, scheduleDates, dateISO, now)` from Task 1, `src/shared/scheduleResolution.js`.
- Produces: `initCountdowns()` now reads `data/schedule-dates.json` in addition to `data/schedule.json`, so countdown alerts fire off the correct schedule on override days. No exported-signature change — same public function.

- [ ] **Step 1: Update `initCountdowns` to resolve per-date first**

In `src/server/countdown.js`, add the import and replace the body of `initCountdowns`:

```javascript
import { readJSON } from './storage.js';
import { broadcast } from './sse.js';
import { getEffectiveSchedule, todayISO } from '../shared/scheduleResolution.js';
```

Replace:

```javascript
export async function initCountdowns() {
  // Clear any existing timers
  clearAllCountdowns();

  const schedule = await readJSON('schedule.json');
  if (!schedule?.entries?.length) return;

  const today = getTodayCode();

  for (const entry of schedule.entries) {
    // Skip disabled entries
    if (entry.enabled === false) continue;

    // Skip entries not scheduled for today
    if (entry.days && !entry.days.includes(today)) continue;

    // Skip entries without alertBefore
    if (!entry.alertBefore || entry.alertBefore <= 0) continue;

    scheduleEntryAlert(entry);
  }

  const scheduled = alertTimers.size;
  if (scheduled > 0) {
    console.log(`[countdown] Scheduled ${scheduled} alert(s) for today (${today})`);
  }
}
```

with:

```javascript
export async function initCountdowns() {
  // Clear any existing timers
  clearAllCountdowns();

  const schedule = await readJSON('schedule.json');
  const scheduleDates = await readJSON('schedule-dates.json');
  const now = new Date();
  const { entries } = getEffectiveSchedule(schedule, scheduleDates, todayISO(now), now);
  if (!entries.length) return;

  for (const entry of entries) {
    // Skip disabled entries
    if (entry.enabled === false) continue;

    // Skip entries without alertBefore
    if (!entry.alertBefore || entry.alertBefore <= 0) continue;

    scheduleEntryAlert(entry);
  }

  const scheduled = alertTimers.size;
  if (scheduled > 0) {
    console.log(`[countdown] Scheduled ${scheduled} alert(s) for today (${todayISO(now)})`);
  }
}
```

Note: `getEffectiveSchedule` already filters recurring entries by day-of-week, so the old `entry.days`/`getTodayCode()` check inside the loop is removed — it would now be redundant (and `getTodayCode()`'s lowercase codes are the separate pre-existing inconsistency called out in Global Constraints; leave `getTodayCode`/`DOW_MAP` in the file since they're unrelated to this change and still used elsewhere in this file — do not remove them).

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check src/server/countdown.js`
Expected: no output (clean).

- [ ] **Step 3: Manual smoke test**

Run: `node -e "import('./src/server/countdown.js').then(m => m.initCountdowns()).then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1); })"`
Expected: prints `OK` (or a `[countdown] Scheduled N alert(s)...` line first, if today's effective schedule has any `alertBefore`-bearing entries) with no errors. This repo has no `data/schedule-dates.json` yet, so `readJSON` returns `null` and `scheduleDates?.[dateISO]` is `undefined` — confirms the no-override fallback path runs without throwing.

- [ ] **Step 4: Commit**

```bash
git add src/server/countdown.js
git commit -m "feat(schedule): countdown alerts resolve per-date overrides before recurring fallback"
```

---

### Task 3: Server plumbing — expose schedule-dates via /api/state, list/delete routes

**Files:**
- Modify: `src/server/app.js:161-190` (`GET /api/state` handler)
- Modify: `src/server/routes/api.js` (add two new routes near the existing `/schedule/*` routes, after line 379's `GET /schedule` handler)

**Interfaces:**
- Produces: `/api/state` response gains `scheduleDates: object` (raw `schedule-dates.json` contents, `{}` if the file doesn't exist yet). New routes: `GET /api/schedule/dates` → the same raw object; `DELETE /api/schedule/dates/:date` → deletes that one date's key, broadcasts `schedule-dates-update` with the updated object, re-runs `initCountdowns()`.
- Consumes: `readJSON`/`writeJSON` from `../storage.js` (already imported in both files), `broadcast` from `../sse.js` (already imported in `api.js`), `initCountdowns` from `../countdown.js` (already imported in `api.js`, confirm via `grep -n "initCountdowns" src/server/routes/api.js` — it's used by the existing schedule routes already).

- [ ] **Step 1: Add `scheduleDates` to `/api/state`**

In `src/server/app.js`, the `Promise.all` inside the `GET /api/state` handler:

```javascript
      const [cache, settings, slides, messages, pinned, customDays, googleAlbums, schedule, rssFeeds, fonts] = await Promise.all([
        readJSON('cache.json'),
        readJSON('settings.json'),
        readJSON('slides.json'),
        readJSON('messages.json'),
        readJSON('pinned.json'),
        readJSON('custom-days.json'),
        readJSON('google-albums.json'),
        readJSON('schedule.json'),
        readJSON('rss-feeds.json'),
        readJSON('fonts.json'),
      ]);
      res.json({
        cache: cache ?? {},
        settings: settings ?? {},
        slides: slides ?? [],
        messages: messages ?? [],
        pinned: pinned ?? [],
        customDays: customDays ?? [],
        googleAlbums: googleAlbums ?? [],
        schedule: schedule ?? { entries: [], categories: [] },
        rssFeeds: rssFeeds ?? [],
        fonts: fonts ?? [],
      });
```

becomes:

```javascript
      const [cache, settings, slides, messages, pinned, customDays, googleAlbums, schedule, rssFeeds, fonts, scheduleDates] = await Promise.all([
        readJSON('cache.json'),
        readJSON('settings.json'),
        readJSON('slides.json'),
        readJSON('messages.json'),
        readJSON('pinned.json'),
        readJSON('custom-days.json'),
        readJSON('google-albums.json'),
        readJSON('schedule.json'),
        readJSON('rss-feeds.json'),
        readJSON('fonts.json'),
        readJSON('schedule-dates.json'),
      ]);
      res.json({
        cache: cache ?? {},
        settings: settings ?? {},
        slides: slides ?? [],
        messages: messages ?? [],
        pinned: pinned ?? [],
        customDays: customDays ?? [],
        googleAlbums: googleAlbums ?? [],
        schedule: schedule ?? { entries: [], categories: [] },
        rssFeeds: rssFeeds ?? [],
        fonts: fonts ?? [],
        scheduleDates: scheduleDates ?? {},
      });
```

- [ ] **Step 2: Add the list and delete routes**

In `src/server/routes/api.js`, immediately after the existing `router.get('/schedule', ...)` handler (ends at line 379), insert:

```javascript
router.get('/schedule/dates', async (_req, res) => {
  try {
    const scheduleDates = await readJSON('schedule-dates.json');
    res.json(scheduleDates ?? {});
  } catch (err) {
    console.error('[api] GET /schedule/dates error:', err.message);
    res.status(500).json({ error: 'Failed to read schedule date overrides.' });
  }
});

router.delete('/schedule/dates/:date', async (req, res) => {
  try {
    const scheduleDates = (await readJSON('schedule-dates.json')) ?? {};
    if (!(req.params.date in scheduleDates)) {
      return res.status(404).json({ error: 'No override found for that date.' });
    }
    delete scheduleDates[req.params.date];
    await writeJSON('schedule-dates.json', scheduleDates);
    broadcast('schedule-dates-update', scheduleDates);
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
    res.json(scheduleDates);
  } catch (err) {
    console.error('[api] DELETE /schedule/dates/:date error:', err.message);
    res.status(500).json({ error: 'Failed to remove schedule date override.' });
  }
});
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/server/app.js && node --check src/server/routes/api.js`
Expected: no output (clean).

- [ ] **Step 4: Manual smoke test**

```bash
node server.js &
sleep 2
curl -s http://127.0.0.1:3000/api/state | node -e "let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d); console.log('scheduleDates' in j ? 'PASS: scheduleDates present' : 'FAIL')})"
curl -s -o /dev/null -w "GET /api/schedule/dates (unauth, expect 401): %{http_code}\n" http://127.0.0.1:3000/api/schedule/dates
kill %1
```
Expected: `PASS: scheduleDates present` and `401` (the route is behind `requireAuth` same as every other `/api/*` route).

- [ ] **Step 5: Commit**

```bash
git add src/server/app.js src/server/routes/api.js
git commit -m "feat(schedule): expose schedule-dates via /api/state, add list/delete routes"
```

---

### Task 4: Wire resolution into the kiosk display

**Files:**
- Modify: `src/screen/App.jsx` (add `scheduleDates` SSE handling, compute effective schedule once, pass down)
- Modify: `src/screen/components/SlideCarousel.jsx:205` (`ScheduleSlide` prop)
- Modify: `src/screen/components/slides/ScheduleSlide.jsx:517-526` (stop reading raw unfiltered entries)

**Interfaces:**
- Consumes: `getEffectiveSchedule`, `todayISO` from `src/shared/scheduleResolution.js` (Task 1).
- Produces: `ScheduleSlide` now receives an already-resolved `{ entries, categories }` via its existing `schedule` prop — no change to `ScheduleSlide`'s prop shape or its internal rendering logic, only to what's fed into `schedule.entries`.

- [ ] **Step 1: Compute the effective schedule once in `App.jsx`**

In `src/screen/App.jsx`, add the import near the other hook/util imports at the top:

```javascript
import { getEffectiveSchedule, todayISO } from '../shared/scheduleResolution.js';
```

Add the `fonts-update` SSE case already exists (from a prior fix) — add a new case right next to it in the same `switch` inside `handleSSE`:

```javascript
      case 'schedule-dates-update':
        setState(prev => prev ? { ...prev, scheduleDates: data } : prev);
        break;
```

Where the component currently builds `rightColumn` and passes `schedule={state?.schedule}` to `SlideCarousel`, compute the effective schedule first. Find the existing `rightColumn` construction (passes `schedule={state?.schedule}` — search for that exact prop) and change it to pass a resolved value instead:

```javascript
  const effectiveSchedule = React.useMemo(
    () => getEffectiveSchedule(state?.schedule, state?.scheduleDates, todayISO()),
    [state?.schedule, state?.scheduleDates]
  );
```

Add this alongside the other `useMemo`/derived-state declarations (near where `allSlides` is computed via `React.useMemo`), then change the `SlideCarousel` prop from `schedule={state?.schedule}` to `schedule={effectiveSchedule}`.

Note: `todayISO()` with no `now` recalculates on every render using the real current time — correct, since this must flip over at local midnight without needing a page reload. Because `React.useMemo`'s dependency array doesn't include a live clock tick, the memo will only recompute when `state.schedule`/`state.scheduleDates` change, not automatically at midnight — this is an accepted limitation matching how the rest of this file already handles day-rollover (e.g. the Pirkei Avos seasonal check has the same characteristic); the kiosk's own periodic full-state resync (`useSSE`'s 5-second poll / 20-second stale-reconnect, see `docs/claude/GOTCHAS.md`) causes `state` to get a new object reference on that cadence regardless, which naturally re-triggers this memo well within a few minutes of an actual midnight rollover.

- [ ] **Step 2: Pass through `SlideCarousel`**

`src/screen/components/SlideCarousel.jsx:205` already does `<ScheduleSlide schedule={schedule} tokens={tokens} settings={settings} />` — `schedule` here is whatever `SlideCarousel`'s own `schedule` prop was set to by its caller (`App.jsx`, changed in Step 1). No change needed in `SlideCarousel.jsx` itself — confirm by reading the file that `schedule` is destructured from `SlideCarousel`'s own props and passed straight through unmodified.

- [ ] **Step 3: Confirm `ScheduleSlide.jsx` needs no change**

`ScheduleSlide.jsx:521` already does `[...(schedule?.entries || [])].sort(...)` — since `schedule.entries` is now pre-filtered by `getEffectiveSchedule` before it ever reaches this component, no change is needed here. This step is a verification, not an edit: read `src/screen/components/slides/ScheduleSlide.jsx:517-526` and confirm it still just consumes `schedule.entries`/`schedule.categories` as-is.

- [ ] **Step 4: Build and smoke-test**

Run: `npm run build`
Expected: `✓ built` with no errors.

Run:
```bash
node server.js &
sleep 2
curl -s -o /dev/null -w "/screen: %{http_code}\n" http://127.0.0.1:3000/screen
kill %1
```
Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add src/screen/App.jsx
git commit -m "feat(schedule): kiosk display resolves per-date overrides via getEffectiveSchedule"
```

---

### Task 5: Excel template generation

**Files:**
- Create: `src/server/scheduleImport.js` (template-building half only in this task; import-parsing half is Task 6)
- Create: `src/server/scheduleImport.test.js`
- Modify: `package.json` (add `exceljs` dependency)
- Modify: `src/server/routes/api.js` (add `GET /schedule/dates/template`)

**Interfaces:**
- Produces: `export async function buildTemplateWorkbook({ dates, mode, schedule, scheduleDates, categories, iconNames })` → an `exceljs.Workbook` instance, one sheet per date in `dates` (each named exactly the ISO date string), with header row `['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled']`, a data-validation list on the Category/Icon/Alert Display columns, and (for `mode === 'export'`) pre-filled rows from that date's current effective schedule; for `mode === 'blank'`, 1-2 example rows instead. `dates: string[]` (ISO), `mode: 'blank'|'export'`, `iconNames: string[]` (the 16 built-in icon names).
- Consumes: `getEffectiveSchedule` from Task 1 (only for `mode === 'export'`).

- [ ] **Step 1: Install exceljs**

Run: `npm install exceljs`
Expected: adds `exceljs` to `dependencies` in `package.json` and `package-lock.json`. Verify with: `node -e "console.log(require('exceljs') ? 'exceljs resolves' : 'FAIL')" ` — note this repo is ESM (`"type": "module"` in `package.json`), so actually verify via: `node --input-type=module -e "import('exceljs').then(() => console.log('exceljs resolves')).catch(e => { console.error(e); process.exit(1); })"`.

- [ ] **Step 2: Write the failing test**

Create `src/server/scheduleImport.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateWorkbook } from './scheduleImport.js';

const ICON_NAMES = ['book', 'prayer', 'meal', 'test', 'bed', 'bus', 'sports', 'bell', 'megaphone', 'clock', 'coffee', 'music', 'candle', 'star', 'calendar', 'sparkle'];

test('blank template has one sheet per requested date with the correct headers', async () => {
  const wb = await buildTemplateWorkbook({
    dates: ['2026-07-25', '2026-07-26'],
    mode: 'blank',
    schedule: { entries: [], categories: [] },
    scheduleDates: {},
    iconNames: ICON_NAMES,
  });
  assert.deepEqual(wb.worksheets.map(ws => ws.name), ['2026-07-25', '2026-07-26']);
  const headerRow = wb.getWorksheet('2026-07-25').getRow(1).values.slice(1); // exceljs values[0] is always undefined
  assert.deepEqual(headerRow, ['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled']);
});

test('blank template includes at least one example row below the header', async () => {
  const wb = await buildTemplateWorkbook({
    dates: ['2026-07-25'],
    mode: 'blank',
    schedule: { entries: [], categories: [] },
    scheduleDates: {},
    iconNames: ICON_NAMES,
  });
  const sheet = wb.getWorksheet('2026-07-25');
  assert.ok(sheet.rowCount >= 2, 'expected at least a header row plus one example row');
});

test('export mode pre-fills a date\'s current effective schedule', async () => {
  const wb = await buildTemplateWorkbook({
    dates: ['2026-07-27'], // a Monday
    mode: 'export',
    schedule: {
      entries: [{ id: '1', name: 'Shacharis', time: '07:00', category: 'davening', days: ['Mon'] }],
      categories: [{ id: 'davening', name: 'Davening' }],
    },
    scheduleDates: {},
    iconNames: ICON_NAMES,
  });
  const sheet = wb.getWorksheet('2026-07-27');
  const dataRow = sheet.getRow(2).values.slice(1);
  assert.equal(dataRow[0], 'Shacharis'); // Name (EN)
  assert.equal(dataRow[2], '07:00');     // Start Time
});

test('Category column has a data-validation dropdown listing existing category names', async () => {
  const wb = await buildTemplateWorkbook({
    dates: ['2026-07-25'],
    mode: 'blank',
    schedule: { entries: [], categories: [{ id: 'davening', name: 'Davening' }, { id: 'meals', name: 'Meals' }] },
    scheduleDates: {},
    iconNames: ICON_NAMES,
  });
  const sheet = wb.getWorksheet('2026-07-25');
  const categoryCell = sheet.getCell('E2');
  assert.ok(categoryCell.dataValidation, 'expected a data validation on the Category column');
  assert.equal(categoryCell.dataValidation.type, 'list');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test src/server/scheduleImport.test.js`
Expected: FAIL — `Cannot find module './scheduleImport.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/server/scheduleImport.js`:

```javascript
import ExcelJS from 'exceljs';
import { getEffectiveSchedule } from '../shared/scheduleResolution.js';

const HEADERS = ['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled'];

const EXAMPLE_ROW = ['Shacharis', '', '07:00', '', 'Davening', 'prayer', 5, 'slide', 'TRUE'];

/**
 * Build an Excel workbook for the per-date schedule override template,
 * one sheet per requested date.
 * @param {object} opts
 * @param {string[]} opts.dates — ISO dates, one sheet per date
 * @param {'blank'|'export'} opts.mode
 * @param {{entries?: object[], categories?: object[]}} opts.schedule — raw schedule.json
 * @param {Record<string, {entries: object[]}>} opts.scheduleDates — raw schedule-dates.json
 * @param {string[]} opts.iconNames — the built-in icon name list, for the Icon dropdown
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function buildTemplateWorkbook({ dates, mode, schedule, scheduleDates, iconNames }) {
  const workbook = new ExcelJS.Workbook();
  const categoryNames = (schedule?.categories || []).map(c => c.name);

  for (const dateISO of dates) {
    const sheet = workbook.addWorksheet(dateISO);
    sheet.addRow(HEADERS);

    if (mode === 'export') {
      const { entries } = getEffectiveSchedule(schedule, scheduleDates, dateISO);
      const categoryById = Object.fromEntries((schedule?.categories || []).map(c => [c.id, c.name]));
      for (const e of entries) {
        sheet.addRow([
          e.name || '', e.nameHe || '', e.time || '', e.endTime || '',
          categoryById[e.category] || e.category || '', e.icon || '',
          e.alertBefore ?? 0, e.countdownDisplay || 'slide', e.enabled === false ? 'FALSE' : 'TRUE',
        ]);
      }
    } else {
      sheet.addRow(EXAMPLE_ROW);
    }

    // Data validation dropdowns — 'warning' error style so typing a value
    // not in the list is still allowed (new categories get auto-created
    // on import), not hard-blocked.
    const lastRow = Math.max(sheet.rowCount, 50); // cover blank rows below any data too
    if (categoryNames.length > 0) {
      sheet.dataValidations.add(`E2:E${lastRow}`, {
        type: 'list', allowBlank: true, errorStyle: 'warning',
        formulae: [`"${categoryNames.join(',')}"`],
      });
    }
    sheet.dataValidations.add(`F2:F${lastRow}`, {
      type: 'list', allowBlank: true, errorStyle: 'warning',
      formulae: [`"${iconNames.join(',')}"`],
    });
    sheet.dataValidations.add(`H2:H${lastRow}`, {
      type: 'list', allowBlank: true, errorStyle: 'warning',
      formulae: ['"slide,takeover"'],
    });
    sheet.dataValidations.add(`I2:I${lastRow}`, {
      type: 'list', allowBlank: true, errorStyle: 'warning',
      formulae: ['"TRUE,FALSE"'],
    });
  }

  return workbook;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test src/server/scheduleImport.test.js`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Add the template-download route**

In `src/server/routes/api.js`, add the import near the top (with the other local imports):

```javascript
import { buildTemplateWorkbook } from '../scheduleImport.js';
```

and add near the other `/schedule/dates` routes from Task 3:

```javascript
const SCHEDULE_ICON_NAMES = ['book', 'prayer', 'meal', 'test', 'bed', 'bus', 'sports', 'bell', 'megaphone', 'clock', 'coffee', 'music', 'candle', 'star', 'calendar', 'sparkle'];

router.get('/schedule/dates/template', async (req, res) => {
  try {
    const mode = req.query.mode === 'export' ? 'export' : 'blank';
    let dates;
    if (req.query.dates) {
      dates = String(req.query.dates).split(',').map(s => s.trim()).filter(Boolean);
    } else {
      dates = [];
      const start = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    }
    if (dates.length === 0 || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
      return res.status(400).json({ error: 'Invalid or missing dates parameter — expected comma-separated YYYY-MM-DD values.' });
    }

    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    const scheduleDates = (await readJSON('schedule-dates.json')) ?? {};
    const workbook = await buildTemplateWorkbook({ dates, mode, schedule, scheduleDates, iconNames: SCHEDULE_ICON_NAMES });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-template-${dates[0]}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[api] GET /schedule/dates/template error:', err.message);
    res.status(500).json({ error: 'Failed to generate schedule template.' });
  }
});
```

- [ ] **Step 7: Verify syntax and manual smoke test**

Run: `node --check src/server/routes/api.js`
Expected: no output (clean).

```bash
node server.js &
sleep 2
# (needs a valid session cookie in practice; a 401 here without one is the correct, expected result)
curl -s -o /dev/null -w "GET template (unauth, expect 401): %{http_code}\n" "http://127.0.0.1:3000/api/schedule/dates/template?dates=2026-07-25"
kill %1
```
Expected: `401` (route correctly gated by `requireAuth`).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/server/scheduleImport.js src/server/scheduleImport.test.js src/server/routes/api.js
git commit -m "feat(schedule): Excel template generation (blank + export modes)"
```

---

### Task 6: Excel import — validation and the upload route

**Files:**
- Modify: `src/server/scheduleImport.js` (add the parse/validate function)
- Modify: `src/server/scheduleImport.test.js` (add its tests)
- Modify: `src/server/routes/api.js` (add `POST /schedule/dates/import`)

**Interfaces:**
- Produces: `export async function parseAndValidateWorkbook(buffer, { existingCategoryNames })` → `{ ok: true, byDate: Record<string, object[]>, newCategoryNames: string[] } | { ok: false, errors: Array<{sheet: string, row: number, message: string}> }`. Never throws for malformed *content* (bad dates, bad rows) — those become entries in `errors`; only throws for a genuinely unparseable file (not a valid .xlsx at all), which the route below catches.
- Consumes: nothing new — plain `exceljs` workbook reading.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/scheduleImport.test.js`:

```javascript
import { parseAndValidateWorkbook, buildTemplateWorkbook } from './scheduleImport.js';

async function workbookBuffer(wb) {
  return wb.xlsx.writeBuffer();
}

test('valid workbook parses into byDate entries, no errors', async () => {
  const wb = await buildTemplateWorkbook({
    dates: ['2026-07-25'], mode: 'blank',
    schedule: { entries: [], categories: [{ id: 'davening', name: 'Davening' }] },
    scheduleDates: {}, iconNames: ['prayer'],
  });
  // The blank template's own example row ("Shacharis", ..., "Davening", "prayer", 5, "slide", "TRUE") is valid input.
  const result = await parseAndValidateWorkbook(await workbookBuffer(wb), { existingCategoryNames: ['Davening'] });
  assert.equal(result.ok, true);
  assert.equal(result.byDate['2026-07-25'].length, 1);
  assert.equal(result.byDate['2026-07-25'][0].name, 'Shacharis');
  assert.equal(result.byDate['2026-07-25'][0].countdownDisplay, 'slide');
  assert.equal(result.byDate['2026-07-25'][0].enabled, true);
});

test('a sheet name that is not a valid date is reported as an error', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Not A Date');
  sheet.addRow(['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled']);
  sheet.addRow(['Something', '', '10:00', '', '', '', 0, 'slide', 'TRUE']);
  const result = await parseAndValidateWorkbook(await workbookBuffer(wb), { existingCategoryNames: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.sheet === 'Not A Date' && /date/i.test(e.message)));
});

test('a malformed time is reported as a row-level error with sheet+row', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('2026-07-25');
  sheet.addRow(['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled']);
  sheet.addRow(['Something', '', '25:99', '', '', '', 0, 'slide', 'TRUE']);
  const result = await parseAndValidateWorkbook(await workbookBuffer(wb), { existingCategoryNames: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.sheet === '2026-07-25' && e.row === 2 && /time/i.test(e.message)));
});

test('a category name not in existingCategoryNames is collected as newCategoryNames, not an error', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('2026-07-25');
  sheet.addRow(['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled']);
  sheet.addRow(['Something', '', '10:00', '', 'Brand New Category', '', 0, 'slide', 'TRUE']);
  const result = await parseAndValidateWorkbook(await workbookBuffer(wb), { existingCategoryNames: ['Davening'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.newCategoryNames, ['Brand New Category']);
});

test('one bad row anywhere in the file means NOTHING is returned as valid (all-or-nothing)', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const goodSheet = wb.addWorksheet('2026-07-25');
  goodSheet.addRow(['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled']);
  goodSheet.addRow(['Good Row', '', '10:00', '', '', '', 0, 'slide', 'TRUE']);
  const badSheet = wb.addWorksheet('2026-07-26');
  badSheet.addRow(['Name (EN)', 'Name (HE)', 'Start Time', 'End Time', 'Category', 'Icon', 'Alert Before', 'Alert Display', 'Enabled']);
  badSheet.addRow(['Bad Row', '', 'not-a-time', '', '', '', 0, 'slide', 'TRUE']);
  const result = await parseAndValidateWorkbook(await workbookBuffer(wb), { existingCategoryNames: [] });
  assert.equal(result.ok, false);
  assert.equal(result.byDate, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/server/scheduleImport.test.js`
Expected: FAIL — `parseAndValidateWorkbook is not a function` (not exported yet).

- [ ] **Step 3: Write the implementation**

Append to `src/server/scheduleImport.js`:

```javascript
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function isValidISODate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime());
}

/**
 * Parse and validate an uploaded schedule-override workbook. Validates the
 * ENTIRE workbook before returning success — if anything is wrong anywhere,
 * ok is false and nothing should be written.
 * @param {Buffer|ArrayBuffer} buffer
 * @param {{existingCategoryNames: string[]}} opts
 * @returns {Promise<{ok: true, byDate: Record<string, object[]>, newCategoryNames: string[]} | {ok: false, errors: Array<{sheet: string, row: number|null, message: string}>}>}
 */
export async function parseAndValidateWorkbook(buffer, { existingCategoryNames }) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const errors = [];
  const byDate = {};
  const newCategorySet = new Set();
  const existingLower = new Set((existingCategoryNames || []).map(n => n.toLowerCase()));

  for (const sheet of workbook.worksheets) {
    const sheetName = sheet.name;
    if (!isValidISODate(sheetName)) {
      errors.push({ sheet: sheetName, row: null, message: `Sheet name "${sheetName}" is not a valid date (expected YYYY-MM-DD).` });
      continue;
    }

    const entries = [];
    // Row 1 is the header; data starts at row 2.
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const values = row.values.slice(1); // values[0] is always undefined in exceljs
      const [nameEn, nameHe, startTime, endTime, category, icon, alertBefore, countdownDisplay, enabled] = values;

      // A fully blank row (no name, no time) is just empty spreadsheet padding — skip silently.
      if (!nameEn && !nameHe && !startTime) continue;

      if (!nameEn && !nameHe) {
        errors.push({ sheet: sheetName, row: rowNum, message: 'Name (EN) or Name (HE) is required.' });
        continue;
      }
      if (!startTime || !TIME_RE.test(String(startTime).trim())) {
        errors.push({ sheet: sheetName, row: rowNum, message: `Start Time "${startTime ?? ''}" is not a valid 24-hour HH:MM time.` });
        continue;
      }
      if (endTime && !TIME_RE.test(String(endTime).trim())) {
        errors.push({ sheet: sheetName, row: rowNum, message: `End Time "${endTime}" is not a valid 24-hour HH:MM time.` });
        continue;
      }

      const categoryName = category ? String(category).trim() : '';
      if (categoryName && !existingLower.has(categoryName.toLowerCase())) {
        newCategorySet.add(categoryName);
      }

      const displayMode = (countdownDisplay ? String(countdownDisplay).trim().toLowerCase() : 'slide');
      if (displayMode !== 'slide' && displayMode !== 'takeover') {
        errors.push({ sheet: sheetName, row: rowNum, message: `Alert Display "${countdownDisplay}" must be "slide" or "takeover".` });
        continue;
      }

      entries.push({
        name: nameEn ? String(nameEn).trim() : '',
        nameHe: nameHe ? String(nameHe).trim() : '',
        time: String(startTime).trim(),
        endTime: endTime ? String(endTime).trim() : '',
        category: categoryName,
        icon: icon ? String(icon).trim() : '',
        alertBefore: Number(alertBefore) || 0,
        countdownDisplay: displayMode,
        enabled: String(enabled ?? 'TRUE').trim().toUpperCase() !== 'FALSE',
      });
    }

    byDate[sheetName] = entries;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, byDate, newCategoryNames: [...newCategorySet] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/server/scheduleImport.test.js`
Expected: PASS — all tests green (the 4 from Task 5 plus the 5 new ones).

- [ ] **Step 5: Add the import route**

In `src/server/routes/api.js`, add the import (extend the existing import from Task 5):

```javascript
import { buildTemplateWorkbook, parseAndValidateWorkbook } from '../scheduleImport.js';
```

Check how the existing font/image upload routes configure `multer` for in-memory buffers (look at `fontUpload` used by `POST /fonts` — confirm it uses `multer.memoryStorage()` by reading its definition near the top of `api.js`) and mirror that exact pattern for a new `scheduleImportUpload` multer instance sized for spreadsheet files (5MB is generous for this use case). Add near the other multer setup at the top of the file:

```javascript
const scheduleImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
```

Add the route after the template route from Task 5:

```javascript
router.post('/schedule/dates/import', (req, res, next) => {
  scheduleImportUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 5 MB.' });
      }
      return res.status(400).json({ error: err.message || 'Upload rejected.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    const existingCategoryNames = (schedule.categories || []).map(c => c.name);

    let result;
    try {
      result = await parseAndValidateWorkbook(req.file.buffer, { existingCategoryNames });
    } catch (parseErr) {
      return res.status(400).json({ error: `Could not read the uploaded file as an Excel workbook: ${parseErr.message}` });
    }

    if (!result.ok) {
      return res.status(422).json({ errors: result.errors });
    }

    // Auto-create any brand-new categories with a rotating default color, no icon.
    const PALETTE = ['#D4A84B', '#7EB8E0', '#C89040', '#8FBF6F', '#B87FBF', '#5CBFA8'];
    let colorIdx = schedule.categories.length;
    for (const name of result.newCategoryNames) {
      schedule.categories.push({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || uuidv4(),
        name,
        color: PALETTE[colorIdx % PALETTE.length],
      });
      colorIdx++;
    }
    if (result.newCategoryNames.length > 0) {
      await writeJSON('schedule.json', schedule);
      broadcast('schedule-update', schedule);
    }

    const scheduleDates = (await readJSON('schedule-dates.json')) ?? {};
    for (const [dateISO, entries] of Object.entries(result.byDate)) {
      scheduleDates[dateISO] = { entries: entries.map(e => ({ id: uuidv4(), ...e })) };
    }
    await writeJSON('schedule-dates.json', scheduleDates);
    broadcast('schedule-dates-update', scheduleDates);
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));

    res.json({
      success: true,
      datesUpdated: Object.keys(result.byDate),
      entryCounts: Object.fromEntries(Object.entries(result.byDate).map(([d, e]) => [d, e.length])),
      newCategories: result.newCategoryNames,
    });
  } catch (err) {
    console.error('[api] POST /schedule/dates/import error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to import schedule.' });
  }
});
```

- [ ] **Step 6: Verify syntax**

Run: `node --check src/server/routes/api.js`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add src/server/scheduleImport.js src/server/scheduleImport.test.js src/server/routes/api.js
git commit -m "feat(schedule): Excel import validation and upload route"
```

---

### Task 7: Admin state hook wiring

**Files:**
- Modify: `src/admin/hooks/useAdminState.js` (add `scheduleDates` state + fetch/delete actions)

**Interfaces:**
- Produces: `useAdminState()`'s returned object gains `scheduleDates` (from `/api/state`'s `scheduleDates` field, Task 3), `fetchScheduleDates()`, `deleteScheduleDateOverride(dateISO)`. Template download and file upload are handled directly in the new admin component (Task 8/9) via plain `fetch` calls, following the exact pattern already used for font upload in `src/admin/components/StylePanel.jsx` — not routed through this hook, consistent with how image/font upload already work in this codebase.
- Consumes: `apiFetch`, `withErrorHandling`, `setState` — all already defined in this file (read the existing `updateSchedule`-adjacent actions around line 265-330 to match the exact helper signatures before writing this).

- [ ] **Step 1: Confirm `scheduleDates` already reaches state (no code change)**

`fetchState` (around line 122-138) does `setState({ ...data, scheduleEntries: ..., scheduleCategories: ... })` — the `...data` spread already includes `scheduleDates` automatically once Task 3 adds it to `/api/state`'s response, since it's a top-level field, not nested like `schedule.entries` (which specifically needs the explicit flattening lines already there for `scheduleEntries`/`scheduleCategories`). No edit needed here — this step is a verification, not a change. Confirm by reading lines 122-138 and checking `data.scheduleDates` would indeed pass through via the spread.

- [ ] **Step 2: Add fetch and delete actions**

Add these two functions near the existing `fetchSchedule`/schedule actions (around line 265), following the exact same `withErrorHandling`/`apiFetch`/`setState` pattern used by the neighboring functions in this file (read `fetchSchedule` and `deleteScheduleEntry` immediately before writing this, to match the helper call signatures exactly):

```javascript
  const fetchScheduleDates = useCallback(() => {
    return withErrorHandling('Fetch schedule date overrides', async () => {
      const result = await apiFetch('/api/schedule/dates');
      setState(prev => ({ ...prev, scheduleDates: result || {} }));
    });
  }, [withErrorHandling]);

  const deleteScheduleDateOverride = useCallback((dateISO) => {
    return withErrorHandling('Remove schedule date override', async () => {
      const result = await apiFetch(`/api/schedule/dates/${dateISO}`, { method: 'DELETE' });
      setState(prev => ({ ...prev, scheduleDates: result || {} }));
    });
  }, [withErrorHandling]);
```

Add both to the hook's returned object (in the same `return { ... }` block where `fetchSchedule`, `updateScheduleEntries`, etc. are returned).

- [ ] **Step 3: Verify syntax and build**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/admin/hooks/useAdminState.js
git commit -m "feat(schedule): wire schedule-dates fetch/delete into useAdminState"
```

---

### Task 8: Admin UI — Daily Overrides panel (list + template download)

**Files:**
- Create: `src/admin/components/ScheduleDateOverrides.jsx`
- Modify: `src/admin/App.jsx` (render the new panel inside the `'schedule'` case)

**Interfaces:**
- Produces: a React component `ScheduleDateOverrides({ scheduleDates, onRefresh, onRemoveOverride })` rendering the upcoming-dates list with Override/Recurring badges and a "Download Blank Template" action. (Upload UI is Task 9, added to this same component in a follow-up step, kept separate here so this task's deliverable — the list/download half — is independently reviewable.)
- Consumes: `scheduleDates` (the object from Task 7's `useAdminState`), `deleteScheduleDateOverride` (Task 7) wired in `App.jsx`, `colors`/`adminFonts`/`buttonPrimary`/`buttonSecondary` from `../styles/admin-tokens.js` (existing), `useIsMobile` from `../hooks/useIsMobile.js` (existing).

- [ ] **Step 1: Create the component (list + badges + template download)**

Create `src/admin/components/ScheduleDateOverrides.jsx`:

```javascript
import React, { useState } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const UPCOMING_DAYS = 7;

export default function ScheduleDateOverrides({ scheduleDates = {}, onRemoveOverride }) {
  const isMobile = useIsMobile();
  const [removingDate, setRemovingDate] = useState(null);

  const upcomingDates = Array.from({ length: UPCOMING_DAYS }, (_, i) => todayISO(i));

  const handleDownloadBlank = () => {
    const dates = upcomingDates.join(',');
    window.location.href = `/api/schedule/dates/template?mode=blank&dates=${encodeURIComponent(dates)}`;
  };

  const handleRemove = async (dateISO) => {
    if (!window.confirm(`Remove the override for ${dateISO}? That day will go back to the regular recurring schedule.`)) return;
    setRemovingDate(dateISO);
    try {
      await onRemoveOverride(dateISO);
    } finally {
      setRemovingDate(null);
    }
  };

  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: '10px',
      padding: isMobile ? '16px' : '20px 24px',
      marginTop: '20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    }}>
      <h3 style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '17px',
        fontWeight: 600,
        color: colors.gold,
        marginBottom: '6px',
      }}>
        Daily Overrides
      </h3>
      <p style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '13px',
        color: colors.dim,
        marginBottom: '16px',
        lineHeight: 1.6,
      }}>
        Give any specific date its own complete schedule, separate from the regular recurring one below.
        Download a template, fill it in (one sheet per date), and upload it back.
      </p>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '18px' }}>
        <button style={{ ...buttonPrimary, padding: '9px 18px', fontSize: '14px' }} onClick={handleDownloadBlank}>
          Download Blank Template ({UPCOMING_DAYS} days)
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {upcomingDates.map(dateISO => {
          const hasOverride = dateISO in scheduleDates;
          return (
            <div
              key={dateISO}
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '10px 14px',
                background: colors.bg,
                border: `1px solid ${hasOverride ? colors.goldBd : colors.border}`,
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
                  {dateISO}
                </span>
                <span style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  color: hasOverride ? colors.gold : colors.dim,
                  background: hasOverride ? colors.goldBg : 'transparent',
                  border: `1px solid ${hasOverride ? colors.goldBd : colors.muted}`,
                }}>
                  {hasOverride ? 'Override' : 'Recurring (default)'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  style={{ ...buttonSecondary, padding: '6px 14px', fontSize: '13px' }}
                  onClick={() => { window.location.href = `/api/schedule/dates/template?mode=export&dates=${dateISO}`; }}
                >
                  Export to Edit
                </button>
                {hasOverride && (
                  <button
                    style={{ ...buttonDanger, padding: '6px 14px', fontSize: '13px', opacity: removingDate === dateISO ? 0.6 : 1 }}
                    disabled={removingDate === dateISO}
                    onClick={() => handleRemove(dateISO)}
                  >
                    {removingDate === dateISO ? 'Removing...' : 'Remove Override'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `App.jsx`**

In `src/admin/App.jsx`, add the import:

```javascript
import ScheduleDateOverrides from './components/ScheduleDateOverrides.jsx';
```

Add `deleteScheduleDateOverride` to the destructured actions pulled from `useAdminState()` at the top of the component (alongside the existing `updateScheduleEntries`, etc.).

In the `'schedule'` case of `renderSection()`, render the new panel below the existing `<ScheduleEditor ... />`:

```javascript
      case 'schedule':
        return (
          <>
            <ScheduleEditor
              entries={state?.scheduleEntries || []}
              categories={state?.scheduleCategories || []}
              onUpdateEntries={updateScheduleEntries}
              onCreateEntry={createScheduleEntry}
              onUpdateEntry={updateScheduleEntry}
              onDeleteEntry={deleteScheduleEntry}
              onUpdateCategories={updateScheduleCategories}
              onLoadTemplate={loadScheduleTemplate}
              savedTemplates={state?.scheduleTemplates || []}
              onFetchTemplates={fetchScheduleTemplates}
              onSaveTemplate={saveScheduleTemplate}
              onUpdateTemplate={updateScheduleTemplate}
              onDeleteTemplate={deleteScheduleTemplate}
            />
            <ScheduleDateOverrides
              scheduleDates={state?.scheduleDates || {}}
              onRemoveOverride={deleteScheduleDateOverride}
            />
          </>
        );
```

- [ ] **Step 3: Build and manual smoke-test**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/admin/components/ScheduleDateOverrides.jsx src/admin/App.jsx
git commit -m "feat(schedule): Daily Overrides panel — upcoming-dates list, badges, template download"
```

---

### Task 9: Admin UI — upload flow

**Files:**
- Modify: `src/admin/components/ScheduleDateOverrides.jsx` (add the upload zone + result feedback)

**Interfaces:**
- Consumes: nothing new from other tasks — calls `POST /api/schedule/dates/import` (Task 6) directly via `fetch`, following the exact CSRF-token pattern already used by `StylePanel.jsx`'s font upload (`getCsrfToken()` reading the `_csrf` cookie).
- Produces: after a successful import, calls a new `onImported` callback prop so `App.jsx` can refresh `scheduleDates` (simplest: re-run `fetchScheduleDates()`).

- [ ] **Step 1: Add the upload zone and result state**

In `src/admin/components/ScheduleDateOverrides.jsx`, add near the top of the component function:

```javascript
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileRef = React.useRef(null);

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/schedule/dates/import', {
        method: 'POST',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadResult({ errors: data.errors || [{ sheet: '', row: null, message: data.error || `Failed (${res.status})` }] });
      } else {
        setUploadResult({ success: data });
        if (onImported) onImported();
      }
    } catch {
      setUploadResult({ errors: [{ sheet: '', row: null, message: 'Connection error' }] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
```

Add `onImported` to the component's destructured props: `export default function ScheduleDateOverrides({ scheduleDates = {}, onRemoveOverride, onImported }) {`.

- [ ] **Step 2: Add the upload UI, after the "Download Blank Template" button**

```javascript
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
        <button
          style={{ ...buttonSecondary, padding: '9px 18px', fontSize: '14px', opacity: uploading ? 0.6 : 1 }}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Uploading...' : 'Upload Filled-In Template'}
        </button>
```

(This goes inside the existing button row `<div>` from Task 8, alongside "Download Blank Template".)

Add the result feedback below that button row:

```javascript
      {uploadResult?.success && (
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.gold, marginBottom: '14px' }}>
          Updated {uploadResult.success.datesUpdated.length} date(s)
          {uploadResult.success.newCategories.length > 0 && ` — created ${uploadResult.success.newCategories.length} new categor${uploadResult.success.newCategories.length === 1 ? 'y' : 'ies'} (${uploadResult.success.newCategories.join(', ')})`}.
        </p>
      )}
      {uploadResult?.errors && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'rgba(224,64,64,0.08)', border: `1px solid ${colors.danger}`, borderRadius: '8px' }}>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.danger, marginBottom: '6px', fontWeight: 600 }}>
            Nothing was saved — fix these and re-upload:
          </p>
          {uploadResult.errors.map((err, i) => (
            <p key={i} style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '2px' }}>
              {err.sheet && `Sheet ${err.sheet}`}{err.row ? `, row ${err.row}` : ''}: {err.message}
            </p>
          ))}
        </div>
      )}
```

- [ ] **Step 3: Wire `onImported` from `App.jsx`**

In `src/admin/App.jsx`, pass `onImported={fetchScheduleDates}` to `<ScheduleDateOverrides ... />` (using the `fetchScheduleDates` action added to `useAdminState` in Task 7 — add it to the destructured actions pulled from the hook if not already there).

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/admin/components/ScheduleDateOverrides.jsx src/admin/App.jsx
git commit -m "feat(schedule): upload flow for the Daily Overrides template, with per-row error feedback"
```

---

### Task 10: Mobile responsiveness pass

**Files:**
- Modify: `src/admin/components/ScheduleDateOverrides.jsx` (verify/adjust the mobile branch)

**Interfaces:**
- No new interfaces — this task is verification and small style adjustments to what Tasks 8-9 already built with `isMobile` branches in place.

- [ ] **Step 1: Manual viewport check**

Run: `npm run dev`, open `http://localhost:5173/admin` (or the Vite-proxied equivalent), open browser devtools, set viewport to 375px width, navigate to the Schedule section.

Verify:
- The date list rows stack the badge/date on one line and the action buttons below (already handled by the `flexDirection: isMobile ? 'column' : 'row'` in Task 8's row markup — confirm it actually looks right, not just compiles).
- "Download Blank Template" and "Upload Filled-In Template" buttons are full-width-ish and comfortably tappable (not cramped side-by-side) — Task 8's button-row `div` already uses `flexDirection: isMobile ? 'column' : 'row'`; if the buttons look cramped even stacked, add `width: '100%'` to both buttons' styles conditionally on `isMobile`.
- No horizontal overflow/scrollbar appears on the panel itself.

- [ ] **Step 2: Fix any issues found**

If the 375px check in Step 1 reveals real problems (there may be none, since Tasks 8-9 already built mobile-aware layout), fix them directly in `ScheduleDateOverrides.jsx` and re-check at 375px.

- [ ] **Step 3: Commit (only if Step 2 required changes)**

```bash
git add src/admin/components/ScheduleDateOverrides.jsx
git commit -m "fix(schedule): mobile layout adjustments for Daily Overrides panel"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-07-21-schedule-date-overrides-design.md` maps to a task — data model + resolution (Tasks 1-2), `/api/state` exposure (Task 3), kiosk display integration (Task 4), Excel template + import (Tasks 5-6), admin UI list/download/upload/remove (Tasks 7-9), mobile (Task 10).
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `getEffectiveSchedule(schedule, scheduleDates, dateISO, now)` signature is identical everywhere it's called (Tasks 2, 4, 5). `countdownDisplay` (not `alertDisplay`) used consistently in the data model, Excel columns, and import validation. Route paths (`/api/schedule/dates`, `/api/schedule/dates/template`, `/api/schedule/dates/import`, `/api/schedule/dates/:date`) are consistent across the plan and don't collide with the existing `/api/schedule/template(s)` routes.
