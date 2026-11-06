import React, { useState } from 'react';
import { Field, Hint, SwitchRow, Choices } from '../look/kit.jsx';
import { LAYOUT_SPEC, LAYOUT_PART_LABEL, LAYOUT_DEFAULTS } from '../../../shared/occasions.js';
import { LAYOUT_SCALE, LAYOUT_SIDES, LAYOUT_ALIGNS, resolveLayout } from '../../../shared/layoutConfig.js';
import { withShow, withoutLayoutField, fullOrder, moveItem, reorder } from './occHelpers.js';
import { btn, small, label, CommitSlider, OwnField, useWide, colors } from './occKit.jsx';

/** A small wireframe of the arrangement: the graphic on the chosen side, the text lines in order. */
export function LayoutPreview({ layout }) {
  const L = layout;
  const on = (k) => L.show[k] !== false;
  const bar = (w, h = 6, extra = {}) => <div style={{ height: h, width: w, background: colors.muted, borderRadius: 3, opacity: 0.55, ...extra }} />;
  const lines = L.order.filter((k) => on(k)).map((k) => (
    <div key={k} style={{ display: 'grid', gap: 3 }}>
      {k === 'name' ? <>{bar('70%', 10, { opacity: 0.9 })}{on('hebrewName') && bar('45%', 8)}</> : k === 'date' ? bar('55%') : k === 'begins' ? bar('65%') : bar('80%')}
    </div>
  ));
  const graphic = (
    <div style={{ width: `${34 * (L.scale / 100)}%`, minWidth: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 4 }}>
      {on('tagline') && bar('60%', 5)}
      {on('ring') ? <div style={{ width: '70%', aspectRatio: '1', borderRadius: '50%', border: `6px solid ${colors.accent}`, opacity: 0.8, display: 'grid', placeItems: 'center' }}><div style={{ height: 12, width: '40%', background: colors.text, borderRadius: 3, opacity: 0.8 }} /></div> : <div style={{ height: 18, width: '60%', background: colors.text, borderRadius: 3, opacity: 0.8 }} />}
      {on('pips') && <div style={{ display: 'flex', gap: 3 }}>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: colors.muted }} />)}</div>}
      {on('bar') && bar('70%', 5, { background: colors.accent })}
    </div>
  );
  const text = <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 9, alignContent: 'center', textAlign: L.align === 'center' ? 'center' : 'start', justifyItems: L.align === 'center' ? 'center' : 'start' }}>{lines}</div>;
  return (
    <div role="img" aria-label="Layout preview" data-testid="occ-layout-preview" style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.sunken, padding: 10, aspectRatio: '16 / 9', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ flex: 1, display: 'flex', gap: 10, flexDirection: L.side === 'right' ? 'row-reverse' : 'row', minHeight: 0 }}>{graphic}{text}</div>
      {on('coming') && <div style={{ display: 'flex', gap: 6 }}>{bar('30%', 8)}{bar('30%', 8)}{bar('30%', 8)}</div>}
      {on('source') && bar('40%', 4)}
    </div>
  );
}

function OrderList({ order, onChange, disabled }) {
  const [drag, setDrag] = useState(-1);
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} data-testid="occ-order">
      {order.map((k, i) => (
        <li key={k} draggable={!disabled} onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag >= 0) onChange(reorder(order, drag, i)); setDrag(-1); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${colors.line}`, borderRadius: 8, padding: '0 8px', minHeight: 44, background: colors.card }}>
          <span aria-hidden="true" title="Drag to move" style={{ cursor: 'grab', color: colors.dim, fontSize: 18 }}>{'⠇'}</span>
          <span style={{ flex: 1, fontSize: 15 }}>{LAYOUT_PART_LABEL[k]}</span>
          <button type="button" disabled={disabled || i === 0} aria-label={`Move ${LAYOUT_PART_LABEL[k]} up`} style={btn(false, { minWidth: 44, padding: 0 })} onClick={() => onChange(moveItem(order, i, -1))}>{'↑'}</button>
          <button type="button" disabled={disabled || i === order.length - 1} aria-label={`Move ${LAYOUT_PART_LABEL[k]} down`} style={btn(false, { minWidth: 44, padding: 0 })} onClick={() => onChange(moveItem(order, i, 1))}>{'↓'}</button>
        </li>
      ))}
    </ol>
  );
}

const SHOW_NOTE = { tagline: 'The short line above the numbers', ring: 'The circle around the numbers', pips: 'One dot per day', bar: 'The lead-up progress bar', coming: "The strip with the next ones", source: 'The source under an explanation' };
const SIMPLE_PARTS = ['name', 'hebrewName', 'date', 'begins', 'event', 'tagline', 'ring', 'coming', 'source'];

/**
 * level 'global': layout is complete; onChange(nextLayout, msg). level 'own': layout is PARTIAL, `base` = resolved parent layout.
 * Phones get switches + size + side; from 900 px wide the full editor (order list, alignment, wireframe).
 */
export function LayoutEditor({ level, layout, base = LAYOUT_DEFAULTS, onChange, disabled }) {
  const own = level === 'own';
  const wide = useWide();
  const L = layout || {};
  const eff = own ? resolveLayout(LAYOUT_DEFAULTS, base, L) : resolveLayout(LAYOUT_DEFAULTS, L, null);
  const parts = wide ? LAYOUT_SPEC.show : SIMPLE_PARTS;
  const showOf = (k) => (own ? (L.show && typeof L.show[k] === 'boolean' ? L.show[k] : null) : eff.show[k] !== false);
  const setShow = (k, v, msg) => onChange(withShow(L, k, v), msg);
  const setField = (f, v, msg) => onChange({ ...L, [f]: v }, msg);
  const followField = (f) => onChange(withoutLayoutField(L, f), `${f}: follows the default`);
  const partsUi = parts.map((k) => (own ? (
    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 140, fontSize: 15 }}>{LAYOUT_PART_LABEL[k]}</span>
      <Choices ariaLabel={LAYOUT_PART_LABEL[k]} value={showOf(k) === null ? 'follow' : showOf(k) ? 'show' : 'hide'} onChange={(v) => setShow(k, v === 'follow' ? null : v === 'show', `${LAYOUT_PART_LABEL[k]}: ${v}`)}
        options={[{ value: 'follow', label: eff.show[k] !== false ? 'Follow (shown)' : 'Follow (hidden)' }, { value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]} />
    </div>
  ) : <SwitchRow key={k} on={showOf(k)} onChange={() => setShow(k, !showOf(k), `${LAYOUT_PART_LABEL[k]} ${showOf(k) ? 'hidden' : 'shown'}`)} label={LAYOUT_PART_LABEL[k]} note={SHOW_NOTE[k]} />));
  const sizeUi = <CommitSlider value={eff.scale} min={LAYOUT_SCALE.min} max={LAYOUT_SCALE.max} step={5} unit="%" ariaLabel="Size" disabled={disabled} onCommit={(n) => setField('scale', n, `Size ${n}%`)} />;
  const sideUi = <Choices ariaLabel="Side" value={eff.side} onChange={(v) => setField('side', v, `Numbers on the ${v}`)} options={LAYOUT_SIDES.map((v) => ({ value: v, label: v === 'left' ? 'Numbers on the left' : 'Numbers on the right' }))} />;
  const alignUi = <Choices ariaLabel="Alignment" value={eff.align} onChange={(v) => setField('align', v, `Text aligned ${v === 'center' ? 'in the centre' : 'to the start'}`)} options={LAYOUT_ALIGNS.map((v) => ({ value: v, label: v === 'center' ? 'Centre' : 'Start' }))} />;
  const orderUi = <OrderList order={fullOrder(eff.order)} disabled={disabled} onChange={(o) => setField('order', o, 'Text order changed')} />;
  const sec = (title, node, field, defaultText) => (own
    ? <OwnField title={title} own={field in L} defaultText={defaultText} onFollow={() => followField(field)} onCustom={() => setField(field, eff[field], `${title}: just this one`)}>{node}</OwnField>
    : <Field label={title}>{node}</Field>);
  return (
    <div data-testid="occ-layout-editor" style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: wide ? 'grid' : 'block', gridTemplateColumns: wide ? 'minmax(0,1fr) 380px' : undefined, gap: 24, alignItems: 'start' }}>
        <div>
          <span style={label}>Which parts show</span>
          {partsUi}
          {sec('Size', sizeUi, 'scale', `${base.scale || 100}%`)}
          {sec('Side', sideUi, 'side', base.side)}
          {wide && sec('Text alignment', alignUi, 'align', base.align)}
          {wide && sec('Order of the text', orderUi, 'order', 'default order')}
          {!wide && <Hint>More choices (order of the lines, alignment, a live wireframe) on a wider screen.</Hint>}
        </div>
        {wide && <div style={{ position: 'sticky', top: 12 }}><span style={label}>Arrangement</span><LayoutPreview layout={eff} /><p style={small}>A sketch, not the real screen.</p></div>}
      </div>
    </div>
  );
}
