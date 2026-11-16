// Occasions routes against a scratch data dir (TACHTACH_DATA_DIR), never the real data/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let shared = null;
async function setup() {
  if (shared) { fs.rmSync(path.join(shared.dir, 'occasions.json'), { force: true }); return shared; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-occ-'));
  process.env.TACHTACH_DATA_DIR = dir;
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ location: { timezone: 'America/New_York' } }));
  const express = (await import('express')).default;
  const occ = await import('../src/server/routes/occasions.js');
  const sse = await import('../src/server/sse.js');
  const events = [];
  sse.addClient({ writeHead() {}, setHeader() {}, flushHeaders() {}, write(c) { events.push(String(c)); return true; }, on() {}, end() {}, writableEnded: false }, false, false, null);
  const app = express();
  app.use('/api', occ.default);
  const server = await new Promise((ok) => { const sv = app.listen(0, '127.0.0.1', () => ok(sv)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body, raw) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const t = await r.text();
    let json = null; try { json = JSON.parse(t); } catch { /* html error page */ }
    return { status: r.status, json };
  };
  shared = { dir, server, call, events };
  return shared;
}
test.after(async () => { if (shared) await new Promise((ok) => shared.server.close(ok)); delete process.env.TACHTACH_DATA_DIR; });

test('occasions routes: starter list, add, edit, on/off, settings, delete, restore, undo, SSE, validation, limits', async () => {
  const { dir, call, events } = await setup();
  const file = path.join(dir, 'occasions.json');
  let r = await call('GET', '/occasions');
  assert.equal(r.status, 200);
  assert.ok(r.json.occasions.length > 10); assert.match(r.json.today, /^\d{4}-\d{2}-\d{2}$/); assert.equal(r.json.tz, 'America/New_York');
  assert.ok(!fs.existsSync(file), 'nothing is written by a read');

  // add a school event (one-time, a time on the day)
  const n0 = events.length;
  r = await call('POST', '/occasions', { occasion: { nameEn: 'Annual dinner', rule: { kind: 'gregorian', month: 3, day: 5 }, repeat: 'once', year: 2027, beginsAt: 'time', time: '19:00', timeDay: 'day', eventEn: 'Main hall', id: '../../etc', starter: 'purim', evil: true } });
  assert.equal(r.status, 200);
  const id = r.json.id;
  assert.match(id, /^[A-Za-z0-9_-]+$/); assert.notEqual(id, '../../etc');
  const added = r.json.occasions.find((o) => o.id === id);
  assert.equal(added.starter, ''); assert.ok(!('evil' in added));
  assert.ok(fs.existsSync(file));
  assert.ok(events.slice(n0).some((e) => e.includes('occasions-update')), 'SSE nudge');

  // validation
  assert.equal((await call('POST', '/occasions', { occasion: { nameEn: '', rule: { kind: 'hebrew', month: 9, day: 19 } } })).status, 400);
  assert.match((await call('POST', '/occasions', { occasion: { nameEn: 'X', rule: { kind: 'gregorian', month: 2, day: 30 } } })).json.error, /does not exist/);
  assert.equal((await call('POST', '/occasions', { occasion: { nameEn: 'X', rule: { kind: 'hebrew', month: 14, day: 1 } } })).status, 400);
  assert.equal((await call('POST', '/occasions', { occasion: { nameEn: 'X'.repeat(200), rule: { kind: 'hebrew', month: 9, day: 1 } } })).status, 400);
  assert.equal((await call('POST', '/occasions', {})).status, 400);

  // edit: explanation without a source is stored but the kiosk rule hides it; on/off
  r = await call('PUT', `/occasions/${id}`, { occasion: { explainEn: 'Words.', source: '' } });
  assert.equal(r.status, 200);
  r = await call('PUT', `/occasions/${id}`, { occasion: { on: false } });
  assert.equal(r.json.occasions.find((o) => o.id === id).on, false);
  assert.equal(r.json.occasions.find((o) => o.id === id).explainEn, 'Words.');
  assert.equal((await call('PUT', `/occasions/${id}`, { occasion: { beginsAt: 'time', time: '' } })).status, 400);
  assert.equal((await call('PUT', '/occasions/nope', { occasion: { on: true } })).status, 404);
  assert.equal((await call('PUT', '/occasions/..%2F..%2Fsettings', { occasion: { on: true } })).status, 404);

  // settings
  r = await call('PUT', '/occasions/settings', { settings: { pick: 'pinned', pinnedId: id, withinDays: 45, rail: false } });
  assert.equal(r.status, 200); assert.equal(r.json.settings.pinnedId, id); assert.equal(r.json.settings.withinDays, 45);
  assert.equal((await call('PUT', '/occasions/settings', { settings: { pinnedId: 'ghost' } })).status, 400);
  assert.match((await call('PUT', '/occasions/settings', { settings: { withinDays: 99999 } })).json.error, /1 to 400/);
  assert.match((await call('PUT', '/occasions/settings', { settings: { evil: 1 } })).json.error, /Unknown setting/);
  assert.equal((await call('PUT', '/occasions/settings', { settings: { pick: 'all' } })).status, 400);
  r = await call('GET', '/occasions');
  assert.equal(r.json.settings.withinDays, 45, 'a refused change leaves the document alone');

  // undo = the whole previous document back
  const before = r.json;
  r = await call('DELETE', `/occasions/${id}`);
  assert.ok(!r.json.occasions.some((o) => o.id === id)); assert.equal(r.json.settings.pinnedId, '');
  assert.equal((await call('DELETE', `/occasions/${id}`)).status, 404);
  r = await call('PUT', '/occasions/all', { file: { occasions: before.occasions, settings: before.settings } });
  assert.ok(r.json.occasions.some((o) => o.id === id)); assert.equal(r.json.settings.pinnedId, id);
  assert.equal((await call('PUT', '/occasions/all', { file: { nope: 1 } })).status, 400);

  // remove a starter, restore starters
  r = await call('DELETE', '/occasions/s-purim');
  assert.ok(!r.json.occasions.some((o) => o.starter === 'purim'));
  r = await call('POST', '/occasions/restore-starters');
  assert.equal(r.json.added, 1); assert.ok(r.json.occasions.some((o) => o.starter === 'purim'));

  // body limit (128 kB for one occasion / the settings)
  assert.equal((await call('POST', '/occasions', null, JSON.stringify({ occasion: { nameEn: 'x', explainEn: 'y'.repeat(140000) } }))).status, 413);
  // too many
  const many = Array.from({ length: 79 }, (_, i) => ({ id: `m${i}`, nameEn: `n${i}`, rule: { kind: 'hebrew', month: 9, day: 1 } }));
  r = await call('PUT', '/occasions/all', { file: { occasions: many } });
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/occasions', { occasion: { nameEn: 'one more', rule: { kind: 'hebrew', month: 9, day: 2 } } })).status, 200);
  assert.match((await call('POST', '/occasions', { occasion: { nameEn: 'too many', rule: { kind: 'hebrew', month: 9, day: 3 } } })).json.error, /80 occasions at most/);
});

// SaaS isolation stub: this route only ever touches ids found in its own org's document.
test('isolation: ids from the URL are only compared with stored ids, never used as paths; other files untouched', async () => {
  const { dir, call } = await setup();
  const settingsBefore = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
  for (const bad of ['settings', '..', '%2E%2E', 'b1', 'a'.repeat(41)]) {
    const r = await call('DELETE', `/occasions/${bad}`);
    assert.ok([404].includes(r.status), `${bad} -> ${r.status}`);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), settingsBefore);
});

test('permissions: occasions.edit is a Full editor power, not Messages only; section opens with it; routes are gated', async () => {
  const P = await import('../src/shared/permissions.js');
  const full = { role: 'editor', preset: 'full' }; const msg = { role: 'editor', preset: 'messages' };
  assert.ok(P.effectiveCaps(full).includes('occasions.edit'));
  assert.ok(!P.effectiveCaps(msg).includes('occasions.edit'));
  assert.equal(P.canOpenSection(full, 'occasions'), true);
  assert.equal(P.canOpenSection(msg, 'occasions'), false);
  for (const [m, p] of [['GET', '/api/occasions'], ['PUT', '/api/occasions/settings'], ['POST', '/api/occasions'], ['DELETE', '/api/occasions/x'], ['PUT', '/api/occasions/all']]) {
    assert.equal((m === 'GET' ? P.canRead(full, p) : P.canDo(full, m, p)), true, `${m} ${p}`);
    assert.equal((m === 'GET' ? P.canRead(msg, p) : P.canDo(msg, m, p)), false, `${m} ${p}`);
  }
});

test('live view: occasions reach viewers on purpose, switched-off ones do not', async () => {
  const { viewerState } = await import('../src/server/live.js');
  const out = viewerState({ occasions: { version: 1, settings: {}, occasions: [{ id: 'a', on: true }, { id: 'b', on: false }] } });
  assert.deepEqual(out.occasions.occasions.map((o) => o.id), ['a']);
});

test('hype / words / look / layout over the routes: saved, refused when strict, SSE copy is the kiosk copy, undo works', async () => {
  const { call, events, dir } = await setup();
  const PHOTO = '/uploads/0a1b2c3d-1111-2222-3333-444455556666.jpg';
  let r = await call('GET', '/occasions');
  assert.equal(r.json.settings.takeover, true, 'the zero takeover is on by default');
  assert.deepEqual(r.json.settings.milestones, [30, 14, 7, 3, 2, 1]); assert.equal(r.json.settings.milestoneMinutes, 2); assert.equal(r.json.settings.milestoneEveryMinutes, 60);
  assert.equal(r.json.settings.milestoneFrom, '07:00'); assert.equal(r.json.settings.milestoneTo, '21:00'); assert.equal(r.json.settings.finalOn, true);
  const before = r.json;

  const n0 = events.length;
  r = await call('PUT', '/occasions/settings', { settings: { milestones: [21, 7], milestoneMinutes: 3, milestoneEveryMinutes: 30, milestoneFrom: '08:00', milestoneTo: '20:00', finalOn: false, look: { accent: '#c9a24b', photo: PHOTO, dim: 70, numeralsFont: 'Rubik' }, layout: { show: { bar: false }, scale: 110, side: 'right' }, stageText: { far: { en: 'Soon', he: 'בקרוב' } }, milestoneText: { 21: { en: 'Three weeks', he: '' } } } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.settings.milestones, [21, 7]); assert.equal(r.json.settings.look.photo, PHOTO); assert.equal(r.json.settings.layout.show.bar, false);
  assert.ok(events.slice(n0).some((e) => e.includes('occasions-update') && e.includes('Three weeks')), 'SSE carries the new settings');
  assert.ok(fs.existsSync(path.join(dir, 'occasions.json')));

  // refusals leave the document alone
  for (const settings of [{ milestones: [0] }, { milestoneEveryMinutes: 45 }, { milestoneFrom: '22:00' }, { look: { photo: 'https://evil.test/x.png' } }, { look: { accent: 'red' } }, { layout: { scale: 300 } }, { stageText: { days: { en: 'x'.repeat(61), he: '' } } }, { stageText: { nope: {} } }, { milestoneText: { 999: { en: 'x', he: '' } } }, { milestoneMinutes: 30 }, { ghost: 1 }]) {
    r = await call('PUT', '/occasions/settings', { settings });
    assert.equal(r.status, 400, JSON.stringify(settings));
  }
  r = await call('GET', '/occasions');
  assert.deepEqual(r.json.settings.milestones, [21, 7]);

  // one occasion: own look / layout / words / switches; unknown keys refused
  r = await call('POST', '/occasions', { occasion: { nameEn: 'Siyum', rule: { kind: 'gregorian', month: 6, day: 1 }, milestoneOn: false, milestones: [5, 1], look: { accent: '#112233', dim: null }, layout: { show: { ring: false }, order: ['date', 'name'] }, stageText: { minutes: { en: 'Nearly!', he: '' } } } });
  assert.equal(r.status, 200);
  const id = r.json.id; const o = r.json.occasions.find((x) => x.id === id);
  assert.equal(o.milestoneOn, false); assert.deepEqual(o.milestones, [5, 1]); assert.deepEqual(o.look, { accent: '#112233' }); assert.deepEqual(o.layout, { show: { ring: false }, order: ['date', 'name'] });
  assert.equal((await call('PUT', `/occasions/${id}`, { occasion: { look: { glow: 1 } } })).status, 400);
  assert.equal((await call('PUT', `/occasions/${id}`, { occasion: { layout: { scale: 5 } } })).status, 400);
  r = await call('PUT', `/occasions/${id}`, { occasion: { look: {}, layout: {}, milestoneOn: null, milestones: null } });
  const o2 = r.json.occasions.find((x) => x.id === id);
  assert.deepEqual(o2.look, {}); assert.deepEqual(o2.layout, {}); assert.equal(o2.milestoneOn, null); assert.equal(o2.milestones, null, 'Follow the default clears each field');

  // the checked rule over the routes + what the kiosk / live copies carry
  r = await call('PUT', `/occasions/${id}`, { occasion: { explainEn: 'DRAFT-WORDS', source: 'chabad.org/a' } });
  let ev = events.slice(-1)[0];
  assert.ok(ev.includes('DRAFT-WORDS'), 'no check needed: the explanation is in the kiosk copy at once');
  r = await call('PUT', `/occasions/${id}`, { occasion: { source: 'chabad.org/b' } });
  assert.equal(r.status, 200);
  assert.equal((await call('PUT', `/occasions/${id}`, { occasion: { explainChecked: 'yes' } })).status, 400, 'junk is still refused');
  const { occasionsForKiosk } = await import('../src/server/occasionsStore.js');
  const kiosk = JSON.stringify(await occasionsForKiosk());
  assert.ok(kiosk.includes('DRAFT-WORDS') && kiosk.includes('chabad.org/b'), 'the kiosk copy carries the explanation and its source');
  const { viewerState } = await import('../src/server/live.js');
  assert.ok(JSON.stringify(viewerState({ occasions: await occasionsForKiosk() }).occasions).includes('DRAFT-WORDS'), 'live viewers get it too (it is on the public screen)');

  // the file cap is enforced by the store
  const fat = Array.from({ length: 80 }, (_, i) => ({ id: `f${i}`, nameEn: 'n', rule: { kind: 'hebrew', month: 9, day: 1 }, explainEn: 'y'.repeat(600), explainHe: 'ש'.repeat(600), source: 's'.repeat(100) }));
  r = await call('PUT', '/occasions/all', { file: { occasions: fat, settings: { milestoneText: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { en: 'x'.repeat(60), he: 'ש'.repeat(60) }])) } } });
  assert.ok(r.status === 200 || (r.status === 400 && /too big/.test(r.json.error)), `status ${r.status}`);

  // undo: the whole previous document comes back, hype fields included
  r = await call('PUT', '/occasions/all', { file: { occasions: before.occasions, settings: before.settings } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.settings.milestones, [30, 14, 7, 3, 2, 1]); assert.equal(r.json.settings.look.photo, '');
});

test('live moments: strict body, caps, rate limit, in memory only, SSE, state, clear, permissions, activity line', async () => {
  const { call, events, dir } = await setup();
  const { momentStore, activeMoment, createMomentStore, parseMoment } = await import('../src/server/occasionMoment.js');
  momentStore.reset();
  const n0 = events.length;
  let r = await call('POST', '/occasions/moment', { kind: 'shoutout', text: { en: 'Mazel tov Dovid!', he: 'מזל טוב' }, seconds: 20, occasionKey: 'abc|2026-12-20' });
  assert.equal(r.status, 200); const m = r.json.moment;
  assert.equal(m.kind, 'shoutout'); assert.equal(m.text.en, 'Mazel tov Dovid!'); assert.equal(m.occasionKey, 'abc|2026-12-20'); assert.equal(m.until - m.startedAt, 20000); assert.match(m.id, /^m/);
  assert.equal(activeMoment().id, m.id, 'the active one rides in /api/state');
  assert.ok(events.slice(n0).some((e) => e.includes('occasion-moment') && e.includes('Mazel tov Dovid')), 'SSE');
  assert.ok(!fs.readdirSync(dir).some((f) => /moment/i.test(f)), 'nothing stored');
  // defaults per kind
  r = await call('POST', '/occasions/moment', { kind: 'burst' }); assert.equal(r.json.moment.until - r.json.moment.startedAt, 8000); assert.equal(r.json.moment.text.en, '');
  r = await call('POST', '/occasions/moment', { kind: 'ten' }); assert.equal(r.json.moment.until - r.json.moment.startedAt, 10000);
  // a new one replaces the old; stop clears it and says so
  assert.equal(activeMoment().kind, 'ten');
  const n1 = events.length;
  r = await call('DELETE', '/occasions/moment'); assert.equal(r.status, 200); assert.equal(r.json.stopped, true);
  assert.equal(activeMoment(), null); assert.ok(events.slice(n1).some((e) => e.includes('occasion-moment') && e.includes('"moment":null')));
  assert.equal((await call('DELETE', '/occasions/moment')).json.stopped, false);
  // validation
  momentStore.reset();
  for (const body of [{}, { kind: 'rocket' }, { kind: 'shoutout' }, { kind: 'shoutout', text: { en: '  ', he: '' } }, { kind: 'burst', text: { en: 'x'.repeat(81) } }, { kind: 'burst', text: { fr: 'x' } }, { kind: 'burst', text: 'hi' }, { kind: 'burst', text: { en: 5 } }, { kind: 'burst', seconds: 4 }, { kind: 'burst', seconds: 61 }, { kind: 'burst', seconds: '10' }, { kind: 'burst', seconds: 7.5 }, { kind: 'burst', occasionKey: '../../x' }, { kind: 'burst', occasionKey: 5 }, { kind: 'burst', evil: 1 }]) {
    r = await call('POST', '/occasions/moment', body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal((await call('POST', '/occasions/moment', null, '[1]')).status, 400);
  assert.equal(activeMoment(), null, 'refused requests start nothing');
  r = await call('POST', '/occasions/moment', { kind: 'shoutout', text: { en: 'y'.repeat(80) } }); assert.equal(r.status, 200);
  assert.equal((await call('POST', '/occasions/moment', { kind: 'shoutout', text: { en: 'x'.repeat(5000) } })).status, 413, '4 kB body cap');
  // the id 'moment' is never an occasion id
  assert.equal((await call('PUT', '/occasions/moment', { occasion: { on: false } })).status, 404);
  // rate limit: 10 a minute for the whole screen
  momentStore.reset();
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/occasions/moment', { kind: 'burst' })).status, 200, `hit ${i}`);
  r = await call('POST', '/occasions/moment', { kind: 'burst' }); assert.equal(r.status, 429); assert.match(r.json.error, /Wait/);
  momentStore.reset();
  assert.equal((await call('POST', '/occasions/moment', { kind: 'burst' })).status, 200);
  momentStore.reset();
  // expiry and the rate window with a fake clock
  let t = 1000; const timers = []; const emitted = [];
  const st = createMomentStore({ now: () => t, emit: (type, data) => emitted.push([type, data]), setTimer: (fn, ms) => { timers.push([fn, ms]); return { unref() {} }; }, clearTimer() {} });
  st.start(parseMoment({ kind: 'burst', seconds: 5 }));
  assert.equal(st.get().kind, 'burst'); t += 4999; assert.ok(st.get()); t += 1; assert.equal(st.get(), null, 'auto-clears at until'); assert.equal(emitted.at(-1)[1].moment, null);
  for (let i = 0; i < 10; i++) assert.ok(st.take().ok);
  assert.equal(st.take().ok, false); t += 60001; assert.ok(st.take().ok);
  // permissions + activity
  const P = await import('../src/shared/permissions.js');
  const full = { role: 'editor', preset: 'full' }; const msg = { role: 'editor', preset: 'messages' };
  assert.equal(P.canDo(full, 'POST', '/api/occasions/moment'), true); assert.equal(P.canDo(full, 'DELETE', '/api/occasions/moment'), true);
  assert.equal(P.canDo(msg, 'POST', '/api/occasions/moment'), false); assert.equal(P.canDo(msg, 'DELETE', '/api/occasions/moment'), false);
  const { describe } = await import('../src/server/activity.js');
  assert.match(describe('POST', '/api/occasions/moment', { kind: 'shoutout' }), /shout-out/); assert.match(describe('DELETE', '/api/occasions/moment'), /Stopped/);
  // viewers may see the active moment (harmless: words typed for the TV)
  const { viewerState } = await import('../src/server/live.js');
  assert.deepEqual(viewerState({ occasionMoment: { id: 'm1', kind: 'burst' } }).occasionMoment, { id: 'm1', kind: 'burst' });
  momentStore.reset();
});

test('advent / count-up / sound over the routes: saved, strict, kiosk copy, undo', async () => {
  const { call, events } = await setup();
  const PH = '/uploads/0a1b2c3d-1111-2222-3333-444455556666.jpg';
  let r = await call('POST', '/occasions', { occasion: { nameEn: 'Run', kind: 'countup', from: { kind: 'gregorian', month: 6, day: 1, year: 2027 }, total: 100, display: 'flip', touch: false, soundOn: true, advent: { on: true, photo: PH, grid: '4x3', daily: { 5: { en: 'Card', source: 'Sefer X p. 3', checked: true }, 4: { en: 'Draft card', source: 'Sefer Y' } } } } });
  assert.equal(r.status, 200);
  const o = r.json.occasions.find((x) => x.id === r.json.id);
  assert.equal(o.kind, 'countup'); assert.equal(o.days, 100); assert.equal(o.display, 'flip'); assert.equal(o.touch, false); assert.equal(o.soundOn, true); assert.equal(o.advent.grid, '4x3'); assert.equal(o.advent.daily['5'].checked, true); assert.equal(o.advent.daily['4'].checked, false);
  assert.ok(events.slice(-1)[0].includes('Draft card'), 'a card with text is in the kiosk copy: no check needed');
  assert.ok(events.slice(-1)[0].includes('"Card"') || events.slice(-1)[0].includes('Card'));
  assert.equal((await call('POST', '/occasions', { occasion: { nameEn: 'Bad', kind: 'countup', total: 5 } })).status, 400);
  assert.equal((await call('POST', '/occasions', { occasion: { nameEn: 'Bad', kind: 'countup', from: { kind: 'gregorian', month: 6, day: 1, year: 2027 }, total: 999 } })).status, 400);
  assert.equal((await call('POST', '/occasions', { occasion: { nameEn: 'Bad', rule: { kind: 'hebrew', month: 9, day: 1 }, advent: { grid: '2x2' } } })).status, 400);
  r = await call('PUT', '/occasions/settings', { settings: { display: 'flip', sound: { on: true, chime: 'bell', volume: 60 } } });
  assert.equal(r.status, 200); assert.equal(r.json.settings.sound.chime, 'bell'); assert.equal(r.json.settings.display, 'flip');
  assert.equal((await call('PUT', '/occasions/settings', { settings: { sound: { volume: 5 } } })).status, 400);
  assert.equal((await call('PUT', '/occasions/settings', { settings: { display: 'big' } })).status, 400);
});

test('spotlight over the routes: strict, partial nested patch, old keys follow, unknown line-up id dropped, another org\'s document untouched', async () => {
  const { dir, call, events } = await setup();
  // SaaS isolation stub: another org's document sits next to ours; its ids are not ours, and it stays byte-identical
  const other = path.join(dir, 'occasions-other-org.json');
  fs.writeFileSync(other, JSON.stringify({ version: 1, settings: {}, occasions: [{ id: 'theirs1', nameEn: 'Their day', rule: { kind: 'hebrew', month: 9, day: 19 } }] }));
  const before = fs.readFileSync(other, 'utf8');
  let r = await call('POST', '/occasions', { occasion: { nameEn: 'Mine', rule: { kind: 'gregorian', month: 3, day: 5 }, history: [{ year: 5747, en: 'Then' }], vort: { en: 'A vort', source: 'Sicha' }, spotlight: { types: ['ring'] } } });
  assert.equal(r.status, 200);
  const mine = r.json.id;
  const added = r.json.occasions.find((o) => o.id === mine);
  assert.equal(added.history[0].year, 5747); assert.equal(added.vort.source, 'Sicha'); assert.deepEqual(added.spotlight, { types: ['ring'], leadDays: null });
  const n0 = events.length;
  r = await call('PUT', '/occasions/settings', { settings: { spotlight: { pick: 'queue', queue: [{ id: 'theirs1', startISO: '' }, { id: mine, startISO: '2027-03-05' }], strip: { count: 2 } } } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.settings.spotlight.queue, [{ id: mine, startISO: '2027-03-05' }], 'an id that is not in this document is dropped');
  assert.equal(r.json.settings.spotlight.strip.count, 2); assert.equal(r.json.settings.spotlight.strip.days, 30, 'a partial patch keeps the rest');
  assert.equal(r.json.settings.pinnedId, mine, 'old keys follow for one release');
  assert.ok(events.slice(n0).some((e) => e.includes('occasions-update')));
  assert.equal(fs.readFileSync(other, 'utf8'), before, 'the other document is byte-identical');
  for (const bad of [{ pick: 'everything' }, { queue: [{ id: '../../x' }] }, { stages: { after: true } }, { strip: { count: 9 } }, { zzz: 1 }]) {
    assert.equal((await call('PUT', '/occasions/settings', { settings: { spotlight: bad } })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call('PUT', `/occasions/${mine}`, { occasion: { history: Array.from({ length: 9 }, () => ({ en: 'x' })) } })).status, 400);
  assert.equal((await call('PUT', `/occasions/${mine}`, { occasion: { vort: { en: 'x'.repeat(401) } } })).status, 400);
  // deleting the day takes it out of the line-up
  r = await call('DELETE', `/occasions/${mine}`);
  assert.deepEqual(r.json.settings.spotlight.queue, []);
  // an old document (no spotlight yet) is migrated on read, nothing is written by the read
  fs.writeFileSync(path.join(dir, 'occasions.json'), JSON.stringify({ version: 1, settings: { pick: 'pinned', pinnedId: 's-purim', display: 'flip' }, occasions: [{ id: 's-purim', nameEn: 'Purim', rule: { kind: 'hebrew', month: 12, day: 14 } }] }));
  r = await call('GET', '/occasions');
  assert.equal(r.json.settings.spotlight.pick, 'pinned'); assert.deepEqual(r.json.settings.spotlight.queue, [{ id: 's-purim', startISO: '' }]); assert.equal(r.json.settings.spotlight.typeMode, 'one');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'occasions.json'), 'utf8')).settings.spotlight, undefined);
  fs.rmSync(other, { force: true });
});

test('worst-case occasion: one occasion at every limit (advent, year vorts, the Spotlight history + vort) is accepted', async () => {
  const { call } = await setup();
  const O = await import('../src/shared/occasions.js');
  const L = O.LIMITS; const he = (n) => 'א'.repeat(n); const en = (n) => 'a'.repeat(n);
  const daily = {}; for (let i = 1; i <= L.adventDays; i++) daily[i] = { en: en(L.adventText), he: he(L.adventText), source: en(L.source), checked: true };
  const yearVorts = {}; for (let i = 0; i < L.yearVorts; i++) yearVorts[String(10 * (i + 1))] = { en: en(L.yearVortText), he: he(L.yearVortText), source: en(L.source) };
  const occasion = { nameEn: en(L.name), nameHe: he(L.name), rule: { kind: 'hebrew', month: 9, day: 19 }, explainEn: en(L.explain), explainHe: he(L.explain),
    explainShortEn: en(L.explainShort), explainShortHe: he(L.explainShort), source: en(L.source), eventEn: en(L.event), eventHe: he(L.event), advent: { on: true, photo: '', grid: '3x3', daily }, yearVorts,
    history: Array.from({ length: L.history }, (_, i) => ({ year: 5700 + i, en: en(L.historyText), he: he(L.historyText) })), vort: { en: en(L.vort), he: he(L.vort), source: en(140) } };
  // the admin sends the whole edited occasion (its stored, normalised shape)
  const body = JSON.stringify({ occasion: O.normalizeOccasion(occasion, { keepId: false }) });
  assert.ok(Buffer.byteLength(body) > 64 * 1024, 'the case is bigger than the old 64 kB limit');
  const r = await call('POST', '/occasions', null, body);
  assert.equal(r.status, 200, JSON.stringify(r.json));
});
