import React, { useEffect, useRef, useState } from 'react';
import { Panel, F } from '../design/ui.jsx';
import { Fit } from '../design/fit.jsx';
import { useDesign } from '../design/DesignRoot.jsx';
import { layoutOf, lookOf, shows, numeralsStack } from '../design/useLayout.js';
import { Label, BigNum, Ticks, EdgeTicks, Backdrop, SOFT_INK } from '../components/slides/occasionParts.jsx';
import { Confetti } from '../components/slides/BirthdaysSlide.jsx';
import { textDir } from '../../shared/bidi.js';
import { COPY, ZERO_WORDS, FAR_DAYS } from '../../shared/occasions.js';

/**
 * The Countdown's hype moments, full canvas (src/shared/occasions.js takeoverFor() decides when):
 *   milestone  'N DAYS TO GO' (a few minutes on a milestone day)
 *   final      the last minute(s): M:SS, re-rendered each second only in this kind
 *   zero       the greeting + the name, a FINITE confetti burst (never on Minimal motion), then it settles
 * Same restrained look as the Countdown page (occasionParts.jsx). Entry: a short fade/rise; exit: a short fade
 * (OccasionTakeoverLayer keeps the last frame for EXIT_MS). Nothing loops. Mounted by App.jsx under the same
 * precedence as every takeover (a freeze / Shabbos cover hides it; an announcement takeover wins over it).
 *
 * Input shape: { kind, key, daysLeft, until (ms epoch), name: {en, he}, words: {big, unit, sub}, stageText: {en, he} | null,
 *                look?, layout?, zero?: {en, he} }  (look / layout / zero optional, read defensively).
 */

export const EXIT_MS = 420;
const two = (n) => String(n).padStart(2, '0');

/** The final countdown's numbers from `until` at `now`. */
export function finalWords(until, now) {
  const secs = Math.max(0, Math.ceil((Number(until) - now) / 1000));
  return { secs, big: `${Math.floor(secs / 60)}:${two(secs % 60)}` };
}

/** The greeting at zero: the takeover's own, else the tagline, else the generic one. */
function zeroOf(tk) {
  const z = tk.zero || tk.greeting || tk.words?.zero;
  if (z && (z.en || z.he)) return z;
  if (tk.stageText && (tk.stageText.en || tk.stageText.he)) return tk.stageText;
  return ZERO_WORDS.here;
}

function TkName({ name, L, portrait, center, big = false }) {
  const heOn = shows(L, 'hebrewName') && !!name?.he;
  const enOn = shows(L, 'name') && !!name?.en;
  const k = L.k || 1;
  const ta = center ? 'center' : 'left';
  const long = [...(name?.he || '')].length > 16 || [...(name?.en || '')].length > 24;
  const hBox = Math.round((portrait ? (long ? 300 : 220) : (long ? 270 : 210)) * (big ? 1.1 : 1));
  const eBox = Math.round((portrait ? (long ? 140 : 96) : (long ? 130 : 90)) * (big ? 1.1 : 1));
  return (
    <div data-occ-name="" style={{ flex: 'none', width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {heOn && (
        <Fit key={`th|${name.he}|${portrait}|${hBox}`} wrap vcenter dir="rtl" max={Math.round((long ? 120 : 176) * k)} min={48} className="tt-he" style={{
          flex: 'none', width: '100%', height: hBox, overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, textAlign: ta,
        }}>{name.he}</Fit>
      )}
      {enOn && (
        <Fit key={`te|${name.en}|${portrait}|${eBox}|${heOn}`} wrap vcenter dir={textDir(name.en)} max={Math.round((heOn ? (long ? 54 : 68) : 120) * k)} min={34} style={{
          flex: 'none', width: '100%', height: heOn ? eBox : hBox, overflow: 'visible', fontFamily: F.enD, fontWeight: heOn ? 400 : 700,
          color: heOn ? SOFT_INK : 'var(--ink)', lineHeight: 1.12, textAlign: ta,
        }}>{name.en}</Fit>
      )}
    </div>
  );
}

function Tagline({ t, center }) {
  if (!t || (!t.en && !t.he)) return null;
  return <Label en={t.en} heText={t.he} color="var(--accentText)" size={30} style={{ justifyContent: center ? 'center' : 'flex-start' }} data-occ-tagline="" />;
}

function CountTk({ tk, now, L, portrait, font }) {
  const final = tk.kind === 'final';
  const fw = final ? finalWords(tk.beginMs ?? tk.until, now) : null;
  const w = tk.words || {};
  const days = Number.isFinite(tk.daysLeft) ? tk.daysLeft : Number(w.big) || 0;
  const big = final ? fw.big : (w.big || String(days));
  const unit = final ? { en: `${COPY.minutes.en} : seconds`, he: `${COPY.minutes.he} : שניות` }
    : w.unit && (w.unit.en || w.unit.he) ? w.unit
      : { en: `${days === 1 ? COPY.day.en : COPY.days.en} ${COPY.toGo.en}`, he: `${COPY.toGo.he} ${days === 1 ? COPY.day.he : COPY.days.he}` };
  const tag = shows(L, 'tagline') ? tk.stageText : null;
  const center = portrait || L.align === 'center';
  const numH = Math.round((portrait ? 560 : 520) * (L.k || 1));
  const numbers = (
    <div data-occ-count={tk.kind} style={{ flex: 'none', minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: 14 }}>
      <BigNum text={big} max={Math.round(numH * 1.12)} height={numH} font={font} align={center ? 'center' : 'start'} color={final ? 'var(--accentText)' : 'var(--ink)'} />
      <Label en={unit.en} heText={unit.he} size={30} color={SOFT_INK} style={{ justifyContent: center ? 'center' : 'flex-start' }} />
      {!final && shows(L, 'pips') && days > 0 && days <= FAR_DAYS && (
        <div style={{ width: '100%', marginTop: 14, display: 'flex', justifyContent: center ? 'center' : 'flex-start' }}><Ticks total={FAR_DAYS} lit={days} align={center ? 'center' : 'start'} height={34} /></div>
      )}
      {final && shows(L, 'bar') && (
        <div style={{ width: '100%', marginTop: 14, display: 'flex', justifyContent: center ? 'center' : 'flex-start' }}><Ticks total={60} lit={Math.min(60, fw.secs)} major={5} height={34} align={center ? 'center' : 'start'} /></div>
      )}
    </div>
  );
  if (portrait) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, textAlign: 'center' }}>
        <Tagline t={tag} center />
        {numbers}
        <div aria-hidden style={{ width: 96, height: 2, background: 'var(--line)', flex: 'none' }} />
        <TkName name={tk.name} L={L} portrait center />
      </div>
    );
  }
  const left = L.side === 'left';
  const nameCol = (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, [left ? 'paddingLeft' : 'paddingRight']: 64, [left ? 'borderLeft' : 'borderRight']: '2px solid var(--line)' }}>
      <Tagline t={tag} />
      <TkName name={tk.name} L={L} big />
    </div>
  );
  const numCol = <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', [left ? 'paddingRight' : 'paddingLeft']: 0 }}>{numbers}</div>;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: left ? 'minmax(0, 1fr) minmax(0, 1.1fr)' : 'minmax(0, 1.1fr) minmax(0, 1fr)', columnGap: 64, alignItems: 'stretch' }}>
      {left ? <>{numCol}{nameCol}</> : <>{nameCol}{numCol}</>}
    </div>
  );
}

function ZeroTk({ tk, L, portrait }) {
  const z = zeroOf(tk);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 24 : 14, textAlign: 'center' }}>
      {z.he && <Fit key={`zh|${z.he}|${portrait}`} className="tt-he tt-bd-hero" wrap vcenter dir="rtl" max={portrait ? 230 : 210} min={72} style={{ flex: 'none', width: '100%', height: portrait ? 340 : 250, overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: 'var(--accentText)', lineHeight: 1.25, textAlign: 'center' }}>{z.he}</Fit>}
      {z.en && <Fit key={`ze|${z.en}|${portrait}`} className="tt-bd-up" wrap vcenter max={portrait ? 120 : 104} min={48} style={{ '--t': '450ms', flex: 'none', width: '100%', height: portrait ? 200 : 140, overflow: 'visible', fontFamily: F.enD, fontWeight: z.he ? 400 : 700, color: z.he ? 'var(--ink)' : 'var(--accentText)', lineHeight: 1.1, textAlign: 'center' }}>{z.en}</Fit>}
      <div className="tt-bd-up" aria-hidden style={{ '--t': '650ms', width: 96, height: 2, background: 'var(--line)', flex: 'none', margin: '8px 0' }} />
      <div className="tt-bd-up" style={{ '--t': '800ms', width: '100%', flex: 'none' }}><TkName name={tk.name} L={L} portrait={portrait} center /></div>
    </div>
  );
}

/** One takeover frame. `now` (ms) only matters for 'final'; App passes null otherwise so other kinds never re-render per second. */
export const OccasionTakeover = React.memo(function OccasionTakeover({ tk, now, exiting = false }) {
  const design = useDesign();
  const portrait = design.portrait;
  const L = layoutOf(tk.layout);
  const look = lookOf(tk.look);
  const font = numeralsStack(look.numeralsFont);
  const vars = look.accent ? { '--accentText': look.accent } : null;
  return (
    <div className={`tt-occ-tk${exiting ? ' tt-out' : ''}`} data-occ-takeover={tk.kind} style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg)', display: 'flex' }}>
      <Panel pad={portrait ? '64px 72px 64px' : '56px 104px 56px'} style={{ borderRadius: 0, ...vars }} data-occ-form={tk.kind}>
        <Backdrop photo={look.photo} dim={look.dim} textSide={L.side === 'left' ? 'right' : 'left'} portrait={portrait} graphics={design.graphics} />
        <EdgeTicks graphics={design.graphics === 'off' ? 'off' : 'rich'} inset={36} />
        {tk.kind === 'zero' && tk.celebrate !== false && <Confetti key={`c|${tk.key}`} graphics={design.graphics} motion={design.motion} />}
        <div className="tt-occ-rise" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <header style={{ flex: 'none', display: 'flex', justifyContent: portrait ? 'center' : 'flex-start' }}>
            <Label en={COPY.slideTitle.en} heText={COPY.slideTitle.he} size={26} />
          </header>
          {tk.kind === 'zero' ? <ZeroTk tk={tk} L={L} portrait={portrait} /> : <CountTk tk={tk} now={now} L={L} portrait={portrait} font={font} />}
        </div>
      </Panel>
    </div>
  );
}, (a, b) => a.exiting === b.exiting && a.now === b.now && a.tk.key === b.tk.key && a.tk.kind === b.tk.kind && a.tk.daysLeft === b.tk.daysLeft
  && a.tk.until === b.tk.until && JSON.stringify([a.tk.name, a.tk.words, a.tk.stageText, a.tk.look, a.tk.layout, a.tk.zero]) === JSON.stringify([b.tk.name, b.tk.words, b.tk.stageText, b.tk.look, b.tk.layout, b.tk.zero]));

/**
 * Keeps the last takeover on screen for a short exit fade after it ends, and gives 'final' a per-second `now`
 * (`clockMs` = the screen clock, already moved by a ?previewAt= offset).
 */
export function OccasionTakeoverLayer({ tk, clockMs }) {
  const [shown, setShown] = useState(tk);
  const [exiting, setExiting] = useState(false);
  const last = useRef(tk);
  useEffect(() => {
    if (tk) { last.current = tk; setShown(tk); setExiting(false); return undefined; }
    if (!last.current) return undefined;
    setExiting(true);
    const t = setTimeout(() => { last.current = null; setShown(null); setExiting(false); }, EXIT_MS);
    return () => clearTimeout(t);
  }, [tk]);
  const cur = tk || shown;
  if (!cur) return null;
  const now = cur.kind === 'final' ? Math.floor(clockMs / 1000) * 1000 : null;
  return <OccasionTakeover key={`${cur.key}|${cur.kind}`} tk={cur} now={now} exiting={!tk && exiting} />;
}
