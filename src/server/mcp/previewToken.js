/**
 * `previewId`: the proof that a change was previewed first, for exactly these arguments (stateless, nothing is stored).
 *
 *   id = base64url(expiryMs) + '.' + HMAC-SHA256(secret, connectionId | tool | canonicalJson(args) | expiryMs)
 *
 * So different arguments, another connection, another tool, an old preview (10 minutes) or a server restart (new secret) are all
 * refused, with a sentence telling the AI to preview again. This is a guard on top of the AI app's Allow button, not instead of it.
 */
import crypto from 'crypto';

export const PREVIEW_TTL_MS = 10 * 60 * 1000;

/** Stable JSON: keys sorted, so the same arguments always give the same string whatever order they arrived in. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

const without = (args) => { const { previewId, ...rest } = args || {}; return rest; };

export function createPreviewSigner({ secret = crypto.randomBytes(32), now = () => Date.now(), ttlMs = PREVIEW_TTL_MS } = {}) {
  const mac = (connectionId, tool, args, expiry) => crypto.createHmac('sha256', secret)
    .update(`${connectionId}|${tool}|${canonicalJson(without(args))}|${expiry}`).digest('base64url');

  return {
    make({ connectionId, tool, args }) {
      const expiry = now() + ttlMs;
      return `${Buffer.from(String(expiry)).toString('base64url')}.${mac(connectionId, tool, args, expiry)}`;
    },
    /** @returns {{ ok: true } | { ok: false, reason: string }} */
    check(id, { connectionId, tool, args }) {
      if (typeof id !== 'string' || !id.includes('.')) return { ok: false, reason: 'missing' };
      const [exp, sig] = id.split('.');
      const expiry = Number(Buffer.from(exp, 'base64url').toString());
      if (!Number.isFinite(expiry)) return { ok: false, reason: 'invalid' };
      const want = Buffer.from(mac(connectionId, tool, args, expiry));
      const got = Buffer.from(String(sig));
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { ok: false, reason: 'changed' };
      if (expiry < now()) return { ok: false, reason: 'expired' };
      return { ok: true };
    },
  };
}

export const REFUSAL = {
  missing: 'Call preview_change first for this change, read the result back to the person, then use the previewId it gives you.',
  invalid: 'That previewId is not valid. Call preview_change again.',
  changed: 'Something is different from what was previewed (the arguments, the tool or the connection changed). Call preview_change again with exactly these arguments.',
  expired: 'That preview is more than 10 minutes old. Call preview_change again and confirm with the person.',
};

export const previewSigner = createPreviewSigner();
