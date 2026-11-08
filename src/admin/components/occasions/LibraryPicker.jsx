import React, { useMemo, useState } from 'react';
import Sheet from '../ui/Sheet.jsx';
import { fieldStyle } from '../look/kit.jsx';
import { btn, small, colors, adminFonts, Chip } from './occKit.jsx';
import { LIBRARY, libraryGroups, searchLibrary, libraryHas, libraryDraft } from '../../../shared/occasionLibrary.js';
import { CATEGORIES, CATEGORY_LABEL, normalizeOccasion, occurrencesBetween, hebrewWords, ruleWords } from '../../../shared/occasions.js';
import { addDaysISO } from '../../../shared/hebrewCalendar.js';
import { fmtShort, daysFrom, inDaysText } from './occDates.js';

/** The next day each library entry falls on (from today): { key: { startISO, days, name } } (one pass, cheap). */
function nextDates(today) {
  const out = {};
  for (const e of LIBRARY) {
    try {
      const o = normalizeOccasion({ ...libraryDraft(e), id: 'lib' });
      const r = occurrencesBetween(o, today, addDaysISO(today, 900))[0];
      if (r) out[e.key] = { startISO: r.startISO, days: r.days, name: r.nameEn || '' };
    } catch { /* an entry without a date shows without one */ }
  }
  return out;
}

/**
 * 'Add an occasion': 'Pick a day' first (a searchable list of well-known Jewish and Chassidic days: tap one and its edit sheet
 * opens), 'Make my own' second. Days already on the list say 'Added'. No explanations here: those need a source (owner rule).
 */
export default function LibraryPicker({ file, today, busy, onPick, onOwn, onClose }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const dates = useMemo(() => nextDates(today), [today]);
  const found = useMemo(() => searchLibrary(q, { todayISO: today }).filter((e) => category === 'all' || e.category === category), [q, today, category]);
  const groups = libraryGroups(found);
  return (
    <Sheet open onClose={onClose} title="Add an occasion" label="Add an occasion">
      <div style={{ display: 'grid', gap: '12px', paddingBottom: '84px' }} data-testid="occ-library">
        <h3 style={{ margin: 0, fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text }}>Pick a day</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the days" placeholder="Search: kis, yud, chanukah, 19 Kislev" style={{ ...fieldStyle, width: '100%' }} data-testid="occ-library-search" autoComplete="off" />
        <div role="group" aria-label="Kind of day" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', ...CATEGORIES.filter((c) => LIBRARY.some((e) => e.category === c))].map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} data-testid={`occ-libcat-${c}`}
              style={{ minHeight: '44px', padding: '0 14px', borderRadius: '999px', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600, background: category === c ? colors.accentSoft : colors.card, color: category === c ? colors.accent : colors.text, border: `1.5px solid ${category === c ? colors.accent : colors.border}` }}>{c === 'all' ? 'All kinds' : CATEGORY_LABEL[c]}</button>
          ))}
        </div>
        <p style={{ ...small, margin: 0 }}>Tap a day to add it. Each comes with its date and sensible choices; you can change everything next.</p>
        {groups.length === 0 && <p style={small} data-testid="occ-library-empty">No day matches that. Tap "Make my own" below to type a date.</p>}
        {groups.map((g) => (
          <section key={g.cat} aria-label={g.label}>
            <h4 style={{ margin: '4px 0 6px', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 700, color: colors.dim }}>{g.label}</h4>
            {g.entries.map((e) => {
              const have = libraryHas(file, e); const nx = dates[e.key];
              return (
                <button key={e.key} type="button" disabled={have || busy} onClick={() => onPick(e)} data-testid={`occ-lib-${e.key}`} aria-label={`${e.en}${have ? ', already added' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: '56px', padding: '8px 4px', background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.line}`, textAlign: 'left', cursor: have ? 'default' : 'pointer', opacity: have ? 0.6 : 1, fontFamily: adminFonts.englishBody, color: colors.text }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '16px' }}>{e.en}</strong>
                      <span dir="rtl" style={{ fontSize: '16px', color: colors.dim, fontFamily: adminFonts.hebrewPrimary }}>{e.he}</span>
                    </span>
                    <span style={{ ...small, display: 'block' }}>
                      {ruleWords(normalizeOccasion({ ...libraryDraft(e), id: 'lib' }))}{e.days > 1 ? ` · ${e.days} days` : ''}
                      {nx ? ` · next ${fmtShort(nx.startISO)} (${inDaysText(daysFrom(today, nx.startISO))}) · ${hebrewWords(nx.startISO).en.replace(/ \d+$/, '')}` : ''}
                    </span>
                  </span>
                  {have ? <Chip tone="ok">Added</Chip> : <span aria-hidden="true" style={{ fontWeight: 700, color: colors.accent, minWidth: '44px', textAlign: 'center' }}>+ Add</span>}
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <div style={{ position: 'sticky', bottom: 0, background: colors.surface || colors.card, padding: '10px 0', borderTop: `1px solid ${colors.line}`, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" style={btn(false)} onClick={onOwn} data-testid="occ-make-own">Make my own</button>
        <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
