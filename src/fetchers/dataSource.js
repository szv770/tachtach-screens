/**
 * Picks where the daily facts come from: `settings.dataSource`.
 *   'live'  (default) the original fetchers: Hebcal + Chabad.org over the internet.
 *   'local'           calculated on the box (src/shared/localData.js); no network.
 * Both return objects with the SAME four functions and the SAME result shapes the
 * callers (fetchAll, fetchZmanimOnly, the preview-for-date route, the schedule
 * store) already used, so they only had to swap which functions they call.
 */
import { fetchHebrewDate as liveHebrewDate, fetchParsha as liveParsha, fetchOmer as liveOmer } from './hebcal.js';
import { fetchZmanim as liveZmanim } from './chabad.js';
import {
  dataSourceOf, locationFor, localISO, localHebrewDate, localParsha, localOmer, localZmanimFor,
} from '../shared/localData.js';

export { dataSourceOf } from '../shared/localData.js';

const live = Object.freeze({
  name: 'live',
  fetchHebrewDate: (date) => liveHebrewDate(date),
  fetchParsha: (zip, date) => liveParsha(zip, date),
  fetchOmer: () => liveOmer(),
  fetchZmanim: (locationId, dateISO) => liveZmanim(locationId, dateISO),
});

/**
 * @param {object} settings  settings.json
 * @param {object} [cache]   cache.json (its weather/geo location feeds the sun maths)
 */
export function sourceFor(settings, cache) {
  if (dataSourceOf(settings) !== 'local') return live;
  const loc = locationFor(settings, cache);
  return {
    name: 'local',
    location: loc,
    fetchHebrewDate: async (date) => localHebrewDate(localISO(date || new Date())),
    fetchParsha: async (_zip, date) => localParsha(localISO(date || new Date())),
    fetchOmer: async () => localOmer(localISO(new Date())),
    // locationId is Chabad's id and means nothing here; the date is 'YYYY-MM-DD' (tomorrow's times) or omitted (today).
    fetchZmanim: async (_locationId, dateISO) => (loc ? localZmanimFor(dateISO || localISO(new Date()), loc) : null),
  };
}
