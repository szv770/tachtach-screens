import { readJSON } from './storage.js';
import { sanitizeGroups } from '../shared/scheduleGroups.js';

/** The configured schedule groups (settings.scheduleGroups, cleaned); [] = feature off. */
export async function readScheduleGroups() {
  const settings = await readJSON('settings.json').catch(() => null);
  return sanitizeGroups(settings?.scheduleGroups);
}

/** Their ids, for the entry sanitisers (unknown ids in groupTimes / groups are dropped). */
export async function scheduleGroupIds() {
  return (await readScheduleGroups()).map((g) => g.id);
}
