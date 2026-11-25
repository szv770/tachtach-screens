/**
 * Apps that registered themselves for the "Sign in with" connector (data/oauth-clients.json), and the apps that were turned away.
 *
 * FIT-RULES: scope = org (one school's own list), privacy class = secret for `secretHash` (a hash of a client secret, never the
 * secret), none for the rest (names and return addresses). Only reached through this module. Capped so strangers cannot grow the file.
 *
 *  - The same app registering again (same name, same return addresses, public client) gets the SAME client id, so an app that
 *    retries does not pile up entries.
 *  - When the list is full the oldest client WITHOUT a live connection is dropped, never one a person is using.
 *  - `turnedAway`: the last 10 registrations refused because the return address is not allowed (host, address, name, time).
 *    It only feeds the admin's "Allow" button in Connect an AI. Nothing is ever allowed from here automatically.
 */
import crypto from 'node:crypto';
import { readJSON, updateJSON } from '../storage.js';
import { MAX_CLIENTS } from '../../shared/oauth.js';

const FILE = 'oauth-clients.json';
const CLIENT_ID = /^ttc_[0-9a-f]{32}$/;
export const MAX_TURNED_AWAY = 10;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const clean = (doc) => (Array.isArray(doc?.clients) ? doc.clients.filter((c) => c && CLIENT_ID.test(c.id) && Array.isArray(c.redirectUris)) : []);
const cleanAway = (doc) => (Array.isArray(doc?.turnedAway) ? doc.turnedAway.filter((t) => t && typeof t.address === 'string') : []);
const empty = () => ({ clients: [], turnedAway: [] });
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/**
 * Register an app. `keepIds`: client ids that have a live connection (never dropped). Returns { client, secret } where
 * `secret` is set ONLY for an app that asked for a client secret (shown once, only its hash is stored).
 */
export async function registerClient({ name, redirectUris, authMethod = 'none' }, { keepIds = [] } = {}) {
  let result;
  await updateJSON(FILE, (doc) => {
    const list = clean(doc);
    if (authMethod === 'none') {
      const same = list.find((c) => (c.authMethod || 'none') === 'none' && c.name === name && sameSet(c.redirectUris, redirectUris));
      if (same) { result = { client: same, secret: null }; return { clients: list, turnedAway: cleanAway(doc) }; }
    }
    const secret = authMethod === 'none' ? null : `ttcs_${crypto.randomBytes(24).toString('hex')}`;
    const client = {
      id: `ttc_${crypto.randomBytes(16).toString('hex')}`, name, redirectUris, authMethod,
      ...(secret ? { secretHash: sha256(secret) } : {}), createdAt: new Date().toISOString(),
    };
    let next = [...list, client];
    const keep = new Set(keepIds);
    while (next.length > MAX_CLIENTS) {
      const i = next.findIndex((c) => c.id !== client.id && !keep.has(c.id));
      if (i < 0) break;
      next.splice(i, 1);
    }
    if (next.length > MAX_CLIENTS) next = next.slice(-MAX_CLIENTS);
    result = { client, secret };
    return { clients: next, turnedAway: cleanAway(doc) };
  }, empty);
  return result;
}

export async function getClient(id) {
  if (typeof id !== 'string' || !CLIENT_ID.test(id)) return null;
  return clean(await readJSON(FILE)).find((c) => c.id === id) || null;
}

/** Does this secret belong to this client? (timing-safe; public clients never match.) */
export function secretMatches(client, secret) {
  if (!client || !client.secretHash || typeof secret !== 'string' || secret.length > 200) return false;
  const a = Buffer.from(sha256(secret)); const b = Buffer.from(client.secretHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function clientCount() {
  return clean(await readJSON(FILE)).length;
}

export async function recordTurnedAway({ address, host, name }) {
  if (typeof address !== 'string' || address.length > 300) return;
  const entry = { address, host: String(host || '').slice(0, 100), name: String(name || 'An AI app').slice(0, 60), at: new Date().toISOString() };
  await updateJSON(FILE, (doc) => ({
    clients: clean(doc),
    turnedAway: [entry, ...cleanAway(doc).filter((t) => t.address !== address)].slice(0, MAX_TURNED_AWAY),
  }), empty);
}

/** Newest first. `allowed(address)` hides entries that have been allowed since. */
export async function listTurnedAway(allowed = () => false) {
  return cleanAway(await readJSON(FILE).catch(() => null)).filter((t) => !allowed(t.address));
}

export async function dismissTurnedAway(address) {
  await updateJSON(FILE, (doc) => ({ clients: clean(doc), turnedAway: cleanAway(doc).filter((t) => t.address !== address) }), empty);
}
