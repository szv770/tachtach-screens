import React, { useLayoutEffect, useRef, useState, useCallback } from 'react';

/**
 * Auto-fit text: the largest font size (between min and max px) at which the
 * text fits its box, found by binary search. Typed line breaks are kept
 * (white-space: pre-wrap); a word is never broken mid-word — a word too long
 * for the width shrinks the text instead.
 *
 * Sizes are measured in layout px (clientHeight/offsetHeight/scrollWidth),
 * never getBoundingClientRect(), so ScreenScaler's transform doesn't skew
 * them (GOTCHAS: kiosk canvas scaling). ResizeObserver and font-load
 * callbacks are ignored after unmount (GOTCHAS: LimudimSlide observer).
 */

/**
 * Binary-search an integer font size on `el` so `fits()` holds.
 * Leaves el.style.fontSize at the result and returns it.
 */
export function searchFontSize(el, min, max, fits) {
  let lo = Math.max(1, Math.floor(min)), hi = Math.max(lo, Math.floor(max)), best = lo;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    el.style.fontSize = `${mid}px`;
    if (fits()) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  el.style.fontSize = `${best}px`;
  return best;
}

/**
 * Shared hook: fit `innerRef` inside `boxRef` (both elements). Re-fits on box
 * resize, on font load and whenever `deps` change. Returns the fitted px.
 */
export function useFitSize(boxRef, innerRef, deps, { min = 12, max = 200, onFit } = {}) {
  const [size, setSize] = useState(null);
  const mounted = useRef(true);
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  const fit = useCallback(() => {
    if (!mounted.current) return;
    const box = boxRef.current, inner = innerRef.current;
    if (!box || !inner) return;
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    const best = searchFontSize(inner, min, max, () =>
      inner.offsetHeight <= H && inner.scrollWidth <= inner.clientWidth + 1 && inner.offsetWidth <= W + 1);
    setSize(best);
    onFitRef.current?.(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, ...deps]);

  useLayoutEffect(() => {
    mounted.current = true;
    fit();
    let ro;
    if (typeof ResizeObserver !== 'undefined' && boxRef.current) {
      ro = new ResizeObserver(() => fit());
      ro.observe(boxRef.current);
    }
    // Web fonts swap in after first paint and change text metrics.
    document.fonts?.ready?.then(() => fit()).catch(() => {});
    return () => {
      mounted.current = false;
      ro?.disconnect();
    };
  }, [fit]);

  return size;
}

/**
 * Fill-the-box auto-fit text. The parent must give it a size (e.g. a flex
 * child with minHeight 0, or an absolutely-positioned box).
 */
export default function FitText({
  text, min = 14, max = 220, lineHeight = 1.15, align = 'center', dir, style, onFit, valign = 'center',
}) {
  const boxRef = useRef(null);
  const innerRef = useRef(null);
  const size = useFitSize(boxRef, innerRef, [text, lineHeight, style?.fontFamily, style?.fontWeight, style?.letterSpacing], { min, max, onFit });
  return (
    <div
      ref={boxRef}
      style={{
        width: '100%', height: '100%', minHeight: 0, minWidth: 0,
        display: 'flex', alignItems: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: 'center', overflow: 'hidden',
      }}
    >
      <div
        ref={innerRef}
        dir={dir}
        style={{
          width: '100%',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'normal',
          wordBreak: 'normal',
          lineHeight,
          textAlign: align,
          unicodeBidi: 'plaintext',
          ...style,
          fontSize: size ? `${size}px` : `${min}px`,
        }}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * In-flow auto-fit for an existing styled line (Takeover / StyledSlide primary
 * text): rendered inside the style's own text element, it takes that
 * element's width and grows until its height reaches `heightFrac` of the
 * nearest [data-fit-root] (the full takeover / slide card).
 */
export function FitLine({ children, min = 28, max = 220, heightFrac = 0.45, maxHeightPx = null }) {
  const ref = useRef(null);
  const rootRef = useRef(null);
  const [size, setSize] = useState(null);
  const mounted = useRef(true);
  const text = typeof children === 'string' ? children : String(children ?? '');

  const fit = useCallback(() => {
    if (!mounted.current) return;
    const el = ref.current;
    if (!el) return;
    const root = rootRef.current || el.closest('[data-fit-root]');
    rootRef.current = root;
    const H = maxHeightPx || (root?.clientHeight || 900) * heightFrac;
    const best = searchFontSize(el, min, max, () => el.offsetHeight <= H && el.scrollWidth <= el.clientWidth + 1);
    setSize(best);
  }, [text, min, max, heightFrac, maxHeightPx]);

  useLayoutEffect(() => {
    mounted.current = true;
    fit();
    let ro;
    const root = ref.current?.closest('[data-fit-root]');
    if (root && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => fit());
      ro.observe(root);
    }
    document.fonts?.ready?.then(() => fit()).catch(() => {});
    return () => { mounted.current = false; ro?.disconnect(); };
  }, [fit]);

  return (
    <span
      ref={ref}
      style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'normal', fontSize: size ? `${size}px` : undefined }}
    >
      {text}
    </span>
  );
}
