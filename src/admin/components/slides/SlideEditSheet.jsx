import React, { useRef } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import useDirtyForm from '../ui/useDirtyForm.js';
import { isAnyDirty } from '../ui/dirty.js';
import { notify } from '../../hooks/useAdminState.js';
import { initialValues, splitValues } from './slideForm.js';
import { BasicFields, TypeFields, AdvancedFields } from './SlideFields.jsx';
import { typeInfo, slideTitle } from './slideTypes.js';

const btn = (primary) => ({
  minHeight: '48px', padding: '0 20px', borderRadius: 'var(--r-sm)', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 800, cursor: 'pointer',
  border: primary ? 'none' : `1.5px solid ${colors.border}`, background: primary ? colors.accent : colors.card, color: primary ? '#fff' : colors.text,
});

function Body({ slide, settings, getSlides, onUpdate, onSaveSettings, onClose, onDelete, go, canDelete }) {
  const info = typeInfo(slide.type);
  const slideRef = useRef(slide);
  slideRef.current = slide;

  const form = useDirtyForm(initialValues(slide, settings), {
    label: 'this slide',
    onSave: async (values, changed) => {
      const { slidePatch, settingsPatch } = splitValues(values, changed, slideRef.current);
      let ok = true;
      if (Object.keys(slidePatch).length) {
        const next = getSlides().map((s) => (s.id === slideRef.current.id ? { ...s, ...slidePatch } : s));
        ok = (await onUpdate(next)) !== false;
      }
      if (ok && Object.keys(settingsPatch).length) ok = (await onSaveSettings(settingsPatch, '')) !== false;
      if (ok) { notify('Slide saved'); onClose(true); }
      return ok;
    },
  });

  return (
    <div data-testid="slide-edit">
      <p style={{ margin: '0 0 4px', fontSize: '13px', color: colors.dim, fontFamily: adminFonts.englishBody }}>{info?.desc}</p>
      <BasicFields slide={slide} form={form} />
      <TypeFields slide={slide} form={form} go={go} settings={settings} />
      <AdvancedFields slide={slide} form={form} />
      {form.error && <div role="alert" style={{ marginTop: '12px', color: colors.danger, fontSize: '14px', fontFamily: adminFonts.englishBody }}>{form.error}</div>}
      <div style={{
        position: 'sticky', bottom: 0, marginTop: '20px', padding: '12px 0 4px', background: colors.card, borderTop: `1px solid ${colors.line}`,
        display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
      }}>
        {canDelete && (
          <button type="button" onClick={onDelete} data-testid="slide-delete" style={{ ...btn(false), color: colors.danger, borderColor: colors.danger, marginRight: 'auto' }}>Delete</button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => onClose(false)} style={btn(false)} data-testid="slide-cancel">Cancel</button>
        <button type="button" onClick={form.save} disabled={form.saving || !form.dirty} data-testid="slide-save" style={{ ...btn(true), opacity: form.saving || !form.dirty ? 0.5 : 1 }}>
          {form.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/**
 * The pencil popup: this slide's own options only, with Save / Cancel. The slide is
 * identified by id so the form follows the latest data; a different slide gets a fresh form.
 */
export default function SlideEditSheet({ slide, ...rest }) {
  const close = (saved) => {
    if (!saved && isAnyDirty() && !window.confirm('Discard your changes to this slide?')) return;
    rest.onClose();
  };
  return (
    <Sheet open={!!slide} onClose={() => close(false)} title={slide ? slideTitle(slide, { announcementsById: rest.announcementsById }) : ''} label="Edit slide" zIndex={1150}>
      {slide && <Body key={slide.id} slide={slide} {...rest} onClose={close} />}
    </Sheet>
  );
}
