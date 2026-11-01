// Red-team 2026-11-01 F1 + F2 + F8 + F3 + C1, tested through the REAL Express app (src/server/app.js: real middleware order,
// real body parsers, real routes), never canDo() with a hand-made body: F1 hid in the middleware ORDER.
import test from 'node:test';
import assert from 'node:assert/strict';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(() => app.close());

const admin = await app.login('admin');
const full = await app.login('full');
const msgs = await app.login('messages');
const view = await app.login('view');
const fullNoTk = await app.login('full', { grant: [], deny: ['announcements.takeover'] });
const msgEdit = await app.login('messages', { grant: ['announcements.edit'], deny: [] });
const msgDel = await app.login('messages', { grant: ['announcements.delete'], deny: [] });
const shiurimOnly = await app.login('view', { grant: ['shiurim.edit'], deny: [] });
const fullNoAnnDel = await app.login('full', { grant: [], deny: ['announcements.delete'] });
const slidesOnly = await app.login('view', { grant: ['slides.edit'], deny: [] });

const tkBody = (t, extra = {}) => ({ display: 'takeover', content: { headlineEn: t }, ...extra });
const list = async () => (await admin.get('/api/announcements')).body;

// ── F1 ──────────────────────────────────────────────────────────────────────
test('F1: Messages only cannot post a takeover (the body is parsed before the role check)', async () => {
  const adminTk = (await admin.post('/api/announcements', tkBody('ADMIN EMERGENCY'))).body;
  assert.equal(adminTk.display, 'takeover');
  const r = await msgs.post('/api/announcements', tkBody('NO SCHOOL TODAY', { when: { expiresAt: null }, resolve: { action: 'replace', ids: [adminTk.id] } }));
  assert.equal(r.status, 403);
  const items = await list();
  assert.equal(items.filter((i) => i.content?.headlineEn === 'NO SCHOOL TODAY').length, 0);
  assert.equal(items.find((i) => i.id === adminTk.id).enabled, true, 'the admin takeover was not paused');
  // other spellings of the same thing
  for (const display of ['TakeOver', ' takeover ']) assert.equal((await msgs.post('/api/announcements', { display, content: { headlineEn: 'x' } })).status, 403, display);
  assert.equal((await msgs.post('/api/messages', { type: 'takeover', textEn: 'x' })).status, 403);
});

test('F1: Messages only still posts slides, banners and notes; Full and admin still post takeovers; view cannot post', async () => {
  for (const display of ['slide', 'banner', 'note']) assert.equal((await msgs.post('/api/announcements', { display, content: { headlineEn: 'hello' } })).status, 201, display);
  assert.equal((await full.post('/api/announcements', tkBody('Full takeover'))).status, 201);
  assert.equal((await admin.post('/api/announcements', tkBody('Admin takeover'))).status, 201);
  assert.equal((await view.post('/api/announcements', tkBody('v'))).status, 403);
  assert.equal((await view.post('/api/announcements', { display: 'slide', content: { headlineEn: 'v' } })).status, 403);
});

test('F1: a posting body that never got parsed cannot slip through (no body at all)', async () => {
  const r = await app.request({ method: 'POST', url: '/api/announcements', token: msgs.token });
  assert.notEqual(r.status, 201);
  assert.equal(r.status === 400 || r.status === 403, true);
});

test('F1: the 256 kB limit on /api/announcements is kept (big letters pass, huge ones are refused)', async () => {
  const letter = { display: 'slide', content: { headlineEn: 'Letter', bodyEn: 'a'.repeat(12000) } };
  assert.equal((await full.post('/api/announcements', letter)).status, 201);
  const huge = await full.post('/api/announcements', { display: 'slide', content: { headlineEn: 'x' }, pad: 'p'.repeat(300 * 1024) });
  assert.equal(huge.status, 413);
  // not parsed for the unauthenticated: no session, no 256 kB buffer
  const anon = await app.request({ method: 'POST', url: '/api/announcements', body: { pad: 'p'.repeat(100 * 1024) } });
  assert.equal(anon.status, 401);
});

// ── F2 ──────────────────────────────────────────────────────────────────────
test('F2: without the takeover permission a stored takeover cannot be published, switched on, re-shown or copied', async () => {
  const draft = (await admin.post('/api/announcements', tkBody('draft tk', { status: 'draft' }))).body;
  const paused = (await admin.post('/api/announcements', tkBody('paused tk'))).body;
  await admin.put(`/api/announcements/${paused.id}`, { enabled: false });
  for (const who of [fullNoTk, msgEdit]) {
    assert.equal((await who.put(`/api/announcements/${draft.id}`, { status: 'published' })).status, 403);
    assert.equal((await who.put(`/api/announcements/${paused.id}`, { enabled: true })).status, 403);
    assert.equal((await who.post(`/api/announcements/${paused.id}/reactivate`, {})).status, 403);
    assert.equal((await who.post(`/api/announcements/${paused.id}/duplicate`, {})).status, 403);
    assert.equal((await who.put(`/api/announcements/${draft.id}`, { content: { headlineEn: 'edited' } })).status, 403, 'not even a text edit of a takeover');
  }
  const after = await list();
  assert.equal(after.find((i) => i.id === draft.id).status, 'draft');
  assert.equal(after.find((i) => i.id === paused.id).enabled, false);
  // an admin / Full editor still can
  assert.equal((await admin.put(`/api/announcements/${draft.id}`, { status: 'published' })).status, 200);
  assert.equal((await full.post(`/api/announcements/${paused.id}/reactivate`, {})).status, 200);
});

test('F2: turning a slide into a takeover is refused too, and ordinary editing keeps working', async () => {
  const slide = (await admin.post('/api/announcements', { display: 'slide', content: { headlineEn: 'plain' } })).body;
  assert.equal((await fullNoTk.put(`/api/announcements/${slide.id}`, { display: 'takeover' })).status, 403);
  assert.equal((await fullNoTk.put(`/api/announcements/${slide.id}`, { content: { headlineEn: 'plain 2' } })).status, 200);
  assert.equal((await fullNoTk.put(`/api/announcements/${slide.id}`, { enabled: false })).status, 200);
  assert.equal((await fullNoTk.post(`/api/announcements/${slide.id}/duplicate`, {})).status, 201);
  assert.equal((await fullNoTk.post(`/api/announcements/${slide.id}/reactivate`, {})).status, 200);
});

test('F2: the old pinned-note route cannot edit a stored takeover, and Kiddush Levana takeovers need the permission', async () => {
  const tk = (await admin.post('/api/announcements', tkBody('legacy target'))).body;
  assert.equal((await fullNoTk.put(`/api/pinned/${tk.id}`, { textEn: 'hijacked' })).status, 403);
  assert.equal((await list()).find((i) => i.id === tk.id).content.headlineEn, 'legacy target');
  assert.equal((await fullNoTk.put('/api/kiddush-levana/settings', { enabled: true })).status, 403);
  assert.notEqual((await full.put('/api/kiddush-levana/settings', { enabled: false })).status, 403);
});

test('F1/F2: restoring (Undo of a delete) a takeover needs the takeover permission, however the body names it', async () => {
  const body = { item: { id: 'restore-tk-1', display: 'takeover', content: { headlineEn: 'restored' } }, refs: [] };
  assert.equal((await msgDel.post('/api/announcements/restore', body)).status, 403);
  assert.equal((await msgDel.post('/api/announcements/restore', { item: { id: 'restore-tk-2', type: 'takeover', content: { headlineEn: 'r' } } })).status, 403);
  assert.equal((await list()).some((i) => i.id.startsWith('restore-tk')), false);
  assert.equal((await msgDel.post('/api/announcements/restore', { item: { id: 'restore-slide-1', display: 'slide', content: { headlineEn: 'ok' } } })).status, 201);
  assert.equal((await admin.post('/api/announcements/restore', body)).status, 201);
});

test('F1: Undo through History cannot bring a deleted takeover back for someone without the permission', async () => {
  const tk = (await admin.post('/api/announcements', tkBody('to be deleted'))).body;
  await admin.del(`/api/announcements/${tk.id}`);
  let rows;
  for (let i = 0; i < 20; i++) { rows = (await admin.get('/api/history')).body.entries; if (rows.some((e) => e.undo?.state === 'available' && /to be deleted/.test(e.detail))) break; await new Promise((r) => setTimeout(r, 50)); }
  const rec = rows.find((e) => /to be deleted/.test(e.detail) && e.undo);
  assert.ok(rec, 'a delete leaves an undo record');
  const undoId = rec.undo.id;
  // a person with delete rights but no takeover permission is refused
  const delNoTk = await app.login('full', { grant: [], deny: ['announcements.takeover'] });
  assert.notEqual((await delNoTk.post(`/api/history/${undoId}/undo`, {})).status, 200);
  assert.equal((await list()).some((i) => i.id === tk.id), false);
  assert.equal((await admin.post(`/api/history/${undoId}/undo`, {})).status, 200);
  assert.equal((await list()).some((i) => i.id === tk.id), true);
});

// ── C1 ──────────────────────────────────────────────────────────────────────
test('C1: "Emergency announcements still show" cannot be turned off by Messages only (screen.control)', async () => {
  const sched = (emergency) => ({ enabled: false, windows: [], emergency });
  assert.equal((await msgs.put('/api/freeze/schedule', sched(false))).status, 403);
  // saving the off-hours windows without changing the switch still works for them
  assert.equal((await msgs.put('/api/freeze/schedule', sched(true))).status, 200);
  assert.equal((await msgs.put('/api/freeze/schedule', { enabled: false })).status, 200);
  assert.equal((await full.put('/api/freeze/schedule', sched(false))).status, 200);
  assert.equal((await msgs.put('/api/freeze/schedule', sched(true))).status, 403, 'turning it back on is a change too');
  assert.equal((await admin.put('/api/freeze/schedule', sched(true))).status, 200);
});

// ── F8 ──────────────────────────────────────────────────────────────────────
const guest = (extra = {}) => ({ name: 'Rabbi Guest', title: 'Guest speaker', date: '2099-01-05', start: '19:30', place: 'Hall', ...extra });
test('F8: "Edit the shiurim" alone cannot give a guest a full-screen takeover', async () => {
  const r = await shiurimOnly.post('/api/shiurim/guests', guest({ takeover: { on: true, minutes: 60, at: '00:01' } }));
  assert.equal(r.status, 403);
  const ok = await shiurimOnly.post('/api/shiurim/guests', guest());
  assert.equal(ok.status, 200);
  assert.equal(ok.body.guests.find((g) => g.id === ok.body.id).takeover.on, false);
  const viaPut = await shiurimOnly.put(`/api/shiurim/guests/${ok.body.id}`, guest({ takeover: { on: true, minutes: 5, at: '01:00' } }));
  assert.equal(viaPut.status, 403);
  const viaRestore = await shiurimOnly.post('/api/shiurim/restore', { upsert: { guests: [{ ...guest({ takeover: { on: true, minutes: 5 } }), id: 'rg1' }] } });
  assert.equal(viaRestore.status, 403);
});

test('F8: a stored guest takeover stays as it is when someone without the permission edits the guest; a permitted person sets it', async () => {
  const made = await full.post('/api/shiurim/guests', guest({ name: 'Rabbi Stored', takeover: { on: true, minutes: 20, at: '08:00' } }));
  assert.equal(made.status, 200);
  const id = made.body.id;
  assert.equal(made.body.guests.find((g) => g.id === id).takeover.on, true);
  const edited = await shiurimOnly.put(`/api/shiurim/guests/${id}`, guest({ name: 'Rabbi Renamed', takeover: { on: false } }));
  assert.equal(edited.status, 200);
  const g = edited.body.guests.find((x) => x.id === id);
  assert.equal(g.name, 'Rabbi Renamed');
  assert.deepEqual({ on: g.takeover.on, minutes: g.takeover.minutes, at: g.takeover.at }, { on: true, minutes: 20, at: '08:00' });
  // a restore that names this guest cannot clear or change it either
  const rs = await shiurimOnly.post('/api/shiurim/restore', { upsert: { guests: [{ ...guest({ name: 'Rabbi Renamed' }), id, takeover: { on: false } }] } });
  assert.equal(rs.status, 200);
  assert.equal(rs.body.guests.find((x) => x.id === id).takeover.on, true);
});

// ── F3 ──────────────────────────────────────────────────────────────────────
test('F3a: "Delete slides" without "Delete announcements" removes only the row, and a permitted delete is fully undoable', async () => {
  const post = (await admin.post('/api/announcements', { display: 'slide', content: { headlineEn: 'precious post' } })).body;
  await admin.put('/api/slides', [{ id: 'ann-' + post.id, type: 'ANNOUNCEMENT', announcementId: post.id, enabled: true }, { id: 's-zm', type: 'ZMANIM', enabled: true }]);
  assert.equal((await fullNoAnnDel.del(`/api/announcements/${post.id}`)).status, 403, 'control');
  assert.equal((await fullNoAnnDel.del(`/api/slides/ann-${post.id}`)).status, 200);
  assert.equal((await list()).some((i) => i.id === post.id), true, 'the post survives');
  assert.deepEqual((await admin.get('/api/slides')).body.map((s) => s.id), ['s-zm']);
  // a person who may delete posts: deleting the row deletes the post, and Undo brings back post + row
  await admin.put('/api/slides', [{ id: 's-zm', type: 'ZMANIM', enabled: true }, { id: 'ann-' + post.id, type: 'ANNOUNCEMENT', announcementId: post.id, enabled: true }]);
  assert.equal((await full.del(`/api/slides/ann-${post.id}`)).status, 200);
  assert.equal((await list()).some((i) => i.id === post.id), false);
  let rec;
  for (let i = 0; i < 20 && !rec; i++) { rec = (await full.get('/api/history')).body.entries.find((e) => e.undo?.state === 'available' && /^Deleted .*precious post/.test(e.detail)); if (!rec) await new Promise((r) => setTimeout(r, 50)); }
  assert.ok(rec, 'History offers an Undo that names the post');
  assert.equal((await full.post(`/api/history/${rec.undo.id}/undo`, {})).status, 200);
  assert.equal((await list()).some((i) => i.id === post.id), true, 'the post is back');
  assert.deepEqual((await admin.get('/api/slides')).body.map((s) => s.id), ['s-zm', 'ann-' + post.id], 'and its row, in its place, once');
});

test('F3b: restore cannot flood or reorder the rotation, backdate-sort, or store free-form blobs', async () => {
  await admin.put('/api/slides', [{ id: 's1', type: 'SCHEDULE', enabled: true }]);
  const refs = Array.from({ length: 40 }, (_, i) => ({ index: 0, row: { id: `row-${i}-<b>x</b>` } }));
  const r = await msgDel.post('/api/announcements/restore', { item: { id: 'flood1', display: 'slide', content: { headlineEn: 'f' }, createdAt: '2099-01-01T00:00:00.000Z', legacy: { extra: { blob: 'A'.repeat(2000) } } }, refs });
  assert.equal(r.status, 201);
  const rows = (await admin.get('/api/slides')).body;
  assert.equal(rows.filter((s) => s.announcementId === 'flood1').length, 1);
  assert.equal(rows.length, 2);
  const item = (await list()).find((i) => i.id === 'flood1');
  assert.ok(Date.parse(item.createdAt) < Date.now() + 120000, 'no future createdAt');
  assert.equal(item.legacy, undefined);
  assert.equal((await msgDel.post('/api/announcements/restore', { item: { id: '../../x y', display: 'slide', content: { headlineEn: 'f' } } })).status, 400);
});

test('F3c: "Change the slides" alone cannot switch a post off the TV', async () => {
  const post = (await admin.post('/api/announcements', { display: 'slide', content: { headlineEn: 'keep me on' } })).body;
  const row = { id: 'ann-' + post.id, type: 'ANNOUNCEMENT', announcementId: post.id, enabled: true };
  await admin.put('/api/slides', [row, { id: 's2', type: 'ZMANIM', enabled: true }]);
  const r = await slidesOnly.put('/api/slides', [{ ...row, enabled: false }, { id: 's2', type: 'ZMANIM', enabled: false }]);
  assert.equal(r.status, 200);
  const rows = (await admin.get('/api/slides')).body;
  assert.equal(rows.find((s) => s.id === row.id).enabled, true, 'post row stays on');
  assert.equal(rows.find((s) => s.id === 's2').enabled, false, 'built-in slides are theirs to switch');
  // people who may edit posts can still switch one off here
  await full.put('/api/slides', [{ ...row, enabled: false }]);
  assert.equal((await admin.get('/api/slides')).body.find((s) => s.id === row.id).enabled, false);
});
