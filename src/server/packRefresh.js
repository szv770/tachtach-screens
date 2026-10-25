/** After a data pack is installed (upload or on-Pi build): in Local mode, fill today's cache from it and tell the screens. */
import { readJSON } from './storage.js';
import { dataSourceOf } from '../shared/localData.js';
import { manualRefresh } from './scheduler.js';
import { broadcast } from './sse.js';

export async function refreshAfterPack() {
  try {
    const settings = (await readJSON('settings.json').catch(() => null)) || {};
    if (dataSourceOf(settings) !== 'local') return;
    const result = await manualRefresh(settings.location || { zip: '33139', locationId: '33139' });
    broadcast('cache-refresh', result);
  } catch (e) {
    console.warn('[data-pack] could not refresh the screen data after installing the pack:', e.message);
  }
}
