import React, { useState } from 'react';
import { Hint, SwitchRow, fieldStyle } from '../look/kit.jsx';
import { LIMITS, explainState, explainWhy, sourceUrl, parseClaudeReply } from '../../../shared/occasions.js';
import { explainChip, onExplainEdit } from './occHelpers.js';
import { btn, small, label, TextIn, Chip, colors } from './occKit.jsx';

/** Open-source link: only for a real http(s) address inside the source text. */
export function OpenSource({ source }) {
  const url = sourceUrl(source);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" data-testid="occ-open-source" style={{ ...btn(false), display: 'inline-flex', alignItems: 'center', textDecoration: 'none', marginTop: 8 }}>Open source</a>;
}

const len = (s) => [...String(s || '').replace(/\s+/g, ' ').trim()].length;
function Count({ n, max, testId }) {
  const over = n > max;
  return <span style={{ ...small, color: over ? colors.danger : colors.dim, fontWeight: over ? 700 : 400 }} data-testid={testId}>{n} / {max}{over ? ' (too long)' : ''}</span>;
}

const FILLED_LABEL = { explainShortEn: 'the one line', explainShortHe: 'the Hebrew line', explainEn: 'the whole story', explainHe: 'the Hebrew story', source: 'the source' };

/**
 * 'What the bochurim see': the one line for the screen (why it is special), the whole story, ONE source for both and ONE
 * 'I checked this' switch. Editing any of them switches the check off again. Owner rule: nothing shows without a source and the check.
 */
export default function ExplainBox({ d, set, copyPrompt }) {
  const edit = (patch) => set(onExplainEdit(d, patch));
  const chip = explainChip(d);
  const st = explainState(d);
  const [paste, setPaste] = useState(null); // null = hidden, string = the box is open
  const [note, setNote] = useState('');

  const apply = (text) => {
    const r = parseClaudeReply(text);
    if (!r.found || !Object.keys(r.fields).length) { setNote('That does not look like the reply to the prompt. It needs lines that start with "Short English:", "Long English:" and "Source:".'); return false; }
    edit(r.fields);
    const parts = Object.keys(r.fields).map((k) => FILLED_LABEL[k]).filter(Boolean);
    setNote(`Filled in ${parts.join(', ')}.${r.shortTooLong ? ` The one line is longer than ${LIMITS.explainShort} characters: please shorten it.` : ''}${r.notSure ? ` Claude was not sure about: ${r.notSure}` : ''} Now open the source and check it.`);
    setPaste(null);
    return true;
  };
  const pasteFromClaude = async () => {
    setNote('');
    try {
      const t = await Promise.race([navigator.clipboard.readText(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 700))]);
      if (t && parseClaudeReply(t).found) { apply(t); return; }
    } catch { /* no clipboard permission: show the box */ }
    setPaste('');
  };

  return (
    <div style={{ border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: 14 }} data-testid="occ-explain-box">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Why it is special (optional)</h4>
        <Chip tone={chip.tone} testId="occ-explain-chip">{chip.text}</Chip>
      </div>
      <p style={{ ...small, margin: '0 0 8px' }}>It only shows on the screen when it has a real source AND you have checked it against that source (Chabad.org is a fine source). Anything you type or change is hidden until you check it again.</p>

      <span style={label}>One line for the screen (English)</span>
      <textarea value={d.explainShortEn} onChange={(e) => edit({ explainShortEn: e.target.value.replace(/\s*\n\s*/g, ' ') })} aria-label="One line for the screen in English" rows={2} maxLength={LIMITS.explainShort + 40} style={{ ...fieldStyle, width: '100%', minHeight: 64, resize: 'vertical' }} data-testid="occ-short-en" />
      <Count n={len(d.explainShortEn)} max={LIMITS.explainShort} testId="occ-short-en-count" />
      <div style={{ height: 8 }} />
      <span style={label}>The same line in Hebrew (optional)</span>
      <textarea value={d.explainShortHe} onChange={(e) => edit({ explainShortHe: e.target.value.replace(/\s*\n\s*/g, ' ') })} aria-label="One line for the screen in Hebrew" dir="rtl" rows={2} maxLength={LIMITS.explainShort + 40} style={{ ...fieldStyle, width: '100%', minHeight: 64, resize: 'vertical' }} data-testid="occ-short-he" />
      <Count n={len(d.explainShortHe)} max={LIMITS.explainShort} testId="occ-short-he-count" />

      <div style={{ height: 12 }} />
      <span style={label}>The whole story (English)</span>
      <textarea value={d.explainEn} onChange={(e) => edit({ explainEn: e.target.value })} aria-label="The whole story in English" rows={4} maxLength={LIMITS.explain + 50} style={{ ...fieldStyle, width: '100%', minHeight: 96, resize: 'vertical' }} data-testid="occ-explain-en" />
      <Count n={[...String(d.explainEn || '')].length} max={LIMITS.explain} testId="occ-explain-en-count" />
      <div style={{ height: 8 }} />
      <span style={label}>The whole story in Hebrew (optional)</span>
      <textarea value={d.explainHe} onChange={(e) => edit({ explainHe: e.target.value })} aria-label="The whole story in Hebrew" dir="rtl" rows={3} maxLength={LIMITS.explain + 50} style={{ ...fieldStyle, width: '100%', minHeight: 80, resize: 'vertical' }} />
      <Count n={[...String(d.explainHe || '')].length} max={LIMITS.explain} testId="occ-explain-he-count" />

      <div style={{ height: 12 }} />
      <span style={label}>Source for both (a sefer with page, the exact talk, or a link)</span>
      <TextIn value={d.source} onChange={(v) => edit({ source: v })} ariaLabel="Source" max={LIMITS.source} placeholder="Sefer, volume and page / https://www.chabad.org/..." testId="occ-source" />
      <OpenSource source={d.source} />
      <SwitchRow on={d.explainChecked === true} onChange={() => { if (d.explainChecked !== true && st !== 'needsCheck') return; set({ explainChecked: d.explainChecked !== true }); }} label="I checked this with the source" note={st === 'none' || st === 'needsSource' ? 'Add the text and the source first.' : 'Only switch this on after you opened the source and compared it, word for word.'} testId="occ-checked" />
      <p style={{ ...small, margin: '4px 0 0', color: st === 'shows' || st === 'none' ? colors.dim : colors.danger }} data-testid="occ-source-state">{st === 'shows' ? 'Checked: shows on the screen with this source under it.' : st === 'none' ? 'No explanation.' : explainWhy(d)}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" style={btn(false)} onClick={copyPrompt} data-testid="occ-claude">Copy a prompt for Claude</button>
        <button type="button" style={btn(false)} onClick={pasteFromClaude} data-testid="occ-paste-claude">Paste from Claude</button>
      </div>
      <Hint>Paste the prompt into Claude. It is told to give exact sources and to say "I am not sure" rather than guess. Then tap "Paste from Claude" to fill the lines and the source. Check the source yourself before you switch on "I checked".</Hint>
      {paste !== null && (
        <div style={{ marginTop: 8 }}>
          <span style={label}>Paste Claude's reply here</span>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Claude's reply" rows={5} style={{ ...fieldStyle, width: '100%', resize: 'vertical' }} data-testid="occ-paste-box" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={btn(true)} onClick={() => apply(paste)} data-testid="occ-paste-apply">Fill in the lines</button>
            <button type="button" style={btn(false)} onClick={() => { setPaste(null); setNote(''); }}>Cancel</button>
          </div>
        </div>
      )}
      {note && <p style={{ ...small, margin: '8px 0 0', color: colors.text }} role="status" data-testid="occ-paste-note">{note}</p>}
    </div>
  );
}
