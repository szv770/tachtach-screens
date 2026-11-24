// Wave 2 of the connector: Daily Story / Word / Letter content and the look and main settings, end to end with the official MCP
// client against the real app (scratch data).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
const clients = [];
test.after(async () => { for (const c of clients) await c.close().catch(() => {}); await app.close(); });

const admin = await app.login('admin');
const full = await app.login('full');
const msgs = await app.login('messages');
assert.equal((await admin.call('PATCH', '/api/settings', { aiAccess: { enabled: true, changesPerMinute: 60 } })).status, 200);

const makeKey = async (who, mode = 'change') => (await who.post('/api/ai/connections', { label: 'wave2', client: 'Claude Code', mode })).body;
const connect = async (who) => {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${app.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${(await makeKey(who)).key}` } } }));
  clients.push(client);
  return client;
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

const adminC = await connect(admin);
const fullC = await connect(full);
const msgC = await connect(msgs);
const names = async (c) => (await c.listTools()).tools.map((t) => t.name);

test('who sees which new tools', async () => {
  const a = await names(adminC);
  for (const t of ['list_daily_content', 'add_daily_content', 'remove_daily_content', 'set_daily_today', 'update_look_and_settings']) assert.ok(a.includes(t), t);
  const f = await names(fullC);
  assert.ok(f.includes('add_daily_content') && f.includes('list_daily_content'));
  assert.ok(!f.includes('update_look_and_settings'), 'a Full editor has neither look.change nor settings.change');
  const m = await names(msgC);
  for (const t of ['list_daily_content', 'add_daily_content', 'update_look_and_settings']) assert.ok(!m.includes(t), `Messages only must not see ${t}`);
  const caps = (await call(adminC, 'get_capabilities')).json;
  const area = (k) => caps.areas.find((x) => x.area === k);
  for (const k of ['daily-story', 'daily-word', 'daily-letter', 'themes', 'layout', 'motion', 'shows', 'style', 'this-screen']) assert.equal(area(k).status, 'available', k);
  assert.equal(area('location').status, 'not-yet');
  assert.equal(area('roster').status, 'not-possible');
});

test('describe_options works for every new area and says what to ask', async () => {
  for (const area of ['daily-story', 'daily-word', 'daily-letter', 'themes', 'style', 'layout', 'motion', 'shows', 'this-screen']) {
    const d = (await call(adminC, 'describe_options', { area })).json;
    assert.equal(d.area, area);
    assert.ok(d.questionsToAsk.length >= 1, area);
    assert.ok(d.rules.length >= 1, area);
  }
  const story = (await call(adminC, 'describe_options', { area: 'daily-story' })).json;
  assert.match(story.rules.join(' '), /Never write a story from memory/);
  assert.match(story.choices.entryFields.source, /REQUIRED/);
  assert.match((await call(adminC, 'describe_options', { area: 'daily-letter' })).json.rules.join(' '), /exactly/i);
  const themes = (await call(adminC, 'describe_options', { area: 'themes' })).json;
  const theme = themes.settings.find((s) => s.key === 'theme');
  assert.ok(theme.allowed.some((o) => o.id === 'midnight'));
  assert.equal(theme.current, 'dark');
  const guide = (await call(adminC, 'get_format_guide', { kind: 'story' })).json;
  assert.match(guide.guidance, /source/i);
  assert.ok(guide.limits.text > 0);
});

const S = (title, source) => ({ kind: 'story', title, text: `Text of ${title}`, ...(source ? { source } : {}) });

test('add stories in bulk: the preview counts, warns about a missing source, the list changes, undo works', async () => {
  const items = [S('Alpha', 'Sefer A p. 1'), S('Beta', 'Sefer B p. 2'), S('Gamma (no source)')];
  const bad = await call(adminC, 'preview_change', { tool: 'add_daily_content', args: { kind: 'story', items: [1, 2] } });
  assert.equal(bad.json.ok, false);
  const r = await change(adminC, 'add_daily_content', { kind: 'story', items });
  assert.equal(r.preview.ok, true, JSON.stringify(r.preview));
  assert.match(r.preview.whatWillHappen, /Add 3 entries/);
  assert.ok(r.preview.warnings.some((w) => /no source/.test(w) && /HIDDEN/.test(w) && /Gamma/.test(w)));
  assert.equal(r.done.isError, false, r.done.text);
  const list = (await call(adminC, 'list_daily_content', { kind: 'story' })).json;
  assert.equal(list.count, 3);
  const gamma = list.entries.find((e) => e.title.startsWith('Gamma'));
  assert.equal(gamma.on, false);
  assert.equal(gamma.hasSource, false);
  assert.equal(list.entries.find((e) => e.title === 'Alpha').hasSource, true);
  // duplicates are skipped on append
  const again = await call(adminC, 'preview_change', { tool: 'add_daily_content', args: { kind: 'story', items } });
  assert.equal(again.json.ok, false, 'nothing new to add');
  // by AI + undo
  await tick();
  const row = (await call(adminC, 'read_history', { limit: 10 })).json.entries.find((e) => e.byAi && e.undoId);
  assert.ok(row && /Daily Story/.test(row.did + (row.detail || '')));
  const u = await change(adminC, 'undo_change', { undoId: row.undoId });
  assert.equal(u.done.isError, false, u.done.text);
  assert.equal((await call(adminC, 'list_daily_content', { kind: 'story' })).json.count, 0);
});

test('remove entries, replace the list, change today', async () => {
  assert.equal((await change(adminC, 'add_daily_content', { kind: 'story', items: [S('One', 'S1'), S('Two', 'S2'), S('Three', 'S3')] })).done.isError, false);
  const ids = (await call(adminC, 'list_daily_content', { kind: 'story' })).json.entries.map((e) => e.id);
  const rm = await change(adminC, 'remove_daily_content', { kind: 'story', ids: [ids[0]] });
  assert.match(rm.preview.whatWillHappen, /Remove 1 entry/);
  assert.equal(rm.done.isError, false, rm.done.text);
  assert.equal((await call(adminC, 'list_daily_content', { kind: 'story' })).json.count, 2);
  assert.equal((await call(adminC, 'preview_change', { tool: 'remove_daily_content', args: { kind: 'story', ids: ['nope'] } })).json.ok, false);
  const rep = await change(adminC, 'add_daily_content', { kind: 'story', items: [S('Solo', 'S9')], mode: 'replace' });
  assert.match(rep.preview.whatWillHappen, /REPLACE the whole Daily Story list/);
  assert.ok(rep.preview.warnings.some((w) => /removes everything/.test(w)));
  assert.equal(rep.done.isError, false, rep.done.text);
  const now = (await call(adminC, 'list_daily_content', { kind: 'story' })).json;
  assert.deepEqual(now.entries.map((e) => e.title), ['Solo']);
  // today
  assert.equal((await change(adminC, 'add_daily_content', { kind: 'story', items: [S('Pick me', 'S10')] })).done.isError, false);
  const pickId = (await call(adminC, 'list_daily_content', { kind: 'story' })).json.entries.find((e) => e.title === 'Pick me').id;
  const noId = await call(adminC, 'preview_change', { tool: 'set_daily_today', args: { kind: 'story', op: 'pick' } });
  assert.equal(noId.json.ok, false);
  const pick = await change(adminC, 'set_daily_today', { kind: 'story', op: 'pick', id: pickId });
  assert.equal(pick.done.isError, false, pick.done.text);
  assert.equal((await call(adminC, 'list_daily_content', { kind: 'story' })).json.showingToday.id, pickId);
  assert.ok(pick.preview.warnings.some((w) => /cannot be undone/.test(w)));
  assert.equal((await change(adminC, 'set_daily_today', { kind: 'story', op: 'automatic' })).done.isError, false);
});

test('words and letters: bulk add, the rules are the app\'s, letters are listed without being printed', async () => {
  const w = await change(adminC, 'add_daily_content', { kind: 'word', items: [{ word: 'nachas', transliteration: 'nachas', meaning: 'joy from children' }, { word: 'kvell', transliteration: 'kvell', meaning: 'to beam with pride' }, { word: 'broken' }] });
  assert.equal(w.preview.ok, true, JSON.stringify(w.preview));
  assert.ok(w.preview.warnings.some((x) => /cannot be used/.test(x)), 'the word with no meaning is reported');
  assert.equal(w.done.isError, false, w.done.text);
  const wl = (await call(adminC, 'list_daily_content', { kind: 'word' })).json;
  const wt = wl.entries.map((e) => e.title);
  assert.ok(wt.includes('nachas') && wt.includes('kvell'), 'the two good words were added to the existing list');
  assert.ok(!wt.includes('broken'), 'the word with no meaning was not');
  const body = 'Dear friend,\n\nA secret paragraph that must not be printed in the list.';
  const l = await change(adminC, 'add_daily_content', { kind: 'letter', items: [{ title: 'To a friend', letter: { body, salutation: 'Greeting and Blessing:', signature: 'With esteem' } }] });
  assert.equal(l.done.isError, false, l.done.text || JSON.stringify(l.preview));
  const ll = (await call(adminC, 'list_daily_content', { kind: 'letter' })).json;
  assert.equal(ll.count, 1);
  assert.ok(!JSON.stringify(ll).includes('secret paragraph'), 'letters are summarised, not printed');
  assert.ok(ll.entries[0].characters > 20);
  // a kind the person cannot use is refused (Messages only)
  const refused = await call(msgC, 'add_daily_content', { kind: 'word', items: [], previewId: 'x' });
  assert.equal(refused.isError, true);
});

test('look and settings: describe, preview before/after, change, "by AI", undo', async () => {
  const d = (await call(adminC, 'describe_options', { area: 'layout' })).json;
  assert.equal(d.settings.find((s) => s.key === 'orientation').current, 'landscape');
  const bad = await call(adminC, 'preview_change', { tool: 'update_look_and_settings', args: { changes: { theme: 'neon-pink' } } });
  assert.equal(bad.json.ok, false);
  assert.match(bad.json.problems.join(' '), /theme must be one of/);
  const unknown = await call(adminC, 'preview_change', { tool: 'update_look_and_settings', args: { changes: { zipCode: '10001' } } });
  assert.equal(unknown.json.ok, false);
  const r = await change(adminC, 'update_look_and_settings', { changes: { theme: 'midnight', orientation: 'portrait', railSide: 'right', motion: 'minimal' } });
  assert.equal(r.preview.ok, true, JSON.stringify(r.preview));
  assert.match(r.preview.whatWillHappen, /Screen theme: dark → midnight/);
  assert.match(r.preview.whatWillHappen, /Screen orientation: landscape → portrait/);
  assert.ok(r.preview.warnings.some((w) => /mounted on its side/.test(w)));
  assert.equal(r.done.isError, false, r.done.text);
  const s = (await admin.get('/api/settings')).body;
  assert.equal(s.theme, 'midnight');
  assert.equal(s.orientation, 'portrait');
  assert.equal(s.layout.railSide, 'right');
  assert.equal(s.clockSide, 'right');
  assert.equal(s.motion, 'minimal');
  const same = await call(adminC, 'preview_change', { tool: 'update_look_and_settings', args: { changes: { theme: 'midnight' } } });
  assert.equal(same.json.ok, false);
  await tick();
  const row = (await call(adminC, 'read_history', { limit: 10 })).json.entries.find((e) => e.byAi && e.undoId);
  assert.ok(row);
  const u = await change(adminC, 'undo_change', { undoId: row.undoId });
  assert.equal(u.done.isError, false, u.done.text);
  const back = (await admin.get('/api/settings')).body;
  assert.ok(back.theme !== 'midnight' && back.orientation !== 'portrait' && back.motion !== 'minimal');
});

test('settings with an object and numbers: day/night theme, Hebrew size, posting defaults', async () => {
  const r = await change(adminC, 'update_look_and_settings', { changes: { autoDayNight: { enabled: true }, hebrewFontScale: 1.1, newPostDefaultEndHours: 4, newSlideSeconds: 20, newPostStartsAs: 'draft' } });
  assert.equal(r.done.isError, false, r.done.text || JSON.stringify(r.preview));
  const s = (await admin.get('/api/settings')).body;
  assert.equal(s.themeAuto.enabled, true);
  assert.equal(s.hebrewFontScale, 1.1);
  assert.equal(s.announcements.defaultEndHours, 4);
  assert.equal(s.announcements.defaultSeconds, 20);
  assert.equal(s.announcements.startAs, 'draft');
  const range = await call(adminC, 'preview_change', { tool: 'update_look_and_settings', args: { changes: { hebrewFontScale: 3 } } });
  assert.equal(range.json.ok, false);
  assert.match(range.json.problems.join(' '), /at most 1.4/);
  // the new defaults flow into describe_options("announcements")
  const a = (await call(adminC, 'describe_options', { area: 'announcements' })).json;
  assert.match(a.defaults.startsAs, /draft/);
  assert.match(a.defaults.defaultEndHours, /4 hours/);
});

test('the connection\'s own switch and limits cannot be reached through any look tool', async () => {
  const noKey = await call(adminC, 'preview_change', { tool: 'update_look_and_settings', args: { changes: { aiAccess: { enabled: false } } } });
  assert.equal(noKey.json.ok, false);
  assert.match(noKey.json.problems.join(' '), /not something this tool accepts|not a setting/);
});

test('someone with only look access cannot change a setting that needs settings access', async () => {
  const lookOnly = await app.login('view', { grant: ['look.change', 'ai.connect'], deny: [] });
  const c = await connect(lookOnly);
  assert.ok((await names(c)).includes('update_look_and_settings'));
  assert.equal((await change(c, 'update_look_and_settings', { changes: { motion: 'lively' } })).done.isError, false);
  const p = await call(c, 'preview_change', { tool: 'update_look_and_settings', args: { changes: { screenName: 'Renamed by AI' } } });
  assert.equal(p.json.ok, false);
  assert.match(p.json.problems.join(' '), /does not have access/);
});

test('schedule_set_days can now be undone too (bulk dates are an undo kind)', async () => {
  const text = '# TachTach schedule v1\n@ 2026-12-11 Fri  Shabbos\n4:05 PM | Mincha | מנחה | Davening';
  assert.equal((await change(adminC, 'schedule_set_days', { text })).done.isError, false);
  await tick();
  const row = (await call(adminC, 'read_history', { limit: 10 })).json.entries.find((e) => e.byAi && e.undoId);
  assert.ok(row);
  assert.equal((await change(adminC, 'undo_change', { undoId: row.undoId })).done.isError, false);
  assert.equal((await call(adminC, 'get_schedule', { date: '2026-12-11' })).json.hasOneDayChange, false);
});
