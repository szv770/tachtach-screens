import React, { useLayoutEffect, useRef, useState } from 'react';
import { useDesign } from '../design/DesignRoot.jsx';
import { numeralsStack } from '../design/useLayout.js';
import { ensureSpotCss } from './css.js';
import { Ambient, Kicker, NameBlock, BeginsLine, Strip, useSize } from './parts.jsx';
import { isHe } from './model.js';

/**
 * The Spotlight SHELL (PLAN.md 3b): one fixed canvas, scaled once to the slide's box, that every view draws inside.
 *
 *   landscape (1600 wide, height follows the box: 760-1100)          portrait (1600 tall, width 760-1100)
 *   ┌───────────────────────────────────────────────┐               ┌────────────────────┐
 *   │ ── KICKER                         [years seal] │               │ ── KICKER          │
 *   │ Name (Hebrew big / English under)              │               │ Name               │
 *   │                                                │               │ [years seal]       │
 *   │            the kind / the act (flex 1)         │               │   the kind / act   │
 *   │                                                │               │                    │
 *   │ Begins Monday evening ·  [chip] [chip] [chip]  │               │ [chip][chip][chip] │
 *   └───────────────────────────────────────────────┘               │ Begins ...         │
 *                                                                    └────────────────────┘
 * `--heat` (0..1) sits on the root and only drives the opacity of the static light layers. Hebrew language: the whole
 * frame is dir=rtl, so every flex row mirrors (kinds mirror their own geometry from ctx.rtl).
 * Props: sp (SpotModel), header ('full' | 'compact' | 'none'), badge (node), strongLight, children(ctx, box) -> the area.
 */
export const CANVAS = { long: 1600, minShort: 760, maxShort: 1100 };

export function canvasFor(w, h) {
  if (!w || !h) return { W: 1600, H: 900, portrait: false, k: 1 };
  const portrait = h > w * 1.05;
  if (portrait) {
    const H = CANVAS.long; const W = Math.round(Math.min(CANVAS.maxShort, Math.max(CANVAS.minShort, (H * w) / h)));
    return { W, H, portrait, k: Math.min(w / W, h / H) };
  }
  const W = CANVAS.long; const H = Math.round(Math.min(CANVAS.maxShort, Math.max(CANVAS.minShort, (W * h) / w)));
  return { W, H, portrait, k: Math.min(w / W, h / H) };
}

export function SpotlightShell({ sp, header = 'full', badge = null, strongLight = false, footer = true, still: stillProp, children }) {
  ensureSpotCss();
  const design = useDesign();
  const [hostRef, host] = useSize();
  const cv = canvasFor(host.w, host.h);
  const lang = sp.lang || 'both';
  const rtl = isHe(lang);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const still = stillProp ?? (design.motion === 'minimal' || reduced);
  const ctx = { portrait: cv.portrait, rtl, lang, still, light: !!design.light, lively: design.motion === 'lively' };
  const pad = cv.portrait ? { x: 60, top: 64, bottom: 56 } : { x: 80, top: 58, bottom: 50 };
  const font = numeralsStack(sp.numeralsFont);
  const accent = sp.accent ? sp.accent : 'var(--accent)';
  return (
    <div ref={hostRef} data-sp-host="" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {host.w > 0 && (
        <div data-sp-canvas="" data-sp-stage={sp.stage} data-sp-portrait={cv.portrait ? '1' : '0'} dir={rtl ? 'rtl' : 'ltr'}
          className={`sp-root ${design.light ? 'sp-light' : 'sp-dark'}`}
          style={{
            position: 'absolute', left: Math.round((host.w - cv.W * cv.k) / 2), top: Math.round((host.h - cv.H * cv.k) / 2),
            width: cv.W, height: cv.H, transform: `scale(${cv.k})`, transformOrigin: '0 0',
            '--heat': Math.max(0, Math.min(1, Number(sp.heat) || 0)), '--sp-acc': `color-mix(in srgb, ${accent} 100%, transparent)`, '--f-cd': font,
          }}>
          <Ambient rtl={rtl} strong={strongLight} still={still} portrait={cv.portrait} />
          <div style={{ position: 'absolute', inset: 0, padding: `${pad.top}px ${pad.x}px ${pad.bottom}px`, display: 'flex', flexDirection: 'column', gap: cv.portrait ? 30 : 22 }}>
            {header !== 'none' && <Header sp={sp} lang={lang} portrait={cv.portrait} compact={header === 'compact'} badge={badge} />}
            <Area>{(box) => children(ctx, box)}</Area>
            {footer && <Footer sp={sp} lang={lang} portrait={cv.portrait} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ sp, lang, portrait, compact, badge }) {
  const nameMax = compact ? (portrait ? 64 : 58) : (portrait ? 92 : 96);
  if (portrait) {
    return (
      <header style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <Kicker sp={sp} lang={lang} size={26} />
          {compact && badge}
        </div>
        <NameBlock sp={sp} lang={lang} max={nameMax} min={40} sub={compact ? 28 : 34} maxH={compact ? 80 : 210} />
        {!compact && badge ? <div style={{ display: 'flex' }}>{badge}</div> : null}
      </header>
    );
  }
  return (
    <header style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 40, minWidth: 0 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Kicker sp={sp} lang={lang} size={compact ? 24 : 26} />
        <NameBlock sp={sp} lang={lang} max={nameMax} min={40} sub={compact ? 28 : 34} maxH={compact ? 70 : 120} />
      </div>
      {badge ? <div style={{ flex: 'none' }}>{badge}</div> : null}
    </header>
  );
}

function Footer({ sp, lang, portrait }) {
  if (portrait) {
    return (
      <footer style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div style={{ display: 'flex' }}><Strip sp={sp} lang={lang} max={3} portrait /></div>
        <BeginsLine sp={sp} lang={lang} size={28} />
      </footer>
    );
  }
  return (
    <footer style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, minWidth: 0, minHeight: 40 }}>
      <BeginsLine sp={sp} lang={lang} size={28} />
      <Strip sp={sp} lang={lang} max={3} />
    </footer>
  );
}

/** The flex-1 area; renders its children with the area's real size (layout px) once known. */
function Area({ children }) {
  const [ref, box] = useSize();
  return (
    <div ref={ref} data-sp-area="" style={{ position: 'relative', flex: '1 1 0', minHeight: 0, minWidth: 0 }}>
      {box.w > 0 && box.h > 0 ? children(box) : null}
    </div>
  );
}

/** Repaint once a second (or every 250 ms near a second boundary is not needed: ticks align to the wall clock). */
export function useNow(nowProp, live = true) {
  const [now, setNow] = useState(() => nowProp ?? Date.now());
  const off = useRef(0);
  useLayoutEffect(() => { off.current = nowProp != null ? nowProp - Date.now() : 0; setNow(nowProp ?? Date.now()); }, [nowProp]);
  useLayoutEffect(() => {
    if (!live) return undefined;
    let t;
    const tick = () => {
      const n = Date.now() + off.current;
      setNow(n);
      t = setTimeout(tick, 1000 - (n % 1000) + 5);
    };
    t = setTimeout(tick, 1000 - ((Date.now() + off.current) % 1000) + 5);
    return () => clearTimeout(t);
  }, [live]);
  return now;
}
