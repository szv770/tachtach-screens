/**
 * Apps that registered themselves for the "Sign in with" connector (data/oauth-clients.json).
 *
 * FIT-RULES: scope = org (one school's own list), privacy class = none (a name and redirect addresses, no secret: these are
 * public PKCE clients), only reached through this module. Capped, oldest dropped first, so strangers cannot grow the file.
 */
import crypto from 'node:crypto';
import { readJSON, updateJSON } from '../storage.js';
import { MAX_CLIENTS } from '../../shared/oauth.js';

const FILE = 'oauth-clients.json';
const CLIENT_ID = /^ttc_[0-9a-f]{32}$/;

const clean = (doc) => (Array.isArray(doc?.clients) ? doc.clients.filter((c) => c && CLIENT_ID.test(c.id) && Array.isArray(c.redirectUris)) : []);

export async function registerClient({ name, redirectUris }) {
  const client = { id: `ttc_${crypto.randomBytes(16).toString('hex')}`, name, redirectUris, createdAt: new Date().toISOString() };
  await updateJSON(FILE, (doc) => ({ clients: [...clean(doc), client].slice(-MAX_CLIENTS) }), () => ({ clients: [] }));
  return client;
}

export async function getClient(id) {
  if (typeof id !== 'string' || !CLIENT_ID.test(id)) return null;
  return clean(await readJSON(FILE)).find((c) => c.id === id) || null;
}

export async function clientCount() {
  return clean(await readJSON(FILE)).length;
}
