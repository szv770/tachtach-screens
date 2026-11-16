import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { Hint } from '../look/kit.jsx';
import { btn, small, label, Select } from './occKit.jsx';
import { spotlightModel, emptyTypeState, TYPES, TYPE_IDS, SPOTLIGHT_STAGE_LABEL, STAGE_IDS } from '../../../shared/spotlight.js';
import { momentFor } from './spotlightKit.js';

/**
 * The live preview of the Spotlight in the wizard: a scaled 16:9 box with the stage chips and a kind picker.
 *
 * PLACEHOLDER (build step 8): the real kiosk component (src/screen/spotlight/Spotlight.jsx, built in parallel) was not on origin
 * when this was written, so SpotlightLive below draws the real MODEL (stage, number, kind, acts, words) as plain text on a scaled
 * 16:9 canvas. When the kiosk component lands, import it in SpotlightLive.jsx-style (one wrapper, props: model, width) and
 * replace ONLY the body of `SpotlightLive`; nothing else in the wizard changes.
 */
function SpotlightLive({ model, width }) {
  const scale = width / 1600;
  const he = model.nameHe; const big = model.stage === 'day' ? 'Today' : model.days > 0 ? model.days : `${model.parts.h}:${String(model.parts.m).padStart(2, '0')}`;
  return (
    <div style={{ width, height: width * 0.5625, overflow: 'hidden', position: 'relative', borderRadius: 'var(--r-sm)', background: '#10131a', color: '#f3efe3' }} data-testid="spot-live-placeholder">
      <div style={{ width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: '0 0', padding: 80, boxSizing: 'border-box', fontFamily: adminFonts.englishBody, display: 'grid', alignContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 44, letterSpacing: 6, textTransform: 'uppercase', opacity: 0.75 }}>{model.words.kicker.en}</div>
        <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }}>{model.nameEn || he}</div>
        <div style={{ fontSize: 300, fontWeight: 800, lineHeight: 1, opacity: 0.55 + model.heat * 0.45 }}>{big}</div>
        <div style={{ fontSize: 40, opacity: 0.8 }}>{model.type.id ? `Kind: ${TYPES[model.type.id].label}` : 'The day itself'} · {model.acts.map((a) => a.id).join(' > ')}</div>
        <div style={{ position: 'absolute', right: 40, bottom: 28, fontSize: 30, opacity: 0.6 }}>Placeholder: the real screen drawing is not connected yet</div>
      </div>
    </div>
  );
}

export default function SpotlightPreview({ file, spotlight, row, ctxNow, canvasWidth = 320, onOpenFull }) {
  const [stage, setStage] = useState('week');
  const [kind, setKind] = useState('');
  // the model of THIS day, built with the draft settings (what you set in the steps), at a moment inside the chosen stage
  const base = useMemo(() => {
    if (!row) return null;
    const { now, ctx } = ctxNow();
    const settings = { ...file.settings, spotlight: { ...spotlight, pick: 'queue', queue: [{ id: row.id, startISO: row.startISO }], leadDays: Math.max(spotlight.leadDays, 60) } };
    return { settings, ctx, now, m0: spotlightModel(now, settings, file, { ctx }) };
  }, [file, spotlight, row, ctxNow]);
  const at = base && base.m0.mode === 'spotlight' ? momentFor(base.m0, stage) : null;
  const model = useMemo(() => {
    if (!base || at == null) return null;
    const ts = kind ? { ...emptyTypeState(), last: kind } : null;
    const m = spotlightModel(new Date(at), base.settings, file, { ctx: base.ctx, typeState: ts });
    return m.mode === 'spotlight' ? m : null;
  }, [base, at, kind, file]);
  if (!row) return <Hint>Choose a day in step 1 to see it here.</Hint>;
  const eligibleKinds = model?.type.eligible || [];
  return (
    <div data-testid="spot-preview" style={{ display: 'grid', gap: '12px' }}>
      <div role="group" aria-label="Preview stage" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {STAGE_IDS.map((id) => {
          const ms = base && base.m0.mode === 'spotlight' ? momentFor(base.m0, id) : null;
          const off = ms == null || spotlight.stages[id] === false; const on = id === stage;
          return <button key={id} type="button" aria-pressed={on} disabled={ms == null} data-testid={`spot-stage-${id}`} onClick={() => setStage(id)}
            style={{ ...btn(false), minHeight: '44px', padding: '0 12px', fontSize: '13px', background: on ? colors.accentSoft : 'transparent', color: on ? colors.accent : off ? colors.dim : colors.text, borderColor: on ? colors.accent : colors.line, opacity: ms == null ? 0.45 : 1, textDecoration: spotlight.stages[id] === false ? 'line-through' : 'none' }}>{SPOTLIGHT_STAGE_LABEL[id]}</button>;
        })}
      </div>
      {model && model.stage !== 'day' && (
        <div>
          <span style={label}>Countdown kind</span>
          <Select ariaLabel="Preview kind" value={kind && eligibleKinds.includes(kind) ? kind : ''} onChange={setKind} testId="spot-preview-kind"
            options={[{ value: '', label: 'The one it would pick' }, ...TYPE_IDS.filter((t) => eligibleKinds.includes(t)).map((t) => ({ value: t, label: TYPES[t].label }))]} />
        </div>
      )}
      <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
        {model ? <SpotlightLive model={model} width={canvasWidth} /> : <Hint>{at == null ? 'This stage does not happen for this day (it starts too late).' : 'Nothing to show at that moment.'}</Hint>}
      </div>
      {model && <p style={{ ...small, margin: 0 }} data-testid="spot-preview-summary">{model.stage === 'day' ? 'The day itself' : `${model.days} days to go`} · {model.acts.length - 1} story part{model.acts.length === 2 ? '' : 's'} in a round · about {Math.round(model.totalSeconds)} seconds</p>}
      <div><button type="button" style={btn(false)} onClick={() => onOpenFull(at)} data-testid="spot-open-full" disabled={at == null}>Open on a full screen</button>
        <Hint>The full screen shows what is saved, so save first to see changes. It opens at this moment and the real TV is not touched.</Hint></div>
    </div>
  );
}
