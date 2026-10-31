// Small shared pieces of Screen > Menu (chips, buttons, dish text) and the API/undo helpers.
import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { tagInfo, DAY_EN } from '../../../shared/menuCopy.js';
import { addDays, dayCodeOf } from '../../../shared/menu.js';

export const btn = (primary, extra = {}) => ({
  minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700,
  border: primary ? 'none' : `1px solid ${colors.line}`, background: primary ? colors.accent : 'transparent', color: primary ? 'var(--on-accent, #fff)' : colors.text, ...extra,
});
export const iconBtn = { minWidth: '44px', minHeight: '44px', border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: '16px' };
export const card = { background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '14px', marginTop: '12px', minWidth: 0 };
export const h3 = { fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text, margin: '0 0 6px' };
export const small = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, lineHeight: 1.45 };

export function Chip({ on, children, onClick, label, disabled, style }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} disabled={disabled} onClick={onClick} style={{
      minHeight: '44px', padding: '0 14px', borderRadius: '999px', cursor: disabled ? 'default' : 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600,
      background: on ? colors.accentSoft : colors.card, color: on ? colors.accent : colors.text, border: `1.5px solid ${on ? colors.accent : colors.border}`, ...style,
    }}>{children}</button>
  );
}

/** The small read-only tag marker inside a dish line. */
export function TagMark({ id }) {
  const t = tagInfo(id);
  if (!t) return null;
  return <span title={t.en} style={{ display: 'inline-block', fontSize: '12px', fontWeight: 800, letterSpacing: '.03em', padding: '1px 7px', borderRadius: '999px', border: `1px solid ${colors.border}`, color: colors.dim, marginLeft: '6px', whiteSpace: 'nowrap' }}>{t.short} {t.en}</span>;
}

export function DishLine({ item }) {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 6px', minWidth: 0 }}>
      {item.en && <span style={{ color: colors.text }}>{item.en}</span>}
      {item.he && <span dir="rtl" style={{ color: item.en ? colors.dim : colors.text, fontFamily: adminFonts.hebrewPrimary }}>{item.he}</span>}
      {(item.tags || []).map((t) => <TagMark key={t} id={t} />)}
    </span>
  );
}

export const labelOfDate = (iso, opts = { weekday: 'long', month: 'short', day: 'numeric' }) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);
export const dayName = (iso) => DAY_EN[dayCodeOf(iso)];
export { addDays };

export async function menuApi(method, path, body) {
  return apiFetch(`/api/menu${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The requests that turn the saved menu `cur` back into `prev` (settings first, then the weeks and one-day changes that differ). */
export function restoreRequests(cur, prev) {
  const reqs = [];
  if (!same(cur.settings, prev.settings) || !same(cur.mealTypes, prev.mealTypes)) reqs.push(['PUT', '/settings', { settings: prev.settings, mealTypes: prev.mealTypes }]);
  if (!same(cur.weekly, prev.weekly)) reqs.push(['PUT', '/weekly/0', { week: prev.weekly }]);
  const n = prev.settings?.cycleWeeks || 1;
  for (let i = 1; i < n; i++) if (!same(cur.weeklyMore?.[i - 1], prev.weeklyMore?.[i - 1])) reqs.push(['PUT', `/weekly/${i}`, { week: prev.weeklyMore?.[i - 1] || {} }]);
  for (const k of new Set([...Object.keys(cur.weeks || {}), ...Object.keys(prev.weeks || {})])) {
    if (same(cur.weeks?.[k], prev.weeks?.[k])) continue;
    reqs.push(prev.weeks?.[k] ? ['PUT', `/weeks/${k}`, { week: prev.weeks[k] }] : ['DELETE', `/weeks/${k}`]);
  }
  for (const k of new Set([...Object.keys(cur.days || {}), ...Object.keys(prev.days || {})])) {
    if (same(cur.days?.[k], prev.days?.[k])) continue;
    reqs.push(prev.days?.[k] ? ['PUT', `/days/${k}`, { day: prev.days[k] }] : ['DELETE', `/days/${k}`]);
  }
  return reqs;
}

export async function undoTo(prev, setFile) {
  try {
    let cur = await menuApi('GET', '');
    for (const [m, p, b] of restoreRequests(cur, prev)) cur = await menuApi(m, p, b);
    setFile(cur);
    notify('Undone', 'success');
  } catch (e) { notify(e.message || 'Could not undo', 'error'); }
}
