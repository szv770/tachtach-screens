import React, { useEffect, useState } from 'react';

// All slide/layout components are hand-tuned in fixed px against this canvas size.
// Scaling the whole canvas (instead of rewriting every px value to vw/vh/rem) is what
// makes the kiosk fill screens of any physical size/resolution correctly.
const LANDSCAPE_CANVAS = { width: 1920, height: 1080 };
const PORTRAIT_CANVAS = { width: 1080, height: 1920 };

export default function ScreenScaler({ portrait = false, children }) {
  const canvas = portrait ? PORTRAIT_CANVAS : LANDSCAPE_CANVAS;
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    const compute = () => {
      setScale({
        x: window.innerWidth / canvas.width,
        y: window.innerHeight / canvas.height,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [canvas.width, canvas.height]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <div
        style={{
          width: `${canvas.width}px`,
          height: `${canvas.height}px`,
          transform: `scale(${scale.x}, ${scale.y})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
