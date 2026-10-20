/**
 * The words on the birthday slide and rail card, in ONE place (like stageStrings.js) so they are easy to change.
 * Pure + unit tested. English is primary; Hebrew is the extra line.
 */
import { displayName } from './roster.js';

export const HERO_HE = 'מזל טוב!';
export const HERO_EN = 'Happy Birthday';

/** One blessing under the names, chosen by the date so every screen shows the same one all day. */
export const BLESSINGS = Object.freeze([
  { en: 'Ad meah v’esrim!', he: 'עד מאה ועשרים!' },
  { en: 'A year of hatzlacha in everything you do', he: 'שנה של הצלחה בכל אשר תפנה' },
  { en: 'Growing in Torah, in yiras Shamayim and in simcha', he: 'להתעלות בתורה, ביראת שמים ובשמחה' },
  { en: 'May this be your best year yet', he: 'שתהיה זו השנה הטובה ביותר' },
  { en: 'Good health, nachas and bracha all year long', he: 'בריאות, נחת וברכה כל השנה' },
  { en: 'Keep learning, keep growing, keep shining', he: 'להמשיך ללמוד, לגדול ולהאיר' },
]);

export function pickBlessing(dateISO) {
  let h = 0;
  for (const ch of String(dateISO || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BLESSINGS[h % BLESSINGS.length];
}

/** The small tag under a name when the birthday is not today: a Shabbos birthday shows Thursday and Sunday. */
export function tagFor(kind) {
  if (kind === 'early') return 'Birthday is this Shabbos';
  if (kind === 'late') return 'Birthday was Shabbos';
  return '';
}

/** "Yesterday: Dovid L., Yossi K." / "Tomorrow: A B · Thursday: C D" for the small strips; at most `max` names, then "+N more". */
export function stripText(items, names = 'full', max = 4) {
  const groups = [];
  for (const it of items || []) {
    const g = groups.find((x) => x.label === it.label);
    if (g) g.names.push(displayName(it.person, names)); else groups.push({ label: it.label, names: [displayName(it.person, names)] });
  }
  let left = max;
  const parts = [];
  for (const g of groups) {
    if (left <= 0) break;
    const shown = g.names.slice(0, left);
    left -= shown.length;
    parts.push(`${g.label}: ${shown.join(', ')}`);
  }
  const total = groups.reduce((n, g) => n + g.names.length, 0);
  const text = parts.join('  ·  ');
  return total > max ? `${text}  +${total - max} more` : text;
}

/** The rail card: English first, Hebrew line second (like every side note). */
export function railNote(today, names = 'full') {
  if (!today?.length) return null;
  const list = today.map((t) => displayName(t.person, names));
  const shown = list.slice(0, 3).join(', ');
  const more = list.length > 3 ? ` +${list.length - 3}` : '';
  return { id: 'birthdays-today', textEn: `Birthday today: ${shown}${more}`, textHe: HERO_HE };
}
