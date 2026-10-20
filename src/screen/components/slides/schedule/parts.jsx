import React, { useLayoutEffect } from 'react';
import { F } from '../../../design/ui.jsx';
import { hm, ap } from './model.js';
import { slotRunning } from '../../../../shared/scheduleLayout.js';

/** Run a one-shot measurement on mount, on a real size change of `ref`, and when fonts arrive (never per frame). */
export function useRefit(run, ref, deps) {
  useLayoutEffect(() => {
    let alive = true;
    const go = () => { if (alive) run(); };
    go();
    let ro;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      let w = ref.current.clientWidth, h = ref.current.clientHeight;
      ro = new ResizeObserver(() => {
        const el = ref.current; if (!el) return;
        if (Math.abs(el.clientWidth - w) < 2 && Math.abs(el.clientHeight - h) < 2) return;
        w = el.clientWidth; h = el.clientHeight; go();
      });
      ro.observe(ref.current);
    }
    document.fonts?.ready?.then(go).catch(() => {});
    // unicode-range subsets (Hebrew) load lazily, after `ready`
    document.fonts?.addEventListener?.('loadingdone', go);
    return () => { alive = false; ro?.disconnect(); document.fonts?.removeEventListener?.('loadingdone', go); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** "7:15–9:15 PM" for a slot. */
export function rangeText(v, end) {
  if (end == null) return `${hm(v)} ${ap(v)}`;
  return ap(v) === ap(end) ? `${hm(v)}–${hm(end)} ${ap(end)}` : `${hm(v)} ${ap(v)}–${hm(end)} ${ap(end)}`;
}

/**
 * A row whose groups run at different times: "Aleph 7:15–9:15 · Beis & Gimmel 8:00–10:00", the running
 * slot in full ink (colour only: a weight change would re-flow the row between minutes). `split` = [{ label, v, end }] (src/shared/scheduleGroups.js rowsForDisplay).
 */
export function SplitTimes({ split, now, color = 'var(--inkDim)', onColor = 'var(--ink)', size = '.6em', style }) {
  return (
    <span data-split="" style={{ fontFamily: F.en, fontSize: size, fontWeight: 600, color, lineHeight: 1.25, marginTop: '.12em', whiteSpace: 'normal', ...style }}>
      {split.map((x, i) => {
        const on = now != null && slotRunning(x, now);
        return (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ margin: '0 .2em' }}>{' · '}</span>}{/* spaces = the line may break between groups */}
            <span style={{ whiteSpace: 'nowrap', color: on ? onColor : undefined }}>
              <span>{x.label}</span>{' '}<span className="tt-num">{rangeText(x.v, x.end)}</span>
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
}
