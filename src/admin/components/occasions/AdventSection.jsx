import React, { useState } from 'react';
import { Field, Hint, SwitchRow, Choices } from '../look/kit.jsx';
import { GRIDS, LIMITS, dailyTextShows } from '../../../shared/occasions.js';
import { adventDays, onCardEdit } from './occHelpers.js';
import { btn, small, label, TextIn, Chip, colors } from './occKit.jsx';
import { PhotoField } from './LookSection.jsx';
import { OpenSource } from './ExplainBox.jsx';
import { fieldStyle } from '../look/kit.jsx';

const cardState = (c) => {
  if (!c || !(c.en || c.he || c.photo)) return { text: 'Empty', tone: 'none' };
  if (c.en || c.he) return dailyTextShows(c) ? { text: 'Checked – shows', tone: 'ok' } : { text: c.photo ? 'Photo shows, text needs checking' : 'Needs checking', tone: 'warn' };
  return { text: 'Photo only', tone: 'ok' };
};

function CardEditor({ card, onChange, onClear }) {
  const c = card || {};
  const edit = (patch) => onChange(onCardEdit(c, patch));
  const hasText = !!(String(c.en || '').trim() || String(c.he || '').trim());
  return (
    <div style={{ padding: '10px 0 14px' }}>
      <textarea value={c.en || ''} onChange={(e) => edit({ en: e.target.value })} aria-label="Card text in English" rows={2} maxLength={LIMITS.adventText + 20} style={{ ...fieldStyle, width: '100%', resize: 'vertical' }} />
      <div style={{ height: 6 }} />
      <textarea value={c.he || ''} onChange={(e) => edit({ he: e.target.value })} aria-label="Card text in Hebrew" dir="rtl" rows={2} maxLength={LIMITS.adventText + 20} style={{ ...fieldStyle, width: '100%', resize: 'vertical' }} />
      <span style={{ ...label, marginTop: 8 }}>Picture for this day (needs no source)</span>
      <PhotoField url={c.photo || ''} compact ariaLabel="Card picture" onChange={(u) => edit({ photo: u })} />
      {hasText && (
        <>
          <span style={{ ...label, marginTop: 8 }}>Source for the text</span>
          <TextIn value={c.source} onChange={(v) => edit({ source: v })} ariaLabel="Card source" max={LIMITS.source} placeholder="Sefer and page / https://www.chabad.org/..." />
          <OpenSource source={c.source} />
          <SwitchRow on={c.checked === true} onChange={() => { if (c.checked !== true && String(c.source || '').trim().length < 3) return; onChange({ ...c, checked: c.checked !== true }); }} label="I checked this with the source" note="Text shows on the screen only with a source and this switch." />
        </>
      )}
      <button type="button" style={btn(false, { marginTop: 8 })} onClick={onClear}>Clear this day</button>
    </div>
  );
}

/** Advent calendar ('Reveal') for one occasion: switch, photo, grid and a card per lead-up day. `d.advent` is the draft block. */
export default function AdventEditor({ d, set, lead, preview }) {
  const a = d.advent || { on: false, photo: '', grid: '3x3', daily: {} };
  const [open, setOpen] = useState(0);
  const setA = (patch) => set({ advent: { ...a, ...patch } });
  const setDay = (n, card) => {
    const daily = { ...a.daily };
    if (card && (card.en || card.he || card.photo || card.source)) daily[String(n)] = card; else delete daily[String(n)];
    setA({ daily });
  };
  const g = GRIDS[a.grid] || GRIDS['3x3'];
  return (
    <div data-testid="occ-advent">
      <SwitchRow on={a.on} onChange={() => setA({ on: !a.on })} label="Reveal a picture as the day gets closer" note="A picture is covered by tiles. More open each day, and all are open exactly when it begins." testId="occ-advent-on" />
      {a.on && (
        <>
          <Field label="The picture to reveal"><PhotoField url={a.photo} ariaLabel="Advent picture" onChange={(u) => setA({ photo: u })} /></Field>
          <Field label="Number of tiles"><Choices ariaLabel="Grid" value={a.grid} onChange={(v) => setA({ grid: v })} options={Object.keys(GRIDS).map((k) => ({ value: k, label: `${GRIDS[k].cols} × ${GRIDS[k].rows} (${GRIDS[k].cols * GRIDS[k].rows})` }))} /></Field>
          <p style={{ ...small, color: colors.text }} data-testid="occ-advent-preview">
            {preview ? `Today ${preview.count} of ${preview.total} tiles are open (${preview.daysLeft} day${preview.daysLeft === 1 ? '' : 's'} left).` : `${g.cols * g.rows} tiles. Nothing to show yet: the Countdown shows this occasion from ${lead} days before.`}
          </p>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 220 }} aria-hidden="true">
            {Array.from({ length: g.cols * g.rows }, (_, i) => <span key={i} style={{ width: 28, height: 18, borderRadius: 3, background: preview && i < preview.count ? colors.accent : colors.sunken, border: `1px solid ${colors.line}` }} />)}
          </div>
          <Field label="A card for each day (optional)" hint={`Shown on the day with that many days left. Up to ${LIMITS.adventDays} days are listed. Text needs a source and your check; a picture alone does not.`}>
            <div style={{ display: 'grid' }}>
              {adventDays(lead).map(({ n, label: lb }) => {
                const c = a.daily[String(n)]; const st = cardState(c);
                return (
                  <div key={n} style={{ borderBottom: `1px solid ${colors.line}` }} data-testid={`occ-advent-day-${n}`}>
                    <button type="button" aria-expanded={open === n} onClick={() => setOpen(open === n ? 0 : n)} style={{ ...btn(false), border: 'none', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', padding: '0 4px' }}>
                      <span style={{ fontSize: 15 }}>{lb}{c && (c.en || c.he) ? ` · ${(c.en || c.he).slice(0, 24)}` : ''}</span>
                      <Chip tone={st.tone}>{st.text}</Chip>
                    </button>
                    {open === n && <CardEditor card={c} onChange={(card) => setDay(n, card)} onClear={() => { setDay(n, null); setOpen(0); }} />}
                  </div>
                );
              })}
            </div>
          </Field>
          <Hint>Daily cards need the same care as explanations: check the source before you switch "I checked" on.</Hint>
        </>
      )}
    </div>
  );
}
