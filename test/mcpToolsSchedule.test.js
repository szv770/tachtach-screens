// Day-to-day use of the connector: cancel a Seder today / change times (one day and every week), the post settings the composer
// has, takeover conflicts, until end of today / Shabbos, and the TV controls. Official MCP client, real app, scratch data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
const clients = [];
test.after(async () => { for (const c of clients) await c.close().catch(() => {}); await app.close(); });

const admin = await app.login('admin');
assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true, changesPerMinute: 60 } })).status, 200);
const connect = async (who) => {
  const key = (await who.post('/api/ai/connections', { label: 'sched', client: 'Claude Code', mode: 'change' })).body.key;
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${app.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  clients.push(c);
  return c;
};
const call = async (c, name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  let json = null; try { json = JSON.parse(text); } catch { /* sentence */ }
  return { isError: !!r.isError, text, json };
};
const change = async (c, tool, args) => {
  const p = await call(c, 'preview_change', { tool, args });
  assert.equal(p.isError, false, p.text);
  if (!p.json.ok) return { preview: p.json };
  return { preview: p.json, done: await call(c, tool, { ...args, previewId: p.json.previewId }) };
};
const tick = () => new Promise((r) => setTimeout(r, 300));
const undoLast = async (c) => {
  await tick();
  const row = (await call(c, 'read_history', { limit: 10 })).json.entries.find((e) => e.byAi && e.undoId);
  assert.ok(row, 'an undoable AI change exists');
  const u = await change(c, 'undo_change', { undoId: row.undoId });
  assert.equal(u.done.isError, false, u.done.text);
};

// A date that is certainly a weekday the weekly schedule runs on: the next Monday.
const nextMonday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
const WEEK = ['# TachTach schedule v1', '@ every Sun-Thu', '7:30 AM - 8:30 AM | Shacharis | שחרית | Davening', '10:30 AM - 11:45 AM | Seder | סדר | Seder', '1:30 PM | Mincha | מנחה | Davening', '@ Fri', '8:00 AM | Shacharis | שחרית | Davening'].join('\n');
assert.equal((await admin.call('PUT', '/api/schedule/weekly', { text: WEEK })).status, 200);

const adminC = await connect(admin);
const names = async (c) => (await c.listTools()).tools.map((t) => t.name);

test('cancel the Seder for one day: the day gets its own copy, the weekly timetable is untouched, undo puts it back', async () => {
  const args = { date: nextMonday, ops: [{ op: 'cancel', match: { name: 'Seder', time: '10:30 AM' } }] };
  const r = await change(adminC, 'schedule_change_day', args);
  assert.equal(r.preview.ok, true, JSON.stringify(r.preview));
  assert.match(r.preview.whatWillHappen, /Cancel “Seder” 10:30 AM–11:45 AM for this day only/);
  assert.ok(r.preview.warnings.some((w) => /own schedule/.test(w)));
  assert.equal(r.done.isError, false, r.done.text);
  const day = (await call(adminC, 'get_schedule', { date: nextMonday })).json;
  assert.equal(day.hasOneDayChange, true);
  assert.deepEqual(day.entries.map((e) => e.name), ['Shacharis', 'Mincha'], 'the Seder no longer shows that day');
  const weekly = (await call(adminC, 'get_schedule', { weekly: true })).json.weekly;
  assert.ok(weekly.some((e) => e.name === 'Seder'), 'the regular timetable still has it');
  assert.equal((await call(adminC, 'get_schedule', { date: addDays(nextMonday, 1) })).json.hasOneDayChange, false, 'other days are untouched');
  await undoLast(adminC);
  assert.equal((await call(adminC, 'get_schedule', { date: nextMonday })).json.hasOneDayChange, false);
});
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('change a start and end time for one day, then edit the same day again (it already has its own schedule)', async () => {
  const r = await change(adminC, 'schedule_change_day', { date: nextMonday, ops: [{ op: 'change', match: { name: 'Mincha' }, set: { time: '1:45 PM' } }, { op: 'change', match: { name: 'Seder' }, set: { time: '10:45 AM - 12:00 PM' } }] });
  assert.equal(r.done.isError, false, r.done.text || JSON.stringify(r.preview));
  assert.match(r.preview.whatWillHappen, /1:30 PM → 1:45 PM/);
  assert.match(r.preview.whatWillHappen, /10:30 AM–11:45 AM → 10:45 AM–12:00 PM/);
  let day = (await call(adminC, 'get_schedule', { date: nextMonday })).json;
  assert.equal(day.entries.find((e) => e.name === 'Mincha').time, '13:45');
  const seder = day.entries.find((e) => e.name === 'Seder');
  assert.equal(seder.time, '10:45');
  assert.equal(seder.endTime, '12:00');
  // second edit of a date that now has its own schedule: no extra "own copy" warning, only the end time moves
  const r2 = await change(adminC, 'schedule_change_day', { date: nextMonday, ops: [{ op: 'change', match: { id: seder.id }, set: { endTime: '12:15 PM' } }] });
  assert.equal(r2.done.isError, false, r2.done.text || JSON.stringify(r2.preview));
  assert.ok(!r2.preview.warnings.some((w) => /own schedule from now on/.test(w)));
  day = (await call(adminC, 'get_schedule', { date: nextMonday })).json;
  assert.equal(day.entries.find((e) => e.name === 'Seder').endTime, '12:15');
  // switch it back on / cancel then restore with change enabled:true
  assert.equal((await change(adminC, 'schedule_change_day', { date: nextMonday, ops: [{ op: 'cancel', match: { name: 'Seder' } }] })).done.isError, false);
  assert.ok(!(await call(adminC, 'get_schedule', { date: nextMonday })).json.entries.some((e) => e.name === 'Seder'));
  assert.equal((await change(adminC, 'schedule_change_day', { date: nextMonday, ops: [{ op: 'change', match: { name: 'Seder' }, set: { enabled: true } }] })).done.isError, false);
  assert.ok((await call(adminC, 'get_schedule', { date: nextMonday })).json.entries.some((e) => e.name === 'Seder'));
  assert.equal((await change(adminC, 'schedule_clear_day', { date: nextMonday })).done.isError, false);
});

test('add a one-off block and remove another; categories must exist', async () => {
  const r = await change(adminC, 'schedule_change_day', { date: nextMonday, ops: [{ op: 'add', entry: { time: '4:00 PM', endTime: '4:30 PM', name: 'Assembly', category: 'Seder' } }, { op: 'remove', match: { name: 'Mincha' } }] });
  assert.equal(r.done.isError, false, r.done.text || JSON.stringify(r.preview));
  const day = (await call(adminC, 'get_schedule', { date: nextMonday })).json;
  assert.deepEqual(day.entries.map((e) => e.name), ['Shacharis', 'Seder', 'Assembly']);
  assert.equal(day.entries.find((e) => e.name === 'Assembly').endTime, '16:30');
  const noCat = await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: nextMonday, ops: [{ op: 'add', entry: { time: '5:00 PM', name: 'X', category: 'Invented' } }] } });
  assert.equal(noCat.json.ok, false);
  assert.match(noCat.json.problems.join(' '), /no category called “Invented”/);
  assert.match(noCat.json.problems.join(' '), /Davening/);
  assert.equal((await change(adminC, 'schedule_clear_day', { date: nextMonday })).done.isError, false);
});

test('a block that is not exactly one is never guessed: the candidates come back', async () => {
  const many = await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: nextMonday, ops: [{ op: 'cancel', match: { name: 'a' } }] } });
  assert.equal(many.json.ok, false);
  assert.match(many.json.problems[0], /matches 2 blocks/);
  assert.match(many.json.problems[0], /Shacharis/);
  const none = await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: nextMonday, ops: [{ op: 'cancel', match: { name: 'Nonesuch' } }] } });
  assert.match(none.json.problems[0], /No block matches/);
  assert.match(none.json.problems[0], /Mincha/);
  const noMatch = await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: nextMonday, ops: [{ op: 'cancel', match: {} }] } });
  assert.match(noMatch.json.problems[0], /Say which block/);
  const badTime = await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: nextMonday, ops: [{ op: 'change', match: { name: 'Mincha' }, set: { time: 'banana' } }] } });
  assert.equal(badTime.json.ok, false);
  assert.match(badTime.json.problems[0], /Couldn.t read the time/);
  const badDate = await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: 'next week', ops: [{ op: 'cancel', match: { name: 'Seder' } }] } });
  assert.match(badDate.json.problems[0], /today, tomorrow/);
  const noSet = await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: nextMonday, ops: [{ op: 'change', match: { name: 'Seder' } }] } });
  assert.match(noSet.json.problems[0], /needs a "set"/);
  assert.equal((await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: 'today', ops: [{ op: 'cancel', match: { name: 'Seder' } }] } })).isError, false, 'today / tomorrow are understood');
  assert.equal((await call(adminC, 'preview_change', { tool: 'schedule_change_day', args: { date: 'tomorrow', ops: [{ op: 'add', entry: { time: '9:00 AM', name: 'Early' } }] } })).isError, false);
});

test('the regular weekly timetable: pick by days, change a time, one undoable change with an automatic backup', async () => {
  const amb = await call(adminC, 'preview_change', { tool: 'schedule_change_week', args: { ops: [{ op: 'change', match: { name: 'Shacharis' }, set: { time: '8:15 AM' } }] } });
  assert.equal(amb.json.ok, false);
  assert.match(amb.json.problems[0], /matches 2 blocks/);
  assert.match(amb.json.problems[0], /Fri/);
  const r = await change(adminC, 'schedule_change_week', { ops: [{ op: 'change', match: { name: 'Shacharis', days: ['Fri'] }, set: { time: '8:15 AM' } }] });
  assert.equal(r.done.isError, false, r.done.text || JSON.stringify(r.preview));
  assert.match(r.preview.whatWillHappen, /REGULAR weekly timetable/);
  assert.ok(r.preview.warnings.some((w) => /every week/.test(w)));
  const weekly = (await call(adminC, 'get_schedule', { weekly: true })).json.weekly;
  assert.equal(weekly.find((e) => e.name === 'Shacharis' && /Fri/.test(JSON.stringify(e.days))).time, '08:15');
  assert.equal(weekly.find((e) => e.name === 'Shacharis' && !/Fri/.test(JSON.stringify(e.days))).time, '07:30', 'the other days are untouched');
  assert.ok((await admin.get('/api/schedule/templates')).body.some((t) => t.auto), 'the old week was backed up');
  await undoLast(adminC);
  assert.equal((await call(adminC, 'get_schedule', { weekly: true })).json.weekly.find((e) => e.name === 'Shacharis' && /Fri/.test(JSON.stringify(e.days))).time, '08:00');
  const add = await change(adminC, 'schedule_change_week', { ops: [{ op: 'add', entry: { time: '9:00 PM', name: 'Maariv', category: 'Davening', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] } }] });
  assert.equal(add.done.isError, false, add.done.text || JSON.stringify(add.preview));
  assert.ok((await call(adminC, 'get_schedule', { weekly: true })).json.weekly.some((e) => e.name === 'Maariv'));
  const rm = await change(adminC, 'schedule_change_week', { ops: [{ op: 'remove', match: { name: 'Maariv' } }] });
  assert.equal(rm.done.isError, false, rm.done.text);
  assert.ok(!(await call(adminC, 'get_schedule', { weekly: true })).json.weekly.some((e) => e.name === 'Maariv'));
});

test('who may use the schedule edits', async () => {
  const msgs = await app.login('messages');
  const m = await connect(msgs);
  const mn = await names(m);
  for (const t of ['schedule_change_day', 'schedule_change_week']) assert.ok(!mn.includes(t), `Messages only must not see ${t}`);
  assert.ok(mn.includes('screen_control') && mn.includes('freeze_screen'), 'Messages only has TV control');
  const view = await app.login('view', { grant: ['ai.connect'], deny: [] });
  const vn = await names(await connect(view));
  assert.ok(!vn.includes('screen_control') && !vn.includes('schedule_change_day'));
});

// ── posts ───────────────────────────────────────────────────────────────────
const post = (extra) => ({ post: { display: 'slide', content: { headlineEn: 'Hello' }, ...extra.post }, ...extra.rest });

test('every composer setting is available: fit, font size, full screen, side-note icon, turns, "for whom"', async () => {
  const r = await change(adminC, 'post_message', {
    post: { display: 'takeover', look: { style: 'celebration', layout: 'bigwords', fit: 'fixed', maxFontPx: 120, fullscreen: true }, takeover: { group: 'turns', rotateSec: 20 }, content: { headlineEn: 'Mazel Tov!', target: 'The whole yeshiva' } },
    endsInHours: 1,
  });
  assert.equal(r.done.isError, false, r.done.text || JSON.stringify(r.preview));
  const stored = (await admin.get('/api/announcements')).body.find((i) => i.id === r.done.json.id);
  assert.equal(stored.look.fit, 'fixed');
  assert.equal(stored.look.maxFontPx, 120);
  assert.equal(stored.look.fullscreen, true);
  assert.equal(stored.takeover.group, 'turns');
  assert.equal(stored.takeover.rotateSec, 20);
  assert.equal(stored.content.target, 'The whole yeshiva');
  const note = await change(adminC, 'post_message', { post: { display: 'note', content: { headlineEn: 'Bring your siddur' }, note: { icon: 'book' } }, endsInHours: 2 });
  assert.equal(note.done.isError, false, note.done.text || JSON.stringify(note.preview));
  assert.equal((await admin.get('/api/announcements')).body.find((i) => i.id === note.done.json.id).note.icon, 'book');
  const bad = await call(adminC, 'preview_change', { tool: 'post_message', args: { post: { display: 'slide', look: { maxFontPx: 5 }, content: { headlineEn: 'x' } } } });
  assert.equal(bad.json.ok, false);
  assert.match(bad.json.problems.join(' '), /at least 12/);
  const edit = await change(adminC, 'edit_post', { id: r.done.json.id, changes: { look: { maxFontPx: 90 } } });
  assert.equal(edit.done.isError, false, edit.done.text);
  assert.equal((await admin.get('/api/announcements')).body.find((i) => i.id === r.done.json.id).look.maxFontPx, 90);
});

test('until the end of today, and until the end of Shabbos (refused plainly when it is not known)', async () => {
  const r = await change(adminC, 'post_message', { post: { display: 'banner', content: { headlineEn: 'Until tonight' } }, until: 'end_of_today' });
  assert.equal(r.done.isError, false, r.done.text || JSON.stringify(r.preview));
  const exp = (await admin.get('/api/announcements')).body.find((i) => i.id === r.done.json.id).when.expiresAt;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(exp));
  assert.equal(parts, '23:59');
  assert.ok(Date.parse(exp) > Date.now() && Date.parse(exp) < Date.now() + 26 * 3600_000);
  const both = await call(adminC, 'preview_change', { tool: 'post_message', args: { post: { display: 'banner', content: { headlineEn: 'x' } }, until: 'end_of_today', endsInHours: 2 } });
  assert.match(both.json.problems.join(' '), /only one of/);
  const unknown = await call(adminC, 'preview_change', { tool: 'post_message', args: { post: { display: 'banner', content: { headlineEn: 'Shabbos' } }, until: 'end_of_shabbos' } });
  assert.equal(unknown.json.ok, false);
  assert.match(unknown.json.problems.join(' '), /end of Shabbos is not known/);
  // with the zmanim calculated on the box it works
  const cur = (await admin.get('/api/settings')).body;
  await app.storage.writeJSON('settings.json', { ...cur, dataSource: 'local', location: { ...(cur.location || {}), lat: 40.668, lon: -73.942, elevation: 10, timezone: 'America/New_York', zip: '11213' } });
  const known = await call(adminC, 'preview_change', { tool: 'post_message', args: { post: { display: 'banner', content: { headlineEn: 'Shabbos' } }, until: 'end_of_shabbos' } });
  if (known.json.ok) {
    assert.match(known.json.whatWillHappen, /until/i);
    const done = await call(adminC, 'post_message', { post: { display: 'banner', content: { headlineEn: 'Shabbos' } }, until: 'end_of_shabbos', previewId: known.json.previewId });
    assert.equal(done.isError, false, done.text);
    const end = Date.parse((await admin.get('/api/announcements')).body.find((i) => i.id === done.json.id).when.expiresAt);
    assert.ok(end > Date.now() && end < Date.now() + 8 * 24 * 3600_000);
    assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(end)), 'Sat');
  } else {
    assert.match(known.json.problems.join(' '), /not known/); // the sandbox may have no local zmanim: still a plain sentence
  }
});

test('takeover conflicts: you must choose replace / share / queue, and each one does what it says', async () => {
  // start clean: the earlier tests left a live takeover behind
  for (const i of (await admin.get('/api/announcements')).body) await admin.del(`/api/announcements/${i.id}`);
  const mk = (t, extra = {}) => ({ post: { display: 'takeover', content: { headlineEn: t }, look: { style: 'classic' }, ...extra }, endsInHours: 3 });
  const a = await change(adminC, 'post_message', mk('Takeover A'));
  assert.equal(a.done.isError, false, a.done.text || JSON.stringify(a.preview));
  const idA = a.done.json.id;
  const noChoice = await call(adminC, 'preview_change', { tool: 'post_message', args: mk('Takeover B') });
  assert.equal(noChoice.json.ok, false);
  assert.match(noChoice.json.problems.join(' '), /Takeover A/);
  assert.match(noChoice.json.problems.join(' '), /ifTakeoverConflict/);
  // replace pauses A
  const rep = await change(adminC, 'post_message', { ...mk('Takeover B'), ifTakeoverConflict: 'replace' });
  assert.equal(rep.done.isError, false, rep.done.text || JSON.stringify(rep.preview));
  assert.ok(rep.preview.warnings.some((w) => /PAUSED/.test(w)));
  let items = (await admin.get('/api/announcements')).body;
  assert.equal(items.find((i) => i.id === idA).enabled, false);
  const idB = rep.done.json.id;
  // share: B and C take turns
  const sh = await change(adminC, 'post_message', { ...mk('Takeover C'), ifTakeoverConflict: 'share' });
  assert.equal(sh.done.isError, false, sh.done.text || JSON.stringify(sh.preview));
  items = (await admin.get('/api/announcements')).body;
  const g = items.find((i) => i.id === sh.done.json.id).takeover.group;
  assert.ok(g);
  assert.equal(items.find((i) => i.id === idB).takeover.group, g);
  // queue: a new one starts when the latest of the others ends
  const q = await change(adminC, 'post_message', { post: { display: 'takeover', content: { headlineEn: 'Takeover D' }, look: { style: 'classic' }, takeover: { group: '' } }, endsInHours: 1, ifTakeoverConflict: 'queue' });
  assert.equal(q.done.isError, false, q.done.text || JSON.stringify(q.preview));
  items = (await admin.get('/api/announcements')).body;
  const d = items.find((i) => i.id === q.done.json.id);
  assert.ok(Date.parse(d.when.startsAt) > Date.now() + 2 * 3600_000, 'starts when the others end');
  // no conflict -> a note, not an error
  const calm = await call(adminC, 'preview_change', { tool: 'post_message', args: { post: { display: 'banner', content: { headlineEn: 'Calm' } }, ifTakeoverConflict: 'replace' } });
  assert.equal(calm.json.ok, true);
  assert.ok(calm.json.warnings.some((w) => /not needed/.test(w)));
  // replacing needs "edit announcements"
  const lowly = await app.login('full', { grant: [], deny: ['announcements.edit'] });
  const lc = await connect(lowly);
  const denied = await call(lc, 'preview_change', { tool: 'post_message', args: { ...mk('Takeover E'), ifTakeoverConflict: 'replace' } });
  assert.equal(denied.json.ok, false);
  assert.match(denied.json.problems.join(' '), /Edit existing announcements/);
});

// ── the TV ──────────────────────────────────────────────────────────────────
test('TV controls: pause / resume, and Freeze with a message for a time, then resume', async () => {
  const p = await change(adminC, 'screen_control', { action: 'pause' });
  assert.equal(p.done.isError, false, p.done.text);
  assert.match(p.preview.whatWillHappen, /Pause the TV/);
  assert.ok(p.preview.warnings.some((w) => /not connected/.test(w)), 'no TV is connected in the test');
  assert.equal((await admin.get('/api/screen/status')).body.paused, true);
  assert.equal((await change(adminC, 'screen_control', { action: 'resume' })).done.isError, false);
  assert.equal((await admin.get('/api/screen/status')).body.paused, false);
  const f = await change(adminC, 'freeze_screen', { mode: 'message', message: 'Assembly in the beis medrash', for: '30m' });
  assert.equal(f.done.isError, false, f.done.text || JSON.stringify(f.preview));
  assert.match(f.preview.whatWillHappen, /Assembly in the beis medrash/);
  assert.match(f.preview.whatWillHappen, /until/);
  const snap = (await admin.get('/api/freeze')).body;
  assert.equal(snap.manual.mode, 'message');
  assert.equal(snap.manual.message, 'Assembly in the beis medrash');
  assert.ok(snap.manual.until > Date.now() + 25 * 60_000 && snap.manual.until < Date.now() + 35 * 60_000);
  const r = await change(adminC, 'resume_screen', {});
  assert.equal(r.done.isError, false, r.done.text);
  assert.ok(!(await admin.get('/api/freeze')).body.manual);
  // problems are plain sentences
  for (const [args, re] of [
    [{ mode: 'message' }, /give the text/],
    [{ mode: 'blank', for: 'minutes' }, /number of minutes/],
    [{ mode: 'blank', for: 'at' }, /clock time/],
    [{ mode: 'blank', for: 'at', at: '25:99' }, /not valid/],
  ]) {
    const bad = await call(adminC, 'preview_change', { tool: 'freeze_screen', args });
    assert.equal(bad.json.ok, false, JSON.stringify(args));
    assert.match(bad.json.problems.join(' '), re);
  }
  const until = await change(adminC, 'freeze_screen', { mode: 'blank', for: 'at', at: '23:30' });
  assert.equal(until.done.isError, false, until.done.text || JSON.stringify(until.preview));
  assert.equal((await change(adminC, 'resume_screen', {})).done.isError, false);
});
