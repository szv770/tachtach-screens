import React, { useMemo, useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import Collapsible from '../ui/Collapsible.jsx';
import { Chip, Row, Btn, ErrorLine, labelStyle, field } from './bits.jsx';
import { NoticePreview, previewParts } from './QuickFill.jsx';
import {
  BLANK_TYPES, BLANK_TYPE_LABEL, TEMPLATE_DISPLAYS, keyFromLabel, placeholdersIn, lengthLabel, sanitizeLength,
} from '../../../shared/quickTemplates.js';
import { STYLE_OPTIONS } from '../announcements/helpers.js';

const LENGTHS = [
  { kind: 'minutes', minutes: 15 }, { kind: 'minutes', minutes: 60 }, { kind: 'minutes', minutes: 120 }, { kind: 'eod' }, { kind: 'forever' },
];
const DISPLAY_LABEL = { slide: 'Slide', banner: 'Banner', takeover: 'Takeover' };

const blank = () => ({ text: '', textHe: '', blanks: [], focus: null, display: 'slide', style: null, length: { kind: 'minutes', minutes: 60 } });

/** Create or edit one quick-message template. `initial` = an existing template (edit) or null (new). */
export default function TemplateEditor({ initial, canShare, canTakeover, onSave, onClose, error }) {
  const [t, setT] = useState(() => (initial ? { ...blank(), ...initial, blanks: initial.blanks.map((b) => ({ ...b })) } : blank()));
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const ta = useRef(null);
  const editing = !!initial?.id;
  const set = (patch) => { setT((x) => ({ ...x, ...patch })); setLocalError(''); };

  const uniqueKey = (label, type) => {
    const base = keyFromLabel(label) || type;
    let k = base, n = 2;
    while (t.blanks.some((b) => b.key === k)) k = `${base.slice(0, 20)}${n++}`;
    return k;
  };

  const addBlank = (type) => {
    const label = BLANK_TYPE_LABEL[type] === 'Free text' ? 'Text' : BLANK_TYPE_LABEL[type];
    const key = uniqueKey(label, type);
    const el = ta.current;
    const pos = el ? el.selectionStart ?? t.text.length : t.text.length;
    const ins = `{${key}}`;
    const text = `${t.text.slice(0, pos)}${ins}${t.text.slice(pos)}`;
    set({ text, blanks: [...t.blanks, { key, label, type }], focus: t.focus || key });
    setTimeout(() => { el?.focus(); el?.setSelectionRange(pos + ins.length, pos + ins.length); }, 0);
  };

  // Blanks actually used in the text (typed placeholders are picked up too).
  const used = useMemo(() => [...new Set([...placeholdersIn(t.text), ...placeholdersIn(t.textHe)])], [t.text, t.textHe]);
  const blanks = useMemo(() => used.map((k) => t.blanks.find((b) => b.key === k) || { key: k, label: k, type: 'text' }), [used, t.blanks]);
  const focus = blanks.some((b) => b.key === t.focus) ? t.focus : (blanks[0]?.key || null);
  const draft = { ...t, blanks, focus };
  const parts = previewParts(draft, {});

  const updateBlank = (key, patch) => set({ blanks: blanks.map((b) => (b.key === key ? { ...b, ...patch } : b)) });

  const save = async () => {
    if (!t.text.trim()) { setLocalError('Type the message first.'); return; }
    setBusy(true);
    const ok = await onSave({ text: t.text, textHe: t.textHe, blanks, focus, display: t.display, style: t.style, length: sanitizeLength(t.length) }, { shared });
    setBusy(false);
    if (ok) onClose();
  };

  const styleLabel = STYLE_OPTIONS.find((s) => s.value === (t.style || ''))?.label || 'Theme';
  return (
    <Sheet open onClose={onClose} title={editing ? 'Edit quick message' : 'New quick message'} label="Quick message editor" zIndex={1400} maxWidth={640}>
      <div data-testid="template-editor">
        <label htmlFor="te-text" style={{ ...labelStyle, marginTop: '8px' }}>Message</label>
        <textarea id="te-text" ref={ta} rows={2} dir="auto" value={t.text} onChange={(e) => set({ text: e.target.value })} placeholder="{name} please come to the office" style={{ ...field, resize: 'vertical' }} />
        <div style={{ ...labelStyle, marginTop: '12px' }}>Add a blank where it goes</div>
        <Row>{BLANK_TYPES.map((ty) => <Chip key={ty} dataKey={ty} onClick={() => addBlank(ty)}>+ {BLANK_TYPE_LABEL[ty]}</Chip>)}</Row>

        {blanks.length > 0 && (
          <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }} data-testid="template-blanks">
            {blanks.map((b) => (
              <div key={b.key} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontSize: '12px', color: colors.dim, minWidth: '70px' }}>{`{${b.key}}`}</code>
                <input aria-label={`Label for ${b.key}`} value={b.label} onChange={(e) => updateBlank(b.key, { label: e.target.value })} style={{ ...field, flex: '1 1 120px', width: 'auto' }} />
                <select aria-label={`Type for ${b.key}`} value={b.type} onChange={(e) => updateBlank(b.key, { type: e.target.value })} style={{ ...field, flex: '0 0 120px', width: 'auto' }}>
                  {BLANK_TYPES.map((ty) => <option key={ty} value={ty}>{BLANK_TYPE_LABEL[ty]}</option>)}
                </select>
              </div>
            ))}
            <div>
              <div style={labelStyle}>Show this one big</div>
              <Row>{blanks.map((b) => <Chip key={b.key} on={focus === b.key} onClick={() => set({ focus: b.key })}>{b.label}</Chip>)}</Row>
            </div>
          </div>
        )}

        <div style={{ ...labelStyle, marginTop: '16px' }}>Preview</div>
        <NoticePreview parts={parts} />

        <Collapsible title="Hebrew version" summary={t.textHe ? t.textHe : 'Optional'} style={{ marginTop: '14px' }}>
          <textarea aria-label="Hebrew message" rows={2} dir="rtl" value={t.textHe} onChange={(e) => set({ textHe: e.target.value })} placeholder={'{name} בוא למנהל'} style={{ ...field, resize: 'vertical', marginTop: '12px', fontSize: '18px' }} />
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '12.5px', color: colors.dim, margin: '8px 0 0' }}>Use the same {'{blank}'} names. Days show in Hebrew automatically.</p>
        </Collapsible>

        <Collapsible title="How long and how it shows" summary={`${lengthLabel(t.length)} · ${DISPLAY_LABEL[t.display]} · ${styleLabel}`} style={{ marginTop: '10px' }}>
          <div style={{ ...labelStyle, marginTop: '12px' }}>Shows for</div>
          <Row>{LENGTHS.map((l) => <Chip key={lengthLabel(l)} on={lengthLabel(l) === lengthLabel(t.length)} onClick={() => set({ length: l })}>{lengthLabel(l)}</Chip>)}</Row>
          <div style={{ ...labelStyle, marginTop: '14px' }}>Show as</div>
          <Row>{TEMPLATE_DISPLAYS.filter((d) => d !== 'takeover' || canTakeover || t.display === 'takeover').map((d) => <Chip key={d} on={t.display === d} onClick={() => set({ display: d })}>{DISPLAY_LABEL[d]}</Chip>)}</Row>
          <label htmlFor="te-style" style={{ ...labelStyle, marginTop: '14px' }}>Look</label>
          <select id="te-style" value={t.style || ''} onChange={(e) => set({ style: e.target.value || null })} style={field}>
            {STYLE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Collapsible>

        {!editing && canShare && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '48px', marginTop: '12px', fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} style={{ width: 22, height: 22 }} />
            Share with everyone (otherwise only you see it)
          </label>
        )}
        <ErrorLine>{localError || error}</ErrorLine>
        <Row style={{ marginTop: '16px' }}>
          <Btn onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn primary onClick={save} disabled={busy} style={{ flex: 2 }} data-testid="template-save">{busy ? 'Saving…' : 'Save'}</Btn>
        </Row>
      </div>
    </Sheet>
  );
}
