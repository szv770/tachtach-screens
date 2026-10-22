/**
 * /api/chazan — the chazan rotation (data/chazan.json, rules in src/shared/chazan.js).
 *
 * Mounted in app.js on /api AFTER requireAuth + csrfProtection + the mutation limiter, gated by the `chazan.edit`
 * capability (src/shared/permissions.js). Every write is validated by the shared normaliser and broadcasts SSE
 * `chazan-update` (state + names + computed days) for the kiosk and the live preview.
 *   GET    /chazan                    state + names + computed forecast
 *   GET    /chazan/swap-options       ?date=&tefila=  who is due, who the fill rule suggests, who could cover
 *   PUT    /chazan/settings           settings (grid, switches, fill rule, display)
 *   PUT    /chazan/order              { order: [ids], next?: id, addAll?: true }
 *   POST   /chazan/swap               { date, tefila, personId }
 *   DELETE /chazan/swap               ?date=&tefila=  (or the same in a JSON body)
 *   PUT    /chazan/away               { personId, from, to|null } | { personId, back: true } | { personId, clear: true }
 *   PUT    /chazan/can                { personId, tefilos: [...] }  (all three or none = can lead everything)
 */
import express, { Router } from 'express';
import { readView, mutate, buildView, FORECAST_DAYS } from '../chazanStore.js';
import {
  normalizeSettings, setOrder, setSwap, clearSwap, setAway, setBack, clearAway, setCan, swapOptions, isISO, TEFILOS, addDays, LIMITS,
} from '../../shared/chazan.js';

const router = Router();
router.use('/chazan', express.json({ limit: '64kb' }));

const err = (res, code, msg) => res.status(code).json({ error: msg });
const ID = /^[A-Za-z0-9_-]{4,40}$/;
const out = (r) => ({ ...r.view, roster: r.ctx.roster.people.map(({ id, first, last, he }) => ({ id, first, last, ...(he ? { he } : {}) })) });
const onRoster = (ctx, id) => typeof id === 'string' && ID.test(id) && ctx.roster.people.some((p) => p.id === id);

router.get('/chazan', async (_req, res) => {
  try { res.json(out(await readView())); } catch { err(res, 500, 'Failed to read the chazan rotation.'); }
});

router.get('/chazan/swap-options', async (req, res) => {
  try {
    const { date, tefila } = req.query;
    if (!isISO(date) || !TEFILOS.includes(tefila)) return err(res, 400, 'Pick a date and a davening.');
    const { state, ctx } = await readView();
    const o = swapOptions(state, date, tefila, ctx.customDays);
    res.json({ ...o, fill: o.rule }); // fill = the rule that applies to THIS slot (a published slot always uses 'furthest')
  } catch { err(res, 500, 'Failed to work out the options.'); }
});

router.put('/chazan/settings', async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return err(res, 400, 'Settings must be an object.');
    res.json(out(await mutate((s) => ({ ...s, settings: normalizeSettings({ ...s.settings, ...body }) }))));
  } catch { err(res, 500, 'Failed to save the settings.'); }
});

router.put('/chazan/order', async (req, res) => {
  try {
    const { order, next, addAll } = req.body || {};
    if (!addAll && !Array.isArray(order)) return err(res, 400, 'order must be a list.');
    if (Array.isArray(order) && order.length > LIMITS.order) return err(res, 400, `The line can hold ${LIMITS.order} people.`);
    if (next !== undefined && next !== null && !(typeof next === 'string' && ID.test(next))) return err(res, 400, 'Bad person.');
    res.json(out(await mutate((s, ctx) => {
      const ok = new Set(ctx.roster.people.map((p) => p.id));
      let list = Array.isArray(order) ? order.filter((id) => ok.has(id)) : [...s.order];
      if (addAll) list = [...list, ...ctx.roster.people.map((p) => p.id).filter((id) => !list.includes(id))];
      return setOrder(s, list, next && ok.has(next) ? next : null);
    })));
  } catch { err(res, 500, 'Failed to save the order.'); }
});

router.post('/chazan/swap', async (req, res) => {
  try {
    const { date, tefila, personId } = req.body || {};
    if (!isISO(date) || !TEFILOS.includes(tefila)) return err(res, 400, 'Pick a date and a davening.');
    let refused = '';
    const r = await mutate((s, ctx) => {
      if (date < s.cursor) { refused = 'That day has already passed.'; return s; }
      if (!onRoster(ctx, personId) || !s.order.includes(personId)) { refused = 'That person is not in the rotation.'; return s; }
      return setSwap(s, date, tefila, personId);
    });
    if (refused) return err(res, 400, refused);
    res.json(out(r));
  } catch { err(res, 500, 'Failed to save the swap.'); }
});

router.delete('/chazan/swap', async (req, res) => {
  try {
    const date = req.query.date ?? req.body?.date;
    const tefila = req.query.tefila ?? req.body?.tefila;
    if (!isISO(date) || !TEFILOS.includes(tefila)) return err(res, 400, 'Pick a date and a davening.');
    res.json(out(await mutate((s) => clearSwap(s, date, tefila))));
  } catch { err(res, 500, 'Failed to undo the swap.'); }
});

router.put('/chazan/away', async (req, res) => {
  try {
    const { personId, from, to, back, clear } = req.body || {};
    if (!(typeof personId === 'string' && ID.test(personId))) return err(res, 400, 'Pick a person.');
    if (!back && !clear) {
      if (!isISO(from)) return err(res, 400, 'Pick the first day he is away.');
      if (to !== null && to !== undefined && to !== '' && (!isISO(to) || to < from)) return err(res, 400, 'The last day cannot be before the first.');
    }
    const r = await mutate((s) => {
      if (!s.order.includes(personId)) return s;
      if (clear) return clearAway(s, personId);
      if (back) return setBack(s, personId, s.cursor);
      return setAway(s, personId, from, to || null);
    });
    if (!r.state.order.includes(personId)) return err(res, 400, 'That person is not in the rotation.');
    res.json(out(r));
  } catch { err(res, 500, 'Failed to save.'); }
});

router.put('/chazan/can', async (req, res) => {
  try {
    const { personId, tefilos } = req.body || {};
    if (!(typeof personId === 'string' && ID.test(personId)) || !Array.isArray(tefilos)) return err(res, 400, 'Pick a person and the davenings he can lead.');
    const list = TEFILOS.filter((t) => tefilos.includes(t));
    res.json(out(await mutate((s) => (s.order.includes(personId) ? setCan(s, personId, list.length ? list : TEFILOS.slice()) : s))));
  } catch { err(res, 500, 'Failed to save.'); }
});

export { buildView, FORECAST_DAYS };
export default router;
