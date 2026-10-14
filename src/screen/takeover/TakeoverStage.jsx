import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDesign } from '../design/DesignRoot.jsx';
import { styleOf } from '../design/announceStyles.js';
import { renderStyleId, effectiveAnimation } from '../../shared/takeoverStyles.js';
import { modelFor, stageLayout } from '../../shared/takeoverModel.js';
import { layoutOf } from '../../shared/announcements.js';
import { renderArt } from './art.js';
import { LAYOUT_HTML } from './layouts.js';
import { fitAll, splitLively, showPage, DEFAULT_PAGE_SECONDS } from './fit.js';
import { ensureTakeoverCss } from './css.js';

/**
 * One takeover "stage" at a virtual W x H canvas (round-3b design,
 * docs/design/2026-10-14-takeovers-r3/). The kiosk full-screen takeover renders
 * it at the real canvas size; rotation slides and the admin picker render it
 * at the design size and scale it with CSS (StageBox below).
 *
 * The art (static SVG layers with entrance + ambient CSS animation) and the
 * layout text are HTML strings set once per content change; fitting is a
 * one-shot measurement (fit.js), never per frame. The clock text is React so
 * it can tick without touching the animated DOM.
 */

const PAGE_SECONDS = DEFAULT_PAGE_SECONDS;
export { PAGE_SECONDS };

function clockText(clock) {
  if (clock?.formatted) return `${clock.formatted} ${clock.ampm || ''}`.trim();
  const d = new Date(); const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function TakeoverStage({ item, w, h, clock, showClock = true, entrance = true, onPages, animation }) {
  ensureTakeoverCss();
  const { light, motion } = useDesign();
  const rootRef = useRef(null);
  const style = renderStyleId(item.look?.style);
  const S = styleOf(style);
  const layout = stageLayout(layoutOf(item));
  const { anim, lively } = effectiveAnimation(animation ?? item.look?.animation, motion);

  const key = JSON.stringify([item.content, layout, item.look?.maxFontPx]);
  const built = useMemo(() => {
    const r = renderArt(style, S, w, h, light);
    const m = modelFor(item, layout);
    return { r, html: LAYOUT_HTML[layout](m) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, style, w, h, light]);

  // The entrance plays once on mount (not on every keystroke in the admin preview).
  const [enterNow, setEnterNow] = useState(entrance && anim !== 'off');
  useEffect(() => {
    if (!enterNow) return undefined;
    const t = setTimeout(() => setEnterNow(false), 1600);
    return () => clearTimeout(t);
  }, [enterNow]);

  const pageRef = useRef(0);
  const [pages, setPages] = useState(1);
  const onPagesRef = useRef(onPages); onPagesRef.current = onPages;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let alive = true;
    const run = () => {
      if (!alive) return;
      const res = fitAll(root, { page: pageRef.current });
      setPages(res.pages);
      onPagesRef.current?.(res.pages);
    };
    run();
    if (enterNow) splitLively(root);
    let raf = 0;
    const refit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
    document.fonts?.ready?.then(refit).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', refit);
    return () => { alive = false; cancelAnimationFrame(raf); document.fonts?.removeEventListener?.('loadingdone', refit); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  // Long sicha / letter text steps through its pages at a fixed reading size.
  useEffect(() => {
    if (pages < 2) return undefined;
    const id = setInterval(() => {
      pageRef.current = (pageRef.current + 1) % pages;
      showPage(rootRef.current, pageRef.current);
    }, PAGE_SECONDS * 1000);
    return () => clearInterval(id);
  }, [pages]);

  const { r } = built;
  const ent = motion === 'lively' ? 'lively' : S.ent;
  const livelyCls = lively || S.ent === 'lively';
  const bw = w - r.L - r.R;
  const cls = ['stage', `st-${style}`, r.align, `mo-${ent}`, bw < 1000 ? 'narrow' : '', r.port ? 'port' : '', enterNow ? 'enter' : '', livelyCls ? 'x-lively' : '', `anim-${anim}`, light ? 'light' : ''].filter(Boolean).join(' ');
  const ch = { top: 34, side: 56, bottom: 34, ...(S.chrome || {}) };
  const pos = (p) => ({ tl: { top: ch.top, left: ch.side }, tr: { top: ch.top, right: ch.side }, bl: { bottom: ch.bottom, left: ch.side }, br: { bottom: ch.bottom, right: ch.side } }[p]);
  const showBh = (S.bh || 'tr') !== 'none';

  return (
    <div ref={rootRef} className="tkr" style={{ width: w, height: h }} data-style={style} data-layout={layout} data-anim={anim}>
      <div className={cls} style={{ width: w, height: h }}>
        <div className="art stage-in" dangerouslySetInnerHTML={{ __html: r.art }} />
        {showClock && <div className="chrome num" style={pos(S.clock || 'tl')}>{clockText(clock)}</div>}
        {showBh && <div className="chrome bh" style={pos(S.bh || 'tr')}>{'ב״ה'}</div>}
        <div className="box" style={{ left: r.L, right: r.R, top: r.Tp, bottom: r.B }} dangerouslySetInnerHTML={{ __html: built.html }} />
      </div>
    </div>
  );
}

/**
 * Size of the virtual canvas for a box of pw x ph layout px: landscape boxes
 * use the 1600 design width (height follows the box's aspect, 800..1400 so
 * 16:10 and squarer panels keep working), tall boxes the 900 portrait width.
 */
export function virtualSize(pw, ph) {
  if (ph > pw * 1.15) return { w: 900, h: Math.min(1700, Math.max(1000, Math.round(900 * ph / pw))) };
  return { w: 1600, h: Math.min(1400, Math.max(800, Math.round(1600 * ph / pw))) };
}

/**
 * Fills its (positioned) parent: measures it and renders the stage either 1:1
 * (`mode="canvas"`, full-screen takeover on the kiosk canvas) or at the design
 * size scaled down to the box (`mode="fit"`, slides and thumbnails).
 */
export function StageBox({ item, mode = 'fit', fixedSize, radius = 0, style, ...rest }) {
  const boxRef = useRef(null);
  const [size, setSize] = useState(fixedSize ? { pw: fixedSize[0], ph: fixedSize[1] } : null);
  useLayoutEffect(() => {
    if (fixedSize) return undefined;
    const el = boxRef.current;
    const measure = () => setSize((prev) => {
      const pw = el.clientWidth, ph = el.clientHeight;
      return prev && prev.pw === pw && prev.ph === ph ? prev : { pw, ph };
    });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [fixedSize]);

  let inner = null;
  if (size && size.pw > 0 && size.ph > 0) {
    if (mode === 'canvas') {
      inner = <TakeoverStage item={item} w={Math.floor(size.pw)} h={Math.floor(size.ph)} {...rest} />;
    } else {
      const v = virtualSize(size.pw, size.ph);
      const k = size.pw / v.w;
      inner = (
        <div style={{ width: v.w, height: v.h, transform: `scale(${k})`, transformOrigin: 'top left' }}>
          <TakeoverStage item={item} w={v.w} h={v.h} {...rest} />
        </div>
      );
    }
  }
  return (
    <div ref={boxRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: radius, ...style }}>
      {inner}
    </div>
  );
}
