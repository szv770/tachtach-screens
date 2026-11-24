// Undo for the bulk changes the AI connector (and a paste) can make: several schedule dates at once, and the Daily Story /
// Word / Letter lists. Real Express app, scratch data.
import test from 'node:test';
import assert from 'node:assert/strict';

const { startApp } = await import('./helpers/realApp.js');
const app = await startApp();
test.after(() => app.close());
const admin = await app.login('admin');
const tick = () => new Promise((r) => setTimeout(r, 300)); // the History line is written when the response finishes

const lastUndo = async () => {
  await tick();
  const rows = (await admin.get('/api/history?limit=20')).body.entries;
  return rows.find((e) => e.undo?.state === 'available');
};

test('several schedule dates at once can be undone, and are refused if changed again', async () => {
  const text = ['# TachTach schedule v1', '@ 2026-12-04 Fri  Shabbos', '4:00 PM | Mincha | מנחה | Davening', '@ 2026-12-05 Shabbos', '9:00 AM | Shacharis | שחרית | Davening'].join('\n');
  assert.equal((await admin.call('PUT', '/api/schedule/dates', { text })).status, 200);
  const row = await lastUndo();
  assert.ok(row, 'an undoable row exists');
  assert.match(row.action + row.detail, /2 dates|schedule/i);
  assert.equal((await admin.post(`/api/history/${row.undo.id}/undo`)).status, 200);
  const dates = (await admin.get('/api/schedule/dates')).body;
  assert.equal(dates['2026-12-04'], undefined);
  assert.equal(dates['2026-12-05'], undefined);
  // conflict: set, change one day by hand, then undo is refused and nothing is lost
  assert.equal((await admin.call('PUT', '/api/schedule/dates', { text })).status, 200);
  const row2 = await lastUndo();
  assert.equal((await admin.call('PUT', '/api/schedule/dates/2026-12-04', { entries: [{ time: '5:00 PM', name: 'Mincha', category: 'Davening' }], label: 'edited' })).status, 200);
  const r = await admin.post(`/api/history/${row2.undo.id}/undo`);
  assert.equal(r.status, 409);
  assert.ok((await admin.get('/api/schedule/dates')).body['2026-12-04'], 'left alone');
});

const stories = (n, tag) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ kind: 'story', title: `${tag} ${i}`, text: `Text ${tag} ${i}`, source: `Book ${tag} p. ${i}` })));
const count = async (path, key) => (await admin.get(path)).body[key].length;

for (const [name, path, key, body] of [
  ['Daily Story', '/api/daily-stories', 'stories', (tag) => ({ text: stories(2, tag), mode: 'append' })],
  ['Daily Word', '/api/daily-words', 'words', (tag) => ({ text: JSON.stringify([{ word: `${tag}1`, transliteration: `${tag}1`, meaning: 'one' }, { word: `${tag}2`, transliteration: `${tag}2`, meaning: 'two' }]), mode: 'append' })],
  ['Daily Letter', '/api/daily-letters', 'stories', (tag) => ({ text: JSON.stringify([{ title: `${tag} letter`, letter: { body: `Dear friend ${tag}`, salutation: 'Greeting' } }]), mode: 'append' })],
]) {
  test(`${name}: an import can be undone, and is refused when an entry it added was edited since`, async () => {
    const before = await count(path, key);
    const imp = await admin.post(`${path}/import`, body('alpha'));
    assert.equal(imp.status, 200, imp.text);
    assert.ok(imp.body.added >= 1);
    const after = await count(path, key);
    assert.ok(after > before);
    const row = await lastUndo();
    assert.ok(row, `${name}: undoable`);
    assert.equal((await admin.post(`/api/history/${row.undo.id}/undo`)).status, 200);
    assert.equal(await count(path, key), before, 'back to what it was');
    // a dry run changes nothing and leaves no history
    const dry = await admin.post(`${path}/import`, { ...body('beta'), dryRun: true });
    assert.equal(dry.status, 200);
    assert.equal(await count(path, key), before);
    // conflict
    assert.equal((await admin.post(`${path}/import`, body('gamma'))).status, 200);
    const row2 = await lastUndo();
    const file = (await admin.get(path)).body;
    const edit = { words: { meaning: 'edited' }, stories: { text: 'edited by hand' } }[key === 'stories' && name === 'Daily Letter' ? 'letters' : key] || { title: 'edited by hand' };
    const list = file[key].map((e) => (/gamma/.test(JSON.stringify(e)) ? { ...e, ...edit } : e));
    assert.equal((await admin.call('PUT', path, { ...file, [key]: list })).status, 200);
    assert.equal((await admin.post(`/api/history/${row2.undo.id}/undo`)).status, 409);
    assert.equal(await count(path, key), after, 'nothing was lost');
  });
}

test('replacing a whole list can be undone (the old entries come back in their places)', async () => {
  assert.equal((await admin.post('/api/daily-stories/import', { text: stories(5, 'keep'), mode: 'append' })).status, 200);
  const before = (await admin.get('/api/daily-stories')).body.stories;
  assert.ok(before.length >= 5);
  const rep = await admin.post('/api/daily-stories/import', { text: stories(1, 'only'), mode: 'replace' });
  assert.equal(rep.status, 200);
  assert.equal(await count('/api/daily-stories', 'stories'), 1);
  const row = await lastUndo();
  assert.ok(row, 'a replace is undoable as long as the old list fits in history');
  assert.equal((await admin.post(`/api/history/${row.undo.id}/undo`)).status, 200);
  const back = (await admin.get('/api/daily-stories')).body.stories;
  assert.deepEqual(back.map((s) => s.id), before.map((s) => s.id), 'same entries, same order');
});

test('a Messages-only person cannot undo a daily-list change (the same rule as making it)', async () => {
  const msgs = await app.login('messages');
  assert.equal((await admin.post('/api/daily-words/import', { text: JSON.stringify([{ word: 'zz', transliteration: 'zz', meaning: 'm' }]) })).status, 200);
  await tick();
  const row = (await admin.get('/api/history?limit=5')).body.entries.find((e) => e.undo?.state === 'available');
  const r = await msgs.post(`/api/history/${row.undo.id}/undo`);
  assert.ok([403, 404].includes(r.status), String(r.status));
});
