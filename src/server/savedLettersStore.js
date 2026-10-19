/** Saved letters: data/saved-letters.json behind the shared personal/shared store (ownedStore.js). */
import { createOwnedStore } from './ownedStore.js';

export const FILE = 'saved-letters.json';
export const store = createOwnedStore({ file: FILE, key: 'letters', max: 300 });
