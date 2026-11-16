import React, { useEffect, useRef, useState } from 'react';
import { HOUR, pad2 } from '../model.js';
import { UnitLabel } from '../parts.jsx';

/**
 * FLIP CARDS and ROLLING NUMBERS (PLAN.md 2d `flip`, `odometer`).
 *
 * Flip: a real split-flap: each card is two static halves (top lit by a static sheen, bottom in shade), a 2 px hinge and
 * two pins; when a digit changes ONE leaf (the old top half, with the new bottom half on its back) folds down with
 * rotateX 0 -> -180 in 600 ms while a shade passes over the bottom half and the leaf darkens as it turns away. Finite;
 * worst case 8 leaves at a rollover. Seconds only from the last day (owner decision 6): far = Days | Hours | Minutes.
 * Rolling numbers: one wheel per digit, a 0-9 strip moved by translateY (700 ms, a little overshoot), static cylinder
 * shading. Seconds always roll (it is the 'action' kind).
 * Minimal / reduced motion: digits change in place (no leaf, no transition).
 */

/** The groups to show: [{ id, digits: '032', unit }] */
export function groupsFor(t, { seconds }) {
  if (t.secs) {
    const hh = Math.floor(t.ms / HOUR);
    const g = [];
    if (hh > 0) g.push({ id: 'h', v: pad2(hh), unit: hh === 1 ? 'hour' : 'hours' });
    g.push({ id: 'm', v: pad2(t.m), unit: 'minutes' });
    g.push({ id: 's', v: pad2(t.s), unit: 'seconds', hot: true });
    return g;
  }
  const g = [
    { id: 'd', v: t.d >= 100 ? String(t.d) : pad2(t.d), unit: t.d === 1 ? 'day' : 'days' },
    { id: 'h', v: pad2(t.h), unit: 'hours' },
    { id: 'm', v: pad2(t.m), unit: 'minutes' },
  ];
  if (seconds) g.push({ id: 's', v: pad2(t.s), unit: 'seconds', hot: true });
  return g;
}

/** Card height so every group fits the box: one row, or (portrait, 3+ groups) two rows. */
function layout(groups, box, portrait, aspect) {
  const gapIn = 12; const colon = 54; const label = 58;
  const rowsOf = (n) => (n === 1 ? [groups] : [groups.slice(0, Math.ceil(groups.length / 2)), groups.slice(Math.ceil(groups.length / 2))]);
  const fit = (rows) => {
    let best = 1e9;
    for (const row of rows) {
      const digits = row.reduce((t, g) => t + g.v.length, 0);
      const fixed = row.reduce((t, g) => t + (g.v.length - 1) * gapIn, 0) + (row.length - 1) * colon;
      best = Math.min(best, (box.w * 0.96 - fixed) / (digits * aspect));
    }
    const hRow = (box.h * 0.94 - (rows.length - 1) * 40) / rows.length - label;
    return Math.max(40, Math.floor(Math.min(best, hRow, portrait ? 300 : 330)));
  };
  const one = fit(rowsOf(1));
  if (portrait && groups.length >= 3) {
    const two = fit(rowsOf(2));
    if (two > one * 1.15) return { rows: rowsOf(2), ch: two };
  }
  return { rows: rowsOf(1), ch: one };
}

export function FlipCard({ v, still, ch }) {
  const [st, setSt] = useState({ cur: v, prev: v, n: 0 });
  const timer = useRef(0);
  useEffect(() => {
    if (v === st.cur) return;
    setSt((o) => ({ cur: v, prev: o.cur, n: o.n + 1 }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSt((o) => ({ ...o, prev: o.cur })), 640);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  const flipping = !still && st.prev !== st.cur;
  const cw = Math.round(ch * (st.cur.length > 1 ? 0.7 * st.cur.length : 0.7));
  return (
    <div className={`sp-card${flipping ? ' sp-flipping' : ''}`} style={{ '--ch': `${ch}px`, '--cw': `${cw}px` }}>
      <div className="sp-half t"><span>{st.cur}</span></div>
      <div className="sp-half b"><span>{flipping ? st.prev : st.cur}</span></div>
      {flipping && <div className="sp-fshade" />}
      {flipping && (
        <div className="sp-leaf" key={st.n}>
          <div className="sp-half t"><span>{st.prev}</span><i className="sp-dark-ov" /></div>
          <div className="sp-half b"><span>{st.cur}</span></div>
        </div>
      )}
      <div className="sp-hinge" />
      <i className="sp-pin l" /><i className="sp-pin r" />
    </div>
  );
}

function Wheel({ d, wh, ww }) {
  const n = Number(d) || 0;
  return (
    <div className="sp-wheel" style={{ '--wh': `${wh}px`, '--ww': `${ww}px` }}>
      <div className="sp-strip" style={{ transform: `translate3d(0, ${-n * wh}px, 0)` }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => <span key={k}>{k}</span>)}
      </div>
      <i className="sp-cyl" /><i className="sp-cyl2" />
    </div>
  );
}

function Colon({ ch, pulse }) {
  const dot = Math.max(10, Math.round(ch * 0.065));
  return (
    <div aria-hidden className={pulse ? 'sp-pulse' : ''} style={{ alignSelf: 'flex-start', marginTop: ch / 2 - dot * 1.6, display: 'flex', flexDirection: 'column', gap: dot * 1.2, width: 54, alignItems: 'center', flex: 'none' }}>
      <i style={{ width: dot, height: dot, borderRadius: '50%', background: 'var(--sp-acc)' }} />
      <i style={{ width: dot, height: dot, borderRadius: '50%', background: 'var(--sp-acc)' }} />
    </div>
  );
}

function Groups({ sp, t, box, ctx, wheels }) {
  const groups = groupsFor(t, { seconds: wheels });
  const aspect = wheels ? 0.66 : 0.7;
  const { rows, ch } = layout(groups, box, ctx.portrait, aspect + 0.02);
  return (
    <div data-sp-kind={wheels ? 'odometer' : 'flip'} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      {rows.map((row, ri) => (
        <div key={ri} dir="ltr" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', flexDirection: ctx.rtl ? 'row-reverse' : 'row' }}>
          {row.map((g, gi) => (
            <React.Fragment key={g.id}>
              {gi > 0 && <Colon ch={ch} pulse={!ctx.still && t.secs} />}
              <div className="sp-in" style={{ '--d': `${200 + (ri * row.length + gi) * 110}ms`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                <div style={{ display: 'flex', gap: 12, padding: g.hot ? 10 : 0, margin: g.hot ? -10 : 0, borderRadius: ch * 0.11, boxShadow: g.hot ? '0 0 0 2px color-mix(in srgb, var(--sp-acc) 55%, transparent)' : 'none' }}>
                  {wheels
                    ? g.v.split('').map((c, i) => <Wheel key={`${g.id}${i}`} d={c} wh={ch} ww={Math.round(ch * 0.66)} />)
                    : g.v.split('').map((c, i) => <FlipCard key={`${g.id}${i}`} v={c} ch={ch} still={ctx.still} />)}
                </div>
                <UnitLabel unit={g.unit} lang={ctx.lang} toGo={false} size={ch > 200 ? 26 : 24} color={g.hot ? 'var(--sp-acc)' : undefined} style={{ letterSpacing: '.3em', color: g.hot ? 'var(--sp-acc)' : undefined }} />
              </div>
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

export function FlipKind(props) { return <Groups {...props} wheels={false} />; }
export function OdometerKind(props) { return <Groups {...props} wheels />; }
