import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { modelLetterhead, planTimeline, packPages, effectiveSpeed, SPEED_MUL, TYPING } from '../../../shared/letterhead.js';
import { wpmFor } from '../../../shared/longText.js';
import { ensureLetterheadCss } from './css.js';
import sigRebbe from './rebbe-signature.png';

/**
 * The Letterhead look of the Letter layout (src/shared/letterhead.js has the rules).
 *
 * Two layout passes (before paint), then one timeline:
 *   1. header lines: the date block and the addressee wrap into visual lines at their real widths;
 *   2. body: the largest typewriter size at which the WHOLE letter fits the body box (floor 28 design px);
 *      a longer letter keeps the floor size and is packed into pages (next lines, never a scroll);
 *   3. timeline: ONE plan (planTimeline) -> Web Animations on a handful of elements (transform, opacity,
 *      clip-path only): the sheet lands, the letterhead inks in, every line is typed with a caret, a marker
 *      follows the typing and then reads along, pages clear and the next lines type, the signature writes on,
 *      the postmark slams. A takeover loops the whole thing. Still mode (Animation = Off, Minimal motion,
 *      reduced motion, the admin's page preview) draws the finished page and steps through pages on a timer.
 */

const SIGNATURES = { rebbe: sigRebbe };
const COMPACT = [1, 0.84, 0.72];
const HIDE = (rtl) => (rtl ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)');
const SHOW = 'inset(0 0 0 0)';
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';

/** Tiny keyframe builder: `at` holds then jumps, `ramp` moves over the segment, offsets are seconds / total. */
function seq(init) {
  const f = [{ t: 0, ...init }];
  let cur = init;
  const api = {
    f,
    at(t, props) { const last = f[f.length - 1]; const tt = Math.max(last.t, t); f.push({ ...cur, t: Math.max(last.t, tt - 0.001) }); f.push({ ...props, t: tt }); cur = props; return api; },
    ramp(t, props, easing) { const last = f[f.length - 1]; if (easing) last.easing = easing; f.push({ ...props, t: Math.max(last.t, t) }); cur = props; return api; },
  };
  return api;
}

function run(list, el, s, total, loop) {
  if (!el || !s) return;
  const frames = s.f.map(({ t, ...rest }) => ({ ...rest, offset: Math.min(1, Math.max(0, t / total)) }));
  if (frames[frames.length - 1].offset < 1) { const { easing, ...last } = frames[frames.length - 1]; void easing; frames.push({ ...last, offset: 1 }); }
  try {
    list.push(el.animate(frames, { duration: total * 1000, iterations: loop ? Infinity : 1, fill: 'both', easing: 'linear' }));
  } catch { /* an engine without a property: the finished page just shows */ }
}

/** Visual lines of each text at `fs` px in a box `W` px wide, measured in the hidden `meas` element. */
function breakLines(meas, texts, fs, W) {
  meas.style.fontSize = fs + 'px';
  meas.style.width = W + 'px';
  meas.replaceChildren();
  const groups = texts.map((text) => {
    const p = document.createElement('p');
    const ws = String(text).split(/\s+/).filter(Boolean);
    const spans = ws.map((w) => { const s = document.createElement('span'); s.textContent = w; p.appendChild(s); p.appendChild(document.createTextNode(' ')); return s; });
    meas.appendChild(p);
    return { ws, spans };
  });
  return groups.map(({ ws, spans }) => {
    const lines = []; let cur = [], top = null;
    spans.forEach((s, i) => {
      const t = s.offsetTop;
      if (top === null || Math.abs(t - top) < 3) { cur.push(ws[i]); if (top === null) top = t; } else { lines.push(cur.join(' ')); cur = [ws[i]]; top = t; }
    });
    if (cur.length) lines.push(cur.join(' '));
    return lines;
  });
}

const Tl = ({ text, h, c }) => (
  <span className="ty" {...(h != null ? { 'data-h': h } : {})} {...(c ? { 'data-c': '1' } : {})}><span className="tx">{text}</span><i className="cr" /></span>
);

function Postmark({ top, bottom }) {
  return (
    <svg className="stamp" viewBox="0 0 140 88" aria-hidden="true">
      <defs>
        <path id="lh-arc-t" d="M 15 44 A 32 32 0 0 1 79 44" />
      </defs>
      <g fill="none" stroke="var(--stamp)" strokeWidth="2" opacity=".9">
        <circle cx="47" cy="44" r="40" />
        <circle cx="47" cy="44" r="24" strokeWidth="1.4" />
        <path d="M 86 26 q 8 -5 16 0 t 16 0 t 16 0" strokeWidth="2.2" />
        <path d="M 86 38 q 8 -5 16 0 t 16 0 t 16 0" strokeWidth="2.2" />
        <path d="M 86 50 q 8 -5 16 0 t 16 0 t 16 0" strokeWidth="2.2" />
        <path d="M 86 62 q 8 -5 16 0 t 16 0 t 16 0" strokeWidth="2.2" />
      </g>
      <text fontSize="7.6" textAnchor="middle" letterSpacing=".3"><textPath href="#lh-arc-t" startOffset="50%">{top}</textPath></text>
      {bottom ? <text fontSize="6.4" textAnchor="middle" x="47" y="46.5">{bottom}</text> : null}
    </svg>
  );
}

export default function LetterSheet({ item, w, h, anim = 'full', loop = false, speed = 'normal', flush = false, still = false, forcedPage = null, onDuration, onPages }) {
  ensureLetterheadCss();
  // compare by CONTENT, not identity: a parent that re-renders (the clock ticks) must never restart the typing
  const mKey = JSON.stringify([item.content?.letter, item.look?.letter]);
  const m = useMemo(() => modelLetterhead(item), [mKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const port = w < h;
  const k = Math.max(0.5, Math.min(1.7, port ? Math.min(w / 800, h / 1300) : Math.min(w / 1480, h / 760)));
  const faceScale = m.rtl ? 1.2 : m.serif ? 1.1 : 1;
  const stillMode = still || anim === 'off' || forcedPage != null;

  const rootRef = useRef(null), sheetRef = useRef(null), bodyRef = useRef(null), measRef = useRef(null);
  const [ft, setFt] = useState(0);
  const [hl, setHl] = useState(null);     // wrapped header lines { date:[], to:[], greet:[] }
  const [lay, setLay] = useState(null);   // { fs, lh, pages }
  const [cur, setCur] = useState(0);      // page shown in still mode
  const [cl, setCl] = useState(0);        // compact level: 0 normal, 1 and 2 tighten the header / footer before the body paginates
  const c = COMPACT[cl];
  const dimsKey = `${Math.round(w)}x${Math.round(h)}`;

  // fonts arriving change every width: measure again
  useEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setFt((n) => n + 1); };
    document.fonts?.ready?.then(bump).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => { alive = false; document.fonts?.removeEventListener?.('loadingdone', bump); };
  }, []);

  useLayoutEffect(() => { setCl(0); }, [m, k, dimsKey]);

  // pass 1: wrap the header lines at their real widths
  useLayoutEffect(() => {
    const meas = measRef.current, sheet = sheetRef.current;
    if (!meas || !sheet) return;
    const cs = getComputedStyle(sheet);
    const inner = sheet.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = 40 * k * c;
    const dtW = port ? inner : Math.round(inner * 0.4);
    const toW = port ? inner : Math.max(200, inner - dtW - gap);
    const head = (texts, fs, W) => (texts.length ? breakLines(meas, texts, fs, W).flat() : []);
    const date = head(m.date, 25 * k * c, dtW);
    const next = { date, to: head(m.to, 25 * k * c, toW), greet: head(m.sal ? [m.sal] : [], 27 * k * c, inner) };
    setHl((p) => (p && JSON.stringify(p) === JSON.stringify(next) ? p : next));
  }, [m, k, c, port, dimsKey, ft]);

  // pass 2: the biggest typewriter size that fits the whole body, else the floor size in pages
  useLayoutEffect(() => {
    const body = bodyRef.current, meas = measRef.current;
    if (!body || !meas || !hl) return;
    const W = body.clientWidth, H = body.clientHeight;
    if (W < 60 || H < 30) return;
    const lo = Math.round((cl ? 27 : 28) * k * faceScale), hi = Math.round(40 * k * faceScale);
    const words = m.body.join(' ').split(/\s+/).filter(Boolean).length;
    const attempt = (fs) => {
      const paras = breakLines(meas, m.body, fs, W);
      const lh = fs * 1.42;
      const n = paras.reduce((a, p) => a + p.length, 0);
      return { fs, lh, paras, fits: (n + 0.5 * Math.max(0, paras.length - 1)) * lh <= H + 1 };
    };
    let best = null;
    if (words <= 260) { for (let fs = hi; fs >= lo; fs -= 2) { const a = attempt(fs); if (a.fits) { best = a; break; } } }
    if (!best) best = attempt(lo);
    // does not fit whole: tighten the header and footer first (re-measures), paginate only at the tightest level
    if (!best.fits && cl < COMPACT.length - 1) { setCl(cl + 1); return; }
    const pages = best.fits ? [{ paras: best.paras, words }] : packPages(best.paras, H / best.lh - 1, 0.5);
    const next = { fs: best.fs, lh: best.lh, pages };
    setLay((p) => (p && JSON.stringify(p) === JSON.stringify(next) ? p : next));
  }, [m, k, faceScale, hl, cl, dimsKey, ft]);

  const pageCount = lay ? lay.pages.length : 1;
  useEffect(() => { if (forcedPage != null) onPages?.(pageCount); }, [forcedPage, pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // still mode: finished page, next lines on a timer
  const spd = effectiveSpeed(m.speed, speed); // this letter's own speed, else the screen's reading speed
  const wpm = wpmFor(spd, m.rtl ? 'he' : 'en');
  useEffect(() => {
    if (!stillMode || !lay) return undefined;
    if (forcedPage != null) { setCur(Math.min(forcedPage, pageCount - 1)); return undefined; }
    const per = lay.pages.map((p) => Math.max(8, (p.words * 60) / wpm + 2));
    onDuration?.(per.reduce((a, b) => a + b, 0) + 2);
    if (pageCount < 2) { setCur(0); return undefined; }
    let i = 0, id;
    const tick = () => { id = setTimeout(() => { i = (i + 1) % pageCount; setCur(i); tick(); }, per[i] * 1000); };
    setCur(0); tick();
    return () => clearTimeout(id);
  }, [stillMode, lay, forcedPage, wpm]); // eslint-disable-line react-hooks/exhaustive-deps

  // the timeline
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !lay || stillMode) return undefined;
    const full = anim === 'full';
    const anims = [];
    const q = (sel) => [...root.querySelectorAll(sel)];
    const heads = q('.ty[data-h]').sort((a, b) => +a.dataset.h - +b.dataset.h);
    const pgEls = q('.pg');
    const closeEl = root.querySelector('.ty[data-c]');
    const sigEl = root.querySelector('.sig'), stampEl = root.querySelector('.stamp'), mailEl = root.querySelector('.mail');
    const len = (el) => (el.querySelector('.tx')?.textContent || '').length;

    const plan = planTimeline({
      headLines: heads.map(len),
      pages: lay.pages.map((p, i) => ({ lines: [...pgEls[i].querySelectorAll('.ty')].map(len), words: p.words })),
      wpm, typeMul: SPEED_MUL[spd], hasClose: !!closeEl, closeChars: closeEl ? len(closeEl) : 0, hasSig: !!sigEl, hasStamp: !!stampEl, hasMailed: !!mailEl, loop,
    });
    const T = plan.total;
    const mono = !m.serif;
    const rtl = m.rtl;

    const typeLine = (el, s, e) => {
      const tx = el.querySelector('.tx'), cr = el.querySelector('.cr');
      const n = Math.max(1, len(el));
      const easing = mono ? `steps(${n}, end)` : 'linear';
      run(anims, tx, seq({ clipPath: HIDE(rtl) }).at(s, { clipPath: HIDE(rtl) }).ramp(e, { clipPath: SHOW }, easing), T, loop);
      const x0 = tx.offsetLeft, W = tx.offsetWidth;
      const a = rtl ? x0 + W : x0, b = rtl ? x0 : x0 + W;
      const tr = (x) => `translateX(${Math.round(x)}px)`;
      run(anims, cr, seq({ opacity: 0, transform: tr(a) }).at(s, { opacity: 1, transform: tr(a) }).ramp(e, { opacity: 1, transform: tr(b) }, easing).at(e + 0.4, { opacity: 0, transform: tr(b) }), T, loop);
    };

    // the sheet lands
    const sheet = sheetRef.current;
    run(anims, sheet, seq({ transform: 'translate3d(0,90px,0) rotateX(10deg) rotate(-1.6deg) scale(.95)' }).ramp(1.05, { transform: 'translate3d(0,0,0) rotateX(0deg) rotate(0deg) scale(1)' }, 'cubic-bezier(.18,.9,.2,1.07)'), T, loop);
    const fade = seq({ opacity: 0 }).ramp(0.4, { opacity: 1 }, 'ease-out');
    if (loop) fade.at(T - TYPING.loopFade, { opacity: 1 }).ramp(T, { opacity: 0 }, 'ease-in');
    run(anims, sheet, fade, T, loop);
    if (full) run(anims, root.querySelector('.cam'), seq({ transform: 'scale(1)' }).ramp(T, { transform: 'scale(1.022)' }, 'linear'), T, loop);

    // the letterhead inks in
    const ink = (el, d, from, to) => run(anims, el, seq({ opacity: 0, transform: from }).at(d, { opacity: 0, transform: from }).ramp(d + 0.95, { opacity: 1, transform: to }, EASE_OUT), T, loop);
    ink(root.querySelector('.hb.en'), 0.5, 'translateX(-52px)', 'translateX(0px)');
    ink(root.querySelector('.hb.he'), 0.7, 'translateX(52px)', 'translateX(0px)');
    run(anims, root.querySelector('.rule'), seq({ transform: 'scaleX(0)' }).at(0.95, { transform: 'scaleX(0)' }).ramp(1.8, { transform: 'scaleX(1)' }, EASE_OUT), T, loop);

    // header lines, then the body lines
    heads.forEach((el, i) => typeLine(el, plan.headT[i].s, plan.headT[i].e));
    plan.pages.forEach((p, pi) => {
      const pg = pgEls[pi];
      const o = seq({ opacity: 0 }).at(p.start, { opacity: 1 });
      if (!p.last || loop) o.at(p.fadeAt - (loop && p.last ? TYPING.loopFade : 0), { opacity: 1 }).ramp(p.fadeAt + 0.35 - (loop && p.last ? TYPING.loopFade : 0), { opacity: 0 }, 'ease-in');
      run(anims, pg, o, T, loop);
      [...pg.querySelectorAll('.ty')].forEach((el, i) => typeLine(el, p.lineT[i].s, p.lineT[i].e));
    });

    // the marker: follows the typing, then reads along
    const band = root.querySelector('.band');
    if (band && full) {
      const b = seq({ opacity: 0, transform: 'translateY(0px)' });
      const P = (y, o = 1) => ({ opacity: o, transform: `translateY(${Math.round(y)}px)` });
      plan.pages.forEach((p, pi) => {
        const lines = [...pgEls[pi].querySelectorAll('.ty')];
        if (!lines.length) return;
        const tops = lines.map((l) => l.offsetTop);
        b.at(p.lineT[0].s, P(tops[0]));
        lines.forEach((_, i) => { if (i > 0) b.at(p.lineT[i].s - 0.01, P(tops[i - 1])).ramp(p.lineT[i].s + 0.1, P(tops[i]), 'ease-out'); });
        const span = p.end - p.typedEnd - 1.4;
        if (span >= 2 && lines.length > 1) {
          const dwell = span / lines.length;
          let t = p.typedEnd + 0.5;
          lines.forEach((_, j) => { b.ramp(t + 0.22, P(tops[j]), 'ease-in-out'); t += dwell; b.at(t, P(tops[j])); });
        }
        b.at(p.end - (p.last ? 0.9 : 0.4), P(tops[tops.length - 1])).ramp(p.end - (p.last ? 0.5 : 0.05), P(tops[tops.length - 1], 0), 'ease-in');
      });
      run(anims, band, b, T, loop);
    }

    // closing, signature, postmark, mailing block, page numbers
    if (closeEl && plan.closeT) typeLine(closeEl, plan.closeT.s, plan.closeT.e);
    if (sigEl && plan.sigT) run(anims, sigEl, seq({ opacity: 0, clipPath: HIDE(false) }).at(plan.sigT.s, { opacity: 1, clipPath: HIDE(false) }).ramp(plan.sigT.e, { opacity: 1, clipPath: SHOW }, 'cubic-bezier(.45,.05,.4,1)'), T, loop);
    if (stampEl && plan.stampT) {
      const s = plan.stampT.s;
      run(anims, stampEl, seq({ opacity: 0, transform: 'scale(1.9) rotate(-16deg)' }).at(s, { opacity: 0, transform: 'scale(1.9) rotate(-16deg)' }).ramp(s + TYPING.stamp, { opacity: 0.9, transform: 'scale(1) rotate(-6deg)' }, 'cubic-bezier(.2,.9,.3,1.25)'), T, loop);
      if (full) {
        const th = seq({ transform: 'translateY(0px)' }).at(s + TYPING.stamp - 0.05, { transform: 'translateY(0px)' }).ramp(s + TYPING.stamp + 0.04, { transform: 'translateY(6px)' }, 'ease-out').ramp(s + TYPING.stamp + 0.5, { transform: 'translateY(0px)' }, EASE_OUT);
        run(anims, root.querySelector('.thud'), th, T, loop);
      }
    }
    if (mailEl && plan.mailedT) run(anims, mailEl, seq({ opacity: 0, transform: 'translateY(16px)' }).at(plan.mailedT.s, { opacity: 0, transform: 'translateY(16px)' }).ramp(plan.mailedT.e, { opacity: 1, transform: 'translateY(0px)' }, EASE_OUT), T, loop);
    q('.pn').forEach((el, i) => {
      const p = plan.pages[i];
      const o = seq({ opacity: 0 }).at(p.start, { opacity: 1 });
      if (!p.last || loop) o.at(p.fadeAt, { opacity: 1 }).ramp(p.fadeAt + 0.3, { opacity: 0 }, 'ease-in');
      run(anims, el, o, T, loop);
    });

    onDuration?.(T);
    return () => anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
  }, [lay, stillMode, anim, loop, wpm, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const sig = m.sigImg ? SIGNATURES[m.sigImg] : null;
  const showEnd = !!(m.close || sig || m.stamp || m.mailed.length);
  const cls = ['lhs', flush ? 'flush' : '', port ? 'port' : '', m.rtl ? 'rtl' : '', m.serif ? 'serif' : ''].filter(Boolean).join(' ');
  const nameOf = (lines) => lines[0];
  const rest = (lines) => lines.slice(1);

  const HeadBlock = ({ lines, side }) => (lines.length ? (
    <div className={`hb ${side}`}>
      <div className="nm">{nameOf(lines)}</div>
      {rest(lines).map((l, i) => <div key={i} className={`ln2${i === 0 ? ' mv' : ''}`}>{l}</div>)}
    </div>
  ) : <div className={`hb ${side}`} />);

  const h0 = hl || { date: [], to: [], greet: [] };
  return (
    <div ref={rootRef} className={cls} style={{ '--k': k, '--c': c }} data-lhs data-pages={pageCount}>
      <div className="cam"><div className="thud"><div ref={sheetRef} className="sheet">
        {(m.head.en.length || m.head.he.length) ? (
          <>
            <div className="head"><HeadBlock lines={m.head.en} side="en" /><HeadBlock lines={m.head.he} side="he" /></div>
            <div className="rule" />
          </>
        ) : null}
        <div className="meta tf">
          <div className="to" style={{ flex: '1 1 0' }}>{h0.to.map((l, i) => <Tl key={i} text={l} h={20 + i} />)}</div>
          <div className="dt">
            {m.grace ? <div className="gr"><Tl text={m.grace} h={0} /></div> : null}
            {h0.date.map((l, i) => <Tl key={i} text={l} h={1 + i} />)}
          </div>
        </div>
        {h0.greet.length ? <div className="greet tf">{h0.greet.map((l, i) => <Tl key={i} text={l} h={40 + i} />)}</div> : null}
        <div ref={bodyRef} className="body tf" style={lay ? { '--fs': `${lay.fs}px`, '--lh': `${lay.lh}px` } : undefined}>
          <div className="band" />
          {lay ? lay.pages.map((pg, pi) => (
            <div key={pi} className="pg" data-p={pi} style={stillMode ? { opacity: pi === cur ? 1 : 0 } : undefined}>
              {pg.paras.map((para, i) => <p key={i}>{para.map((ln, j) => <Tl key={j} text={ln} />)}</p>)}
            </div>
          )) : null}
          {lay && pageCount > 1 ? lay.pages.map((_, pi) => <div key={pi} className="pn tf" style={stillMode ? { opacity: pi === cur ? 1 : 0 } : undefined}>{`– ${pi + 1} / ${pageCount} –`}</div>) : null}
          <div ref={measRef} className="meas tf" style={{ position: 'absolute', visibility: 'hidden', left: 0, top: 0, lineHeight: 1.42, whiteSpace: 'normal', pointerEvents: 'none' }} />
        </div>
        {showEnd ? (
          <div className="end tf">
            <div className="cl">{m.close ? <Tl text={m.close} c /> : null}{sig ? <img className="sig" src={sig} alt="" /> : null}</div>
            <div className="mb">
              {m.mailed.length ? <div className="mail">{m.mailed.map((l, i) => <div key={i}>{l}</div>)}</div> : null}
              {m.stamp ? <Postmark top={m.stamp.top} bottom={m.stamp.bottom} /> : null}
            </div>
          </div>
        ) : null}
      </div></div></div>
    </div>
  );
}
