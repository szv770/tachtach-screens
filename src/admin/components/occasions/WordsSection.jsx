import React, { useEffect, useState } from 'react';
import { Field, Hint } from '../look/kit.jsx';
import { STAGES, STAGE_LABEL, STAGE_TEXT_DEFAULTS, LIMITS, RANGES, milestoneDefault } from '../../../shared/occasions.js';
import { withLine } from './occHelpers.js';
import { btn, small, label, TextIn, colors } from './occKit.jsx';

/** One EN / HE line with 'no line' and 'follow the default'. `value` undefined = follows; saves when a box is left. */
function LineRow({ title, value, placeholder, onSet, onFollow, followText, disabled }) {
  const [en, setEn] = useState(value?.en ?? '');
  const [he, setHe] = useState(value?.he ?? '');
  useEffect(() => { setEn(value?.en ?? ''); setHe(value?.he ?? ''); }, [value?.en, value?.he]);
  const commit = () => { if (en.trim() === (value?.en ?? '') && he.trim() === (value?.he ?? '')) return; if (!en.trim() && !he.trim() && value === undefined) return; onSet({ en: en.trim(), he: he.trim() }); };
  const state = value === undefined ? followText : (!value.en && !value.he ? 'No line on purpose' : 'Your words');
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${colors.line}` }} data-testid={`occ-line-${title}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}><strong style={{ fontSize: '14px' }}>{title}</strong><span style={small}>{state}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '8px', marginTop: '6px' }}>
        <TextIn value={en} onChange={setEn} onBlur={commit} ariaLabel={`${title} in English`} max={LIMITS.stageLine} placeholder={placeholder?.en || 'English'} disabled={disabled} />
        <TextIn value={he} onChange={setHe} onBlur={commit} ariaLabel={`${title} in Hebrew`} dir="rtl" max={LIMITS.stageLine} placeholder={placeholder?.he || 'עברית'} disabled={disabled} />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled} style={btn(false, { minHeight: '44px' })} onClick={() => onSet({ en: '', he: '' })}>No line</button>
        {value !== undefined && <button type="button" disabled={disabled} style={btn(false)} onClick={onFollow}>{followText === 'Built-in' ? 'Use the built-in line' : 'Follow the default'}</button>}
      </div>
    </div>
  );
}

/**
 * Words for each stage + per milestone. level 'global': value = { stageText, milestoneText } from settings, onChange(patch, msg).
 * level 'own': value = the occasion's own maps, `base` = the settings' maps (for placeholders), onChange(patch).
 */
export function WordsEditor({ level, stageText, milestoneText, baseStage = {}, baseMilestone = {}, onChange, disabled }) {
  const own = level === 'own';
  const [num, setNum] = useState('');
  const [err, setErr] = useState('');
  const stagePh = (k) => baseStage[k] || STAGE_TEXT_DEFAULTS[k];
  const addMs = () => {
    const n = Number(num);
    if (!Number.isInteger(n) || n < RANGES.milestoneDay.min || n > RANGES.milestoneDay.max) { setErr(`A whole number from ${RANGES.milestoneDay.min} to ${RANGES.milestoneDay.max}.`); return; }
    if (milestoneText[String(n)]) { setErr(`${n} already has a line.`); return; }
    if (Object.keys(milestoneText).length >= LIMITS.milestoneTexts) { setErr(`${LIMITS.milestoneTexts} lines at most.`); return; }
    setErr(''); setNum('');
    onChange({ milestoneText: withLine(milestoneText, String(n), baseMilestone[String(n)] || milestoneDefault(n)) }, `Line for ${n} days added`);
  };
  return (
    <div data-testid="occ-words">
      <Hint style={{ marginTop: 0 }}>A short line above the countdown, one line, {LIMITS.stageLine} characters at most. Leave a stage on its built-in line, write your own, or choose "No line". Hebrew lines: have a Hebrew speaker read them.</Hint>
      {STAGES.map((k) => (
        <LineRow key={k} title={STAGE_LABEL[k]} value={stageText[k]} placeholder={stagePh(k)} disabled={disabled}
          followText={own ? 'Follows the default' : 'Built-in'}
          onSet={(v) => onChange({ stageText: withLine(stageText, k, v) }, `${STAGE_LABEL[k]}: words saved`)}
          onFollow={() => onChange({ stageText: withLine(stageText, k, undefined) }, `${STAGE_LABEL[k]}: back to ${own ? 'the default' : 'built-in'}`)} />
      ))}
      <Field label="A line for one particular day count" hint="For example 7 for 'one week to go'. Beats the stage line on that day.">
        {Object.keys(milestoneText).sort((a, b) => Number(a) - Number(b)).map((k) => (
          <LineRow key={k} title={`${k} days left`} value={milestoneText[k]} placeholder={baseMilestone[k] || milestoneDefault(Number(k))} disabled={disabled} followText="Built-in"
            onSet={(v) => onChange({ milestoneText: withLine(milestoneText, k, v) }, `${k} days: words saved`)}
            onFollow={() => onChange({ milestoneText: withLine(milestoneText, k, undefined) }, `${k} days: line removed`)} />
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
          <input type="text" inputMode="numeric" value={num} disabled={disabled} placeholder="Days, 1-365" aria-label="Day count for a new line" onChange={(e) => { setNum(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && addMs()}
            style={{ minHeight: '44px', width: '130px', boxSizing: 'border-box', fontSize: '16px', padding: '0 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${colors.border}`, background: colors.card, color: colors.text }} />
          <button type="button" disabled={disabled} style={btn(false)} onClick={addMs}>Add a line</button>
        </div>
        {err && <p style={{ ...small, color: colors.danger, margin: '6px 0 0' }}>{err}</p>}
      </Field>
    </div>
  );
}
