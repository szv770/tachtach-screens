import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { F, Bidi } from '../../../design/ui.jsx';
import { DAY_FIT, dayColumnCandidates, searchLargest, pickDayFit, dayScrollSeconds, showAmPm } from '../../../../shared/scheduleLayout.js';
import { READER, readerPlan, readerKeyframesCss } from '../../../../shared/longText.js';
import { ensureReaderCss, readerAnimName, readerAnimation } from '../../../design/reader.js';
import { hm, ap, catVars, contentKey } from './model.js';
import { SplitTimes, useRefit } from './parts.jsx';

/**
 * Whole day: every row at once. One-shot fit (never per frame): for 1 / 2 (/ 3) columns, with and without
 * the Hebrew names, binary-search the largest row size whose rows all fit the box (CSS multi-column,
 * balanced; overflow shows up as extra columns = scrollWidth), then pickDayFit. Nothing fits above the
 * legibility floor -> one column that scrolls ONCE (reader keyframes: hold, ease, steady, ease, hold).
 * States (now / next / past) only change colours, never sizes, so nothing jumps between minutes.
 */

// grid columns, in em of the row size: start time | am/pm | end time | category bar | name (+ Hebrew)
const T = { start: 2.68, ap: 1.08, end: 2.42, bar: .78 };

export function DayRow({ s, state, now, showAp, hasEnd, light, hebrew }) {
  const isNow = state === 'now', isNext = state === 'next', isPast = state === 'past';
  const dim = isNow ? 'color-mix(in srgb, var(--fillInk) 72%, transparent)' : isPast ? 'var(--past)' : 'var(--inkDim)';
  const bar = isNow ? 'var(--fillInk)' : isNext ? 'var(--accentText)' : isPast ? 'var(--past)' : 'var(--catDot)';
  const tpl = `${T.start}em ${T.ap}em ${hasEnd ? `${T.end}em ` : ''}${T.bar}em minmax(0, 1fr)`;
  return (
    <div data-row={s.id} data-state={state || 'later'} style={{
      ...catVars(s, light), breakInside: 'avoid', display: 'grid', gridTemplateColumns: tpl, alignItems: 'baseline',
      padding: '.1em .3em', borderRadius: '.32em', position: 'relative', lineHeight: 1.13,
      color: isNow ? 'var(--fillInk)' : isPast ? 'var(--past)' : 'var(--ink)',
      background: isNow ? 'var(--fill)' : 'transparent',
      boxShadow: isNow ? '0 .12em .5em color-mix(in srgb, var(--fill) 30%, transparent)'
        : isNext ? 'inset 0 0 0 .07em color-mix(in srgb, var(--accentText) 60%, transparent)' : 'none',
    }}>
      <span className="tt-num" data-cell="start" style={{ textAlign: 'right', fontWeight: 650, letterSpacing: '-.03em', whiteSpace: 'nowrap', color: isNext ? 'var(--accentText)' : undefined }}>{hm(s.v)}</span>
      <span data-cell="ap" data-ap="" style={{ fontFamily: F.en, fontSize: '.56em', fontWeight: 700, letterSpacing: '.02em', paddingLeft: '.38em', color: isNext ? 'var(--accentText)' : dim, whiteSpace: 'nowrap' }}>{showAp ? ap(s.v) : ''}</span>
      {hasEnd && (
        <span className="tt-num" data-cell="end" style={{ fontSize: '.66em', fontWeight: 600, color: dim, whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>{s.end != null ? `–${hm(s.end)}` : ''}</span>
      )}
      <i aria-hidden="true" style={{ alignSelf: 'start', marginTop: '.16em', justifySelf: 'center', width: '.2em', height: '.86em', borderRadius: '.1em', background: bar }} />
      <span data-cell="name" style={{ display: 'flex', alignItems: 'baseline', gap: '.55em', minWidth: 0 }}>
        <span style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Bidi text={s.primary} fallback={s.primaryHe ? 'rtl' : 'ltr'} style={{ fontFamily: s.primaryHe ? F.heD : F.enD, fontWeight: 600, letterSpacing: s.primaryHe ? 0 : '-.01em' }} />
          {s.split && <SplitTimes split={s.split} now={now} color={dim} onColor={isNow ? 'var(--fillInk)' : isPast ? 'var(--past)' : 'var(--ink)'} size=".6em" />}
        </span>
        {s.chazan && (
          <span data-ch="" style={{ display: 'var(--ch-on, none)', flex: 'none', fontFamily: F.en, fontSize: '.66em', fontWeight: 600, color: dim, whiteSpace: 'nowrap' }}>
            <span aria-hidden="true" style={{ margin: '0 .35em 0 0' }}>·</span>{s.chazan}
          </span>
        )}
        {hebrew && s.secondary && (
          <Bidi text={s.secondary} fallback="rtl" data-he="" style={{ display: 'var(--he-on, inline)', marginLeft: 'auto', flex: 'none', fontFamily: F.heD, fontWeight: 500, fontSize: 'calc(.82em * var(--he-scale, 1))', color: dim, whiteSpace: 'nowrap' }} />
        )}
      </span>
    </div>
  );
}

export default function DayView({ items, states, now, light, portrait, hebrewMode = 'auto', canScroll = true, speed = 'normal', onSeconds }) {
  ensureReaderCss();
  const boxRef = useRef(null);
  const colsRef = useRef(null);
  const trackRef = useRef(null);
  const [plan, setPlan] = useState(null); // { mode: 'fit'|'scroll', cols, hebrew, size }
  const [colStarts, setColStarts] = useState(() => new Set());
  const [scroll, setScroll] = useState(null); // { distance, sec }
  const key = contentKey(items);
  const hasHe = hebrewMode !== 'off' && items.some((s) => s.secondary);
  const hasEnd = items.some((s) => s.end != null);
  const hasCh = items.some((s) => s.chazan);
  const n = items.length;

  const fit = useCallback(() => {
    const el = colsRef.current;
    if (!el || !el.clientHeight || !el.clientWidth) return;
    const fits = () => {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) return false;
      const all = el.querySelectorAll('[data-row]'); const last = all[all.length - 1];
      if (last && last.offsetLeft + last.offsetWidth > el.clientWidth + 1) return false;
      // a word too long for its column must not be broken or poke out: refuse the size instead
      for (const c of el.querySelectorAll('[data-cell=name]')) if (c.scrollWidth > c.clientWidth + 1) return false;
      return true;
    };
    // rows whose name had to wrap onto a second line (ragged when there are many)
    const wrapped = (s) => {
      let k = 0;
      for (const r of el.querySelectorAll('[data-row]')) if (r.offsetHeight > s * 1.13 * 1.55 + s * 0.2) k++;
      return k;
    };
    const apply = (c, h, s, ch) => { el.style.columnCount = String(c); el.style.setProperty('--he-on', h ? 'inline' : 'none'); el.style.setProperty('--ch-on', ch ? 'inline' : 'none'); el.style.fontSize = `${s}px`; };
    const tryAll = (floor, ch = false) => {
      const results = [];
      for (const cols of dayColumnCandidates(n, portrait)) {
        for (const hebrew of hasHe ? [true, false] : [false]) {
          const size = searchLargest(floor, DAY_FIT.max, (s) => { apply(cols, hebrew, s, ch); return fits(); });
          let wraps = 0;
          if (size != null) { apply(cols, hebrew, size, ch); wraps = wrapped(size); }
          results.push({ cols, hebrew, size, wraps, count: n });
        }
      }
      return pickDayFit(results);
    };
    // chazan names ride on the davening rows only when they do not make the type smaller (within 2 px) than without them
    let best = tryAll(DAY_FIT.floor, false);
    let names = false;
    if (hasCh) {
      const withCh = tryAll(DAY_FIT.floor, true);
      if (withCh && (!best || withCh.size >= best.size - 2)) { best = withCh; names = true; }
    }
    if (!best && !canScroll) best = tryAll(DAY_FIT.minimalFloor, false);
    let next;
    if (best) next = { mode: 'fit', cols: best.cols, hebrew: best.hebrew, size: best.size, names };
    else if (canScroll) next = { mode: 'scroll', cols: 1, hebrew: hasHe, size: portrait ? DAY_FIT.scrollSize.portrait : DAY_FIT.scrollSize.landscape, names: hasCh };
    else { const c = dayColumnCandidates(n, portrait); next = { mode: 'fit', cols: c[c.length - 1], hebrew: false, size: DAY_FIT.minimalFloor, names: false }; }
    apply(next.mode === 'fit' ? next.cols : 1, next.hebrew, next.size, next.names);
    setPlan((p) => (p && p.mode === next.mode && p.cols === next.cols && p.hebrew === next.hebrew && p.size === next.size && p.names === next.names ? p : next));
  }, [key, n, portrait, hasHe, hasCh, canScroll]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefit(fit, boxRef, [fit]);

  // which rows start a column (they always show am/pm); measured after the fit, sizes never change
  useLayoutEffect(() => {
    const el = colsRef.current; if (!el || !plan || plan.mode !== 'fit') return;
    const starts = new Set(); let left = null;
    el.querySelectorAll('[data-row]').forEach((r) => { if (left == null || Math.abs(r.offsetLeft - left) > 4) { starts.add(r.dataset.row); left = r.offsetLeft; } });
    setColStarts((p) => (p.size === starts.size && [...starts].every((x) => p.has(x)) ? p : starts));
  }, [plan, key]);

  // scroll fallback: measure once in scroll mode
  useLayoutEffect(() => {
    if (!plan || plan.mode !== 'scroll') { setScroll((p) => (p ? null : p)); return; }
    const v = boxRef.current, t = trackRef.current; if (!v || !t) return;
    const distance = Math.round(t.offsetHeight - v.clientHeight);
    if (distance <= 2) { setScroll(null); return; }
    const rowH = t.offsetHeight / Math.max(1, n);
    const sec = dayScrollSeconds(Math.ceil(distance / rowH), speed);
    setScroll((p) => (p && p.distance === distance && p.sec === sec ? p : { distance, sec }));
  }, [plan, key, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const anim = useMemo(() => {
    if (!scroll) return null;
    const pl = readerPlan({ distance: scroll.distance, scrollSec: scroll.sec });
    const name = readerAnimName(pl);
    return { css: readerKeyframesCss(name, pl), value: readerAnimation(name, pl, false), total: pl.total };
  }, [scroll]);

  const scrolling = plan?.mode === 'scroll';
  const secs = scrolling && anim ? Math.ceil(anim.total) + READER.slideExtra : 0;
  const onSecondsRef = useRef(onSeconds); onSecondsRef.current = onSeconds;
  useLayoutEffect(() => { onSecondsRef.current?.(secs); }, [secs]);

  const hebrew = plan ? plan.hebrew : hasHe;
  const showNames = plan ? !!plan.names : false;
  let prev = null;
  const rows = items.map((s, i) => {
    const sa = colStarts.has(s.id) || showAmPm(prev, s.v);
    prev = s.v;
    return <DayRow key={s.id || i} s={s} state={states.st[i]} running={states.running[i]} now={now} showAp={sa} hasEnd={hasEnd} light={light} hebrew={hasHe} />;
  });

  return (
    <div ref={boxRef} data-sched-view="day" data-fit={plan ? `${plan.mode}:${plan.cols}:${plan.size}:${plan.hebrew ? 'he' : 'en'}${hasCh ? (plan.names ? ':ch' : ':noch') : ''}` : ''}
      className={scrolling ? 'rd-view' : undefined}
      style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', marginTop: 10 }}>
      {scrolling && (
        <>
          <div ref={trackRef} className="rd-track" data-on={anim ? '' : undefined}
            style={{ fontSize: plan.size, fontFamily: F.en, '--he-on': hebrew ? 'inline' : 'none', '--ch-on': showNames ? 'inline' : 'none', ...(anim ? { animation: anim.value } : { padding: `${READER.fadeEm}em 0` }) }}>
            {rows}
          </div>
          <i className="rd-fade t" aria-hidden="true" style={{ fontSize: plan.size }} />
          <i className="rd-fade b" aria-hidden="true" style={{ fontSize: plan.size }} />
          {anim && <style>{anim.css}</style>}
        </>
      )}
      {/* the fitted columns; while scrolling, an invisible copy that keeps measuring (a resize can make it fit again) */}
      <div ref={colsRef} aria-hidden={scrolling ? 'true' : undefined} data-measure={scrolling ? '' : undefined} style={{
        height: '100%', fontFamily: F.en, columnFill: 'balance', columnGap: 56, columnRule: '2px solid var(--line)',
        columnCount: plan?.cols || 2, fontSize: plan?.size || DAY_FIT.floor, '--he-on': hebrew ? 'inline' : 'none', '--ch-on': showNames ? 'inline' : 'none',
        ...(scrolling ? { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' } : null),
      }}>
        {scrolling ? items.map((s, i) => <DayRow key={s.id || i} s={s} state="" running={null} now={now} showAp hasEnd={hasEnd} light={light} hebrew={hasHe} />) : rows}
      </div>
    </div>
  );
}
