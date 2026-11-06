import React from 'react';
import { Hint, SwitchRow } from '../look/kit.jsx';
import { LIMITS, explainState, explainWhy, sourceUrl } from '../../../shared/occasions.js';
import { explainChip, onExplainEdit } from './occHelpers.js';
import { btn, small, label, TextIn, Chip, colors } from './occKit.jsx';
import { fieldStyle } from '../look/kit.jsx';

/** Open-source link: only for a real http(s) address inside the source text. */
export function OpenSource({ source }) {
  const url = sourceUrl(source);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" data-testid="occ-open-source" style={{ ...btn(false), display: 'inline-flex', alignItems: 'center', textDecoration: 'none', marginTop: 8 }}>Open source</a>;
}

/** The explanation block of the edit sheet: text, source, 'I checked this with the source', and why it is hidden. */
export default function ExplainBox({ d, set, copyPrompt }) {
  const edit = (patch) => set(onExplainEdit(d, patch));
  const chip = explainChip(d);
  const st = explainState(d);
  return (
    <div style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Explanation (a vort), optional</h3>
        <Chip tone={chip.tone} testId="occ-explain-chip">{chip.text}</Chip>
      </div>
      <p style={{ ...small, margin: '0 0 8px' }}>It only shows on the screen when it has a real source AND you have checked it against that source (Chabad.org is a fine source). Anything you type or change is hidden until you check it again.</p>
      <textarea value={d.explainEn} onChange={(e) => edit({ explainEn: e.target.value })} aria-label="Explanation in English" rows={4} maxLength={LIMITS.explain + 50} style={{ ...fieldStyle, width: '100%', minHeight: 96, resize: 'vertical' }} data-testid="occ-explain-en" />
      <div style={{ height: 8 }} />
      <textarea value={d.explainHe} onChange={(e) => edit({ explainHe: e.target.value })} aria-label="Explanation in Hebrew" dir="rtl" rows={3} maxLength={LIMITS.explain + 50} style={{ ...fieldStyle, width: '100%', minHeight: 80, resize: 'vertical' }} />
      <div style={{ height: 8 }} />
      <span style={label}>Source (a sefer with page, the exact talk, or a link)</span>
      <TextIn value={d.source} onChange={(v) => edit({ source: v })} ariaLabel="Source" max={LIMITS.source} placeholder="Sefer, volume and page / https://www.chabad.org/..." testId="occ-source" />
      <OpenSource source={d.source} />
      <SwitchRow on={d.explainChecked === true} onChange={() => { if (d.explainChecked !== true && st !== 'needsCheck') return; set({ explainChecked: d.explainChecked !== true }); }} label="I checked this with the source" note={st === 'none' || st === 'needsSource' ? 'Add the text and the source first.' : 'Only switch this on after you opened the source and compared it, word for word.'} testId="occ-checked" />
      <p style={{ ...small, margin: '4px 0 0', color: st === 'shows' || st === 'none' ? colors.dim : colors.danger }} data-testid="occ-source-state">{st === 'shows' ? 'Shows on the screen with this source under it.' : st === 'none' ? 'No explanation.' : explainWhy(d)}</p>
      <button type="button" style={{ ...btn(false), marginTop: 10 }} onClick={copyPrompt} data-testid="occ-claude">Copy a prompt for Claude (asks for real sources)</button>
      <Hint>Paste it into Claude. It is told to give exact sources and to say "I am not sure" rather than guess. Check the source yourself before you switch on "I checked".</Hint>
    </div>
  );
}
