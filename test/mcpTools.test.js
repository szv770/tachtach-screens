// The AI connector (/mcp) end to end: the official MCP client over HTTP against the REAL Express app, scratch data only.
// What must hold: off = 404, bad key = 401, each person sees only their tools, the AI is told what is possible and what to ask,
// every change needs a matching preview, changes are real and marked "by AI", undo works, and no names / coordinates leak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
const clients = [];
test.after(async () => { for (const c of clients) await c.close().catch(() => {}); await app.close(); });

const { STYLE_IDS } = await import('../src/shared/takeoverStyles.js');
const { DISPLAYS } = await import('../src/shared/announcements.js');
const { CONNECTOR_LAYOUTS } = await import('../src/shared/mcpTools/catalogue.js');

const admin = await app.login('admin');
const full = await app.login('full');
const msgs = await app.login('messages');
const noTakeover = await app.login('messages', { grant: [], deny: [] });
assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true, changesPerMinute: 60 } })).status, 200);

const makeKey = async (who, mode = 'change') => (await who.post('/api/ai/connections', { label: 'mcp test', client: 'Claude Code', mode })).body;
const connect = async (key) => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${app.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  clients.push(client);
  return client;
};
const call = async (client, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  let json = null;
  try { json = JSON.parse(text); } catch { /* an error sentence */ }
  return { isError: !!r.isError, text, json };
};
/** preview, then apply with the previewId (what a well-behaved AI does). */
const change = async (client, tool, args) => {
  const p = await call(client, 'preview_change', { tool, args });
  assert.equal(p.isError, false, p.text);
  if (!p.json.ok) return { preview: p.json };
  const done = await call(client, tool, { ...args, previewId: p.json.previewId });
  return { preview: p.json, done };
};

const fullKey = await makeKey(full);
const fullClient = await connect(fullKey.key);
const msgClient = await connect((await makeKey(msgs)).key);
const lookClient = await connect((await makeKey(full, 'read')).key);

test('/mcp is a 404 while AI connections are off, 401 without a good key, 405 for anything but POST', async () => {
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: false } })).status, 200);
  const off = await app.request({ method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${fullKey.key}` } });
  assert.equal(off.status, 404);
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true } })).status, 200);
  const noKey = await app.request({ method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert.equal(noKey.status, 401);
  const bad = await app.request({ method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ttk_${'a'.repeat(64)}` } });
  assert.equal(bad.status, 401);
  assert.equal((await app.request({ method: 'GET', url: '/mcp', headers: { authorization: `Bearer ${fullKey.key}` } })).status, 405);
  // a session cookie alone is never enough
  assert.equal((await app.request({ method: 'POST', url: '/mcp', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, token: admin.token })).status, 401);
});

test('the AI is handed the playbook, and each person sees only the tools they may use', async () => {
  assert.match(fullClient.getInstructions() || '', /get_capabilities/);
  assert.match(fullClient.getInstructions() || '', /preview_change/);
  const names = async (c) => (await c.listTools()).tools.map((t) => t.name);
  const full_ = await names(fullClient);
  for (const t of ['get_capabilities', 'describe_options', 'preview_change', 'post_message', 'schedule_replace_week', 'set_slide_enabled', 'delete_post', 'undo_change']) assert.ok(full_.includes(t), t);
  const msg = await names(msgClient);
  assert.ok(msg.includes('post_message') && msg.includes('preview_change'));
  for (const t of ['schedule_replace_week', 'set_slide_enabled', 'delete_post', 'edit_post']) assert.ok(!msg.includes(t), `Messages only must not see ${t}`);
  const look = await names(lookClient);
  assert.ok(look.includes('get_overview') && look.includes('list_posts'));
  for (const t of ['post_message', 'schedule_replace_week', 'undo_change', 'delete_post']) assert.ok(!look.includes(t), `look-only must not see ${t}`);
  // honest annotations: reads are read-only (no Allow prompt), changes are not, deletes are destructive
  const tools = (await fullClient.listTools()).tools;
  const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
  assert.equal(by.get_overview.readOnlyHint, true);
  assert.equal(by.preview_change.readOnlyHint, true);
  assert.equal(by.post_message.readOnlyHint, false);
  assert.equal(by.delete_post.destructiveHint, true);
  assert.equal(by.post_message.destructiveHint, false);
  // starter prompts exist
  assert.ok((await fullClient.listPrompts()).prompts.some((p) => p.name === 'post_a_message'));
});

test('get_capabilities tells each person the truth about what they can do, and why not', async () => {
  const full_ = (await call(fullClient, 'get_capabilities')).json;
  const area = (j, k) => j.areas.find((a) => a.area === k);
  assert.equal(area(full_, 'announcements').status, 'available');
  assert.equal(area(full_, 'schedule').status, 'available');
  assert.equal(area(full_, 'roster').status, 'not-possible');
  assert.match(area(full_, 'roster').reason, /names/i);
  assert.equal(area(full_, 'team').status, 'not-possible');
  assert.equal(area(full_, 'averages').status, 'not-possible');
  assert.equal(area(full_, 'images').status, 'not-yet');
  const msg = (await call(msgClient, 'get_capabilities')).json;
  assert.equal(area(msg, 'announcements').status, 'available');
  assert.equal(area(msg, 'schedule').status, 'available', 'it can still READ the schedule');
  assert.equal(area(msg, 'schedule').canChange, false, 'but not change it');
  assert.ok(area(msg, 'schedule').cannot.some((c) => c.tool === 'schedule_replace_week' && /does not have that access/.test(c.because)));
  assert.equal(area(msg, 'announcements').canChange, true);
  assert.equal(area(full_, 'schedule').canChange, true);
  const look = (await call(lookClient, 'get_capabilities')).json;
  assert.equal(look.youAre.canChange, false);
  assert.equal(area(look, 'announcements').canChange, false);
  assert.ok(area(look, 'announcements').cannot.every((c) => /look only/.test(c.because)));
});

test('describe_options lists the real choices, the school defaults and the questions to ask', async () => {
  const d = (await call(fullClient, 'describe_options', { area: 'announcements' })).json;
  assert.deepEqual(d.choices.display.map((x) => x.id), DISPLAYS);
  assert.deepEqual(d.choices.layouts.map((x) => x.id), CONNECTOR_LAYOUTS);
  assert.deepEqual(d.choices.takeoverStyles.flatMap((g) => g.styles.map((s) => s.id)), STYLE_IDS);
  assert.ok(d.questionsToAsk.some((q) => /how long/i.test(q)));
  assert.equal(d.choices.display.find((x) => x.id === 'takeover').pausesRotation, true);
  assert.equal(d.choices.display.find((x) => x.id === 'banner').pausesRotation, false);
  assert.ok(d.defaults.slideSeconds >= 3);
  for (const area of ['schedule', 'slides', 'history', 'home']) assert.ok((await call(fullClient, 'describe_options', { area })).json.area === area);
  // nothing is claimed for an area that has no tools yet
  const bad = await call(fullClient, 'describe_options', { area: 'menu' });
  assert.equal(bad.isError, true);
});

test('a change without a matching preview is refused and saves nothing', async () => {
  const post = { display: 'banner', content: { headlineEn: 'NO PREVIEW' } };
  const noId = await call(fullClient, 'post_message', { post });
  assert.equal(noId.isError, true);
  assert.match(noId.text, /previewId/);
  const fake = await call(fullClient, 'post_message', { post, previewId: 'abc.def' });
  assert.equal(fake.isError, true);
  const p = (await call(fullClient, 'preview_change', { tool: 'post_message', args: { post, endsInHours: 2 } })).json;
  assert.equal(p.ok, true);
  const changed = await call(fullClient, 'post_message', { post, endsInHours: 5, previewId: p.previewId });
  assert.equal(changed.isError, true, 'different arguments than were previewed');
  assert.match(changed.text, /preview_change again/);
  const otherKey = await connect((await makeKey(full)).key);
  const stolen = await call(otherKey, 'post_message', { post, endsInHours: 2, previewId: p.previewId });
  assert.equal(stolen.isError, true, 'a previewId belongs to one connection');
  const wrongTool = await call(fullClient, 'edit_post', { id: 'x', changes: post, previewId: p.previewId });
  assert.equal(wrongTool.isError, true);
  assert.equal((await admin.get('/api/announcements')).body.filter((i) => i.content?.headlineEn === 'NO PREVIEW').length, 0);
});

test('post_message: preview says what will happen, the post is real, marked "by AI", and can be undone', async () => {
  const args = { post: { display: 'banner', content: { headlineEn: 'Mincha at 1:45 today' }, banner: { mode: 'scroll' } }, endsInHours: 3 };
  const r = await change(fullClient, 'post_message', args);
  assert.equal(r.preview.ok, true);
  assert.match(r.preview.whatWillHappen, /Banner/);
  assert.match(r.preview.whatWillHappen, /Mincha at 1:45 today/);
  assert.equal(r.done.isError, false, r.done.text);
  const id = r.done.json.id;
  const stored = (await admin.get('/api/announcements')).body.find((i) => i.id === id);
  assert.equal(stored.display, 'banner');
  assert.equal(stored.banner.mode, 'scroll');
  assert.ok(Date.parse(stored.when.expiresAt) > Date.now() + 2.9 * 3600_000 && Date.parse(stored.when.expiresAt) < Date.now() + 3.1 * 3600_000);
  await new Promise((res) => setTimeout(res, 300));
  const hist = (await call(fullClient, 'read_history', { limit: 10 })).json.entries;
  const row = hist.find((e) => e.byAi && e.undoId);
  assert.ok(row, 'the AI row is marked and undoable');
  const u = await change(fullClient, 'undo_change', { undoId: row.undoId });
  assert.equal(u.done.isError, false, u.done.text);
  assert.equal((await admin.get('/api/announcements')).body.some((i) => i.id === id), false, 'the undo removed the post');
});

test('post_message: problems come back as plain sentences, and a takeover needs the takeover access', async () => {
  const empty = await call(fullClient, 'preview_change', { tool: 'post_message', args: { post: { display: 'slide' } } });
  assert.equal(empty.json.ok, false);
  assert.match(empty.json.problems.join(' '), /text/i);
  const badArgs = await call(fullClient, 'preview_change', { tool: 'post_message', args: { post: { display: 'sideways' } } });
  assert.equal(badArgs.json.ok, false);
  assert.match(badArgs.json.problems.join(' '), /slide, banner, note, takeover/);
  const noTk = await app.login('full', { grant: [], deny: ['announcements.takeover'] });
  const noTkClient = await connect((await makeKey(noTk)).key);
  const tk = await call(noTkClient, 'preview_change', { tool: 'post_message', args: { post: { display: 'takeover', content: { headlineEn: 'x' } } } });
  assert.equal(tk.json.ok, false);
  assert.match(tk.json.problems.join(' '), /takeover/i);
  const own = await call(fullClient, 'preview_change', { tool: 'post_message', args: { post: { display: 'takeover', content: { headlineEn: 'Drill' }, look: { style: 'emergency' } }, endsInHours: 1 } });
  assert.equal(own.json.ok, true);
  assert.ok(own.json.warnings.some((w) => /WHOLE screen/.test(w)));
});

test('edit, pause, end and delete a post through previews', async () => {
  const made = await change(fullClient, 'post_message', { post: { display: 'slide', status: 'published', content: { headlineEn: 'Edit me' }, slide: { duration: 10 } }, endsInHours: 0 });
  const id = made.done.json.id;
  const ed = await change(fullClient, 'edit_post', { id, changes: { content: { headlineEn: 'Edited by AI' } } });
  assert.equal(ed.done.isError, false, ed.done.text);
  assert.equal((await admin.get('/api/announcements')).body.find((i) => i.id === id).content.headlineEn, 'Edited by AI');
  const ps = await change(fullClient, 'set_post_state', { id, state: 'pause' });
  assert.equal(ps.done.isError, false, ps.done.text);
  assert.equal((await admin.get('/api/announcements')).body.find((i) => i.id === id).enabled, false);
  const listed = (await call(fullClient, 'list_posts', { status: 'paused' })).json.posts.find((p) => p.id === id);
  assert.ok(listed);
  assert.match(listed.text, /Edited by AI/);
  const rs = await change(fullClient, 'set_post_state', { id, state: 'resume' });
  assert.equal(rs.done.isError, false, rs.done.text);
  const en = await change(fullClient, 'set_post_state', { id, state: 'end_now' });
  assert.equal(en.done.isError, false, en.done.text);
  assert.equal((await call(fullClient, 'list_posts', { status: 'ended' })).json.posts.some((p) => p.id === id), true);
  const del = await change(fullClient, 'delete_post', { id });
  assert.equal(del.done.isError, false, del.done.text);
  assert.equal((await admin.get('/api/announcements')).body.some((i) => i.id === id), false);
  // Messages only can post but cannot edit: the tool is not even offered, and calling it is refused
  const refused = await call(msgClient, 'delete_post', { id: 'x', previewId: 'y' });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /cannot use/);
});

const WEEK = ['# TachTach schedule v1', '@ every Sun-Thu', '7:30 AM - 8:30 AM | Shacharis | שחרית | Davening', '1:30 PM | Mincha | מנחה | Davening', '@ Fri', '8:00 AM | Shacharis | שחרית | Davening'].join('\n');

test('schedule: the format guide, a previewed week replace with an automatic backup, and one-day changes', async () => {
  const g = (await call(fullClient, 'get_format_guide', { kind: 'week' })).json;
  assert.match(g.format, /TachTach schedule v1/);
  const bad = await call(fullClient, 'preview_change', { tool: 'schedule_replace_week', args: { text: 'not a schedule' } });
  assert.equal(bad.json.ok, false);
  assert.ok(bad.json.problems.length >= 1);
  const week = await change(fullClient, 'schedule_replace_week', { text: WEEK });
  assert.equal(week.preview.ok, true, JSON.stringify(week.preview));
  assert.match(week.preview.whatWillHappen, /WHOLE weekly timetable/);
  assert.ok(week.preview.newWeek.some((l) => /Shacharis/.test(l)));
  assert.equal(week.done.isError, false, week.done.text);
  const sched = (await call(fullClient, 'get_schedule', { weekly: true })).json;
  assert.ok(sched.weekly.some((e) => e.name === 'Mincha'));
  // a one-day change, then clear it
  const day = '# TachTach schedule v1\n@ 2026-12-04 Fri  Shabbos Chanukah\n4:00 PM | Mincha | מנחה | Davening';
  const set = await change(fullClient, 'schedule_set_days', { text: day });
  assert.equal(set.done.isError, false, set.done.text || JSON.stringify(set.preview));
  const d = (await call(fullClient, 'get_schedule', { date: '2026-12-04' })).json;
  assert.equal(d.hasOneDayChange, true);
  assert.equal(d.entries[0].name, 'Mincha');
  const clear = await change(fullClient, 'schedule_clear_day', { date: '2026-12-04' });
  assert.equal(clear.done.isError, false, clear.done.text);
  assert.equal((await call(fullClient, 'get_schedule', { date: '2026-12-04' })).json.hasOneDayChange, false);
  const none = await call(fullClient, 'preview_change', { tool: 'schedule_clear_day', args: { date: '2026-12-04' } });
  assert.equal(none.json.ok, false, 'nothing left to clear');
});

test('slides: switch off, move and set seconds through previews', async () => {
  assert.equal((await admin.call('PUT', '/api/slides', [{ id: 's1', type: 'ZMANIM', enabled: true, duration: 12 }, { id: 's2', type: 'WEATHER', enabled: true, duration: 10 }, { id: 's3', type: 'LIMUDIM', enabled: true, duration: 15 }])).status, 200);
  const list = (await call(fullClient, 'list_slides')).json.slides;
  assert.deepEqual(list.map((s) => s.id), ['s1', 's2', 's3']);
  assert.equal((await change(fullClient, 'set_slide_enabled', { id: 's2', enabled: false })).done.isError, false);
  assert.equal((await change(fullClient, 'reorder_slides', { id: 's3', toPosition: 1 })).done.isError, false);
  assert.equal((await change(fullClient, 'set_slide_duration', { id: 's1', seconds: 25 })).done.isError, false);
  const after = (await admin.get('/api/slides')).body;
  assert.deepEqual(after.map((s) => s.id), ['s3', 's1', 's2']);
  assert.equal(after.find((s) => s.id === 's2').enabled, false);
  assert.equal(after.find((s) => s.id === 's1').duration, 25);
  const nope = await call(fullClient, 'preview_change', { tool: 'set_slide_enabled', args: { id: 'missing', enabled: true } });
  assert.equal(nope.isError, true);
  assert.match(nope.text, /list_slides/);
  const tooShort = await call(fullClient, 'preview_change', { tool: 'set_slide_duration', args: { id: 's1', seconds: 1 } });
  assert.equal(tooShort.json.ok, false);
});

test('no names, coordinates or links ever appear in any tool answer', async () => {
  await app.storage.writeJSON('roster.json', { people: [{ id: 'r1', first: 'Zalmanovich', last: 'Testname', month: 1, day: 1 }], birthdays: {} });
  await app.storage.writeJSON('chazan.json', { queue: [{ id: 'c1', name: 'Zalmanovich Testname' }] });
  // written straight to the file: a settings PATCH of the location would start the real zmanim / Chabad.org fetches
  const cur = (await admin.get('/api/settings')).body;
  await app.storage.writeJSON('settings.json', { ...cur, location: { ...(cur.location || {}), zip: '33139', lat: 25.774321, lon: -80.139876 }, siteName: 'Test School' });
  const outputs = [];
  for (const [name, args] of [['get_capabilities'], ['get_overview'], ['list_slides'], ['get_schedule', { weekly: true }], ['list_posts'], ['get_settings'], ['read_history', { limit: 50 }], ['describe_options', { area: 'announcements' }]]) {
    outputs.push((await call(fullClient, name, args || {})).text);
  }
  const all = outputs.join('\n');
  for (const secret of ['Zalmanovich', 'Testname', '25.774321', '-80.139876', '33139']) assert.ok(!all.includes(secret), `leaked: ${secret}`);
  assert.match(all, /Test School/);
});

test('the change limit applies to tool changes, and reads stay free', async () => {
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { changesPerMinute: 2 } })).status, 200);
  const c = await connect((await makeKey(full)).key);
  const post = (t) => change(c, 'post_message', { post: { display: 'note', content: { headlineEn: t } }, endsInHours: 1 });
  assert.equal((await post('one')).done.isError, false);
  assert.equal((await post('two')).done.isError, false);
  const third = await post('three');
  assert.equal(third.done.isError, true);
  assert.match(third.done.text, /Slow down|too many/i);
  for (let i = 0; i < 4; i++) assert.equal((await call(c, 'get_overview')).isError, false);
  assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { changesPerMinute: 60 } })).status, 200);
});

test('a revoked key stops working at once, even for a connection already open', async () => {
  const k = await makeKey(full);
  const c = await connect(k.key);
  assert.equal((await call(c, 'get_overview')).isError, false);
  assert.equal((await full.del(`/api/ai/connections/${k.connection.id}`)).status, 200);
  await assert.rejects(call(c, 'get_overview'));
});
