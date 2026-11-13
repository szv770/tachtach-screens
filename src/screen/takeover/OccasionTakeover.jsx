import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Panel, F } from '../design/ui.jsx';
import { Fit } from '../design/fit.jsx';
import { useDesign } from '../design/DesignRoot.jsx';
import { layoutOf, lookOf, shows, numeralsStack } from '../design/useLayout.js';
import { YearsBadge, Label, HeroNum, TickLine, Backdrop, PhotoPane, PHOTO_SHARE, useBox, SOFT_INK, LABEL_INK, ACC, useSmallAccent, WHY_LABEL, FitText, Kicker, SourceLine, READ } from '../components/slides/occasionParts.jsx';
import { Confetti } from '../components/slides/BirthdaysSlide.jsx';
import { textDir } from '../../shared/bidi.js';
import { COPY, ZERO_WORDS, FAR_DAYS } from '../../shared/occasions.js';
import { playOnce } from './occasionSound.js';

/**
 * The Countdown's hype moments, full canvas (src/shared/occasions.js takeoverFor() decides when):
 *   milestone  'N DAYS TO GO' (a few minutes on a milestone day)
 *   final      the last minute(s): M:SS, re-rendered each second only in this kind
 *   zero       the greeting + the name, a FINITE confetti burst (never on Minimal motion), then it settles
 * One set with the Countdown page (the shared kit in occasionParts.jsx): the kicker with its accent bar, the rail hairline,
 * the hairline divider with an accent head between the number and its words, display roles for the name, reading roles for
 * the why line, the same source line and the same rise-in. Entry: a short fade/rise; exit: a short fade
 * (OccasionTakeoverLayer keeps the last frame for EXIT_MS). Nothing loops. Mounted by App.jsx under the same
 * precedence as every takeover (a freeze / Shabbos cover hides it; an announcement takeover wins over it).
 *
 * Input shape: { kind, key, daysLeft, until (ms epoch), name: {en, he}, words: {big, unit, sub}, stageText: {en, he} | null,
 *                look?, layout?, zero?: {en, he}, why?: {en, he, source}, dates?: {toGoLabel} }  (optional ones read defensively).
 * The milestone shows the short 'why we celebrate' line (`why`) as a quiet bottom line when it fits; it is the FIRST thing dropped when
 * the frame is crowded (measured after layout).
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
  return <Label en={t.en} heText={t.he} color={ACC} size={30} style={{ justifyContent: center ? 'center' : 'flex-start' }} data-occ-tagline="" />;
}

/** The quiet 'why we celebrate' line of a milestone: label, the text fitted (28 px at the least), a muted source. */
function WhyLine({ why, L, portrait, center }) {
  const w = { en: why.en || '', he: why.he || '' };
  const ta = center ? 'center' : 'start';
  return (
    <div data-occ-why="" style={{ flex: 'none', width: '100%', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', gap: 6, textAlign: ta }}>
      <Kicker en={WHY_LABEL.en} heText={WHY_LABEL.he} size={24} center={center} />
      <FitText max={Math.round(40 * (L.k || 1))} min={28} budget={Math.round((portrait ? 220 : 170) * (L.k || 1))} deps={`${w.en}|${w.he}`} data-occ-why-text="" style={{ flex: 'none', width: '100%', lineHeight: 1.36, textAlign: ta }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4em' }}>
          {w.en && <div dir={textDir(w.en)} style={{ fontFamily: textDir(w.en) === 'rtl' ? READ.he : READ.en, fontWeight: 500, color: 'var(--ink)', unicodeBidi: 'isolate' }}>{w.en}</div>}
          {w.he && <div className="tt-he" dir="rtl" style={{ fontFamily: READ.he, fontWeight: 500, color: w.en ? SOFT_INK : 'var(--ink)', lineHeight: 1.42 }}>{w.he}</div>}
        </div>
      </FitText>
      {why.source && <SourceLine text={why.source} data-occ-why-source="" style={{ flex: 'none', color: LABEL_INK, textAlign: ta }} />}
    </div>
  );
}

/** Is the frame's body taller than its box? Then the optional line goes (re-measured once the fonts are in). */
function useCrowded(ref, key) {
  const [crowded, setCrowded] = useState(false);
  const at = useRef(key);
  const fresh = useRef(false);
  if (at.current !== key) { at.current = key; fresh.current = false; if (crowded) setCrowded(false); }
  useLayoutEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el || !el.clientHeight) return;
      const over = [el, ...el.querySelectorAll('[data-tk-col]')].some((c) => c.clientHeight && c.scrollHeight > c.clientHeight + 2);
      if (over) setCrowded(true);
    };
    check();
    let alive = true;
    document.fonts?.ready?.then(() => {
      if (!alive || fresh.current) return;
      fresh.current = true; // fallback fonts are wider: measure again once, from 'not crowded', when the real ones are in
      if (document.fonts.status === 'loaded') setCrowded(false); else check();
    }).catch(() => {});
    return () => { alive = false; };
  });
  return crowded;
}

function CountTk({ tk, now, L, portrait, font, tagline }) {
  const bodyRef = useRef(null);
  const [boxRef, bw, bh] = useBox(portrait ? 760 : 1390, portrait ? 1300 : 640);
  const whyOn = tk.kind === 'milestone' && shows(L, 'why') && !!(tk.why && (tk.why.en || tk.why.he));
  const crowded = useCrowded(bodyRef, `${tk.key}|${portrait}|${whyOn}`);
  const why = whyOn && !crowded ? tk.why : null;
  const final = tk.kind === 'final';
  const fw = final ? finalWords(tk.beginMs ?? tk.until, now) : null;
  const w = tk.words || {};
  const days = Number.isFinite(tk.daysLeft) ? tk.daysLeft : Number(w.big) || 0;
  const big = final ? fw.big : (w.big || String(days));
  // 'N DAYS UNTIL IT BEGINS' when the model says so (the countdown runs to the evening before the day itself)
  const tg = tk.dates?.toGoLabel;
  const noun = days === 1 ? COPY.day : COPY.days;
  const toGo = !final && tg && (tg.en || tg.he) ? { en: w.unit && !w.unit.en && w.unit.he ? '' : (tg.en ? `${noun.en} ${tg.en}` : noun.en), he: w.unit && !w.unit.he && w.unit.en ? '' : (tg.he ? `${noun.he} ${tg.he}` : noun.he) } : null;
  const unit = final ? { en: `${COPY.minutes.en} : seconds`, he: `${COPY.minutes.he} : שניות` }
    : toGo || (w.unit && (w.unit.en || w.unit.he) ? w.unit
      : { en: `${days === 1 ? COPY.day.en : COPY.days.en} ${COPY.toGo.en}`, he: `${COPY.toGo.he} ${days === 1 ? COPY.day.he : COPY.days.he}` });
  const center = L.align === 'center';
  const stack = portrait || center;
  const al = stack && center ? 'center' : 'flex-start';
  const maxH = Math.round((stack ? Math.min(bh * 0.42, 620) : Math.min(bh * 0.8, 560)) * (L.k || 1));
  const maxW = stack ? bw : bw * 0.5;
  const number = (
    <div data-occ-count={tk.kind} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: al }}>
      <div key={final ? big : 'n'} className={final ? 'tt-hype-pop' : undefined} style={{ '--pop-from': 1.07 }}>
        <HeroNum text={big} font={font} maxW={maxW} maxH={maxH} color={final ? ACC : 'var(--ink)'} intro={!final} />
      </div>
    </div>
  );
  const unitEl = <Label en={unit.en} heText={unit.he} size={28} color={SOFT_INK} style={{ justifyContent: al }} />;
  if (stack) {
    return (
      <div ref={(el) => { bodyRef.current = el; boxRef.current = el; }} data-tk-col="" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: al, justifyContent: 'safe center', gap: 28, textAlign: center ? 'center' : 'start' }}>
        <TkName name={tk.name} L={L} portrait center={center} />
        {number}
        {unitEl}
        <YearsBadge years={tk.years} center={center} />
        {why && <WhyLine why={why} L={L} portrait center={center} />}
      </div>
    );
  }
  const left = L.side !== 'right';
  return (
    <div ref={(el) => { bodyRef.current = el; boxRef.current = el; }} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'safe center' }}>
      <div style={{ display: 'flex', flexDirection: left ? 'row' : 'row-reverse', gap: 72, alignItems: 'stretch' }}>
        {number}
        <div data-tk-col="" style={{ position: 'relative', flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
          <span aria-hidden className="tt-rule-in" style={{ position: 'absolute', [left ? 'left' : 'right']: -37, top: 0, bottom: 0, width: 2, background: 'var(--line)' }}>
            <span style={{ position: 'absolute', left: -1, top: 0, width: 4, height: 64, borderRadius: 2, background: 'var(--accentText)' }} />
          </span>
          {unitEl}
          <YearsBadge years={tk.years} />
          <TkName name={tk.name} L={L} big />
          {why ? <WhyLine why={why} L={L} /> : <span />}
        </div>
      </div>
    </div>
  );
}

/** The takeover's rail: the kicker (the tagline in the accent, else 'Countdown') and one hairline with the days / seconds left. */
function TkRail({ tk, L, now, lang }) {
  const final = tk.kind === 'final';
  const tag = shows(L, 'tagline') && tk.stageText && (tk.stageText.en || tk.stageText.he) ? tk.stageText : null;
  const t = tag || COPY.slideTitle;
  const days = Number.isFinite(tk.daysLeft) ? tk.daysLeft : 0;
  let prog = <div aria-hidden style={{ height: 2, background: 'var(--line)' }} />;
  if (final && shows(L, 'bar')) prog = <TickLine total={60} lit={Math.min(60, finalWords(tk.beginMs ?? tk.until, now).secs)} major={5} />;
  else if (tk.kind === 'milestone' && shows(L, 'pips') && days > 0 && days <= FAR_DAYS) prog = <TickLine total={FAR_DAYS} lit={days} />;
  return (
    <header style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
      <Kicker en={t.en} heText={lang === 'english' ? '' : t.he} size={26} data-occ-tagline={tag ? '' : undefined} />
      {tk.kind !== 'zero' && prog}
    </header>
  );
}

function ZeroTk({ tk, L, portrait }) {
  const z = zeroOf(tk);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: portrait ? 24 : 14, textAlign: 'center' }}>
      {z.he && <Fit key={`zh|${z.he}|${portrait}`} className="tt-he tt-bd-hero" wrap vcenter dir="rtl" max={portrait ? 230 : 210} min={72} style={{ flex: 'none', width: '100%', height: portrait ? 340 : 250, overflow: 'visible', fontFamily: F.heD, fontWeight: 700, color: ACC, lineHeight: 1.25, textAlign: 'center' }}>{z.he}</Fit>}
      {z.en && <Fit key={`ze|${z.en}|${portrait}`} className="tt-bd-up" wrap vcenter max={portrait ? 120 : 104} min={48} style={{ '--t': '450ms', flex: 'none', width: '100%', height: portrait ? 200 : 140, overflow: 'visible', fontFamily: F.enD, fontWeight: z.he ? 400 : 700, color: z.he ? 'var(--ink)' : ACC, lineHeight: 1.1, textAlign: 'center' }}>{z.en}</Fit>}
      <div className="tt-bd-up" style={{ '--t': '800ms', width: '100%', flex: 'none' }}><TkName name={tk.name} L={L} portrait={portrait} center /></div>
      <div className="tt-bd-up" style={{ '--t': '1100ms', flex: 'none' }}><YearsBadge years={tk.years} center /></div>
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
  const panelRef = useRef(null);
  useSmallAccent(panelRef, [design.themeId, design.light, look.accent]);
  return (
    <div className={`tt-occ-tk${exiting ? ' tt-out' : ''}`} data-occ-takeover={tk.kind} style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg)', display: 'flex' }}>
      <Panel ref={panelRef} pad={portrait ? '64px 72px 64px' : '56px 104px 56px'} style={{ borderRadius: 0, ...vars }} data-occ-form={tk.kind}>
        {look.photo ? <PhotoPane photo={look.photo} dim={look.dim} side={L.side === 'right' ? 'left' : 'right'} portrait={portrait} /> : <Backdrop graphics={design.graphics} />}
        {tk.kind === 'zero' && tk.celebrate !== false && <Confetti key={`c|${tk.key}`} graphics={design.graphics} motion={design.motion} />}
        <div className="tt-occ-rise" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...(look.photo && !portrait ? { [L.side === 'right' ? 'paddingLeft' : 'paddingRight']: `calc(${PHOTO_SHARE.land * 100}% + 8px)` } : null) }}>
          {look.photo && portrait && <div aria-hidden style={{ flex: 'none', height: `${PHOTO_SHARE.port * 100 - 2}%` }} />}
          <TkRail tk={tk} L={L} now={now} lang="both" />
          {tk.kind === 'zero' ? <ZeroTk tk={tk} L={L} portrait={portrait} /> : <CountTk tk={tk} now={now} L={L} portrait={portrait} font={font} />}
        </div>
      </Panel>
    </div>
  );
}, (a, b) => a.exiting === b.exiting && a.now === b.now && a.tk.key === b.tk.key && a.tk.kind === b.tk.kind && a.tk.daysLeft === b.tk.daysLeft
  && a.tk.until === b.tk.until && JSON.stringify([a.tk.name, a.tk.words, a.tk.stageText, a.tk.look, a.tk.layout, a.tk.zero, a.tk.why, a.tk.dates?.toGoLabel]) === JSON.stringify([b.tk.name, b.tk.words, b.tk.stageText, b.tk.look, b.tk.layout, b.tk.zero, b.tk.why, b.tk.dates?.toGoLabel]));

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
  // the optional chime, once per appearance (settings.sound; null = silent)
  useEffect(() => { if (tk?.sound) playOnce(`tk|${tk.key}`, tk.sound); }, [tk?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = tk || shown;
  if (!cur) return null;
  const now = cur.kind === 'final' ? Math.floor(clockMs / 1000) * 1000 : null;
  return <OccasionTakeover key={`${cur.key}|${cur.kind}`} tk={cur} now={now} exiting={!tk && exiting} />;
}
