/**
 * Quick-message templates: data/quick-templates.json behind the shared
 * personal/shared store (ownedStore.js). Starters are seeded once (shared),
 * then are ordinary editable data. `recents` holds, per person, the names /
 * people / places they used lately (quick chips).
 */
import { createOwnedStore } from './ownedStore.js';
import { SEED_TEMPLATES, SEED_MARKER } from '../shared/quickTemplatesSeed.js';
import { RECENT_TYPES, pushRecent } from '../shared/quickTemplates.js';

export const FILE = 'quick-templates.json';

/** `io` = { read, write } to use something other than data/ (tests). */
export function createTemplateStore(io) {
  const store = createOwnedStore({
    io, file: FILE, key: 'templates', seed: SEED_TEMPLATES, seedMarker: SEED_MARKER, max: 200,
    extra: (doc) => ({ recents: doc?.recents && typeof doc.recents === 'object' && !Array.isArray(doc.recents) ? doc.recents : {} }),
  });

  /** This person's recents: { name: [...], person: [...], place: [...] }. */
  async function getRecents(user) {
    const doc = await store.read();
    const mine = (user?.id && doc.recents[user.id]) || {};
    return Object.fromEntries(RECENT_TYPES.map((t) => [t, Array.isArray(mine[t]) ? mine[t] : []]));
  }

  /** values: [{ type, value }]. Only the caller's own recents are ever touched. */
  async function addRecents(user, values) {
    if (!user?.id) return {};
    const items = (Array.isArray(values) ? values : []).slice(0, 12).filter((v) => v && RECENT_TYPES.includes(v.type));
    return store.mutateDoc((doc) => {
      const mine = { ...(doc.recents[user.id] || {}) };
      for (const v of items) mine[v.type] = pushRecent(mine[v.type], v.value);
      doc.recents[user.id] = mine;
      return Object.fromEntries(RECENT_TYPES.map((t) => [t, mine[t] || []]));
    });
  }

  return { store, getRecents, addRecents };
}

const defaultStore = createTemplateStore();
export const { store, getRecents, addRecents } = defaultStore;
