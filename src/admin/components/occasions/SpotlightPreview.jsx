import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { Hint } from '../look/kit.jsx';
import { btn, small, label, Select } from './occKit.jsx';
import { spotlightModel, emptyTypeState, TYPES, TYPE_IDS, SPOTLIGHT_STAGE_LABEL, STAGE_IDS } from '../../../shared/spotlight.js';
import { momentFor, ACT_LABEL } from './spotlightKit.js';
import DesignRoot from '../../../screen/design/DesignRoot.jsx';
import Spotlight from '../../../screen/spotlight/Spotlight.jsx';
import { toSpot, viewOf } from '../../../screen/spotlight/adapt.js';
import { resolveActiveTheme } from '../../../shared/dayNight.js';

/**
 * The live preview of the Spotlight in the wizard: the REAL kiosk component (src/screen/spotlight/Spotlight.jsx, fed by adapt.js)
 * on a scaled 16:9 canvas, frozen at the chosen moment (still, no ticking). If the screen component ever throws, the boundary
 * below falls back to PlainLive: the model drawn as plain text (stage, number, kind, parts). Admin code never edits src/screen.
 */
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { bad: false }; }
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidUpdate(prev) { if (this.state.bad && prev.resetKey !== this.props.resetKey) this.setState({ bad: false }); }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}
function PlainLive({ model, width }) {
  const scale = width / 1600;
  const big = model.stage === 'day' ? 'Today' : model.days > 0 ? model.days : `${model.parts.h}:${String(model.parts.m).padStart(2, '0')}`;
  return (
    <div style={{ width, height: width * 0.5625, overflow: 'hidden', position: 'relative', borderRadius: 'var(--r-sm)', background: '#10131a', color: '#f3efe3' }} data-testid="spot-live-plain">
      <div style={{ width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: '0 0', padding: 80, boxSizing: 'border-box', fontFamily: adminFonts.englishBody, display: 'grid', alignContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 44, opacity: 0.75 }}>{model.words.kicker.en}</div>
        <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }}>{model.nameEn || model.nameHe}</div>
        <div style={{ fontSize: 300, fontWeight: 800, lineHeight: 1 }}>{big}</div>
        <div style={{ fontSize: 40, opacity: 0.8 }}>{model.type.id ? `Kind: ${TYPES[model.type.id].label}` : 'The day itself'}</div>
      </div>
    </div>
  );
}
function SpotlightLive({ model, view, nowMs, width, settings }) {
  const scale = width / 1600;
  const sp = toSpot(model, { lang: 'both' });
  const themeId = resolveActiveTheme(settings, {}, new Date(nowMs)).themeId;
  return (
    <Boundary resetKey={`${model.key}|${nowMs}|${view.kind}|${view.type || view.act || ''}`} fallback={<PlainLive model={model} width={width} />}>
      <div style={{ width, height: width * 0.5625, overflow: 'hidden', position: 'relative', borderRadius: 'var(--r-sm)', border: `1px solid ${colors.line}` }} data-testid="spot-live">
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'top left', direction: 'ltr', pointerEvents: 'none' }}>
          <DesignRoot settings={settings} themeId={themeId} style={{ position: 'absolute', inset: 0 }}>
            {sp && <Spotlight key={`${model.key}|${nowMs}|${view.kind}|${view.type || view.act || ''}`} sp={sp} view={view} nowMs={nowMs} live={false} still />}
          </DesignRoot>
        </div>
      </div>
    </Boundary>
  );
}

export default function SpotlightPreview({ file, spotlight, row, ctxNow, canvasWidth = 320, onOpenFull, appSettings = {} }) {
  const [stage, setStage] = useState('week');
  const [part, setPart] = useState(0);
  const [kind, setKind] = useState('');
  // the model of THIS day, built with the draft settings (what you set in the steps), at a moment inside the chosen stage
  const base = useMemo(() => {
    if (!row) return null;
    const { now, ctx } = ctxNow();
    const settings = { ...file.settings, spotlight: { ...spotlight, pick: 'queue', queue: [{ id: row.id, startISO: row.startISO }], leadDays: Math.max(spotlight.leadDays, 60) } };
    // a half-typed draft must never take the admin page down: no preview instead
    try { return { settings, ctx, now, m0: spotlightModel(now, settings, file, { ctx }) }; } catch { return null; }
  }, [file, spotlight, row, ctxNow]);
  const at = base && base.m0.mode === 'spotlight' ? momentFor(base.m0, stage) : null;
  const model = useMemo(() => {
    if (!base || at == null) return null;
    const ts = kind ? { ...emptyTypeState(), last: kind } : null;
    try {
      const m = spotlightModel(new Date(at), base.settings, file, { ctx: base.ctx, typeState: ts });
      return m.mode === 'spotlight' ? m : null;
    } catch { return null; }
  }, [base, at, kind, file]);
  if (!row) return <Hint>Choose a day in step 1 to see it here.</Hint>;
  const eligibleKinds = model?.type.eligible || [];
  return (
    <div data-testid="spot-preview" style={{ display: 'grid', gap: '12px' }}>
      <div role="group" aria-label="Preview stage" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {STAGE_IDS.map((id) => {
          const ms = base && base.m0.mode === 'spotlight' ? momentFor(base.m0, id) : null;
          const off = ms == null || spotlight.stages[id] === false; const on = id === stage;
          return <button key={id} type="button" aria-pressed={on} disabled={ms == null} data-testid={`spot-stage-${id}`} onClick={() => { setStage(id); setPart(0); }}
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
      {model && model.acts.length > 1 && (
        <div>
          <span style={label}>Part of the round</span>
          <Select ariaLabel="Preview part" value={String(Math.min(part, model.acts.length - 1))} onChange={(v) => setPart(Number(v))} testId="spot-preview-part"
            options={model.acts.map((a, i) => ({ value: String(i), label: i === 0 ? (model.stage === 'day' ? 'Today' : 'The countdown') : (ACT_LABEL[a.id] || a.id) }))} />
        </div>
      )}
      <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
        {model ? <SpotlightLive model={model} view={viewOf(model.acts[Math.min(part, model.acts.length - 1)].id, model)} nowMs={at} width={canvasWidth} settings={appSettings} /> : <Hint>{at == null ? 'This stage does not happen for this day (it starts too late).' : 'Nothing to show at that moment.'}</Hint>}
      </div>
      {model && <p style={{ ...small, margin: 0 }} data-testid="spot-preview-summary">{model.stage === 'day' ? 'The day itself' : `${model.days} days to go`} · {model.acts.length - 1} story part{model.acts.length === 2 ? '' : 's'} in a round · about {Math.round(model.totalSeconds)} seconds</p>}
      <div><button type="button" style={btn(false)} onClick={() => onOpenFull(at)} data-testid="spot-open-full" disabled={at == null}>Open on a full screen</button>
        <Hint>The full screen shows what is saved, so save first to see changes. It opens at this moment and the real TV is not touched.</Hint></div>
    </div>
  );
}
