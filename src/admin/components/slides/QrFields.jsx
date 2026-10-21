import React from 'react';
import { Field, Hint, SwitchRow, fieldStyle } from '../look/kit.jsx';

const CORNERS = [['tr', 'Top right'], ['tl', 'Top left'], ['br', 'Bottom right'], ['bl', 'Bottom left']];
const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];

/**
 * "Show a QR code on this page" controls, shared by the slide pencil popup and the
 * Media > Web pages editor. `v` holds qrOn/qrUrl/qrCorner/qrSize/qrCaption; `set(key, value)`.
 * The link is committed on blur (the caller validates it) so typing is never interrupted.
 */
export default function QrFields({ v, set }) {
  const [url, setUrl] = React.useState(v.qrUrl || '');
  React.useEffect(() => { setUrl(v.qrUrl || ''); }, [v.qrUrl]);
  const [cap, setCap] = React.useState(v.qrCaption || '');
  React.useEffect(() => { setCap(v.qrCaption || ''); }, [v.qrCaption]);
  return (
    <>
      <SwitchRow on={!!v.qrOn} onChange={() => set('qrOn', !v.qrOn)} label="Show a QR code on this page" note="A scannable code in a corner, on top of the page. Use the normal donate link, not the + display one." testId="f-qr-on" />
      {v.qrOn && (
        <>
          <Field label="Where the QR code goes">
            <input aria-label="QR code link" value={url} placeholder="https://charidy.com/miami" onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== (v.qrUrl || '') && set('qrUrl', url)} style={fieldStyle} />
          </Field>
          <Field label="Corner">
            <select aria-label="QR corner" value={v.qrCorner || 'tr'} onChange={(e) => set('qrCorner', e.target.value)} style={fieldStyle}>
              {CORNERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Size">
            <select aria-label="QR size" value={v.qrSize || 'm'} onChange={(e) => set('qrSize', e.target.value)} style={fieldStyle}>
              {SIZES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Words under the code (optional)">
            <input aria-label="QR caption" value={cap} maxLength={40} placeholder="Scan to donate" onChange={(e) => setCap(e.target.value)} onBlur={() => cap !== (v.qrCaption || '') && set('qrCaption', cap)} style={fieldStyle} />
          </Field>
          <Hint>Dark on white so phones read it from across the room. Keep it Medium or Large for a big screen.</Hint>
        </>
      )}
    </>
  );
}
