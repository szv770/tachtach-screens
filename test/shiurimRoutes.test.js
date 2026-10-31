// Shiurim routes + photo pipeline against a scratch data dir (TACHTACH_DATA_DIR), never the real data/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

let shared = null;
async function setup() {
  if (shared) { fs.rmSync(path.join(shared.dir, 'shiurim.json'), { force: true }); shared.events.length = 0; return shared; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-shiurim-'));
  process.env.TACHTACH_DATA_DIR = dir;
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ location: { timezone: 'America/New_York' }, scheduleGroups: [{ id: 'aleph', name: 'Aleph' }] }));
  fs.writeFileSync(path.join(dir, 'schedule.json'), JSON.stringify({ categories: [], entries: [
    { id: 'e1', name: 'Seder Chassidus', time: '10:00', endTime: '11:00', days: ['Mon', 'Tue'], enabled: true },
    { id: 'e2', name: 'Off block', time: '12:00', enabled: false },
  ] }));
  const express = (await import('express')).default;
  const router = await import('../src/server/routes/shiurim.js');
  const sse = await import('../src/server/sse.js');
  const events = [];
  sse.addClient({ writeHead() {}, setHeader() {}, flushHeaders() {}, write(c) { events.push(String(c)); return true; }, on() {}, end() {}, writableEnded: false }, false, false, null);
  const app = express();
  app.use('/api', router.default);
  const server = await new Promise((ok) => { const sv = app.listen(0, '127.0.0.1', () => ok(sv)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body, raw) => {
    const r = await fetch(base + p, raw ? { method, body: raw } : { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let json = null; try { json = JSON.parse(t); } catch { /* html error page */ }
    return { status: r.status, json, text: t };
  };
  const upload = async (buf, name = 'p.jpg', type = 'image/jpeg') => {
    const fd = new FormData();
    fd.append('photo', new Blob([buf], { type }), name);
    return call('POST', '/shiurim/photo', undefined, fd);
  };
  shared = { dir, server, call, upload, events };
  return shared;
}
test.after(async () => { if (shared) await new Promise((ok) => shared.server.close(ok)); delete process.env.TACHTACH_DATA_DIR; });

const jpeg = (w = 1200, h = 900, withExif = false) => {
  let s = sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg();
  if (withExif) s = s.withExif({ IFD0: { Copyright: 'secret-owner' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 0/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '74/1 0/1 0/1' } });
  return s.toBuffer();
};

test('routes: people, shiurim, guests, settings, validation, SSE, disk document', async () => {
  const { dir, call, events } = await setup();
  let r = await call('GET', '/shiurim');
  assert.equal(r.status, 200); assert.deepEqual(r.json.people, []); assert.match(r.json.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.json.blocks.length, 1, 'only switched-on schedule blocks can be linked'); assert.equal(r.json.groups[0].id, 'aleph');
  assert.ok(!fs.existsSync(path.join(dir, 'shiurim.json')), 'a read writes nothing');

  r = await call('POST', '/shiurim/people', { name: 'Rabbi Sample', nameHe: 'הרב לדוגמה' });
  assert.equal(r.status, 200); const pid = r.json.id; assert.ok(pid);
  assert.equal((await call('POST', '/shiurim/people', { name: '  ' })).status, 400);
  assert.equal((await call('PUT', '/shiurim/people/ghost', { name: 'x' })).status, 400);

  r = await call('POST', '/shiurim/shiurim', { personId: pid, title: 'Gemara', place: 'Beis Medrash', when: { kind: 'weekly', days: ['Tue', 'Sun'], start: '20:15', end: '21:00' } });
  assert.equal(r.status, 200); const sid = r.json.id;
  assert.deepEqual(r.json.shiurim[0].when.days, ['Sun', 'Tue']);
  r = await call('POST', '/shiurim/shiurim', { personId: pid, title: 'Chassidus', when: { kind: 'linked', entryId: 'e1', entryName: 'Seder Chassidus' } });
  assert.equal(r.status, 200); const lid = r.json.id; assert.deepEqual(r.json.attention, []);
  r = await call('PUT', `/shiurim/shiurim/${lid}`, { when: { kind: 'linked', entryId: 'zzz-deleted', entryName: 'Gone block' } });
  assert.equal(r.json.attention[0].kind, 'gone', 'a link to a deleted block is flagged');
  assert.equal((await call('POST', '/shiurim/shiurim', { personId: pid, title: 'Bad', when: { kind: 'weekly', days: [], start: '08:00' } })).status, 400);
  assert.equal((await call('POST', '/shiurim/shiurim', { personId: 'ghost', title: 'Bad', when: { kind: 'weekly', days: ['Sun'], start: '08:00' } })).status, 400);
  assert.equal((await call('POST', '/shiurim/shiurim', { title: 'No time', when: { kind: 'weekly', days: ['Sun'] } })).status, 400);

  r = await call('POST', '/shiurim/guests', { name: 'Rabbi Guest', date: '2026-11-05', start: '20:15', end: '21:15', place: 'Zal', takeover: { on: true, minutes: 10 }, link: 'https://example.org/x' });
  assert.equal(r.status, 200); const gid = r.json.id;
  assert.equal((await call('POST', '/shiurim/guests', { name: 'X', date: '2026-11-05', link: 'http://insecure.example.org' })).status, 400);
  assert.equal((await call('POST', '/shiurim/guests', { name: 'X', date: 'nope' })).status, 400);
  r = await call('PUT', `/shiurim/guests/${gid}`, { topic: 'Emunah', banner: true });
  assert.equal(r.json.guests[0].topic, 'Emunah'); assert.equal(r.json.guests[0].place, 'Zal', 'a change keeps the rest');

  r = await call('PUT', '/shiurim/settings', { settings: { view: 'week', guestLeadDays: 5, past: 'hide', bogus: 1 } });
  assert.equal(r.json.settings.view, 'week'); assert.equal(r.json.settings.guestLeadDays, 5); assert.equal(r.json.settings.bogus, undefined);
  assert.equal((await call('PUT', '/shiurim/settings', { settings: { hoursFrom: 'noon' } })).status, 400);
  assert.equal((await call('PUT', '/shiurim/settings', {})).status, 400);

  r = await call('POST', `/shiurim/people/${pid}/move`, { dir: -1 }); assert.equal(r.status, 200);
  r = await call('DELETE', `/shiurim/shiurim/${lid}`); assert.equal(r.json.shiurim.length, 1);
  assert.equal((await call('DELETE', `/shiurim/shiurim/${lid}`)).status, 400, 'already gone');

  // the Undo path: put records back
  r = await call('DELETE', `/shiurim/people/${pid}`); assert.equal(r.json.removedShiurim, 1); assert.equal(r.json.people.length, 0);
  r = await call('POST', '/shiurim/restore', { upsert: { people: [{ id: pid, name: 'Rabbi Sample' }], shiurim: [{ id: sid, personId: pid, title: 'Gemara', when: { kind: 'weekly', days: ['Sun'], start: '20:15' } }] } });
  assert.equal(r.json.people.length, 1); assert.equal(r.json.shiurim.length, 1); assert.equal(r.json.guests.length, 1, 'only the records asked for are touched');

  // every save went out as shiurim-update, small, with no staff ids
  const sent = events.join('');
  assert.match(sent, /shiurim-update/); assert.doesNotMatch(sent, /createdBy|userId|archivedAt/);
  const disk = JSON.parse(fs.readFileSync(path.join(dir, 'shiurim.json'), 'utf8'));
  assert.equal(disk.version, 1); assert.equal(disk.shiurim[0].id, sid);
});

test('today card: cancel / move / restore apply to the screen\'s own today, instant SSE', async () => {
  const { call, events } = await setup();
  let r = await call('POST', '/shiurim/people', { name: 'R' }); const pid = r.json.id;
  r = await call('POST', '/shiurim/shiurim', { personId: pid, title: 'T', when: { kind: 'weekly', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'], start: '09:00' } }); const sid = r.json.id;
  const today = r.json.today;
  events.length = 0;
  r = await call('POST', '/shiurim/today', { op: 'cancel', shiurId: sid });
  assert.equal(r.status, 200); assert.equal(r.json.changes[today][sid].cancelled, true); assert.equal(r.json.changes[today][sid].note, 'Cancelled today');
  assert.match(events.join(''), new RegExp(`"cancelled":true`), 'the TV hears it at once');
  r = await call('POST', '/shiurim/today', { op: 'move', shiurId: sid, start: '15:30', end: '16:00', place: 'Zal' });
  assert.equal(r.json.changes[today][sid].start, '15:30'); assert.ok(!r.json.changes[today][sid].cancelled);
  r = await call('POST', '/shiurim/today', { op: 'reset', shiurId: sid }); assert.deepEqual(r.json.changes, {});
  assert.equal((await call('POST', '/shiurim/today', { op: 'cancel', shiurId: 'ghost' })).status, 400);
  assert.equal((await call('POST', '/shiurim/today', { op: 'nope', shiurId: sid })).status, 400);
  // a body cannot pick the date: only the server's today is ever changed
  r = await call('POST', '/shiurim/today', { op: 'cancel', shiurId: sid, date: '2020-01-01' });
  assert.deepEqual(Object.keys(r.json.changes), [today]);
});

test('photos: sniffed type, re-encoded (EXIF/GPS gone), bounded size, random names, attach checks, remove deletes files', async () => {
  const { dir, call, upload } = await setup();
  const raw = await jpeg(3000, 2000, true);
  assert.ok((await sharp(raw).metadata()).exif, 'the test picture carries EXIF + GPS');
  let r = await upload(raw);
  assert.equal(r.status, 201); const id = r.json.id;
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'a random id, no original file name');
  const full = path.join(dir, 'uploads', `spk-${id}.jpg`), thumb = path.join(dir, 'uploads', `spk-${id}-t.jpg`);
  assert.ok(fs.existsSync(full) && fs.existsSync(thumb));
  const mf = await sharp(full).metadata(), mt = await sharp(thumb).metadata();
  assert.equal(mf.format, 'jpeg'); assert.ok(Math.max(mf.width, mf.height) <= 800 && Math.max(mf.width, mf.height) >= 700, 'longest side 800');
  assert.ok(Math.max(mt.width, mt.height) <= 160);
  assert.equal(mf.exif, undefined, 'EXIF (and so GPS) removed'); assert.equal(mf.icc, undefined);
  assert.equal(fs.readFileSync(full).includes('secret-owner'), false);
  // a PNG becomes a JPEG; a WebP works
  r = await upload(await sharp({ create: { width: 200, height: 300, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).png().toBuffer(), 'x.png', 'image/png'); assert.equal(r.status, 201);
  r = await upload(await sharp({ create: { width: 200, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer(), 'x.webp', 'image/webp'); assert.equal(r.status, 201);
  // the type comes from the bytes, not the label: a text file called .jpg, GIF, SVG, PDF, empty, truncated
  assert.equal((await upload(Buffer.from('hello this is not a picture at all'), 'x.jpg')).status, 400);
  assert.equal((await upload(await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer(), 'x.jpg', 'image/jpeg')).status, 400, 'GIF refused even when labelled jpeg');
  assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>1</script></svg>'), 'x.svg', 'image/svg+xml')).status, 400);
  assert.equal((await upload(Buffer.from('%PDF-1.4 fake pdf content here'), 'x.pdf', 'application/pdf')).status, 400);
  assert.equal((await upload(Buffer.alloc(0))).status, 400);
  assert.equal((await upload((await jpeg(400, 400)).subarray(0, 300))).status, 400, 'a truncated picture is not stored');
  assert.equal((await call('POST', '/shiurim/photo', undefined, new FormData())).status, 400, 'no picture sent');
  // size limit
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(11 * 1024 * 1024, 1)]);
  assert.equal((await upload(big)).status, 413);
  // a decompression bomb (huge dimensions) is refused, not decoded
  const bomb = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
  assert.equal((await upload(bomb, 'b.png', 'image/png')).status, 400);
  // no stray files from the failures
  const stored = fs.readdirSync(path.join(dir, 'uploads')).filter((f) => f.startsWith('spk-'));
  assert.equal(stored.length, 6, 'three accepted pictures x (full + thumb)');

  // attach: only an id this server made (the file exists)
  r = await call('POST', '/shiurim/people', { name: 'Rabbi Photo', photo: { id, focus: 'center' } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.people[0].photo, { id, focus: 'center' }); const pid = r.json.id;
  assert.equal((await call('POST', '/shiurim/people', { name: 'Ghost photo', photo: { id: '0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11' } })).status, 400, 'no such file');
  assert.equal((await call('POST', '/shiurim/people', { name: 'Traversal', photo: { id: '../../settings' } })).status, 400);
  assert.equal((await call('POST', '/shiurim/guests', { name: 'G', date: '2026-11-05', photo: { id: '../x' } })).status, 400);
  // the guest and the person can share one asset; removing one photo keeps the files while the other still uses them
  r = await call('POST', '/shiurim/guests', { name: 'G', date: '2026-11-05', photo: { id } }); const gid = r.json.id;
  r = await call('DELETE', `/shiurim/guests/${gid}/photo`); assert.equal(r.json.guests[0].photo, null);
  assert.ok(fs.existsSync(full), 'still used by the person');
  r = await call('DELETE', `/shiurim/people/${pid}/photo`); assert.equal(r.json.people[0].photo, null);
  assert.ok(!fs.existsSync(full) && !fs.existsSync(thumb), 'Remove photo is final: both files are deleted');
  assert.equal((await call('DELETE', '/shiurim/people/ghost/photo')).status, 400);
});

test('the daily clean-up keeps photos a person or guest points at (and only those)', async () => {
  const { dir, call, upload } = await setup();
  const keep = (await upload(await jpeg(300, 300))).json.id;
  const orphan = (await upload(await jpeg(300, 300))).json.id;
  await call('POST', '/shiurim/people', { name: 'Keeper', photo: { id: keep } });
  const { shiurimPhotoIds } = await import('../src/server/shiurimStore.js');
  assert.deepEqual(await shiurimPhotoIds(), [keep]);
  const { isFileReferenced } = await import('../src/shared/uploadRefs.js');
  const { photoFile } = await import('../src/shared/shiurim.js');
  const refs = new Set((await shiurimPhotoIds()).map((id) => photoFile(id).replace(/\.jpg$/, '')));
  assert.equal(isFileReferenced(`spk-${keep}.jpg`, refs), true); assert.equal(isFileReferenced(`spk-${keep}-t.jpg`, refs), true);
  assert.equal(isFileReferenced(`spk-${orphan}.jpg`, refs), false);
  assert.ok(fs.existsSync(path.join(dir, 'uploads', `spk-${orphan}.jpg`)));
});

test('import: dry run counts and warnings, errors with the line, schedule link, replace/add, rate limit on real imports', async () => {
  const { dir, call } = await setup();
  const text = ['# TachTach shiurim v1', 'Rabbi Sample | Gemara | Zal | Sun, Tue | 8:15 PM - 9:00 PM', 'Rabbi Other | Halacha | Room 4 | Mon-Thu | 1:30 - 2:00', 'Rabbi L | Chassidus | Zal | schedule: Seder Chassidus'].join('\n');
  let r = await call('POST', '/shiurim/import', { text, dryRun: true });
  assert.equal(r.status, 200); assert.equal(r.json.counts.shiurim, 3); assert.equal(r.json.counts.newPeople, 3); assert.equal(r.json.warnings.length, 1, 'a bare 1:30 is assumed to be PM, and says so'); assert.deepEqual(r.json.errors, []);
  assert.ok(!fs.existsSync(path.join(dir, 'shiurim.json')), 'a dry run saves nothing');
  r = await call('POST', '/shiurim/import', { text: 'Rabbi A | G | Z | Sun | 8:15 PM\nRabbi B | G | Z | Someday | 8:15 PM' });
  assert.equal(r.status, 400); assert.match(r.json.error, /^Line 2: could not read the days/);
  assert.ok(!fs.existsSync(path.join(dir, 'shiurim.json')), 'all or nothing');
  r = await call('POST', '/shiurim/import', { text: 'R | G | Z | schedule: No such block' }); assert.equal(r.status, 400); assert.match(r.json.error, /no schedule block/);
  r = await call('POST', '/shiurim/import', { text });
  assert.equal(r.status, 200); assert.equal(r.json.shiurim.length, 3); assert.equal(r.json.people.length, 3);
  assert.equal(r.json.shiurim.find((s) => s.title === 'Chassidus').when.entryId, 'e1');
  r = await call('POST', '/shiurim/import', { text: 'Rabbi Sample | Gemara | Zal | Sun, Tue | 8:15 PM - 9:00 PM\nRabbi New | New | Zal | Fri | 9:00 AM', mode: 'add' });
  assert.equal(r.json.shiurim.length, 4, 'the identical one is skipped'); assert.equal(r.json.people.length, 4);
  r = await call('POST', '/shiurim/import', { rows: [['Rebbe', 'Shiur', 'Place', 'Days', 'Time'], ['Rabbi Sheet', 'Mishna', 'Zal', 'Sun', '9:00 AM']], mode: 'replace' });
  assert.equal(r.json.shiurim.length, 1);
  r = await call('POST', '/shiurim/import', { text: 'x'.repeat(70 * 1024) });
  assert.equal(r.status, 400); assert.match(r.json.error, /too long/);
  // real imports are rate limited per person (30 an hour); dry runs have their own, larger budget
  let limited = 0;
  for (let i = 0; i < 40; i++) { const x = await call('POST', '/shiurim/import', { text: 'Rabbi Sheet | Mishna | Zal | Sun | 9:00 AM', mode: 'add' }); if (x.status === 429) limited++; }
  assert.ok(limited >= 5, `got ${limited} 429s`);
  for (let i = 0; i < 20; i++) assert.equal((await call('POST', '/shiurim/import', { text, dryRun: true })).status, 200);
});

test('limits: body size, the 256 kB document, guest post rate; ids never become paths (isolation stub)', async () => {
  const { dir, call } = await setup();
  const huge = await call('POST', '/shiurim/people', { name: 'x', pad: 'y'.repeat(200 * 1024) });
  assert.equal(huge.status, 413);
  // the document refuses to grow past 256 kB (filled through the Undo route, which is not rate limited)
  const guest = (i) => ({ id: `g_fill${i}`, name: `Guest ${i}`, nameHe: 'ש'.repeat(60), title: 'T'.repeat(60), titleHe: 'ת'.repeat(60), topic: 'x'.repeat(100), topicHe: 'נ'.repeat(100), bio: 'b'.repeat(200), bioHe: 'ב'.repeat(200), place: 'p'.repeat(60), placeHe: 'פ'.repeat(60), date: '2026-12-01', link: `https://example.org/${'a'.repeat(150)}` });
  const shiur = (i) => ({ id: `s_fill${i}`, title: 'T'.repeat(60), titleHe: 'ת'.repeat(60), place: 'p'.repeat(60), placeHe: 'פ'.repeat(60), note: 'n'.repeat(80), when: { kind: 'weekly', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'], start: '08:00', end: '09:00' }, season: { from: '2026-11-01', until: '2027-03-01' }, groups: ['aleph'] });
  let last = null;
  for (let chunk = 0; chunk < 6 && (!last || last.status === 200); chunk++) {
    const guests = chunk < 2 ? Array.from({ length: 50 }, (_, i) => guest(chunk * 50 + i)) : [];
    const shiurim = chunk >= 2 ? Array.from({ length: 80 }, (_, i) => shiur((chunk - 2) * 80 + i)) : [];
    last = await call('POST', '/shiurim/restore', { upsert: { guests, shiurim } });
  }
  assert.equal(last.status, 400); assert.match(last.json.error, /too big/);
  assert.ok(fs.statSync(path.join(dir, 'shiurim.json')).size <= 256 * 1024, 'nothing past the cap was written');
  // per-person guest post budget (30 an hour)
  let limited = 0;
  for (let i = 0; i < 40; i++) if ((await call('POST', '/shiurim/guests', { name: 'Rate', date: '2026-12-01' })).status === 429) limited++;
  assert.ok(limited >= 5, `got ${limited} 429s`);
  // isolation: ids from the URL are only compared to ids in the document, never used as a path or key
  for (const bad of ['..%2F..%2Fsettings', '%2e%2e', 'a'.repeat(200), '__proto__', 'constructor']) {
    const no = (st) => [400, 404].includes(st); // refused: a bad id is either 'not in the list' or no route at all, never a success
    assert.ok(no((await call('PUT', `/shiurim/people/${bad}`, { name: 'x' })).status), bad);
    assert.ok(no((await call('DELETE', `/shiurim/shiurim/${bad}`)).status), bad);
    assert.ok(no((await call('PUT', `/shiurim/guests/${bad}`, { name: 'x', date: '2026-12-01' })).status), bad);
    assert.ok(no((await call('DELETE', `/shiurim/guests/${bad}/photo`)).status), bad);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).location.timezone, 'America/New_York', 'nothing outside shiurim.json was touched');
});
