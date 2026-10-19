import React, { useState } from 'react';
import { colors, adminFonts, inputStyle } from '../styles/admin-tokens.js';
import Collapsible from './ui/Collapsible.jsx';
import SaveBar from './ui/SaveBar.jsx';
import Sheet from './ui/Sheet.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';
import useDirtyForm from './ui/useDirtyForm.js';
import ThemeSwitch from './ThemeSwitch.jsx';
import Icon from './ui/Icon.jsx';

/**
 * /admin/kit — admin-only showcase of the shared components (Phase 1 foundation).
 * Phase 2 adopts them in the settings panels:
 *   Collapsible        default closed, one-line summary, `edited` gold dot, `id` = search anchor
 *   useDirtyForm+SaveBar  multi-field forms; leave-page guard is automatic (ui/dirty.js)
 *   Sheet              bottom sheet (centred card on desktop)
 *   SegmentedControl   2-5 short choices
 */
export default function UiKit() {
  const [sheet, setSheet] = useState(false);
  const [seg, setSeg] = useState('a');
  const form = useDirtyForm({ city: 'Miami Beach', zip: '33139', units: 'F' }, {
    label: 'the UI kit demo',
    onSave: async () => { await new Promise((r) => setTimeout(r, 400)); return true; },
  });
  const label = { display: 'block', fontSize: '13px', fontWeight: 700, color: colors.dim, margin: '12px 0 6px', fontFamily: adminFonts.englishBody };
  return (
    <div data-testid="ui-kit" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', maxWidth: '640px', fontFamily: adminFonts.englishBody }}>
      <p style={{ color: colors.dim, fontSize: '14px', margin: 0 }}>Shared building blocks for the admin. Edit a field below to see the Save bar and the leave-page guard.</p>

      <Collapsible id="kit-location" title="Location" summary={`${form.values.city} · ${form.values.zip}`} edited={form.isChanged('city') || form.isChanged('zip')} icon="screen">
        <label style={label}>City
          <input style={{ ...inputStyle, marginTop: '6px' }} value={form.values.city} onChange={(e) => form.set('city', e.target.value)} />
        </label>
        <label style={label}>Zip code
          <input style={{ ...inputStyle, marginTop: '6px' }} value={form.values.zip} onChange={(e) => form.set('zip', e.target.value)} />
        </label>
      </Collapsible>

      <Collapsible id="kit-units" title="Weather units" summary={form.values.units === 'F' ? 'Fahrenheit' : 'Celsius'} edited={form.isChanged('units')} icon="sun">
        <div style={{ paddingTop: '12px' }}>
          <SegmentedControl ariaLabel="Units" value={form.values.units} onChange={(v) => form.set('units', v)} options={[{ value: 'F', label: '°F' }, { value: 'C', label: '°C' }]} />
        </div>
      </Collapsible>

      <Collapsible title="Appearance" summary="Light, dark or follow this device" icon="palette">
        <div style={{ paddingTop: '12px' }}><ThemeSwitch /></div>
      </Collapsible>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <SegmentedControl ariaLabel="Demo" value={seg} onChange={setSeg} options={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }, { value: 'c', label: 'Three' }]} />
        <button type="button" onClick={() => setSheet(true)} style={{ minHeight: '44px', padding: '0 18px', borderRadius: '999px', border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon name="plus" size={16} />Open a sheet
        </button>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="A sheet">
        <p style={{ color: colors.dim, fontSize: '14px', lineHeight: 1.5 }}>Drag the grabber down, tap outside, press Escape or use the X to close.</p>
      </Sheet>

      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </div>
  );
}
