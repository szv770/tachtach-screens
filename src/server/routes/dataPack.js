/**
 * /api/system/data-pack: the admin's door to the offline data pack (Health page card). ADMIN ONLY: it sits in the
 * `/api/system` area, which `enforceRole` already limits to the `system.update` capability (adminOnly), and this router
 * checks `req.user.role === 'admin'` again. Mounted after requireAuth + CSRF + the mutation limiter.
 *
 *   GET    /            what is installed (covers until, days left, warning level, per-section notes, coverage gaps) + the build job
 *   POST   /upload      a pack file ({kind:'tachtach-data-pack', files}) as the raw request body; verified, then swapped in atomically
 *   GET    /download    the installed pack as one file (to carry to another box)
 *   POST   /build       start "Build / refresh on this Pi" in the background ({months?: 14-24})
 *   POST   /build/cancel
 *
 * The upload can only ever write the allow-listed pack file names into the pack folder (src/shared/dataPackBuild.js
 * verifyPackFiles), after the manifest checksums and every file's format check out; nothing is executed.
 */
import express, { Router } from 'express';
import { gunzipSync } from 'zlib';
import { packStatus, installPackFiles, readPackFiles } from '../dataPackStore.js';
import { unbundlePack, bundlePack } from '../../shared/dataPackBuild.js';
import { jobStatus, startJob, cancelJob, BUILD_MONTHS } from '../packJob.js';
import { readJSON } from '../storage.js';
import { dataSourceOf } from '../../shared/localData.js';

export const MAX_UPLOAD = 24 * 1024 * 1024;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** The router; `afterInstall` runs once a pack is in place (the server refreshes today's cache there). */
export function createDataPackRouter({ afterInstall = async () => {} } = {}) {
  const router = Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    return req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Your role can’t do that. Ask an admin.' });
  });

  router.get('/', async (_req, res) => {
    try {
      const settings = (await readJSON('settings.json').catch(() => null)) || {};
      res.json({ pack: await packStatus(todayISO()), job: jobStatus(), dataSource: dataSourceOf(settings), months: BUILD_MONTHS });
    } catch (e) {
      console.error('[data-pack] GET:', e.message);
      res.status(500).json({ error: 'Could not read the data pack status.' });
    }
  });

  router.post('/upload', express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
    try {
      if (jobStatus().running) return res.status(409).json({ error: 'A build is running. Wait for it to finish or stop it first.' });
      let raw = req.body;
      if (!Buffer.isBuffer(raw) || !raw.length) return res.status(400).json({ error: 'Choose a data pack file to upload.' });
      if (raw[0] === 0x1f && raw[1] === 0x8b) { // .gz
        try { raw = gunzipSync(raw, { maxOutputLength: MAX_UPLOAD * 2 }); } catch { return res.status(400).json({ error: 'That file could not be unzipped.' }); }
      }
      const { files, error } = unbundlePack(raw.toString('utf-8'));
      if (error) return res.status(400).json({ error });
      try { await installPackFiles(files); } catch (e) {
        if (e.status === 400) return res.status(400).json({ error: `That data pack is not valid: ${e.message}`, errors: e.errors });
        throw e;
      }
      await afterInstall({ source: 'upload' });
      res.json({ ok: true, pack: await packStatus(todayISO()) });
    } catch (e) {
      console.error('[data-pack] upload:', e.message);
      res.status(500).json({ error: 'Could not install the data pack.' });
    }
  });

  router.get('/download', async (_req, res) => {
    try {
      const files = await readPackFiles();
      if (!files) return res.status(404).json({ error: 'No data pack is installed.' });
      res.set({ 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="tachtach-data-pack.json"' }).send(bundlePack(files));
    } catch (e) {
      res.status(500).json({ error: 'Could not read the data pack.' });
    }
  });

  router.post('/build', express.json({ limit: '2kb' }), (req, res) => {
    try {
      const months = req.body?.months;
      if (months !== undefined && !(Number.isFinite(Number(months)) && Number(months) >= BUILD_MONTHS.min && Number(months) <= BUILD_MONTHS.max)) {
        return res.status(400).json({ error: `Months must be between ${BUILD_MONTHS.min} and ${BUILD_MONTHS.max}.` });
      }
      const r = startJob({ months });
      if (!r.started) return res.status(409).json({ error: r.reason });
      r.done.then(() => afterInstall({ source: 'build' })).catch(() => {});
      res.status(202).json({ ok: true, job: jobStatus() });
    } catch (e) {
      console.error('[data-pack] build:', e.message);
      res.status(500).json({ error: 'Could not start the build.' });
    }
  });

  router.post('/build/cancel', (_req, res) => res.json({ ok: true, cancelled: cancelJob(), job: jobStatus() }));

  return router;
}

export default createDataPackRouter;
