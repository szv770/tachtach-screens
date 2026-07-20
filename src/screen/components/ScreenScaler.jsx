import React, { useEffect, useState } from 'react';

// All slide/layout components are hand-tuned in fixed px against this canvas size.
// Scaling the whole canvas (instead of rewriting every px value to vw/vh/rem) is what
// makes the kiosk fill screens of any physical size/resolution correctly. Shrinking
// the canvas below the "native" 1920x1080 design size is also how we zoom the whole
// UI in uniformly — everything (text, icons, spacing) ends up occupying a bigger
// fraction of the real screen, while each slide's own shrink-to-fit logic (e.g.
// ScheduleSlide's full-day auto-scale) keeps working unchanged, just kicking in a
// little sooner since there's proportionally less room on the smaller canvas.
const LANDSCAPE_CANVAS = { width: 1600, height: 900 };
const PORTRAIT_CANVAS = { width: 900, height: 1600 };

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
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', direction: 'ltr' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
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
