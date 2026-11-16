import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import { Hint } from '../look/kit.jsx';
import { btn, small, h3, Chip } from './occKit.jsx';
import { occasionProblem, daysUntil } from '../../../shared/occasions.js';
import { TYPE_IDS } from '../../../shared/spotlight.js';
import { chooseList, toggleInQueue, inQueue, pickOfQueue, MAX_QUEUE } from './spotlightKit.js';
import { moveItem } from './occHelpers.js';
import { KindTile, KIND_NOTE, arrowBtn } from './SpotlightParts.jsx';
import SpotlightStory from './SpotlightStory.jsx';
import SpotlightPreview from './SpotlightPreview.jsx';

const STEPS = ['Which day', 'Kinds of countdown', 'The day\'s story', 'Preview'];
const STORY_KEYS = ['explainShortEn', 'explainShortHe', 'explainEn', 'explainHe', 'source', 'explainChecked', 'vort', 'history', 'since', 'yearVorts', 'look'];
const rowName = (r) => r.nameEn || r.nameHe;

const tile = (on) => ({ minHeight: '56px', padding: '8px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 10, fontFamily: adminFonts.englishBody,
  border: `1.5px solid ${on ? colors.accent : colors.line}`, background: on ? colors.accentSoft : colors.card, color: colors.text });

/**
 * The 4-step Spotlight setup (bottom sheet, sticky Back / Next / Save, 44 px targets):
 * 1 Which day (automatic, or tap days to line them up) · 2 Kinds of countdown · 3 The day's story · 4 Preview with stage chips.
 * Saves the spotlight settings (pick, line-up, kinds switched off) and the story fields of the chosen day in one go.
 */
export default function SpotlightWizard({ file, rows, autoRow, initialStep = 1, canEdit, busy, ctxNow, copy, onClose, onSave, onOpenFull }) {
  const sp0 = file.settings.spotlight;
  const [step, setStep] = useState(initialStep);
  const [queue, setQueue] = useState(sp0.queue);
  const [off, setOff] = useState(sp0.types.off);
  const [edits, setEdits] = useState({}); // occasion id -> the story fields changed in this sheet
  const [showAll, setShowAll] = useState(false);
  const today = file.today;
  const list = useMemo(() => chooseList(rows), [rows]);
  const shown = showAll ? list : list.slice(0, 8);

  const pick = pickOfQueue(queue);
  const spotlight = { ...sp0, pick, queue, types: { ...sp0.types, off } };
  const targetRow = (queue[0] && (list.find((r) => r.id === queue[0].id && r.startISO === queue[0].startISO) || list.find((r) => r.id === queue[0].id))) || autoRow || list.find((r) => r.occasion.big !== false) || list[0] || null;
  const tid = targetRow?.id;
  const draft = targetRow ? { ...targetRow.occasion, ...(edits[tid] || {}) } : null;
  const setDraft = (patch) => setEdits((e) => ({ ...e, [tid]: { ...(e[tid] || {}), ...patch } }));
  const problem = draft ? occasionProblem({ ...draft, nameEn: draft.nameEn, rule: draft.rule }) : null;
  const dirty = pick !== sp0.pick || JSON.stringify(queue) !== JSON.stringify(sp0.queue) || JSON.stringify(off) !== JSON.stringify(sp0.types.off) || Object.keys(edits).length > 0;

  const toggleKind = (id) => setOff((o) => (o.includes(id) ? o.filter((x) => x !== id) : o.length >= TYPE_IDS.length - 1 ? o : [...o, id]));
  const save = () => {
    const story = {};
    if (tid && edits[tid]) for (const k of STORY_KEYS) if (k in edits[tid]) story[k] = k === 'vort' ? (edits[tid].vort && (edits[tid].vort.en || edits[tid].vort.he) ? edits[tid].vort : null) : edits[tid][k];
    if (tid && edits[tid]?.history) story.history = edits[tid].history.map((h) => ({ ...h, year: h.year === '' ? null : Number(h.year) }));
    onSave({ spotlight: { pick, queue, types: { off } }, occasionId: tid, story: Object.keys(story).length ? story : null });
  };

  const nav = { position: 'sticky', bottom: 0, background: colors.surface || colors.card, padding: '10px 0', borderTop: `1px solid ${colors.line}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' };
  return (
    <Sheet open onClose={onClose} title="Set up the Spotlight" label="Spotlight setup">
      <div style={{ display: 'grid', gap: '16px', paddingBottom: '84px' }} data-testid="spot-wizard">
        <ol style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0 }} aria-label="Steps">
          {STEPS.map((t, i) => (
            <li key={t} style={{ flex: 1, minWidth: 0 }}>
              <button type="button" onClick={() => setStep(i + 1)} aria-current={step === i + 1 ? 'step' : undefined} aria-label={`Step ${i + 1}: ${t}`} data-testid={`spot-step-btn-${i + 1}`}
                style={{ width: '100%', minHeight: 44, border: 'none', borderBottom: `3px solid ${step >= i + 1 ? colors.accent : colors.line}`, background: 'transparent', color: step === i + 1 ? colors.text : colors.dim, fontFamily: adminFonts.englishBody, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '0 2px' }}>
                {i + 1}<span style={{ display: 'block', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>
              </button>
            </li>
          ))}
        </ol>

        {step === 1 && (
          <section style={{ display: 'grid', gap: 10 }} aria-label="Step 1: Which day" data-testid="spot-step-1">
            <h3 style={h3}>Which day is the star?</h3>
            <p style={{ ...small, margin: 0 }}>Tap a day to make it the Spotlight. Tap more to line them up: when one is over, the next takes over by itself.</p>
            <button type="button" aria-pressed={queue.length === 0} onClick={() => setQueue([])} style={tile(queue.length === 0)} data-testid="spot-pick-auto">
              <span style={{ fontSize: 18 }} aria-hidden="true">{queue.length === 0 ? '●' : '○'}</span>
              <span><strong style={{ fontSize: 15 }}>Automatic</strong><span style={{ ...small, display: 'block' }}>The nearest big day{autoRow && queue.length === 0 ? `: now ${rowName(autoRow)}` : ''}</span></span>
            </button>
            {shown.map((r) => {
              const i = inQueue(queue, r); const on = i >= 0; const n = daysUntil(r, today);
              return (
                <button key={r.id} type="button" aria-pressed={on} onClick={() => setQueue((q) => toggleInQueue(q, r))} style={tile(on)} data-testid={`spot-pick-${r.id}`}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: 14, fontWeight: 700, border: `1.5px solid ${on ? colors.accent : colors.line}`, background: on ? colors.accent : 'transparent', color: on ? 'var(--on-accent, #fff)' : colors.dim }}>{on ? i + 1 : ''}</span>
                  <span style={{ minWidth: 0, flex: 1 }}><strong style={{ fontSize: 15 }}>{rowName(r)}</strong><span style={{ ...small, display: 'block' }}>{n <= 0 ? 'Today' : `in ${n} day${n === 1 ? '' : 's'}`}{r.nameHe && r.nameEn ? ` · ${r.nameHe}` : ''}</span></span>
                  {r.occasion.big === false && <Chip>small</Chip>}
                </button>
              );
            })}
            {list.length > 8 && <button type="button" style={btn(false)} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${list.length} days`}</button>}
            {queue.length >= MAX_QUEUE && <Hint style={{ marginTop: 0 }}>{MAX_QUEUE} days is the most in a line-up.</Hint>}
            {queue.length > 1 && (
              <div data-testid="spot-lineup">
                <h4 style={{ margin: '6px 0', fontSize: 15 }}>Your line-up, in order</h4>
                {queue.map((e, i) => {
                  const r = list.find((x) => x.id === e.id && x.startISO === e.startISO) || list.find((x) => x.id === e.id);
                  return (
                    <div key={`${e.id}${e.startISO}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 48 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{i + 1}. {r ? rowName(r) : e.id}</span>
                      <button type="button" aria-label={`Move ${r ? rowName(r) : e.id} earlier`} disabled={i === 0} style={arrowBtn} onClick={() => setQueue(moveItem(queue, i, -1))}>{'▲'}</button>
                      <button type="button" aria-label={`Move ${r ? rowName(r) : e.id} later`} disabled={i === queue.length - 1} style={arrowBtn} onClick={() => setQueue(moveItem(queue, i, 1))}>{'▼'}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section style={{ display: 'grid', gap: 10 }} aria-label="Step 2: Kinds of countdown" data-testid="spot-step-2">
            <h3 style={h3}>Which kinds of countdown?</h3>
            <p style={{ ...small, margin: 0 }}>They take turns, a different one each time. Close to the day only the ones that tick seconds show. Tap one to switch it off. Order and more are under More options.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {TYPE_IDS.map((id) => <KindTile key={id} id={id} on={!off.includes(id)} note={KIND_NOTE[id]} disabled={!off.includes(id) && off.length >= TYPE_IDS.length - 1} onToggle={() => toggleKind(id)} />)}
            </div>
            <p style={{ ...small, margin: 0 }} data-testid="spot-kinds-count">{TYPE_IDS.length - off.length} of {TYPE_IDS.length} on. At least one stays on.</p>
          </section>
        )}

        {step === 3 && (
          <section style={{ display: 'grid', gap: 10 }} aria-label="Step 3: The day's story" data-testid="spot-step-3">
            <h3 style={h3}>The story of {targetRow ? rowName(targetRow) : 'the day'}</h3>
            {targetRow && draft
              ? <SpotlightStory key={tid} d={draft} set={setDraft} row={targetRow} copy={copy} />
              : <Hint>Nothing to tell yet: choose a day in step 1, or add a day to the list first.</Hint>}
          </section>
        )}

        {step === 4 && (
          <section style={{ display: 'grid', gap: 10 }} aria-label="Step 4: Preview" data-testid="spot-step-4">
            <h3 style={h3}>Preview{targetRow ? `: ${rowName(targetRow)}` : ''}</h3>
            <p style={{ ...small, margin: 0 }}>See it at different times on the way to the day. {dirty ? 'This shows what you have chosen so far.' : ''}</p>
            <SpotlightPreview file={file} spotlight={spotlight} row={targetRow} ctxNow={ctxNow} canvasWidth={Math.min(360, (typeof window !== 'undefined' ? window.innerWidth : 360) - 64)} onOpenFull={onOpenFull} />
          </section>
        )}
        {problem && step === 3 && <p style={{ ...small, color: colors.danger, margin: 0 }} data-testid="spot-problem">{problem}</p>}
      </div>
      <div style={nav}>
        {step > 1 && <button type="button" style={btn(false)} onClick={() => setStep(step - 1)} data-testid="spot-back">Back</button>}
        {step < 4 && <button type="button" style={btn(false)} onClick={() => setStep(step + 1)} data-testid="spot-next">Next</button>}
        <button type="button" style={btn(true)} disabled={!canEdit || busy || !!problem || !dirty} onClick={save} data-testid="spot-save">Save</button>
        <button type="button" style={btn(false, { marginLeft: 'auto' })} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
