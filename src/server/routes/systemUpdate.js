/**
 * Software update (admin only). The only thing a POST here can do is drop data/update-request.json
 * after the admin has proved who they are AGAIN (password, plus a 2-step code when they have 2-step);
 * a root-owned systemd path unit does the rest (see src/server/systemUpdate.js, deploy/run-update.sh).
 *
 * Gating, strictest first: requireAuth + CSRF + enforceRole (capability `system.update`, adminOnly so
 * it can never be granted) + this router's own admin check + fresh password/2-step + lockout counters
 * + one request per 5 minutes.
 */
import { Router } from 'express';
import realUsers from '../users.js';
import realActivity from '../activity.js';
import * as realSvc from '../systemUpdate.js';
import { UPDATE_ACTIONS } from '../../shared/systemUpdate.js';
import { updateNotInstalledMessage } from '../platform.js';

const GUESS_LIMIT = { max: 6, lockMs: 15 * 60 * 1000 };
// Same counters as "change my password" / "turn off 2-step", so the guesses add up across both.
const guessKey = (req, what) => `user:${req.user.username}|${what}`;
const TOO_MANY = { error: 'Too many wrong tries. Please wait a few minutes.' };

/** The router, with its collaborators injectable so the rules can be tested without a real Pi. */
export function createSystemUpdateRouter({ users = realUsers, activity = realActivity, svc = realSvc } = {}) {
  const { getUpdateInfo, getUpdateStatus, installedInfo, checkRequestAllowed, noteRequest, writeRequestFile } = svc;
  const router = Router();

router.use('/system', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Your role can’t do that. Ask an admin.' });
});

router.get('/system/update', async (req, res) => {
  try {
    res.json(await getUpdateInfo({ refresh: req.query.refresh === '1' }));
  } catch (e) {
    console.error('[update] GET:', e.message);
    res.status(500).json({ error: 'Could not read the update information.' });
  }
});

/** No git, no network: what the banner and the "Updating..." screen poll. */
router.get('/system/update/status', (_req, res) => {
  try { res.json(getUpdateStatus()); } catch (e) { res.status(500).json({ error: 'Could not read the update status.' }); }
});

router.post('/system/update', async (req, res) => {
  try {
    const { action, password, code } = req.body || {};
    if (typeof action !== 'string' || !UPDATE_ACTIONS.includes(action)) return res.status(400).json({ error: 'Unknown action.' });
    if (!installedInfo()) {
      return res.status(409).json({ error: updateNotInstalledMessage(), code: 'not_installed' });
    }
    const me = await users.getUser(req.user.id);
    if (!me || me.role !== 'admin') return res.status(403).json({ error: 'Your role can’t do that. Ask an admin.' });

    // Check the cheap, no-guess rules first so a busy Pi does not eat password attempts.
    const gate = checkRequestAllowed();
    if (!gate.ok) return res.status(429).json({ error: gate.reason, code: 'rate_limited', waitMs: gate.waitMs });

    // Fresh password.
    if (!me.passwordHash) return res.status(400).json({ error: 'Set a password under My account first.' });
    if (await users.isLocked(guessKey(req, 'password'))) return res.status(429).json(TOO_MANY);
    if (typeof password !== 'string' || !password || !(await users.verifyLogin(me.username, password))) {
      await users.recordFailure(guessKey(req, 'password'), GUESS_LIMIT);
      return res.status(400).json({ error: 'That password isn’t right.', code: 'bad_password' });
    }
    // Fresh 2-step code when this admin has 2-step.
    if (me.totpEnabled) {
      if (await users.isLocked(guessKey(req, '2fa'))) return res.status(429).json(TOO_MANY);
      if (typeof code !== 'string' || !(await users.verifyTotp(me.id, code))) {
        await users.recordFailure(guessKey(req, '2fa'), GUESS_LIMIT);
        return res.status(400).json({ error: 'That 6-digit code isn’t right. Use a fresh one from your authenticator app.', code: 'bad_code' });
      }
    }
    await users.clearFailures(guessKey(req, 'password'));
    await users.clearFailures(guessKey(req, '2fa'));

    // A second tab could have got here first while we were checking.
    const again = checkRequestAllowed();
    if (!again.ok) return res.status(429).json({ error: again.reason, code: 'rate_limited', waitMs: again.waitMs });

    writeRequestFile({ action, by: req.user.name });
    noteRequest();
    activity.record({
      user: req.user, area: 'system',
      action: action === 'rollback' ? 'Rolled back the software to the earlier version' : 'Started a software update',
      detail: 'From the admin Health page',
    }).catch(() => {});
    res.status(202).json({ requested: true, action });
  } catch (e) {
    console.error('[update] POST:', e.message);
    res.status(500).json({ error: 'Could not start the update.' });
  }
});

  return router;
}

export default createSystemUpdateRouter();
