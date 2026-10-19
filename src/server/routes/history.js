/**
 * History ("Recent changes") and Undo.
 *
 *   GET  /api/history            who did what lately (from the activity log), each row with its Undo state
 *   POST /api/history/:id/undo   put one change back
 *
 * Admins see everyone's changes. Anyone else sees their own plus changes to shared content
 * (announcements, slides, schedule...), never other people's settings. Undo goes through the undo
 * service, which only does anything for the whitelisted kinds, refuses when the thing has changed
 * since (409, plain message), and re-checks the person's capabilities (403). Both routes are open to
 * every signed-in role in permissions.js because the undo itself does that check per change.
 */
import { Router } from 'express';
import activity from '../activity.js';
import { visibleTo, UNDO_KINDS } from '../../shared/undo.js';

const router = Router();
const svc = async () => (await import('../undoRuntime.js')).undoService;

router.get('/history', async (req, res) => {
  try {
    const service = await svc();
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 100));
    const [entries, records] = await Promise.all([activity.list({ limit: 500 }), service.store.load()]);
    const byId = new Map(records.map((r) => [r.id, r]));
    const rows = entries.filter((e) => visibleTo(e, req.user)).slice(0, limit).map((e) => {
      let undo = null;
      if (e.undoId) {
        const rec = byId.get(e.undoId);
        if (!rec) undo = { state: 'expired' };
        else if (rec.used) undo = { id: rec.id, state: 'used', by: rec.used.by, at: rec.used.at };
        else {
          const p = service.permission(rec, req.user);
          undo = p.ok ? { id: rec.id, state: 'available' } : { id: rec.id, state: 'blocked', reason: p.reason };
        }
      }
      return { at: e.at, name: e.name, mine: !!e.userId && e.userId === req.user.id, action: e.action, detail: e.detail || '', area: e.area || null, undo };
    });
    res.set('Cache-Control', 'no-store');
    res.json({ entries: rows, scope: req.user.role === 'admin' ? 'everyone' : 'yours-and-shared' });
  } catch (err) {
    console.error('[history]', err.message);
    res.status(500).json({ error: 'Could not load recent changes.' });
  }
});

router.post('/history/:id/undo', async (req, res) => {
  try {
    const service = await svc();
    const rec = await service.store.get(String(req.params.id));
    // Someone else's settings change is as invisible here as in the list.
    if (!rec || !visibleTo({ userId: rec.userId, kind: rec.kind }, req.user) || !UNDO_KINDS[rec.kind]) {
      return res.status(404).json({ error: 'That change is too old to undo.' });
    }
    const done = await service.revert(rec.id, req.user);
    activity.record({ user: req.user, action: 'Undid a change', detail: done.label, area: UNDO_KINDS[done.kind].area }).catch(() => {});
    res.json({ ok: true, label: done.label });
  } catch (err) {
    if (err?.expose && err.status) return res.status(err.status).json({ error: err.message, code: err.name === 'UndoConflict' ? 'conflict' : undefined });
    console.error('[history] undo:', err.message);
    res.status(500).json({ error: 'Could not undo that. Nothing was changed.' });
  }
});

export default router;
