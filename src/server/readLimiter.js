/**
 * A per-PERSON rate limiter for expensive reads. The mutation limiter skips GET and is keyed by address;
 * this one is keyed by signed-in user id + route, in memory, with bounded memory (a fixed-size table
 * that drops expired entries first, then the oldest). Budgets are declared in READ_ROUTES
 * (src/shared/permissions.js); enforceRole has already let the person through when this runs.
 */
import { readPolicy, READ_BUDGETS } from '../shared/permissions.js';

export function createReadLimiter({ now = () => Date.now(), maxKeys = 5000 } = {}) {
  const hits = new Map(); // key -> { start, count, windowMs }

  function take(key, { max, windowMs }) {
    const t = now();
    let h = hits.get(key);
    if (!h || t - h.start >= windowMs) {
      h = { start: t, count: 0, windowMs };
      hits.delete(key); // re-insert so Map order stays oldest-first
      hits.set(key, h);
      if (hits.size > maxKeys) {
        for (const [k, v] of hits) if (t - v.start >= v.windowMs) hits.delete(k);
        while (hits.size > maxKeys) hits.delete(hits.keys().next().value);
      }
    }
    if (h.count >= max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((h.start + windowMs - t) / 1000)) };
    h.count++;
    return { ok: true };
  }

  return { take, size: () => hits.size };
}

const shared = createReadLimiter();

/** Express middleware: after enforceRole. Only reads whose READ_ROUTES entry has a budget are counted. */
export function readBudget(limiter = shared) {
  return (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const e = readPolicy(req.originalUrl.split('?')[0]);
    const budget = e?.budget && READ_BUDGETS[e.budget];
    if (!budget) return next();
    const who = req.user?.id || req.ip || 'anon';
    const r = limiter.take(`${who}|${e.route}`, budget);
    if (r.ok) return next();
    res.set('Retry-After', String(r.retryAfterSec));
    return res.status(429).json({ error: 'Slow down a little: too many requests in a minute. Try again shortly.' });
  };
}
