import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { nameOf, TEFILA_HE } from '../../../shared/chazan.js';

export const card = { background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-lg)', padding: '16px', marginBottom: '16px' };
export const h3 = { fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text, margin: '0 0 6px' };
export const small = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, lineHeight: 1.5 };
export const chip = { display: 'inline-block', padding: '2px 10px', borderRadius: '999px', border: `1px solid ${colors.line}`, fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 650, color: colors.dim, whiteSpace: 'nowrap' };
export const tefilaLabel = (t, he = true) => (he ? `${t}  ·  ${TEFILA_HE[t]}` : t);

/** id -> display name (roster names at read time; a person who left the roster shows as 'Someone'). */
export function makeNamer(roster, namesMode) {
  const by = new Map((roster || []).map((p) => [p.id, p]));
  return (id) => (id && by.has(id) ? nameOf(by.get(id), namesMode) : id ? 'Someone (removed)' : '');
}
export const prettyDate = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
export const dayTitle = (iso, today) => {
  const diff = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : prettyDate(iso, { weekday: 'long' });
};
