/**
 * Saved Quick Announcement messages. GET returns the saved list (or the
 * built-in starters until someone first saves); PUT replaces the whole list.
 * Open to editors as well as admins (src/shared/permissions.js).
 */
import { Router } from 'express';
import { readJSON, writeJSON } from '../storage.js';
import { DEFAULT_QUICK_TEMPLATES, sanitizeTemplates } from '../../shared/quickTemplates.js';

const router = Router();
const FILE = 'quick-templates.json';

router.get('/quick-templates', async (_req, res) => {
  try {
    const saved = await readJSON(FILE).catch(() => null);
    res.json({ templates: Array.isArray(saved) ? sanitizeTemplates(saved) : DEFAULT_QUICK_TEMPLATES, isDefault: !Array.isArray(saved) });
  } catch (err) {
    console.error('[quick-templates] read:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/quick-templates', async (req, res) => {
  if (!Array.isArray(req.body?.templates)) return res.status(400).json({ error: 'Send { templates: [...] }.' });
  try {
    const templates = sanitizeTemplates(req.body.templates);
    await writeJSON(FILE, templates);
    res.json({ templates, isDefault: false });
  } catch (err) {
    console.error('[quick-templates] write:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
