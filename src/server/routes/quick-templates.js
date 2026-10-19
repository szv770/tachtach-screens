/**
 * /api/quick-templates — saved quick messages (templates with blanks).
 *
 * Mounted in app.js on /api after requireAuth + CSRF + enforceRole (which already
 * needs `announcements.post` for any write). Ownership (own vs shared) is enforced
 * again in ownedStore.js; a person only ever receives their own + shared ones.
 */
import { Router } from 'express';
import { store, getRecents, addRecents } from '../quickTemplatesStore.js';
import { StoreError } from '../ownedStore.js';
import { sanitizeTemplate, TemplateError, sortTemplates } from '../../shared/quickTemplates.js';

const router = Router();

function fail(res, err, what) {
  if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
  if (err instanceof TemplateError) return res.status(400).json({ error: err.message });
  console.error(`[quick-templates] ${what} error:`, err.message);
  return res.status(500).json({ error: `Failed to ${what}.` });
}

const withMine = (t, user) => ({ ...t, mine: t.ownerId != null && t.ownerId === user.id, shared: t.ownerId == null });

router.get('/quick-templates', async (req, res) => {
  try {
    const templates = sortTemplates(await store.list(req.user)).map((t) => withMine(t, req.user));
    res.json({ templates, recents: await getRecents(req.user) });
  } catch (err) { fail(res, err, 'read quick messages'); }
});

router.post('/quick-templates/recents', async (req, res) => {
  try { res.json({ recents: await addRecents(req.user, req.body?.values) }); } catch (err) { fail(res, err, 'save recent names'); }
});

router.post('/quick-templates/reorder', async (req, res) => {
  try {
    const list = await store.reorder(req.user, req.body?.ids);
    res.json({ templates: sortTemplates(list).map((t) => withMine(t, req.user)) });
  } catch (err) { fail(res, err, 'reorder quick messages'); }
});

router.post('/quick-templates', async (req, res) => {
  try {
    const data = sanitizeTemplate(req.body);
    const t = await store.create(req.user, data, { shared: req.body?.shared === true });
    res.status(201).json(withMine(t, req.user));
  } catch (err) { fail(res, err, 'save quick message'); }
});

router.put('/quick-templates/:id', async (req, res) => {
  try {
    const t = await store.update(req.user, req.params.id, sanitizeTemplate(req.body));
    res.json(withMine(t, req.user));
  } catch (err) { fail(res, err, 'save quick message'); }
});

router.delete('/quick-templates/:id', async (req, res) => {
  try {
    const t = await store.remove(req.user, req.params.id);
    res.json({ ok: true, template: withMine(t, req.user) });
  } catch (err) { fail(res, err, 'delete quick message'); }
});

export default router;
