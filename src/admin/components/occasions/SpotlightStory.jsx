import React, { useState } from 'react';
import { colors } from '../../styles/admin-tokens.js';
import { Hint, fieldStyle } from '../look/kit.jsx';
import { btn, small, label, TextIn, CommitSlider } from './occKit.jsx';
import ExplainBox from './ExplainBox.jsx';
import { SinceField, YearVorts } from './MilestoneSection.jsx';
import { PhotoField } from './LookSection.jsx';
import { vortPrompt, hebrewWords, civilWords, RANGES } from '../../../shared/occasions.js';
import { SPOTLIGHT_LIMITS } from '../../../shared/spotlight.js';
import { vortOnlyPrompt, historyPrompt, parseSpotlightReply } from './spotlightKit.js';
import { arrowBtn } from './SpotlightParts.jsx';
import { moveItem } from './occHelpers.js';

const len = (s) => [...String(s || '')].length;
function Count({ n, max }) { return <span style={{ ...small, color: n > max ? colors.danger : colors.dim, fontWeight: n > max ? 700 : 400 }}>{n} / {max}{n > max ? ' (too long)' : ''}</span>; }
const dateOf = (row) => (row?.startISO ? `${hebrewWords(row.startISO).en}, ${civilWords(row.startISO).en}` : '');
const block = { border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: 14, display: 'grid', gap: 10, minWidth: 0 };
const area = { ...fieldStyle, width: '100%', minHeight: 72, resize: 'vertical' };

/** 'Paste Claude's reply' box shared by the vort and the history blocks. */
function PasteBox({ onApply, testId }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [note, setNote] = useState('');
  const apply = () => { const r = parseSpotlightReply(text); if (!r.vort && !r.history) { setNote('That does not look like the reply to the prompt (it needs lines that start with "Vort English:" or "History:").'); return; } onApply(r); setNote(`Filled in. ${r.notSure ? `Claude was not sure about: ${r.notSure}. ` : ''}Open the source and check it.`); setOpen(false); setText(''); };
  return (
    <div>
      <button type="button" style={btn(false)} onClick={() => setOpen(!open)} aria-expanded={open} data-testid={testId}>Paste Claude's reply</button>
      {open && (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Claude's reply" rows={5} style={area} placeholder="Paste the whole reply here" />
          <div><button type="button" style={btn(true)} onClick={apply} disabled={!text.trim()}>Fill in the fields</button></div>
        </div>
      )}
      {note && <p style={{ ...small, margin: '6px 0 0' }}>{note}</p>}
    </div>
  );
}

/** Step 3 of the wizard: the day's story for the chosen day. `d` is the day's draft, `set(patch)` changes it. */
export default function SpotlightStory({ d, set, row, copy }) {
  const name = d.nameEn || d.nameHe;
  const vort = d.vort || { en: '', he: '', source: '' };
  const setVort = (p) => set({ vort: { ...vort, ...p } });
  const hist = Array.isArray(d.history) ? d.history : [];
  const setHist = (list) => set({ history: list });
  const look = d.look || {};
  return (
    <div style={{ display: 'grid', gap: 14 }} data-testid="spot-story">
      <p style={{ ...small, margin: 0 }}>All of this is optional. A part you leave empty simply does not show. Sources are printed when you give them. No student names, please.</p>

      <ExplainBox d={d} set={set} copyPrompt={() => copy(vortPrompt(row, name), 'Prompt copied')} />

      <div style={block} data-testid="spot-vort">
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>A short teaching (vort)</h4>
        <p style={{ ...small, margin: 0 }}>A few sentences that show after the countdown. Separate from the story above.</p>
        <div><span style={label}>English</span><textarea value={vort.en} onChange={(e) => setVort({ en: e.target.value })} aria-label="Vort in English" rows={3} style={area} data-testid="spot-vort-en" /><Count n={len(vort.en)} max={SPOTLIGHT_LIMITS.vort} /></div>
        <div><span style={label}>Hebrew</span><textarea dir="rtl" value={vort.he} onChange={(e) => setVort({ he: e.target.value })} aria-label="Vort in Hebrew" rows={3} style={area} /><Count n={len(vort.he)} max={SPOTLIGHT_LIMITS.vort} /></div>
        <div><span style={label}>Source (optional)</span><TextIn value={vort.source} onChange={(v) => setVort({ source: v })} ariaLabel="Vort source" max={SPOTLIGHT_LIMITS.vortSource} /></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={() => copy(vortOnlyPrompt(name || 'this day', dateOf(row)), 'Prompt copied')} data-testid="spot-vort-prompt">Copy a Claude prompt</button>
        </div>
        <PasteBox onApply={(r) => r.vort && setVort(r.vort)} testId="spot-vort-paste" />
      </div>

      <div style={block} data-testid="spot-history">
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>This day in history</h4>
        <p style={{ ...small, margin: 0 }}>Up to {SPOTLIGHT_LIMITS.history} short lines: the Hebrew year and what happened. Rebbeim, places and events only.</p>
        {hist.map((h, i) => (
          <div key={i} style={{ display: 'grid', gap: 6, borderTop: i ? `1px solid ${colors.line}` : 'none', paddingTop: i ? 10 : 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input inputMode="numeric" value={h.year ?? ''} onChange={(e) => setHist(hist.map((x, j) => (j === i ? { ...x, year: e.target.value.replace(/\D/g, '').slice(0, 4) } : x)))} aria-label={`History line ${i + 1}: year`} placeholder="5747" style={{ ...fieldStyle, width: 92, flex: 'none' }} />
              <span style={{ flex: 1 }} />
              <button type="button" aria-label={`Move line ${i + 1} up`} disabled={i === 0} style={arrowBtn} onClick={() => setHist(moveItem(hist, i, -1))}>{'▲'}</button>
              <button type="button" aria-label={`Move line ${i + 1} down`} disabled={i === hist.length - 1} style={arrowBtn} onClick={() => setHist(moveItem(hist, i, 1))}>{'▼'}</button>
              <button type="button" aria-label={`Remove line ${i + 1}`} style={arrowBtn} onClick={() => setHist(hist.filter((_, j) => j !== i))}>{'✕'}</button>
            </div>
            <TextIn value={h.en} onChange={(v) => setHist(hist.map((x, j) => (j === i ? { ...x, en: v } : x)))} ariaLabel={`History line ${i + 1} in English`} max={SPOTLIGHT_LIMITS.historyText} placeholder="What happened (English)" />
            <TextIn value={h.he} onChange={(v) => setHist(hist.map((x, j) => (j === i ? { ...x, he: v } : x)))} ariaLabel={`History line ${i + 1} in Hebrew`} dir="rtl" max={SPOTLIGHT_LIMITS.historyText} placeholder="בעברית (לא חובה)" />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} disabled={hist.length >= SPOTLIGHT_LIMITS.history} onClick={() => setHist([...hist, { year: '', en: '', he: '' }])} data-testid="spot-history-add">+ Add a line</button>
          <button type="button" style={btn(false)} onClick={() => copy(historyPrompt(name || 'this day', dateOf(row)), 'Prompt copied')} data-testid="spot-history-prompt">Copy a Claude prompt</button>
        </div>
        <PasteBox onApply={(r) => r.history && setHist([...hist, ...r.history].slice(0, SPOTLIGHT_LIMITS.history))} testId="spot-history-paste" />
      </div>

      <div style={block}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Milestone years</h4>
        <SinceField d={d} set={set} next={row} />
        <YearVorts d={d} set={set} next={row} copy={copy} />
      </div>

      <div style={block} data-testid="spot-photo">
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>A photo</h4>
        <PhotoField url={look.photo || ''} ariaLabel="Photo of the day" onChange={(u) => set({ look: { ...look, photo: u } })} />
        <div><span style={label}>Darkening over the photo</span><CommitSlider value={look.dim ?? 55} min={RANGES.dim.min} max={RANGES.dim.max} step={5} unit="%" ariaLabel="Darkening over the photo" onCommit={(n) => set({ look: { ...look, dim: n } })} /></div>
        <Hint style={{ marginTop: 0 }}>JPEG, PNG or WebP. The screen dims it so the words stay readable.</Hint>
      </div>
    </div>
  );
}
