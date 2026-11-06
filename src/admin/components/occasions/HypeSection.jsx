import React, { useState } from 'react';
import { Field, Hint, SwitchRow, Choices, fieldStyle } from '../look/kit.jsx';
import { NumberField } from '../ui.jsx';
import { RANGES, LIMITS, MILESTONE_EVERY } from '../../../shared/occasions.js';
import { addMilestone, removeMilestone, previewMoments } from './occHelpers.js';
import { btn, small, colors, TriChoice, OwnField } from './occKit.jsx';

/** Milestone day counts as removable chips + an add-number box. */
export function MilestoneChips({ list, onChange, disabled }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const add = () => { const r = addMilestone(list, text); if (r.error) setErr(r.error); else { setErr(''); setText(''); onChange(r.list); } };
  return (
    <div data-testid="occ-milestones">
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {list.length === 0 && <span style={small}>No milestone days.</span>}
        {list.map((n) => (
          <span key={n} style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: colors.card, paddingLeft: '14px' }}>
            <strong style={{ fontSize: '15px' }}>{n}</strong>
            <button type="button" disabled={disabled} aria-label={`Remove ${n} days`} onClick={() => onChange(removeMilestone(list, n))} style={{ ...btn(false), border: 'none', minWidth: '44px', padding: 0 }}>{'✕'}</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
        <input type="text" inputMode="numeric" value={text} disabled={disabled} placeholder="Days, 1-365" aria-label="Add a milestone day count" onChange={(e) => { setText(e.target.value); setErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && add()} style={{ ...fieldStyle, width: '130px' }} />
        <button type="button" disabled={disabled} onClick={add} style={btn(false)}>Add</button>
      </div>
      {err && <p style={{ ...small, color: colors.danger, margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}

/** 'For every countdown': milestone takeovers, final minute, zero takeover, with Test buttons. */
export function HypeGlobal({ s, save, canEdit, hero, openPreview }) {
  const tests = previewMoments(hero, s);
  return (
    <>
      <Hint style={{ marginTop: 0 }}>The Countdown keeps rotating with the other slides all day. These are extra full-screen moments on top of that, and they pause the slides while they show.</Hint>
      <SwitchRow on={s.milestoneOn} onChange={() => save({ milestoneOn: !s.milestoneOn }, s.milestoneOn ? 'Milestone takeovers off' : 'Milestone takeovers on')} label="Milestone takeovers" note="On a day when the days left match a number below, a full-screen takeover appears for a couple of minutes at the start of each time slot." testId="occ-milestone-on" />
      {s.milestoneOn && (
        <>
          <Field label="Milestone days (days left)"><MilestoneChips list={s.milestones} disabled={!canEdit} onChange={(l) => save({ milestones: l }, 'Milestone days changed')} /></Field>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Field label="Shows for (minutes)"><NumberField value={s.milestoneMinutes} min={RANGES.milestoneMinutes.min} max={RANGES.milestoneMinutes.max} onCommit={(n) => save({ milestoneMinutes: n }, `Milestone takeover ${n} minutes`)} ariaLabel="Milestone minutes" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>
          </div>
          <Field label="How often"><Choices ariaLabel="How often" value={s.milestoneEveryMinutes} onChange={(v) => save({ milestoneEveryMinutes: v }, `Milestone takeover every ${v} minutes`)} options={MILESTONE_EVERY.map((v) => ({ value: v, label: v === 60 ? 'Every hour' : v === 120 ? 'Every 2 hours' : `Every ${v} minutes` }))} /></Field>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Field label="Only from"><input type="time" aria-label="Milestones from" value={s.milestoneFrom} disabled={!canEdit} onChange={(e) => e.target.value && save({ milestoneFrom: e.target.value }, `Milestones from ${e.target.value}`)} style={{ ...fieldStyle, maxWidth: '150px' }} /></Field>
            <Field label="Until"><input type="time" aria-label="Milestones until" value={s.milestoneTo} disabled={!canEdit} onChange={(e) => e.target.value && save({ milestoneTo: e.target.value }, `Milestones until ${e.target.value}`)} style={{ ...fieldStyle, maxWidth: '150px' }} /></Field>
          </div>
          <p style={small}>The screen's own clock. For example {s.milestoneMinutes} minute{s.milestoneMinutes === 1 ? '' : 's'} at the start of {s.milestoneEveryMinutes === 60 ? 'every hour' : `every ${s.milestoneEveryMinutes} minutes`}, between {s.milestoneFrom} and {s.milestoneTo}.</p>
        </>
      )}
      <SwitchRow on={s.finalOn} onChange={() => save({ finalOn: !s.finalOn }, s.finalOn ? 'Final minute off' : 'Final minute on')} label="Final minute" note="The last 60 seconds count down with live seconds, flowing into the moment it begins. Only with exact times." testId="occ-final-on" />
      <SwitchRow on={s.takeover} onChange={() => save({ takeover: !s.takeover }, s.takeover ? 'Zero takeover off' : 'Zero takeover on')} label="The moment it begins" note="A full-screen greeting when the countdown reaches zero. Only with exact times." testId="occ-zero-on" />
      {s.takeover && <Field label="Zero takeover minutes"><NumberField value={s.takeoverMinutes} min={RANGES.takeoverMinutes.min} max={RANGES.takeoverMinutes.max} onCommit={(n) => save({ takeoverMinutes: n }, `Zero takeover ${n} minutes`)} ariaLabel="Zero takeover minutes" disabled={!canEdit} style={{ ...fieldStyle, maxWidth: '96px' }} /></Field>}
      <div style={{ marginTop: '14px' }} data-testid="occ-hype-tests">
        <span style={{ ...small, fontWeight: 700, display: 'block', marginBottom: '6px' }}>Test on the screen</span>
        {tests.length ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{tests.map((t) => <button key={t.id} type="button" style={btn(false)} onClick={() => openPreview(t.ms)} data-testid={`occ-test-${t.id}`}>{t.label}</button>)}</div>
        ) : <p style={small}>Add an occasion first.</p>}
        <Hint>Opens the screen preview at that moment for {hero ? (hero.nameEn || hero.nameHe) : 'the nearest occasion'}. Nothing changes on the real TV.</Hint>
      </div>
    </>
  );
}

/** 'Just this one': per-occasion override of the hype moments. */
export function HypeOwn({ d, set, s }) {
  const own = Array.isArray(d.milestones);
  return (
    <>
      <p style={{ ...small, marginTop: 0 }}>Milestone takeover</p>
      <TriChoice ariaLabel="Milestone takeover for this occasion" value={d.milestoneOn ?? null} onChange={(v) => set({ milestoneOn: v })} defaultOn={s.milestoneOn} />
      <OwnField title="Milestone days" own={own} defaultText={s.milestones.join(', ')} onFollow={() => set({ milestones: null })} onCustom={() => set({ milestones: [...s.milestones] })}>
        <MilestoneChips list={d.milestones || []} onChange={(l) => set({ milestones: l })} />
      </OwnField>
      <p style={{ ...small, marginTop: '14px' }}>Final minute</p>
      <TriChoice ariaLabel="Final minute for this occasion" value={d.finalOn ?? null} onChange={(v) => set({ finalOn: v })} defaultOn={s.finalOn} />
      <Hint>The moment-it-begins takeover has its own switch further down ("Full-screen takeover at the moment it begins").</Hint>
      <p style={small}>Limit: {LIMITS.milestones} milestone days.</p>
    </>
  );
}
