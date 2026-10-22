import React from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary } from '../../styles/admin-tokens.js';
import { card, h3, small, chip, tefilaLabel, prettyDate, dayTitle } from './shared.js';

/** Today / Tomorrow / the day after: who leads each davening, with a one-tap Swap. */
export function DayCard({ day, today, name, hebrew, canEdit, onSwap, onUndoSwap }) {
  const title = dayTitle(day.date, today);
  return (
    <div style={{ ...card, marginBottom: '12px' }} data-testid={`chazan-day-${day.date}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <h3 style={{ ...h3, margin: 0 }}>{title}</h3>
        <span style={small}>{prettyDate(day.date)}</span>
      </div>
      {!day.slots.length && <div style={{ ...small, marginTop: '8px' }}>{day.off ? `No chazan today (${day.off}).` : 'No davenings with a chazan.'}</div>}
      {day.slots.map((s) => (
        <div key={s.tefila} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: `1px solid ${colors.line}`, flexWrap: 'wrap' }}>
          <div style={{ width: '112px', flex: 'none', fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: colors.dim }}>{tefilaLabel(s.tefila, hebrew)}</div>
          <div style={{ flex: 1, minWidth: '120px', fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text }}>
            {s.id ? name(s.id) : <span style={{ color: colors.dim, fontWeight: 600 }}>{s.how === 'pick' ? 'Pick someone' : 'Nobody available'}</span>}
            {s.how === 'swap' && <span style={{ ...chip, marginLeft: '8px' }}>Swapped{s.displacedId ? ` for ${name(s.displacedId)}` : ''}</span>}
            {s.how === 'cover' && <span style={{ ...chip, marginLeft: '8px' }}>Covering for {name(s.displacedId)} (away)</span>}
          </div>
          {canEdit && !day.past && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {s.how === 'swap' && <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={() => onUndoSwap(day.date, s.tefila)}>Undo swap</button>}
              <button style={{ ...(s.how === 'pick' ? buttonPrimary : buttonSecondary), minHeight: '44px' }} onClick={() => onSwap(day.date, s.tefila)} aria-label={`Swap ${s.tefila} ${prettyDate(day.date)}`}>{s.how === 'pick' ? 'Pick…' : 'Swap…'}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Forecast({ days, today, name, hebrew }) {
  return (
    <div>
      {days.map((d) => (
        <div key={d.date} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderTop: `1px solid ${colors.line}`, alignItems: 'baseline' }}>
          <div style={{ width: '92px', flex: 'none', fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: d.date === today ? 800 : 650, color: d.date === today ? colors.accent : colors.dim }}>{prettyDate(d.date)}</div>
          <div style={{ flex: 1, minWidth: 0, fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            {d.slots.length ? d.slots.map((s) => (
              <span key={s.tefila}><span style={{ color: colors.dim }}>{hebrew ? s.tefila : s.tefila.slice(0, 3)}:</span> <b>{s.id ? name(s.id) : '—'}</b></span>
            )) : <span style={{ color: colors.dim }}>{d.off || 'no chazan'}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
