import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Scan-to-donate badge: a white card (always dark-on-white so phones read it from across
 * the room) with a QR code and an optional caption, pinned to a corner of whatever it is
 * placed in. Generated in the browser (no internet needed); static, no animation.
 * Used by the Web page slide (per-slide QR). Props: url, corner tl|tr|bl|br, size s|m|l, caption.
 */
const SIZES = { s: 160, m: 220, l: 300 };
const POS = { tl: { top: 24, left: 24 }, tr: { top: 24, right: 24 }, bl: { bottom: 24, left: 24 }, br: { bottom: 24, right: 24 } };

export default function QrBadge({ url, corner = 'tr', size = 'm', caption = '' }) {
  const [svg, setSvg] = useState('');
  const target = String(url || '').trim();
  useEffect(() => {
    let alive = true;
    if (!target) { setSvg(''); return undefined; }
    QRCode.toString(target, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => alive && setSvg(s)).catch(() => alive && setSvg(''));
    return () => { alive = false; };
  }, [target]);
  if (!svg) return null;
  const px = SIZES[size] || SIZES.m;
  return (
    <div data-qr-badge style={{
      position: 'absolute', ...(POS[corner] || POS.tr), zIndex: 5, pointerEvents: 'none', direction: 'ltr',
      background: '#fff', color: '#111', borderRadius: 20, padding: 16, boxShadow: '0 6px 24px rgba(0,0,0,.35)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: px + 32, boxSizing: 'border-box',
    }}>
      <div style={{ width: px, height: px }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', `<svg width="${px}" height="${px}" `) }} />
      {caption ? <div style={{ fontFamily: 'var(--f-en)', fontWeight: 800, fontSize: Math.round(px / 8), lineHeight: 1.15, textAlign: 'center', maxWidth: px }}>{caption}</div> : null}
    </div>
  );
}
