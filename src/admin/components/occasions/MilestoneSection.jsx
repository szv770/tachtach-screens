import React, { useState } from 'react';
import { Field, Choices } from '../look/kit.jsx';
import { btn, small, label, TextIn, Group, colors } from './occKit.jsx';
import { milestoneOf, milestonePrompt, vortFor, yearWords, NUMBER_VORTS, LIMITS, SINCE_MIN, SINCE_MAX } from '../../../shared/occasions.js';

/**
 * Big or small, and the YEARS: the Hebrew year the day first happened turns every date into 'N years' (or 'entering the Nth year');
 * a round or meaningful number is a milestone (a vort), a big one gets the full treatment. The owner can write his own vort for a
 * number (for example what the Rebbe said at the Frierdiker Rebbe's 100th, used again at the Rebbe's 100th).
 */
export function BigSmallField({ d, set }) {
  return (
    <Field label="How big is this day?" style={{ marginTop: 0 }} hint="Big days can be the main countdown. Small days only appear in the 'coming up' strip (and lead only when nothing big is near).">
      <Choices ariaLabel="Big or small" value={d.big === false ? 'small' : 'big'} onChange={(v) => set({ big: v === 'big' })} options={[{ value: 'big', label: 'Big' }, { value: 'small', label: 'Small' }]} />
    </Field>
  );
}

export function SinceField({ d, set, next }) {
  const raw = d.since && d.since.year != null ? String(d.since.year) : '';
  const year = Number(raw);
  const valid = Number.isInteger(year) && year >= SINCE_MIN && year <= SINCE_MAX;
  const m = valid && next ? milestoneOf({ year }, next.startISO) : null;
  const w = m?.tier ? yearWords(m) : null;
  return (
    <Field label="The Hebrew year it first happened (optional)" style={{ marginTop: 0 }} hint="For example 5747 for Hey Teves. Then the screen can say '40 years' and 'entering the 40th year', and round years get extra attention.">
      <TextIn value={raw} onChange={(v) => { const t = v.replace(/\D/g, '').slice(0, 4); set({ since: t ? { year: Number(t) } : null }); }} ariaLabel="Year it first happened" max={4} testId="occ-since" placeholder="5747" />
      {raw && !valid && <p style={{ ...small, color: colors.danger, margin: '6px 0 0' }}>A Hebrew year between {SINCE_MIN} and {SINCE_MAX}.</p>}
      {m && <p style={{ ...small, margin: '6px 0 0' }} data-testid="occ-since-note">
        Next time: {m.completed} years since, entering the {m.entering}{m.entering % 10 === 1 && m.entering % 100 !== 11 ? 'st' : m.entering % 10 === 2 && m.entering % 100 !== 12 ? 'nd' : m.entering % 10 === 3 && m.entering % 100 !== 13 ? 'rd' : 'th'} year.
        {w ? ` A ${m.tier} milestone: the screen shows "${w.line.en}".` : ' Not a milestone year.'}
      </p>}
    </Field>
  );
}

export function YearVorts({ d, set, next, copy }) {
  const [add, setAdd] = useState('');
  const vorts = d.yearVorts && typeof d.yearVorts === 'object' ? d.yearVorts : {};
  const keys = Object.keys(vorts).sort((a, b) => Number(a) - Number(b));
  const m = d.since?.year && next ? milestoneOf(d.since, next.startISO) : null;
  const shown = m?.tier ? vortFor(m, vorts) : null;
  const edit = (k, patch) => set({ yearVorts: { ...vorts, [k]: { en: '', he: '', source: '', ...vorts[k], ...patch } } });
  const addNum = () => { const n = String(Number(add)); if (!/^\d{1,4}$/.test(add) || Number(add) < 1 || vorts[n] || keys.length >= LIMITS.yearVorts) return; set({ yearVorts: { ...vorts, [n]: { en: '', he: '', source: '' } } }); setAdd(''); };
  const prompt = () => copy(milestonePrompt({ name: d.nameEn || d.nameHe || 'this day', n: m?.n || Number(add) || 40, focus: m?.focus || 'completed', since: d.since?.year }), 'Prompt copied');
  return (
    <Group title="Vorts for milestone years" summary={keys.length ? `${keys.length} of your own` : 'Optional: the words for a number of years'} testId="occ-year-vorts">
      <p style={{ ...small, margin: '0 0 10px' }}>A round or meaningful number of years shows a short vort under the countdown. {shown ? (shown.own ? 'Your own text is used for the next one.' : 'The next one uses the built-in line for that number (you can replace it below).') : 'Write your own for any number, for example what the Rebbe said at a similar milestone.'}</p>
      {keys.map((k) => (
        <div key={k} style={{ display: 'grid', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${colors.line}` }} data-testid={`occ-vort-${k}`}>
          <strong style={{ fontSize: 15 }}>{k} years{NUMBER_VORTS[k] ? ' (replaces the built-in line)' : ''}</strong>
          <TextIn value={vorts[k].en} onChange={(v) => edit(k, { en: v })} ariaLabel={`Vort for ${k} years, English`} max={LIMITS.yearVortText} placeholder="English" />
          <TextIn value={vorts[k].he} onChange={(v) => edit(k, { he: v })} ariaLabel={`Vort for ${k} years, Hebrew`} dir="rtl" max={LIMITS.yearVortText} placeholder="עברית" />
          <TextIn value={vorts[k].source} onChange={(v) => edit(k, { source: v })} ariaLabel={`Source for ${k} years`} max={LIMITS.source} placeholder="Source (optional)" />
          <button type="button" style={btn(false)} onClick={() => { const o = { ...vorts }; delete o[k]; set({ yearVorts: o }); }}>Remove this vort</button>
        </div>
      ))}
      <span style={label}>Add a vort for this number of years</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><TextIn value={add} onChange={(v) => setAdd(v.replace(/\D/g, '').slice(0, 4))} ariaLabel="Number of years" max={4} placeholder="40" testId="occ-vort-add" /></div>
        <button type="button" style={btn(true)} onClick={addNum} disabled={!add}>Add</button>
      </div>
      <div style={{ marginTop: 10 }}><button type="button" style={btn(false)} onClick={prompt} data-testid="occ-vort-claude">Copy a prompt for Claude (find what the Rebbe said at a similar milestone)</button></div>
    </Group>
  );
}
