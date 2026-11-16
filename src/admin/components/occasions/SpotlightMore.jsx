import React, { useState } from 'react';
import { colors } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import { Field, Hint, SwitchRow, Choices, fieldStyle } from '../look/kit.jsx';
import { NumberField } from '../ui.jsx';
import { btn, small, label, Select, Group, OwnField } from './occKit.jsx';
import { LookEditor, StageStyleField, HypeField } from './LookSection.jsx';
import { moveItem } from './occHelpers.js';
import { KindThumb, KindTile, KIND_NOTE, arrowBtn } from './SpotlightParts.jsx';
import { ACT_LABEL, STAGE_NOTE, DEPTH_LABEL, kindsSummary, stagesSummary, actsSummary, stripSummary, depthSummary, stageDates } from './spotlightKit.js';
import { TYPE_IDS, TYPES, TYPE_LABEL, TYPE_MODES, TYPE_MODE_LABEL, STAGE_IDS, SPOTLIGHT_STAGE_LABEL, SPOTLIGHT_ACTS, SPOTLIGHT_DEPTHS, SPOTLIGHT_RANGES } from '../../../shared/spotlight.js';

const fmt = (d) => (d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const num = { ...fieldStyle, maxWidth: '96px' };

/** One day's own spotlight options (its own kinds, its own start): used in the edit sheet and under 'Just for one day'. */
export function OccSpotlightOwn({ value, onChange, off = [], baseLead, disabled }) {
  const v = value || { types: null, leadDays: null };
  const only = Array.isArray(v.types) ? v.types : null;
  const base = TYPE_IDS.filter((t) => !off.includes(t));
  const toggle = (id) => { const cur = only || base; const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; if (next.length) onChange({ ...v, types: TYPE_IDS.filter((t) => next.includes(t)) }); };
  return (
    <div data-testid="spot-own" style={{ display: 'grid', gap: 4 }}>
      <OwnField title="Kinds of countdown for this day" own={!!only} defaultText={`${base.length} of ${TYPE_IDS.length}`} onFollow={() => onChange({ ...v, types: null })} onCustom={() => onChange({ ...v, types: base })}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {TYPE_IDS.map((id) => <KindTile key={id} id={id} on={!!only?.includes(id)} testId={`spot-own-kind-${id}`} disabled={disabled || (only?.length === 1 && only[0] === id)} onToggle={() => toggle(id)} />)}
        </div>
      </OwnField>
      <OwnField title="Start the Spotlight" own={v.leadDays != null} defaultText={`${baseLead} days before`} onFollow={() => onChange({ ...v, leadDays: null })} onCustom={() => onChange({ ...v, leadDays: baseLead })}>
        <NumberField value={v.leadDays ?? baseLead} min={SPOTLIGHT_RANGES.leadDays.min} max={SPOTLIGHT_RANGES.leadDays.max} ariaLabel="This day starts how many days before" disabled={disabled} style={num} onCommit={(n) => onChange({ ...v, leadDays: n })} />
        <Hint>How many days before it the Spotlight starts for this day.</Hint>
      </OwnField>
    </div>
  );
}

/** Everything else of the Spotlight, in collapsed groups with a one-line summary each. */
export default function SpotlightMore({ s, file, model, hero, canEdit, save, change }) {
  const sp = s.spotlight;
  const saveSp = (patch, msg) => save({ spotlight: patch }, msg);
  const [dayId, setDayId] = useState('');
  const day = file.occasions.find((o) => o.id === dayId) || null;
  const dates = stageDates(model);
  const order = sp.types.order;
  const toggleKind = (id) => {
    const off = sp.types.off.includes(id) ? sp.types.off.filter((x) => x !== id) : [...sp.types.off, id];
    if (off.length < TYPE_IDS.length) saveSp({ types: { off } }, `${TYPE_LABEL[id]}: ${off.includes(id) ? 'off' : 'on'}`);
  };
  return (
    <Collapsible id="occ-more" title="More options for the Spotlight" icon="list" summary={`${kindsSummary(sp)} · ${stagesSummary(sp)}`}>
      <div style={{ display: 'grid', gap: 10 }} data-testid="spot-more">
        <Group title="Kinds and order" summary={kindsSummary(sp)} testId="spot-more-kinds">
          <Field label="How they take turns" style={{ marginTop: 0 }} hint="Never the same kind twice in a row (unless only one is on).">
            <Choices ariaLabel="Order of the kinds" value={sp.typeMode} onChange={(v) => saveSp({ typeMode: v }, `Kinds: ${TYPE_MODE_LABEL[v].toLowerCase()}`)} options={TYPE_MODES.map((v) => ({ value: v, label: TYPE_MODE_LABEL[v] }))} />
          </Field>
          {sp.typeMode === 'one' && (
            <Field label="The one to always show"><Select ariaLabel="The one kind" value={sp.oneType} onChange={(v) => saveSp({ oneType: v }, `Always ${TYPE_LABEL[v].toLowerCase()}`)} options={TYPE_IDS.map((t) => ({ value: t, label: TYPES[t].label }))} disabled={!canEdit} /></Field>
          )}
          <div role="group" aria-label="Kinds" style={{ marginTop: 10 }}>
            {order.map((id, i) => {
              const on = !sp.types.off.includes(id);
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 56, borderBottom: `1px solid ${colors.line}` }}>
                  <button type="button" aria-pressed={on} disabled={!canEdit || (on && sp.types.off.length >= TYPE_IDS.length - 1)} onClick={() => toggleKind(id)} data-testid={`spot-more-kind-${id}`}
                    style={{ ...btn(false), flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '4px 10px', background: on ? colors.accentSoft : 'transparent', color: on ? colors.accent : colors.dim, borderColor: on ? colors.accent : colors.line }}>
                    <KindThumb id={id} size={44} />
                    <span style={{ minWidth: 0 }}><span style={{ fontSize: 14 }}>{on ? '✓ ' : ''}{TYPES[id].label}</span><span style={{ ...small, display: 'block', fontWeight: 400, fontSize: 12 }}>{KIND_NOTE[id]}</span></span>
                  </button>
                  <button type="button" aria-label={`Move ${TYPES[id].label} earlier`} disabled={!canEdit || i === 0} style={arrowBtn} onClick={() => saveSp({ types: { order: moveItem(order, i, -1) } }, 'Order changed')}>{'▲'}</button>
                  <button type="button" aria-label={`Move ${TYPES[id].label} later`} disabled={!canEdit || i === order.length - 1} style={arrowBtn} onClick={() => saveSp({ types: { order: moveItem(order, i, 1) } }, 'Order changed')}>{'▼'}</button>
                </div>
              );
            })}
          </div>
          <Hint>The order is used by "My order". Each day can have its own kinds under "Just for one day".</Hint>
        </Group>

        <Group title="Stages on the way" summary={stagesSummary(sp)} testId="spot-more-stages">
          <Field label="Start the Spotlight this many days before (for a day you choose)" style={{ marginTop: 0 }} hint="Automatic uses the days-ahead number in 'On the screen'.">
            <NumberField value={sp.leadDays} min={SPOTLIGHT_RANGES.leadDays.min} max={SPOTLIGHT_RANGES.leadDays.max} ariaLabel="Spotlight lead days" disabled={!canEdit} style={num} onCommit={(n) => saveSp({ leadDays: n }, `Starts ${n} days before`)} />
          </Field>
          <p style={{ ...small, margin: '10px 0 0' }}>Each stage has its own mood. Switch one off and the screen stays with the stage before it.</p>
          {STAGE_IDS.map((id) => {
            const d = dates.find((x) => x.id === id)?.at;
            return <SwitchRow key={id} on={sp.stages[id] !== false} onChange={() => saveSp({ stages: { [id]: sp.stages[id] === false } }, `${SPOTLIGHT_STAGE_LABEL[id]}: ${sp.stages[id] === false ? 'on' : 'off'}`)} label={`${SPOTLIGHT_STAGE_LABEL[id]}${d ? ` · from about ${fmt(d)}` : ''}`} note={STAGE_NOTE[id]} testId={`spot-stage-switch-${id}`} />;
          })}
          <Hint>The words for each stage are under "Words for each stage" further down.</Hint>
        </Group>

        <Group title="Hype and story length" summary={depthSummary(s, sp)} testId="spot-more-hype">
          <HypeField level="global" value={s.hype || 'lively'} onChange={(v) => save({ hype: v }, `Hype: ${v}`)} />
          <Field label="How many story parts come after the countdown each time">
            <Choices ariaLabel="Story parts per round" value={sp.depth} onChange={(v) => saveSp({ depth: v }, `Story parts: ${v}`)} options={SPOTLIGHT_DEPTHS.map((v) => ({ value: v, label: DEPTH_LABEL[v] }))} />
          </Field>
          <Hint>Automatic keeps each round short far away and longer close to the day, with a different story part every time.</Hint>
        </Group>

        <Group title="What the story shows" summary={actsSummary(sp)} testId="spot-more-acts">
          {SPOTLIGHT_ACTS.map((a) => <SwitchRow key={a} on={sp.acts[a] !== false} onChange={() => saveSp({ acts: { [a]: sp.acts[a] === false } }, `${ACT_LABEL[a]}: ${sp.acts[a] === false ? 'on' : 'off'}`)} label={ACT_LABEL[a]} testId={`spot-act-${a}`} />)}
          <StageStyleField level="global" value={s.stageStyle || 'scroll'} onChange={(v) => save({ stageStyle: v }, `Explanation: ${v}`)} />
        </Group>

        <Group title="Colours and photo" summary={`${s.look.accent ? s.look.accent : 'My theme'}${s.look.photo ? ' · photo' : ''}`} testId="spot-more-colours">
          <Hint style={{ marginTop: 0 }}>It uses the colours and fonts of your theme. Change them only if you want this day to stand out. Each day can have its own look in its edit sheet.</Hint>
          <LookEditor level="global" look={s.look} disabled={!canEdit} onChange={(l, msg) => save({ look: l }, msg)} />
        </Group>

        <Group title="The side strip" summary={stripSummary(sp)} testId="spot-more-strip">
          <SwitchRow on={sp.strip.on} onChange={() => saveSp({ strip: { on: !sp.strip.on } }, sp.strip.on ? 'Side strip off' : 'Side strip on')} label="Show the other days in a small strip" note="Never a full page: just names and days to go." testId="spot-strip-on" />
          {sp.strip.on && (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Field label={`How many (${SPOTLIGHT_RANGES.stripCount.min}-${SPOTLIGHT_RANGES.stripCount.max})`}><NumberField value={sp.strip.count} min={SPOTLIGHT_RANGES.stripCount.min} max={SPOTLIGHT_RANGES.stripCount.max} ariaLabel="Side strip: how many" disabled={!canEdit} style={num} onCommit={(n) => saveSp({ strip: { count: n } }, `${n} in the strip`)} /></Field>
                <Field label={`Look ahead (days, ${SPOTLIGHT_RANGES.stripDays.min}-${SPOTLIGHT_RANGES.stripDays.max})`}><NumberField value={sp.strip.days} min={SPOTLIGHT_RANGES.stripDays.min} max={SPOTLIGHT_RANGES.stripDays.max} ariaLabel="Side strip: days ahead" disabled={!canEdit} style={num} onCommit={(n) => saveSp({ strip: { days: n } }, `Strip looks ${n} days ahead`)} /></Field>
              </div>
              <SwitchRow on={sp.strip.small} onChange={() => saveSp({ strip: { small: !sp.strip.small } }, sp.strip.small ? 'Small days left out' : 'Small days included')} label="Include small days" note="Off: only the big days." testId="spot-strip-small" />
            </>
          )}
        </Group>

        <Group title="Just for one day" summary="Its own kinds and its own start" testId="spot-more-day">
          <span style={label}>Which day</span>
          <Select ariaLabel="Which day" testId="spot-day-select" value={dayId} onChange={setDayId} options={[{ value: '', label: 'Choose a day...' }, ...file.occasions.filter((o) => o.on).map((o) => ({ value: o.id, label: o.nameEn || o.nameHe }))]} />
          {day && (
            <div style={{ marginTop: 10 }}>
              <OccSpotlightOwn key={day.id} value={day.spotlight} off={sp.types.off} baseLead={sp.leadDays} disabled={!canEdit}
                onChange={(v) => change('PUT', `/${day.id}`, { occasion: { spotlight: v } }, `${day.nameEn || day.nameHe}: saved`)} />
            </div>
          )}
        </Group>
      </div>
    </Collapsible>
  );
}
