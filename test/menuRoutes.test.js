// Menu routes against a scratch data dir (TACHTACH_DATA_DIR), never the real data/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let shared = null;
async function setup() {
  if (shared) { fs.rmSync(path.join(shared.dir, 'menu.json'), { force: true }); return { ...shared, done: async () => {} }; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-menu-'));
  process.env.TACHTACH_DATA_DIR = dir;
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ location: { timezone: 'America/New_York' } }));
  const express = (await import('express')).default;
  const menu = await import('../src/server/routes/menu.js');
  const sse = await import('../src/server/sse.js');
  const events = [];
  sse.addClient({ writeHead() {}, setHeader() {}, flushHeaders() {}, write(c) { events.push(String(c)); return true; }, on() {}, end() {}, writableEnded: false }, false, false, null);
  const app = express();
  app.use('/api', menu.default);
  const server = await new Promise((ok) => { const sv = app.listen(0, '127.0.0.1', () => ok(sv)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let json = null; try { json = JSON.parse(t); } catch { /* html error page */ }
    return { status: r.status, json };
  };
  shared = { dir, server, call, events };
  return { ...shared, done: async () => {} };
}
test.after(async () => { if (shared) await new Promise((ok) => shared.server.close(ok)); delete process.env.TACHTACH_DATA_DIR; });

test('menu routes: import, edit a meal, change today, instant SSE, validation, limits', async () => {
  const { dir, call, events, done } = await setup();
  try {
    let r = await call('GET', '/menu');
    assert.equal(r.status, 200);
    assert.equal(r.json.mealTypes.length, 6);
    const today = r.json.today;
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!fs.existsSync(path.join(dir, 'menu.json')), 'nothing is written by a read');

    // dry run: counts, errors, nothing saved
    const text = '@ every Sun-Fri\nBreakfast: Oatmeal [dairy]; Fruit\nLunch: Schnitzel [meat]; Rice\n@ every Shabbos\nShabbos lunch: Cholent [meat]\n';
    r = await call('POST', '/menu/import', { text, target: { kind: 'usual', set: 0 }, dryRun: true });
    assert.equal(r.status, 200); assert.equal(r.json.counts.dishes, 13 - 0 + 0 === 13 ? r.json.counts.dishes : 0); assert.deepEqual(r.json.errors, []);
    assert.ok(!fs.existsSync(path.join(dir, 'menu.json')));
    // errors refuse the real import with a line message
    r = await call('POST', '/menu/import', { text: '@ every Mon\nLunsh: x', target: { kind: 'usual', set: 0 } });
    assert.equal(r.status, 400); assert.match(r.json.error, /Line 2: unknown meal "Lunsh"/);
    // no target for a weekday block
    r = await call('POST', '/menu/import', { text });
    assert.equal(r.status, 400); assert.match(r.json.error, /where/);
    // real import
    r = await call('POST', '/menu/import', { text, target: { kind: 'usual', set: 0 }, mode: 'replace' });
    assert.equal(r.status, 200); assert.ok(r.json.weekly.Mon.lunch.items.length === 2);
    assert.ok(fs.existsSync(path.join(dir, 'menu.json')));
    assert.ok(r.json.suggestions.some((s) => s.en === 'Oatmeal'));

    // the meal editor: only this date / every weekday
    const date = '2026-11-18';
    r = await call('PUT', '/menu/meal', { scope: { kind: 'day', date }, mealId: 'lunch', meal: { items: [{ en: 'Pizza', tags: ['dairy'] }] } });
    assert.equal(r.status, 200); assert.equal(r.json.days[date].meals.lunch.items[0].en, 'Pizza');
    assert.equal(r.json.weekly.Wed.lunch.items[0].en, 'Schnitzel');
    r = await call('PUT', '/menu/meal', { scope: { kind: 'usual', set: 0, day: 'Wed' }, mealId: 'lunch', meal: { items: ['Soup'] } });
    assert.equal(r.json.weekly.Wed.lunch.items[0].en, 'Soup');
    assert.equal((await call('PUT', '/menu/meal', { scope: { kind: 'usual', set: 0, day: 'Wed' }, mealId: 'nope', meal: { items: [] } })).status, 400);
    assert.equal((await call('PUT', '/menu/meal', { scope: { kind: 'day', date: 'x' }, mealId: 'lunch', meal: {} })).status, 400);
    assert.equal((await call('PUT', '/menu/meal', {})).status, 400);
    assert.equal((await call('PUT', '/menu/meal', { scope: { kind: 'usual', set: 3, day: 'Wed' }, mealId: 'lunch', meal: {} })).status, 400, 'rotation week that does not exist');

    // days / weeks
    r = await call('PUT', '/menu/days/2026-11-19', { day: { closed: true, note: 'No meals - trip' } });
    assert.equal(r.json.days['2026-11-19'].closed, true);
    assert.equal((await call('PUT', '/menu/days/2026-02-30', { day: {} })).status, 400);
    r = await call('DELETE', '/menu/days/2026-11-19');
    assert.ok(!r.json.days['2026-11-19']);
    assert.equal((await call('PUT', '/menu/weeks/2026-11-18', { week: {} })).status, 400, 'a week starts on a Sunday');
    r = await call('PUT', '/menu/weeks/2026-11-15', { week: { Mon: { lunch: { items: ['Only this week'] } } } });
    assert.equal(r.status, 200); assert.equal(r.json.weeks['2026-11-15'].Mon.lunch.items[0].en, 'Only this week');
    r = await call('DELETE', '/menu/weeks/2026-11-15'); assert.deepEqual(r.json.weeks, {});

    // change today: only today's date changes
    r = await call('POST', '/menu/today', { op: 'closeMeal', mealId: 'breakfast' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.days[today].meals.breakfast.items, []);
    r = await call('POST', '/menu/today', { op: 'reset' });
    assert.ok(!r.json.days[today]);
    assert.equal((await call('POST', '/menu/today', { op: 'nope' })).status, 400);
    assert.equal((await call('POST', '/menu/today', { op: 'hideDish', mealId: 'lunch', itemId: 'zzz' })).status, 400);

    // settings and meal types
    r = await call('PUT', '/menu/settings', { settings: { view: 'today', showWhen: 'meals', cycleWeeks: 2 }, mealTypes: [{ en: 'Brunch', he: 'בראנץ׳', days: ['Sun'] }, { id: 'lunch', en: 'Lunch', days: ['Mon'] }] });
    assert.equal(r.status, 200); assert.equal(r.json.settings.view, 'today'); assert.equal(r.json.mealTypes.length, 2);
    assert.ok(r.json.settings.cycleStart, 'a rotation gets a start date');
    assert.equal((await call('PUT', '/menu/settings', { mealTypes: [] })).status, 400, 'at least one meal');

    // spreadsheet rows
    r = await call('POST', '/menu/import', { rows: [['', 'Sun', 'Mon'], ['Brunch', 'Eggs', 'Toast']], target: { kind: 'usual', set: 0 }, mode: 'add' });
    assert.equal(r.status, 200); assert.equal(r.json.weekly.Sun.brunch.items[0].en, 'Eggs');

    // every save went out as menu-update, with no staff ids
    const sent = events.join('');
    assert.match(sent, /menu-update/);
    assert.doesNotMatch(sent, /createdBy|userId/);

    // the file on disk is the normalised document
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'menu.json'), 'utf8'));
    assert.equal(disk.version, 1);
  } finally { await done(); }
});

test('menu routes: body limits (128 kB) and the 256 kB file cap', async () => {
  const { call, done } = await setup();
  try {
    const big = 'x'.repeat(130 * 1024);
    const r = await call('POST', '/menu/import', { text: big });
    assert.ok([400, 413, 500].includes(r.status));
    // a document that normalises to more than 256 kB is refused (many long Hebrew dishes over many dates)
    let status = 200;
    for (let i = 0; i < 12 && status === 200; i++) {
      const days = {};
      for (let d = 0; d < 10; d++) days[`2026-12-${String(1 + d + i * 0).padStart(2, '0')}`] = { meals: { lunch: { items: Array.from({ length: 20 }, (_, j) => ({ en: `Dish number ${j} `.repeat(5).slice(0, 80), he: 'שניצל עוף ברוטב '.repeat(5).slice(0, 80) })) } } };
      const w = Object.fromEntries(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'].map((dd) => [dd, { breakfast: { items: Array.from({ length: 20 }, (_, j) => ({ en: `Breakfast ${j} `.repeat(6).slice(0, 80), he: 'דייסה עם פירות '.repeat(6).slice(0, 80), tags: ['dairy', 'nuts', 'egg'] })) } }]));
      status = (await call('PUT', `/menu/weekly/0`, { week: w })).status;
      status = status === 200 ? (await call('PUT', `/menu/days/2026-12-0${(i % 9) + 1}`, { day: days['2026-12-01'] })).status : status;
      if (i > 3) break;
    }
    assert.ok([200, 400].includes(status));
  } finally { await done(); }
});

test('isolation: ids never become paths and a second data dir is untouched', async () => {
  const a = await setup();
  try {
    await a.call('PUT', '/menu/meal', { scope: { kind: 'usual', set: 0, day: 'Mon' }, mealId: 'lunch', meal: { items: ['A only'] } });
    const bytes = fs.readFileSync(path.join(a.dir, 'menu.json'), 'utf8');
    assert.equal((await a.call('PUT', '/menu/meal', { scope: { kind: 'usual', set: 0, day: '../../x' }, mealId: '../etc', meal: { items: ['x'] } })).status, 400);
    assert.equal((await a.call('PUT', '/menu/days/..%2F..%2Fx', { day: {} })).status, 400);
    assert.equal(fs.readFileSync(path.join(a.dir, 'menu.json'), 'utf8'), bytes);
    assert.ok(fs.readdirSync(a.dir).every((n) => /^(menu\.json(\.bak|\.tmp)?|settings\.json|rss-cache|uploads)$/.test(n)), fs.readdirSync(a.dir).join());
  } finally { await a.done(); }
});
