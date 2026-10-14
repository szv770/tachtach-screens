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

// Compute a UNIFORM scale plus a canvas whose aspect ratio matches the viewport.
//
// The previous version scaled x and y independently (scale(vw/1600, vh/900)), so on
// any viewport that wasn't exactly 16:9 the whole UI was stretched — e.g. a desktop
// browser tab at ~1920x940 got scale(1.2, 1.04): text visibly squashed/wide, and a
// portrait viewport showing a landscape layout got scale(0.675, 2.13).
//
// Instead: pick the scale that fits the design canvas inside the viewport
// (min of the two ratios), then grow the canvas's *logical* size along the other
// axis so that canvas × scale == viewport exactly. Result: no distortion, no
// letterboxing, no cropping — the extra room on a wider/taller viewport becomes extra
// layout space (Layout.jsx's grid is %/fr based, so it just flows into it).
//
// On a true 16:9 screen (the 3840x2160 kiosk TV, a 1920x1080 monitor) this is
// identical to before: canvas stays 1600x900 and scale is 2.4 / 1.2.
function computeFit(base) {
  const vw = window.innerWidth || base.width;
  const vh = window.innerHeight || base.height;
  const scale = Math.min(vw / base.width, vh / base.height);
  return {
    scale,
    width: vw / scale,
    height: vh / scale,
  };
}

export default function ScreenScaler({ portrait = false, children }) {
  const base = portrait ? PORTRAIT_CANVAS : LANDSCAPE_CANVAS;
  const [fit, setFit] = useState(() => computeFit(base));

  useEffect(() => {
    const compute = () => setFit(computeFit(base));
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [base.width, base.height]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', direction: 'ltr' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${fit.width}px`,
          height: `${fit.height}px`,
          transform: `scale(${fit.scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
