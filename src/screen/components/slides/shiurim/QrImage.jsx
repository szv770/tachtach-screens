import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A scan-to-open QR code as a plain <img> (a data: PNG made in the browser: no network, no markup injection, static).
 * It is always dark on white, whatever the theme, because phones read it from across a room; that is the ONE place a literal
 * colour is right on the kiosk (the same reason QrBadge.jsx has them). `url` is validated https-only by the shared normaliser.
 */
export default function QrImage({ url, size = 200 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    if (!url) { setSrc(''); return undefined; }
    QRCode.toDataURL(url, { margin: 2, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => alive && setSrc(s)).catch(() => alive && setSrc(''));
    return () => { alive = false; };
  }, [url, size]);
  if (!src) return null;
  return <img data-qr="" src={src} alt="" width={size} height={size} style={{ display: 'block', flex: 'none', borderRadius: 12, width: size, height: size }} />;
}
