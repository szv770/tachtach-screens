import React, { useMemo, useState } from 'react';
import { SwitchRow } from '../look/kit.jsx';
import { fieldStyle } from '../look/kit.jsx';
import { btn, small, colors, adminFonts, Chip, useWide } from './occKit.jsx';
import { explainChip } from './occHelpers.js';
import { groupByMonth, yearStrip, rowTexts, rowMatches, FILTERS, FILTER_LABEL } from './occDates.js';

/** The next 12 months as small cells with dots for the days in them; tapping one scrolls to that month below. */
export function YearStrip({ rows, today }) {
  const wide = useWide(700);
  const cells = useMemo(() => yearStrip(rows, today), [rows, today]);
  const go = (key) => { const el = document.getElementById(`occ-month-${key}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <div role="group" aria-label="The year at a glance" data-testid="occ-strip" style={{ display: 'grid', gridTemplateColumns: `repeat(${wide ? 12 : 6}, minmax(0, 1fr))`, gap: '4px' }}>
      {cells.map((c) => (
        <button key={c.key} type="button" disabled={!c.count} onClick={() => go(c.key)} aria-label={`${c.label}: ${c.count} ${c.count === 1 ? 'day' : 'days'}`} data-testid={`occ-strip-${c.key}`}
          style={{ minHeight: '48px', padding: '2px', borderRadius: 'var(--r-sm)', border: `1px solid ${colors.line}`, background: c.count ? colors.accentSoft : 'transparent', color: c.count ? colors.accent : colors.dim, cursor: c.count ? 'pointer' : 'default', fontFamily: adminFonts.englishBody, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{c.short}</span>
          <span aria-hidden="true" style={{ fontSize: '12px', letterSpacing: '1px' }}>{c.count ? `${'●'.repeat(Math.min(c.count, 4))}${c.count > 4 ? '+' : ''}` : '·'}</span>
        </button>
      ))}
    </div>
  );
}

function Row({ r, today, tz, canEdit, onEdit, onToggle }) {
  const o = r.occasion; const t = rowTexts(r, today, tz); const chip = explainChip(o);
  const name = r.nameEn || r.nameHe;
  return (
    <div data-testid={`occ-row-${r.id}`} style={{ display: 'flex', alignItems: 'stretch', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${colors.line}`, opacity: o.on ? 1 : 0.6, minWidth: 0 }}>
      <button type="button" onClick={() => canEdit && onEdit(o)} disabled={!canEdit} aria-label={`Edit ${name}`} data-testid={`occ-edit-${r.id}`}
        style={{ flex: 1, minWidth: 0, minHeight: '64px', padding: '6px 2px', background: 'transparent', border: 'none', textAlign: 'left', cursor: canEdit ? 'pointer' : 'default', fontFamily: adminFonts.englishBody, color: colors.text, display: 'block' }}>
        <span style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '16px' }}>{r.nameEn || r.nameHe}</strong>
          {r.nameHe && r.nameEn && <span dir="rtl" style={{ fontSize: '16px', color: colors.dim, fontFamily: adminFonts.hebrewPrimary }}>{r.nameHe}</span>}
        </span>
        <span style={{ ...small, display: 'block' }} data-testid={`occ-dayline-${r.id}`}>{t.dayLine}</span>
        <span style={{ ...small, display: 'block' }}>{t.beginsLine}{t.rangeLine ? ` · Runs: ${t.rangeLine}` : ''}</span>
        <span style={{ ...small, color: colors.text, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
          <strong data-testid={`occ-in-${r.id}`}>{t.inLine}</strong>
          {t.inSub && <span>{t.inSub}</span>}
          {o.kind === 'countup' ? <span>· run of {o.total} days</span> : null}
          <Chip tone={chip.tone} testId={`occ-chip-${r.id}`}>{chip.text}</Chip>
        </span>
      </button>
      {canEdit && (
        <button type="button" aria-pressed={o.on} aria-label={`${o.on ? 'Switch off' : 'Switch on'} ${name}`} onClick={() => onToggle(o)} style={btn(false, { padding: '0 12px', minWidth: '64px', alignSelf: 'center' })}>{o.on ? 'On' : 'Off'}</button>
      )}
    </div>
  );
}

/**
 * The list of days as a timeline: grouped by the month the day is in, earliest first, a search box, filter chips, the year strip
 * above, and the switched-off ones collapsed at the bottom. Tap a row to edit it.
 */
export default function Timeline({ rows, today, tz, canEdit, onEdit, onToggle, offCount }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showOff, setShowOff] = useState(false);
  const on = rows.filter((r) => r.occasion.on);
  const off = rows.filter((r) => !r.occasion.on);
  const pass = (r) => rowMatches(r, { query, filter });
  const shownOn = filter === 'off' ? [] : on.filter(pass);
  const shownOff = (filter === 'on' || filter === 'needs') ? [] : off.filter(pass);
  const groups = useMemo(() => groupByMonth(shownOn), [rows, query, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const offOpen = showOff || filter === 'off';
  const rowProps = { today, tz, canEdit, onEdit, onToggle };
  return (
    <div style={{ display: 'grid', gap: '10px' }} data-testid="occ-timeline">
      <YearStrip rows={rows} today={today} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the list" placeholder="Search by name or date" style={{ ...fieldStyle, width: '100%' }} data-testid="occ-search" autoComplete="off" />
      <div role="group" aria-label="Show" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`occ-filter-${f}`}
            style={{ minHeight: '44px', padding: '0 14px', borderRadius: '999px', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600, background: filter === f ? colors.accentSoft : colors.card, color: filter === f ? colors.accent : colors.text, border: `1.5px solid ${filter === f ? colors.accent : colors.border}` }}>{FILTER_LABEL[f]}</button>
        ))}
      </div>
      {groups.length === 0 && shownOff.length === 0 && <p style={small} data-testid="occ-empty">{query || filter !== 'all' ? 'Nothing matches. Clear the search or choose All.' : 'Nothing on the list yet.'}</p>}
      {groups.map((g) => (
        <section key={g.key} id={`occ-month-${g.key}`} aria-label={g.label} data-testid={`occ-group-${g.key}`} style={{ scrollMarginTop: '12px' }}>
          <h4 style={{ margin: '8px 0 0', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700, color: colors.dim, display: 'flex', justifyContent: 'space-between' }}><span>{g.label}</span><span style={{ fontWeight: 400 }}>{g.rows.length}</span></h4>
          {g.rows.map((r) => <Row key={`${r.id}|${r.startISO}`} r={r} {...rowProps} />)}
        </section>
      ))}
      {(offCount > 0 || shownOff.length > 0) && filter !== 'on' && filter !== 'needs' && (
        <>
          {filter !== 'off' && <SwitchRow on={showOff} onChange={() => setShowOff(!showOff)} label={`Switched off (${off.length})`} note={showOff ? '' : 'Collapsed: they are not on the screen.'} testId="occ-show-off" />}
          {offOpen && <section aria-label="Switched off" data-testid="occ-off-group">{shownOff.map((r) => <Row key={`${r.id}|${r.startISO}`} r={r} {...rowProps} />)}</section>}
        </>
      )}
    </div>
  );
}
