import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreezeController, FreezeError } from '../src/server/freeze.js';
import { zonedToMs, parseHM } from '../src/shared/freeze.js';
import { canDo, effectiveCaps, PRESETS, CAP_IDS } from '../src/shared/permissions.js';
import { describe as describeAction } from '../src/server/activity.js';

const NY = 'America/New_York';
const at = (d, t) => { const [y, m, dd] = d.split('-').map(Number); return zonedToMs(y, m, dd, parseHM(t), NY); };

function harness(initial = null, startAt = at('2026-10-19', '12:00')) {
  const h = { clock: startAt, disk: initial, events: [], writes: 0 };
  h.make = () => createFreezeController({
    read: async () => h.disk,
    write: async (d) => { h.disk = JSON.parse(JSON.stringify(d)); h.writes++; },
    now: () => h.clock,
    broadcast: (type, data) => h.events.push({ type, data }),
    context: async () => ({ tz: NY, netzMinutes: 7 * 60 + 5 }),
    setTimer: () => 0, clearTimer: () => {},
  });
  return h;
}

test('set persists, broadcasts freeze-update, and is what the kiosk gets', async () => {
  const h = harness();
  const c = h.make(); await c.init();
  assert.equal(c.getKioskView().active, null);
  const snap = await c.set({ mode: 'message', message: 'Back at 8', style: 'terminal', duration: '30m' }, { name: 'Dina' });
  assert.equal(snap.active.mode, 'message');
  assert.equal(snap.active.until, h.clock + 30 * 60000);
  assert.equal(h.disk.manual.message, 'Back at 8');
  assert.equal(h.disk.manual.by, 'Dina');
  const last = h.events.at(-1);
  assert.equal(last.type, 'freeze-update');
  assert.equal(last.data.active.style, 'terminal');
  assert.equal(last.data.active.source, 'manual');
});

test('a timed freeze resumes by itself, with no leftover state', async () => {
  const h = harness();
  const c = h.make(); await c.init();
  await c.set({ mode: 'blank', duration: '1h' });
  h.clock += 59 * 60000; await c.evaluate();
  assert.ok(c.getKioskView().active);
  h.clock += 2 * 60000; await c.evaluate();
  assert.equal(c.getKioskView().active, null);
  assert.equal(h.disk.manual, null);
  assert.deepEqual(h.events.at(-1).data, { active: null, emergency: true });
});

test('survives a restart (re-armed from freeze.json) and drops one that ran out while down', async () => {
  const h = harness();
  const a = h.make(); await a.init();
  await a.set({ mode: 'logo', duration: 'tomorrow' });
  const until = at('2026-10-20', '07:05'); // today's netz time of day, tomorrow
  assert.equal(h.disk.manual.until, until);
  h.clock += 3600000;
  const b = h.make(); await b.init(); // "restart"
  assert.equal(b.getKioskView().active.mode, 'logo');
  assert.equal(b.snapshot().manual.until, until);
  h.clock = until + 1000;
  const c = h.make(); await c.init(); // down over the end
  assert.equal(c.getKioskView().active, null);
  assert.equal(h.disk.manual, null);
});

test('until a chosen time, in the screen zone', async () => {
  const h = harness();
  const c = h.make(); await c.init();
  const s = await c.set({ mode: 'blank', duration: 'at', at: '14:30' });
  assert.equal(s.active.until, at('2026-10-19', '14:30'));
  await assert.rejects(c.set({ mode: 'blank', duration: 'at', at: 'soon' }), FreezeError);
  await assert.rejects(c.set({ mode: 'sparkly' }), FreezeError);
  await assert.rejects(c.set({ mode: 'blank', duration: 'forever-ish' }), FreezeError);
});

test('resume clears the freeze; an off-hours window is skipped once', async () => {
  const h = harness(null, at('2026-10-19', '23:30'));
  const c = h.make(); await c.init();
  await c.saveSchedule({ enabled: true, windows: [{ id: 'night', days: [1, 2, 3, 4, 5], from: '23:00', to: '06:00', mode: 'blank' }] });
  assert.equal(c.getKioskView().active.source, 'schedule');
  assert.equal(c.getKioskView().active.until, at('2026-10-20', '06:00'));
  await c.resume();
  assert.equal(c.getKioskView().active, null);
  h.clock = at('2026-10-20', '02:00'); await c.evaluate();
  assert.equal(c.getKioskView().active, null);
  h.clock = at('2026-10-20', '23:15'); await c.evaluate();
  assert.equal(c.getKioskView().active.source, 'schedule');
  // the window starts by itself with a broadcast
  assert.equal(h.events.at(-1).data.active.mode, 'blank');
});

test('manual freeze beats the window; schedule validation and the emergency setting', async () => {
  const h = harness(null, at('2026-10-19', '23:30'));
  const c = h.make(); await c.init();
  await c.saveSchedule({ enabled: true, windows: [{ id: 'n', days: [1], from: '23:00', to: '06:00', mode: 'blank' }] });
  await c.set({ mode: 'message', message: 'Hi', duration: 'manual' });
  assert.equal(c.getKioskView().active.source, 'manual');
  await assert.rejects(c.saveSchedule({ windows: [{ days: [], from: '1:00', to: '2:00' }] }), FreezeError);
  assert.equal(c.getKioskView().emergency, true); // default ON
  await c.saveSchedule({ emergency: false });
  assert.equal(c.getKioskView().emergency, false);
  assert.equal(h.disk.emergency, false);
});

test('Resume with the same view does not re-broadcast on idle ticks', async () => {
  const h = harness();
  const c = h.make(); await c.init();
  const n = h.events.length;
  await c.evaluate(); await c.evaluate();
  assert.equal(h.events.length, n);
});

// ── who may use it ──────────────────────────────────────────────────────────

test('freeze routes need screen.control (messages-only has it, view-only does not)', () => {
  const messagesOnly = { role: 'editor', preset: 'messages' };
  const viewOnly = { role: 'editor', preset: 'view' };
  const full = { role: 'editor' };
  for (const [m, p] of [['POST', '/api/freeze'], ['DELETE', '/api/freeze'], ['PUT', '/api/freeze/schedule']]) {
    assert.equal(canDo(messagesOnly, m, p, {}), true, `${m} ${p} messages-only`);
    assert.equal(canDo(full, m, p, {}), true, `${m} ${p} full editor`);
    assert.equal(canDo(viewOnly, m, p, {}), false, `${m} ${p} view-only`);
    assert.equal(canDo('admin', m, p, {}), true);
  }
  assert.equal(canDo(viewOnly, 'GET', '/api/freeze'), true);
  // an editor with screen.control denied loses it, one granted gains it
  assert.equal(canDo({ role: 'editor', overrides: { grant: [], deny: ['screen.control'] } }, 'POST', '/api/freeze', {}), false);
  assert.equal(canDo({ role: 'editor', preset: 'view', overrides: { grant: ['screen.control'], deny: [] } }, 'POST', '/api/freeze', {}), true);
  // odd spellings cannot dodge the rule
  assert.equal(canDo(viewOnly, 'POST', '/api//Freeze/', {}), false);
  assert.equal(canDo(viewOnly, 'POST', '/api/freeze/../freeze', {}), false);
  assert.ok(CAP_IDS.includes('screen.control') && PRESETS.messages.caps.includes('screen.control'));
  assert.ok(!effectiveCaps(viewOnly).includes('screen.control'));
});

test('activity log lines', () => {
  assert.equal(describeAction('POST', '/api/freeze'), 'Froze the screen');
  assert.equal(describeAction('DELETE', '/api/freeze'), 'Resumed the screen');
  assert.equal(describeAction('PUT', '/api/freeze/schedule'), 'Changed the screen off-hours schedule');
});
