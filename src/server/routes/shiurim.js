/**
 * /api/shiurim: the Shiurim and Guest speaker slides' data (docs/specs/06-SPEAKER-SHIURIM.md). Mounted on /api AFTER
 * requireAuth + csrfProtection + the mutation limiter, gated by the `shiurim.edit` capability (src/shared/permissions.js).
 * Granular writes (one person, one shiur, one guest, one day's change) so two people editing different things cannot
 * overwrite each other; every one runs under the store lock and ends in an SSE `shiurim-update`, so the TV follows at once.
 * Bodies are bounded (128 kB; import text 64 kB; photo 10 MB multipart on its own route). A route never takes a path or a file
 * name from the request: photo ids are server-made uuids, compared to what the document holds.
 */
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { shiurimStore } from '../shiurimStore.js';
import * as S from '../../shared/shiurim.js';
import { photoUpload, storePhoto, removePhoto, photoExists, MAX_BYTES } from '../speakerPhoto.js';
import { isClientError } from '../safeError.js';

const router = Router();
router.use('/shiurim', (req, res, next) => (req.path === '/photo' ? next() : express.json({ limit: '128kb' })(req, res, next)));

const perPerson = (name, windowMs, max, skip) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${name}:${req.user?.id || req.ip}`,
  skip: skip || (() => false),
  message: { error: 'Too many requests. Please wait a little.' },
  validate: false,
});
const importReal = perPerson('shiurim-import', 60 * 60 * 1000, 30, (req) => req.body?.dryRun === true);
const importDry = perPerson('shiurim-import-dry', 60 * 60 * 1000, 240, (req) => req.body?.dryRun !== true);
const guestPost = perPerson('shiurim-guest', 60 * 60 * 1000, 30);
const photoPost = perPerson('shiurim-photo', 60 * 60 * 1000, 40);

const fail = (res, e) => {
  if (e instanceof S.ShiurimError || isClientError(e)) return res.status(400).json({ error: e.message });
  return res.status(500).json({ error: 'The list could not be saved.' });
};
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

/** The document plus what the admin needs to draw itself: today, the schedule blocks to link to, the groups, what needs attention. */
async function view(file) {
  const [today, tz, schedule, scheduleDates, groups] = await Promise.all([shiurimStore.today(), shiurimStore.tz(), shiurimStore.schedule(), shiurimStore.scheduleDates(), shiurimStore.groups()]);
  const blocks = (schedule?.entries || []).filter((e) => e && e.enabled !== false).slice(0, 400)
    .map((e) => ({ id: e.id || '', name: String(e.name || ''), nameHe: String(e.nameHe || ''), days: e.days || null, time: e.time || '', endTime: e.endTime || '' }));
  const places = [...new Set([...(file.shiurim || []).map((s) => s.place), ...(file.guests || []).map((g) => g.place)].filter(Boolean))].slice(0, 20);
  // what the Today card shows: every shiur of the screen's own today, including ones the schedule removed or that were cancelled
  const todayRows = S.shiurimOn(file, today, { schedule, scheduleDates, groups, includeHidden: true })
    .map((r) => ({ id: r.id, start: r.start, end: r.end, cancelled: r.cancelled, reason: r.reason, moved: r.moved, linked: r.linked, note: r.note, place: r.place, placeHe: r.placeHe }));
  return { ...file, today, tz, blocks, groups, places, todayRows, attention: S.attention(file, schedule) };
}
const send = async (res, saved, extra = {}) => res.json({ ...(await view(saved)), ...extra });

/** A photo id in a body must be one this server made (the file exists); anything else is dropped. */
function checkPhoto(input) {
  if (!input || !('photo' in input) || input.photo == null) return input;
  const p = S.normalizePhoto(input.photo);
  if (!p || !photoExists(p.id)) throw new S.ShiurimError('That photo is not on the screen box any more. Add it again.');
  return { ...input, photo: p };
}

router.get('/shiurim', async (_req, res) => {
  try { res.json(await view(await shiurimStore.read())); } catch { res.status(500).json({ error: 'Could not read the list.' }); }
});

router.put('/shiurim/settings', async (req, res) => {
  try { await send(res, await shiurimStore.mutate(undefined, (f) => S.setSettings(f, body(req).settings))); } catch (e) { fail(res, e); }
});

// People (the rebbeim) ─ { name, nameHe, photo? }
router.post('/shiurim/people', async (req, res) => {
  try {
    const input = checkPhoto(body(req));
    const r = await shiurimStore.mutateWith(undefined, (f) => S.upsertPerson(f, input));
    await send(res, r.file, { id: r.id });
  } catch (e) { fail(res, e); }
});
router.put('/shiurim/people/:id', async (req, res) => {
  try { await send(res, (await shiurimStore.mutateWith(undefined, (f) => S.upsertPerson(f, checkPhoto(body(req)), req.params.id))).file); } catch (e) { fail(res, e); }
});
router.post('/shiurim/people/:id/move', async (req, res) => {
  try { await send(res, await shiurimStore.mutate(undefined, (f) => S.movePerson(f, req.params.id, Number(body(req).dir) < 0 ? -1 : 1))); } catch (e) { fail(res, e); }
});
router.delete('/shiurim/people/:id', async (req, res) => {
  try {
    const r = await shiurimStore.mutateWith(undefined, (f) => S.removePerson(f, req.params.id));
    await send(res, r.file, { removedShiurim: r.removedShiurim });
  } catch (e) { fail(res, e); }
});
router.delete('/shiurim/people/:id/photo', async (req, res) => {
  try { await dropPhoto(res, 'person', req.params.id); } catch (e) { fail(res, e); }
});

// Shiurim ─ { personId, title, titleHe, place, placeHe, when, groups, season, enabled, note }
router.post('/shiurim/shiurim', async (req, res) => {
  try {
    const r = await shiurimStore.mutateWith(undefined, (f) => S.upsertShiur(f, body(req)));
    await send(res, r.file, { id: r.id });
  } catch (e) { fail(res, e); }
});
router.put('/shiurim/shiurim/:id', async (req, res) => {
  try { await send(res, (await shiurimStore.mutateWith(undefined, (f) => S.upsertShiur(f, body(req), req.params.id))).file); } catch (e) { fail(res, e); }
});
router.delete('/shiurim/shiurim/:id', async (req, res) => {
  try { await send(res, await shiurimStore.mutate(undefined, (f) => S.removeShiur(f, req.params.id))); } catch (e) { fail(res, e); }
});

// Guest speakers
router.post('/shiurim/guests', guestPost, async (req, res) => {
  try {
    const input = checkPhoto(body(req));
    const r = await shiurimStore.mutateWith(undefined, (f) => S.upsertGuest(f, input));
    await send(res, r.file, { id: r.id });
  } catch (e) { fail(res, e); }
});
router.put('/shiurim/guests/:id', async (req, res) => {
  try { await send(res, (await shiurimStore.mutateWith(undefined, (f) => S.upsertGuest(f, checkPhoto(body(req)), req.params.id))).file); } catch (e) { fail(res, e); }
});
router.delete('/shiurim/guests/:id', async (req, res) => {
  try { await send(res, await shiurimStore.mutate(undefined, (f) => S.removeGuest(f, req.params.id))); } catch (e) { fail(res, e); }
});
router.delete('/shiurim/guests/:id/photo', async (req, res) => {
  try { await dropPhoto(res, 'guest', req.params.id); } catch (e) { fail(res, e); }
});

async function dropPhoto(res, kind, id) {
  const before = await shiurimStore.read();
  const old = (kind === 'guest' ? before.guests : before.people).find((x) => x.id === id)?.photo?.id;
  const saved = await shiurimStore.mutate(undefined, (f) => S.setPhoto(f, kind, id, null));
  // 'Remove photo' is one tap and final: the files go now (unless another record uses the same asset)
  if (old && !S.photoIds(saved).includes(old)) await removePhoto(old);
  await send(res, saved);
}

// Upload one photo: multipart field 'photo' -> { id }. It is only attached when a person/guest is saved with { photo: { id, focus } }.
router.post('/shiurim/photo', photoPost, (req, res, next) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `That picture is too big (the limit is ${MAX_BYTES / 1024 / 1024} MB).` });
    return res.status(400).json({ error: isClientError(err) ? err.message : 'Upload rejected.' });
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No picture was sent.' });
    res.status(201).json(await storePhoto(req.file.buffer));
  } catch (e) { fail(res, e); }
});

// Today card on the screen's own today: { op: 'cancel' | 'restore' | 'move' | 'note' | 'reset', shiurId, start?, end?, place?, note? }
router.post('/shiurim/today', async (req, res) => {
  try {
    const b = body(req);
    const a = { shiurId: String(b.shiurId ?? ''), start: b.start, end: b.end, place: typeof b.place === 'string' ? b.place : undefined, note: typeof b.note === 'string' ? b.note : undefined };
    await send(res, await shiurimStore.mutate(undefined, (f, today) => S.todayOp(f, today, String(b.op), a)));
  } catch (e) { fail(res, e); }
});

// Put records back (Undo): { upsert: { people, shiurim, guests, changes }, remove: { people, shiurim, guests } }
router.post('/shiurim/restore', async (req, res) => {
  try { await send(res, await shiurimStore.mutate(undefined, (f) => S.restoreRecords(f, { upsert: body(req).upsert, remove: body(req).remove }))); } catch (e) { fail(res, e); }
});

// Paste / spreadsheet import: { text | rows, mode?: 'replace'|'add', dryRun?: boolean }. The server parses again on apply.
router.post('/shiurim/import', importReal, importDry, async (req, res) => {
  try {
    const b = body(req);
    const [cur, schedule] = await Promise.all([shiurimStore.read(), shiurimStore.schedule()]);
    const parsed = S.parseShiurimInput({ text: typeof b.text === 'string' ? b.text : undefined, rows: Array.isArray(b.rows) ? b.rows : undefined }, cur, { schedule });
    const summary = { errors: parsed.errors, warnings: parsed.warnings, counts: parsed.counts, people: parsed.people.filter((p) => !p.existingId).map((p) => p.name || p.nameHe) };
    const first = parsed.errors[0];
    if (b.dryRun === true || first) return res.status(first && b.dryRun !== true ? 400 : 200).json({ ...summary, dryRun: b.dryRun === true, error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message}` : undefined });
    const saved = await shiurimStore.mutate(undefined, (f) => S.applyImport(f, parsed, { mode: b.mode === 'add' ? 'add' : 'replace' }));
    res.json({ ...summary, ...(await view(saved)) });
  } catch (e) { fail(res, e); }
});

export default router;
