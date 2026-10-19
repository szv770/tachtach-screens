import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { READER, readerPlan, readerKeyframesCss } from '../../shared/longText.js';
import { ensureReaderCss, readerAnimName, readerAnimation } from './reader.js';

/**
 * AutoScroll reader body (rules: src/shared/longText.js, CSS: reader.js).
 *
 * Shows `text` at the given size. If it does not fit it first shrinks by up to
 * (1 - minShrink) (one-shot measurement, never per frame); if it STILL does not fit
 * it reports `{ over: true, distance, contentH, words }` through `onMeasure` and,
 * once the parent hands back `scrollSec`, scrolls: one `translate3d` CSS animation on
 * the inner track, hold + ease + steady + ease + hold, finite (or looping with
 * fades when `loop`), edge fades drawn over it. Several bodies side by side (Hayom
 * Yom English | Hebrew) share one `scrollSec`, so they start and finish together.
 *
 *   <ReaderBody text="para\npara" dir="rtl" style={{ fontSize: 39 }} onMeasure={setInfo} scrollSec={s} />
 */
export default function ReaderBody({ text, dir, style, className, minShrink = READER.minShrink, scrollSec, loop = false, onMeasure }) {
  ensureReaderCss();
  const viewRef = useRef(null);
  const trackRef = useRef(null);
  const [info, setInfo] = useState(null);
  const onMeasureRef = useRef(onMeasure); onMeasureRef.current = onMeasure;
  const paras = useMemo(() => String(text || '').split(/\n+/).map((p) => p.trim()).filter(Boolean), [text]);
  const words = useMemo(() => paras.join(' ').split(/\s+/).filter(Boolean).length, [paras]);

  const measure = useCallback(() => {
    const v = viewRef.current, t = trackRef.current;
    if (!v || !t || !v.clientHeight) return;
    const pads = () => { const cs = getComputedStyle(t); return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0); };
    const natural = () => t.offsetHeight - pads();
    let k = 1;
    v.style.setProperty('--rd-k', '1');
    while (natural() > v.clientHeight + 1 && k > minShrink + 1e-6) {
      k = Math.max(minShrink, +(k - 0.03).toFixed(3));
      v.style.setProperty('--rd-k', String(k));
    }
    const fs = parseFloat(getComputedStyle(v).fontSize) || 30;
    const contentH = natural();
    const overflow = contentH - v.clientHeight;
    const next = overflow <= 1
      ? { over: false, words }
      : { over: true, words, distance: Math.round(overflow + 2 * READER.fadeEm * fs), contentH: Math.round(contentH + 2 * READER.fadeEm * fs) };
    setInfo((prev) => (prev && prev.over === next.over && prev.distance === next.distance && prev.contentH === next.contentH && prev.words === next.words ? prev : next));
  }, [minShrink, words]);

  // report upwards (outside setState so a parent update never nests inside this component's render)
  useLayoutEffect(() => { if (info) onMeasureRef.current?.(info); }, [info]);

  useLayoutEffect(() => {
    measure();
    let ro;
    if (typeof ResizeObserver !== 'undefined' && viewRef.current) {
      let first = true;
      ro = new ResizeObserver(() => { if (first) { first = false; return; } measure(); });
      ro.observe(viewRef.current);
    }
    let alive = true;
    document.fonts?.ready?.then(() => alive && measure()).catch(() => {});
    const onFonts = () => alive && measure();
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => { alive = false; ro?.disconnect(); document.fonts?.removeEventListener?.('loadingdone', onFonts); };
  }, [measure, text, style?.fontSize, style?.fontFamily]);

  const on = !!(info?.over && scrollSec > 0);
  const anim = useMemo(() => {
    if (!on) return null;
    const plan = readerPlan({ distance: info.distance, scrollSec });
    const name = readerAnimName(plan);
    return { name, css: readerKeyframesCss(name, plan, { loop }), value: readerAnimation(name, plan, loop) };
  }, [on, info?.distance, scrollSec, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  const fs = style?.fontSize;
  const viewStyle = { ...style, ...(fs != null ? { fontSize: `calc((${typeof fs === 'number' ? `${fs}px` : fs}) * var(--rd-k, 1))` } : null) };

  return (
    <div ref={viewRef} dir={dir} className={`rd-view ${className || ''}`} style={viewStyle} data-reader={on ? 'scroll' : 'static'}>
      <div ref={trackRef} className="rd-track" data-on={on ? '' : undefined} style={anim ? { animation: anim.value } : undefined}>
        {paras.map((p, i) => <p key={i} style={{ margin: i ? '.6em 0 0' : 0 }}>{p}</p>)}
      </div>
      {on && <i className="rd-fade t" aria-hidden="true" />}
      {on && <i className="rd-fade b" aria-hidden="true" />}
      {anim && <style>{anim.css}</style>}
    </div>
  );
}
