import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Auto-fit in the style of the R2 mockup's fitAll(): a one-shot binary
 * search on font-size per render / resize / font load — never per frame.
 * Measured in layout px (scrollWidth/clientWidth), so ScreenScaler's
 * transform doesn't skew it (GOTCHAS: kiosk canvas scaling). Observers are
 * disconnected on unmount.
 */

function fits(el) {
  return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 2;
}

function useRefit(fit, ref) {
  useLayoutEffect(() => {
    let alive = true;
    const run = () => { if (alive) fit(); };
    run();
    let ro;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(run);
      ro.observe(ref.current);
    }
    document.fonts?.ready?.then(run).catch(() => {});
    return () => { alive = false; ro?.disconnect(); };
  }, [fit, ref]);
}

/**
 * <Fit max={210} wrap style={{ height: 230 }}>text</Fit> — the element is the
 * box (give it a height/width via style); its font size is the largest that
 * fits. `wrap` allows balanced wrapping; otherwise one line.
 */
export function Fit({ children, max = 200, min = 16, wrap = false, vcenter = false, style, className, dir, as: Tag = 'div', onSize, ...rest }) {
  const ref = useRef(null);
  const innerRef = useRef(null);
  const [size, setSize] = useState(null);
  const text = typeof children === 'string' ? children : JSON.stringify(React.Children.map(children, (c) => (typeof c === 'string' ? c : c?.key)));
  const ok = useCallback(() => {
    const el = ref.current, inner = innerRef.current;
    if (inner) return inner.offsetHeight <= el.clientHeight + 2 && inner.scrollWidth <= el.clientWidth + 1;
    return fits(el);
  }, []);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    let lo = min, hi = max;
    el.style.fontSize = `${hi}px`;
    if (ok()) { setSize(hi); onSize?.(hi); return; }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      el.style.fontSize = `${mid}px`;
      if (ok()) lo = mid; else hi = mid;
    }
    el.style.fontSize = `${lo}px`;
    setSize(lo);
    onSize?.(lo);
  }, [text, max, min, wrap, vcenter]); // eslint-disable-line react-hooks/exhaustive-deps
  useRefit(fit, ref);
  return (
    <Tag
      ref={ref}
      dir={dir}
      className={className}
      style={{
        whiteSpace: wrap ? 'normal' : 'nowrap', overflow: 'hidden', lineHeight: 1.12,
        textWrap: wrap ? 'balance' : undefined, minWidth: 0,
        ...(vcenter ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : null),
        ...style,
        fontSize: size ? `${size}px` : `${max}px`,
      }}
      {...rest}
    >
      {vcenter ? <div ref={innerRef} style={{ width: '100%', textAlign: 'inherit' }}>{children}</div> : children}
    </Tag>
  );
}

/**
 * Grouped fit: every element registered with the same group gets ONE size —
 * the largest at which the longest fits on one line — floored at `floor`;
 * below the floor an element wraps instead of shrinking (R2 "later today"
 * strip: one rhythm across the row).
 */
export function useGroupFit({ max, floor, deps }) {
  const els = useRef(new Map());
  const [size, setSize] = useState(max);
  const [wrapIds, setWrapIds] = useState(() => new Set());
  const boxRef = useRef(null);
  const register = useCallback((id) => (el) => { if (el) els.current.set(id, el); else els.current.delete(id); }, []);
  const fit = useCallback(() => {
    let group = max;
    for (const el of els.current.values()) {
      if (!el.clientWidth) continue;
      el.style.whiteSpace = 'nowrap';
      let s = max;
      el.style.fontSize = `${s}px`;
      while (el.scrollWidth > el.clientWidth + 1 && s > 14) { s -= 1; el.style.fontSize = `${s}px`; }
      group = Math.min(group, s);
    }
    const final = Math.max(group, floor);
    const wraps = new Set();
    for (const [id, el] of els.current) {
      el.style.fontSize = `${final}px`;
      if (el.scrollWidth > el.clientWidth + 1) wraps.add(id);
    }
    setSize(final);
    setWrapIds(wraps);
  }, [max, floor, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useRefit(fit, boxRef);
  return { boxRef, register, size, wraps: wrapIds };
}
