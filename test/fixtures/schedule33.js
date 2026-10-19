/**
 * A realistic 33-row school day (the owner's reality: many sedarim, ~6:30 AM to ~11:30 PM, some ranges,
 * some point times, English + Hebrew names, long names included). Used by test/scheduleLayout.test.js
 * and scripts/schedule-audit.mjs (Playwright, throwaway copy only). Not real school data.
 *
 * `GROUPS` / `groupEntries()` add three groups (Aleph / Beis / Gimmel): night seder, dorm attendance and
 * lights out run earlier for Aleph and later (shared times) for Beis and Gimmel.
 */

export const CATEGORIES = [
  { id: 'davening', name: 'Davening', nameHe: 'תפילה', color: '#6F9FE0', kind: 'davening' },
  { id: 'seder', name: 'Seder', nameHe: 'סדר', color: '#4FB5A5', kind: 'seder' },
  { id: 'shiur', name: 'Shiur', nameHe: 'שיעור', color: '#A88BDB', kind: 'seder' },
  { id: 'meals', name: 'Meals', nameHe: 'סעודות', color: '#DCA45A', kind: 'meal' },
  { id: 'break', name: 'Breaks', nameHe: 'הפסקה', color: '#58B6C9', kind: 'break' },
  { id: 'dorm', name: 'Dorm', nameHe: 'פנימייה', color: '#D8B65A', kind: 'other' },
  { id: 'night', name: 'Lights out', nameHe: 'כיבוי אורות', color: '#DA8C8C', kind: 'other' },
];

// [time, endTime, category, English, Hebrew]
const ROWS = [
  ['06:30', '', 'dorm', 'Wake up', 'השכמה'],
  ['06:50', '', 'dorm', 'Morning attendance', 'נוכחות בוקר'],
  ['07:00', '07:30', 'seder', 'Chassidus before davening', 'חסידות קודם התפילה'],
  ['07:30', '08:40', 'davening', 'Shacharis', 'שחרית'],
  ['08:40', '09:10', 'meals', 'Breakfast', 'ארוחת בוקר'],
  ['09:10', '09:30', 'seder', 'Chitas', 'חת״ת'],
  ['09:30', '11:00', 'seder', 'Seder Iyun', 'סדר עיון'],
  ['11:00', '11:10', 'break', 'Break', 'הפסקה'],
  ['11:10', '12:20', 'shiur', 'Shiur Iyun', 'שיעור עיון'],
  ['12:20', '12:50', 'seder', 'Chazara', 'חזרה'],
  ['12:50', '13:10', 'shiur', 'Halacha', 'הלכה'],
  ['13:10', '13:30', 'davening', 'Mincha', 'מנחה'],
  ['13:30', '14:10', 'meals', 'Lunch', 'ארוחת צהריים'],
  ['14:10', '14:50', 'break', 'Rest', 'מנוחה'],
  ['14:50', '', 'dorm', 'Afternoon attendance', 'נוכחות'],
  ['15:00', '16:15', 'seder', 'Seder Bekiyus', 'סדר בקיאות'],
  ['16:15', '16:30', 'meals', 'Snack', 'כיבוד'],
  ['16:30', '17:30', 'shiur', 'Shiur Bekiyus', 'שיעור בקיאות'],
  ['17:30', '18:15', 'break', 'Sports & free time', 'ספורט'],
  ['18:15', '18:45', 'seder', 'Mishnayos', 'משניות'],
  ['18:45', '19:15', 'meals', 'Supper', 'ארוחת ערב'],
  ['19:15', '19:30', 'davening', 'Maariv', 'מעריב'],
  ['19:30', '19:45', 'break', 'Break', 'הפסקה'],
  ['19:45', '21:00', 'seder', 'Night Seder', 'סדר לילה'],
  ['21:00', '21:15', 'seder', 'Rambam', 'רמב״ם'],
  ['21:15', '21:45', 'shiur', 'Farbrengen with the mashpia', 'התוועדות עם המשפיע'],
  ['21:45', '22:00', 'meals', 'Late snack', 'כיבוד'],
  ['22:00', '22:30', 'break', 'Free time', 'זמן חופשי'],
  ['22:30', '', 'dorm', 'Dorm attendance', 'נוכחות בפנימייה'],
  ['22:40', '', 'davening', 'Kriyas Shema she’al hamita', 'קריאת שמע שעל המטה'],
  ['22:50', '', 'dorm', 'Quiet in the dorms', 'שקט בפנימייה'],
  ['23:00', '', 'night', 'Lights out', 'כיבוי אורות'],
  ['23:30', '', 'dorm', 'Final room check', 'בדיקת חדרים'],
];

export const ENTRIES = ROWS.map(([time, endTime, category, name, nameHe], i) => ({
  id: `f${String(i + 1).padStart(2, '0')}`, name, nameHe, time, endTime, category, enabled: true,
  days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ...(category === 'seder' || category === 'shiur' || category === 'davening' ? { alertBefore: 5 } : null),
}));

/** A day of `n` rows: the first n of the 33, or the 33 repeated with shifted times past 33 (sorted, unique ids). */
export function entriesOf(n) {
  if (n <= ENTRIES.length) return ENTRIES.slice(0, n);
  const out = [...ENTRIES];
  let k = 0;
  while (out.length < n) {
    const base = ENTRIES[k % ENTRIES.length];
    const [h, m] = base.time.split(':').map(Number);
    const t = Math.min(23 * 60 + 58, h * 60 + m + 5);
    out.push({ ...base, id: `x${out.length}`, time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, endTime: '' });
    k++;
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export const SCHEDULE33 = { entries: ENTRIES, categories: CATEGORIES };

// ── groups ───────────────────────────────────────────────────────────────
export const GROUPS = [
  { id: 'aleph', name: 'Aleph', nameHe: 'א׳', short: 'Aleph' },
  { id: 'beis', name: 'Beis', nameHe: 'ב׳', short: 'Beis' },
  { id: 'gimmel', name: 'Gimmel', nameHe: 'ג׳', short: 'Gimmel' },
];

/** The 33 rows with Aleph earlier for night seder, dorm attendance and lights out; Beis & Gimmel use the base times. */
export function groupEntries() {
  // base (= Beis & Gimmel) times, and Aleph's own earlier slot
  const split = {
    'Night Seder': { base: { time: '19:45', endTime: '21:00' }, aleph: { time: '19:30', endTime: '20:30' } },
    'Dorm attendance': { base: { time: '22:30', endTime: '' }, aleph: { time: '21:50', endTime: '' } },
    'Lights out': { base: { time: '23:00', endTime: '' }, aleph: { time: '22:15', endTime: '' } },
  };
  return ENTRIES.map((e) => {
    const g = split[e.name];
    return g ? { ...e, ...g.base, groupTimes: { aleph: g.aleph } } : e;
  });
}
