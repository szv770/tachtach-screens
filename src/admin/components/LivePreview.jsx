import React, { useRef, useState, useEffect } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';

const KIOSK_W = 1920;
const KIOSK_H = 1080;

export default function LivePreview() {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.18);

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setScale(w / KIOSK_W);
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '11px',
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        marginBottom: '8px',
      }}>
        Live Preview
      </div>
      {/* 16:9 aspect ratio container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', /* 9/16 = 56.25% */
          borderRadius: '4px',
          overflow: 'hidden',
          background: colors.bg,
          border: `1px solid ${colors.muted}`,
        }}
      >
        <iframe
          src="/screen?preview=true"
          title="Screen Preview"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${KIOSK_W}px`,
            height: `${KIOSK_H}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 'none',
          }}
        />
      </div>
    </div>
  );
}
