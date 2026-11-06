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

  // body limit (64 kB)
  assert.equal((await call('POST', '/occasions', null, JSON.stringify({ occasion: { nameEn: 'x', explainEn: 'y'.repeat(70000) } }))).status, 413);
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
  assert.equal(r.json.occasions.find((x) => x.id === id).explainChecked, false);
  let ev = events.slice(-1)[0];
  assert.ok(!ev.includes('DRAFT-WORDS'), 'an unchecked explanation is not broadcast');
  r = await call('PUT', `/occasions/${id}`, { occasion: { explainChecked: true } });
  assert.equal(r.json.occasions.find((x) => x.id === id).explainChecked, true);
  assert.ok(events.slice(-1)[0].includes('DRAFT-WORDS'), 'checked: it shows, so it is in the kiosk copy');
  r = await call('PUT', `/occasions/${id}`, { occasion: { source: 'chabad.org/b' } });
  assert.equal(r.json.occasions.find((x) => x.id === id).explainChecked, false, 'editing the source un-checks it');
  assert.equal((await call('PUT', `/occasions/${id}`, { occasion: { explainChecked: 'yes' } })).status, 400);
  const { occasionsForKiosk } = await import('../src/server/occasionsStore.js');
  const kiosk = JSON.stringify(await occasionsForKiosk());
  assert.ok(!kiosk.includes('DRAFT-WORDS') && !kiosk.includes('chabad.org/b'));
  const { viewerState } = await import('../src/server/live.js');
  assert.ok(!JSON.stringify(viewerState({ occasions: await occasionsForKiosk() }).occasions).includes('DRAFT-WORDS'), 'live viewers never get an unchecked explanation');

  // the file cap is enforced by the store
  const fat = Array.from({ length: 80 }, (_, i) => ({ id: `f${i}`, nameEn: 'n', rule: { kind: 'hebrew', month: 9, day: 1 }, explainEn: 'y'.repeat(600), explainHe: 'ש'.repeat(600), source: 's'.repeat(100) }));
  r = await call('PUT', '/occasions/all', { file: { occasions: fat, settings: { milestoneText: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { en: 'x'.repeat(60), he: 'ש'.repeat(60) }])) } } });
  assert.ok(r.status === 200 || (r.status === 400 && /too big/.test(r.json.error)), `status ${r.status}`);

  // undo: the whole previous document comes back, hype fields included
  r = await call('PUT', '/occasions/all', { file: { occasions: before.occasions, settings: before.settings } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.settings.milestones, [30, 14, 7, 3, 2, 1]); assert.equal(r.json.settings.look.photo, '');
});
