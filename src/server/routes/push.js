/**
 * Phone alerts (web push) — subscribe / unsubscribe / test. Every signed-in
 * role may manage their own phone; see src/server/push.js.
 */
import { Router } from 'express';
import { getPublicKey, validSubscription, subscribe, unsubscribe, subscriptionCount, sendPush } from '../push.js';

const router = Router();

router.get('/push/status', async (req, res) => {
  try {
    res.json({ publicKey: await getPublicKey(), count: await subscriptionCount(req.user.id) });
  } catch (err) {
    console.error('[push] status:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/push/subscribe', async (req, res) => {
  const sub = req.body?.subscription;
  if (!validSubscription(sub)) return res.status(400).json({ error: 'Not a valid push subscription.' });
  try {
    await subscribe(req.user.id, sub, req.get('user-agent'));
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] subscribe:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/push/unsubscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Missing endpoint.' });
  try {
    await unsubscribe(req.user.id, endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] unsubscribe:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/push/test', async (req, res) => {
  try {
    const r = await sendPush(
      { title: 'ת"ח ת"ח', body: 'Alerts are working on this phone.', tag: 'push-test' },
      { userId: req.user.id },
    );
    if (!r.total) return res.status(400).json({ error: 'This phone is not subscribed yet.' });
    res.json(r);
  } catch (err) {
    console.error('[push] test:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
